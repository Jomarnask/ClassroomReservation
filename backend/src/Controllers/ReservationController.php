<?php

namespace App\Controllers;

use App\Auth\AuthenticatedUser;
use App\Http\ApiException;
use App\Http\Request;
use App\Http\Response;
use App\Services\ReservationService;

class ReservationController
{
    private const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

    private ReservationService $service;

    public function __construct()
    {
        $this->service = new ReservationService();
    }

    /**
     * GET /api/reservations
     * Query: status, room_id, date_from, date_to, mine=true, limit
     */
    public function index(Request $request): void
    {
        $user = $this->user($request);
        $filters = [];

        $status = strtolower(trim((string) $request->getQuery('status', '')));

        if ($status !== '') {
            if (!in_array($status, self::STATUSES, true)) {
                throw new ApiException('status must be one of: ' . implode(', ', self::STATUSES) . '.', 422);
            }

            $filters['status'] = $status;
        }

        $roomId = $request->getQuery('room_id');

        if ($roomId !== null && $roomId !== '') {
            $filters['room_id'] = $this->parseId($roomId, 'room_id');
        }

        foreach (['date_from', 'date_to'] as $key) {
            $value = trim((string) $request->getQuery($key, ''));

            if ($value !== '') {
                $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);

                if (!$date || $date->format('Y-m-d') !== $value) {
                    throw new ApiException($key . ' must be a valid date in YYYY-MM-DD format.', 422);
                }

                $filters[$key] = $value;
            }
        }

        $mine = $request->getQuery('mine');

        if ($mine !== null && $mine !== '') {
            if (!in_array(strtolower((string) $mine), ['true', 'false', '1', '0'], true)) {
                throw new ApiException('mine must be true or false.', 422);
            }

            $filters['mine'] = filter_var($mine, FILTER_VALIDATE_BOOLEAN);
        }

        $limit = $request->getQuery('limit');

        if ($limit !== null && $limit !== '') {
            $parsed = filter_var($limit, FILTER_VALIDATE_INT);

            if ($parsed === false || $parsed < 1 || $parsed > 500) {
                throw new ApiException('limit must be between 1 and 500.', 422);
            }

            $filters['limit'] = $parsed;
        }

        $rows = $this->service->list($user, $filters);

        Response::success($rows, 'Reservations retrieved successfully.');
    }

    /** GET /api/reservations/{reservationId} */
    public function show(Request $request, array $params): void
    {
        $user = $this->user($request);
        $id = $this->parseId($params['reservationId'] ?? null, 'reservation ID');

        Response::success($this->service->get($user, $id), 'Reservation retrieved successfully.');
    }

    /** POST /api/reservations (active students only) */
    public function store(Request $request): void
    {
        $user = $this->user($request);

        $reservation = $this->service->create($user, $request->getBody());

        Response::success(
            $reservation,
            'Reservation request submitted. It is now pending until the Admin decides.',
            201
        );
    }

    /** PATCH /api/reservations/{reservationId}/decision  body: { "approve": true, "reason": "..." } */
    public function decide(Request $request, array $params): void
    {
        $user = $this->user($request);
        $id = $this->parseId($params['reservationId'] ?? null, 'reservation ID');

        $outcome = $this->service->decide($user, $id, $request->getBody());

        $approved = ($outcome['result']['decision'] ?? '') === 'approved';

        Response::success(
            $outcome,
            $approved ? 'Reservation approved.' : 'Reservation rejected.'
        );
    }

    /** PATCH /api/reservations/{reservationId}/cancel */
    public function cancel(Request $request, array $params): void
    {
        $user = $this->user($request);
        $id = $this->parseId($params['reservationId'] ?? null, 'reservation ID');

        Response::success($this->service->cancel($user, $id), 'Reservation cancelled.');
    }

    /** GET /api/rooms/{roomId}/taken-slots?from=YYYY-MM-DD&to=YYYY-MM-DD */
    public function takenSlots(Request $request, array $params): void
    {
        $user = $this->user($request);
        $roomId = $this->parseId($params['roomId'] ?? null, 'room ID');

        $slots = $this->service->takenSlots(
            $user,
            $roomId,
            $request->getQuery('from'),
            $request->getQuery('to')
        );

        Response::success($slots, 'Taken slots retrieved successfully.');
    }

    private function user(Request $request): AuthenticatedUser
    {
        $user = $request->getUser();

        if (!$user) {
            throw new ApiException('Authentication required.', 401);
        }

        return $user;
    }

    private function parseId(mixed $value, string $label): int
    {
        $id = filter_var($value, FILTER_VALIDATE_INT);

        if ($id === false || $id < 1) {
            throw new ApiException('Invalid ' . $label . '.', 422);
        }

        return $id;
    }
}