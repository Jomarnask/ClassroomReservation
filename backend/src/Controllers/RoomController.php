<?php

namespace App\Controllers;

use App\Http\Request;
use App\Http\Response;
use App\Http\ApiException;
use App\Services\RoomService;

class RoomController
{
    private RoomService $service;

    public function __construct()
    {
        $this->service = new RoomService();
    }

    public function index(Request $request): void
    {
        $user = $request->getUser();

        if (!$user) {
            throw new ApiException('Authentication required.', 401);
        }

        $filters = [];

        $activeOnly = $request->getQuery('active_only');

        if ($activeOnly !== null) {
            if (!in_array(strtolower((string) $activeOnly), ['true', 'false', '1', '0'], true)) {
                throw new ApiException('active_only must be true or false.', 422);
            }

            $filters['active_only'] = filter_var(
                $activeOnly,
                FILTER_VALIDATE_BOOLEAN
            );
        }

        $search = trim((string) $request->getQuery('search', ''));

        if ($search !== '') {
            $filters['search'] = $search;
        }

        $roomType = trim((string) $request->getQuery('room_type', ''));

        if ($roomType !== '') {
            $filters['room_type'] = $roomType;
        }

        $floor = $request->getQuery('floor');

        if ($floor !== null && $floor !== '') {
            $parsedFloor = filter_var($floor, FILTER_VALIDATE_INT);

            if ($parsedFloor === false || $parsedFloor < 0 || $parsedFloor > 100) {
                throw new ApiException('Invalid floor filter.', 422);
            }

            $filters['floor'] = $parsedFloor;
        }

        $rooms = $this->service->list($user, $filters);

        Response::success($rooms, 'Rooms retrieved successfully.');
    }

    public function show(Request $request, array $params): void
    {
        $user = $request->getUser();

        if (!$user) {
            throw new ApiException('Authentication required.', 401);
        }

        $roomId = $this->parseRoomId($params['roomId'] ?? null);

        $room = $this->service->get($user, $roomId);

        Response::success($room, 'Room retrieved successfully.');
    }

    public function store(Request $request): void
    {
        $user = $request->getUser();

        if (!$user) {
            throw new ApiException('Authentication required.', 401);
        }

        $room = $this->service->create($user, $request->getBody());

        Response::success($room, 'Room created successfully.', 201);
    }

    public function update(Request $request, array $params): void
    {
        $user = $request->getUser();

        if (!$user) {
            throw new ApiException('Authentication required.', 401);
        }

        $roomId = $this->parseRoomId($params['roomId'] ?? null);

        $room = $this->service->update(
            $user,
            $roomId,
            $request->getBody()
        );

        Response::success($room, 'Room updated successfully.');
    }

    private function parseRoomId(mixed $value): int
    {
        $roomId = filter_var($value, FILTER_VALIDATE_INT);

        if ($roomId === false || $roomId < 1) {
            throw new ApiException('Invalid room ID.', 422);
        }

        return $roomId;
    }
}