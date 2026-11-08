<?php

namespace App\Services;

use App\Auth\AuthenticatedUser;
use App\Database\Database;
use App\Http\ApiException;
use App\Repositories\ReservationRepository;
use DateTimeImmutable;
use PDO;
use PDOException;
use Throwable;

class ReservationService
{
    // Same operating hours the booking timetable uses (07:00 - 21:00).
    private const OPEN_MINUTES = 7 * 60;
    private const CLOSE_MINUTES = 21 * 60;

    private const MAX_RANGE_DAYS = 92;

    private ReservationRepository $repository;

    public function __construct(?ReservationRepository $repository = null)
    {
        $this->repository = $repository ?? new ReservationRepository();
    }

    // ------------------------------------------------------------------
    // Queries
    // ------------------------------------------------------------------

    /**
     * Row Level Security decides what the caller sees: admins see everything,
     * students see their own, faculty see reservations they are tagged in.
     */
    public function list(AuthenticatedUser $user, array $filters = []): array
    {
        return $this->run($user, function (PDO $pdo) use ($user, $filters) {
            $this->assertActiveAccount($pdo, $user);

            if (!empty($filters['mine'])) {
                $filters['student_id'] = $user->getId();
            }
            unset($filters['mine']);

            return $this->repository->findAll($pdo, $filters);
        });
    }

    public function get(AuthenticatedUser $user, int $reservationId): array
    {
        return $this->run($user, function (PDO $pdo) use ($user, $reservationId) {
            $this->assertActiveAccount($pdo, $user);

            $reservation = $this->repository->findById($pdo, $reservationId);

            // RLS hides other people's rows, so "not visible" and "not found" look the same.
            if (!$reservation) {
                throw new ApiException('Reservation not found.', 404);
            }

            return $reservation;
        });
    }

    public function takenSlots(AuthenticatedUser $user, int $roomId, mixed $from, mixed $to): array
    {
        [$from, $to] = $this->validateRange($from, $to);

        return $this->run($user, function (PDO $pdo) use ($user, $roomId, $from, $to) {
            $this->assertActiveAccount($pdo, $user);

            return $this->repository->takenSlots($pdo, $roomId, $from, $to);
        });
    }

    // ------------------------------------------------------------------
    // Commands
    // ------------------------------------------------------------------

    public function create(AuthenticatedUser $user, array $input): array
    {
        $data = $this->validateCreate($input);

        return $this->run($user, function (PDO $pdo) use ($user, $data) {
            $access = $this->repository->findUserAccess($pdo, $user->getId());

            if (!$access
                || $access['role'] !== 'student'
                || $access['account_status'] !== 'active') {
                throw new ApiException('Only active students can submit reservation requests.', 403);
            }

            $room = $this->repository->findRoomState($pdo, $data['room_id']);

            if (!$room) {
                throw new ApiException('Room not found.', 404);
            }

            if (!$room['is_active']) {
                throw new ApiException('This room is not available for reservations.', 409);
            }

            if (!$this->repository->isActiveFaculty($pdo, $data['faculty_id'])) {
                throw new ApiException('The selected faculty member is not available.', 422);
            }

            $this->assertNoConflicts($pdo, $user, $data);

            $data['student_id'] = $user->getId();

            $newId = $this->repository->insert($pdo, $data);

            return $this->repository->findById($pdo, $newId);
        });
    }

    /** Admin approves or rejects a pending reservation. */
    public function decide(AuthenticatedUser $user, int $reservationId, array $input): array
    {
        $decision = $this->validateDecision($input);

        return $this->run($user, function (PDO $pdo) use ($user, $reservationId, $decision) {
            $access = $this->repository->findUserAccess($pdo, $user->getId());

            if (!$access
                || $access['role'] !== 'admin'
                || $access['account_status'] !== 'active') {
                throw new ApiException('Administrator access required.', 403);
            }

            $result = $this->repository->decide(
                $pdo,
                $reservationId,
                $decision['approve'],
                $decision['reason']
            );

            return [
                'reservation' => $this->repository->findById($pdo, $reservationId),
                'result' => $result,
            ];
        });
    }

    /** The owner (or an admin) cancels a pending or approved reservation. */
    public function cancel(AuthenticatedUser $user, int $reservationId): array
    {
        return $this->run($user, function (PDO $pdo) use ($user, $reservationId) {
            $this->assertActiveAccount($pdo, $user);

            $this->repository->cancel($pdo, $reservationId);

            return $this->repository->findById($pdo, $reservationId);
        });
    }

    // ------------------------------------------------------------------
    // Booking rules
    // ------------------------------------------------------------------

    private function assertNoConflicts(PDO $pdo, AuthenticatedUser $user, array $data): void
    {
        $day = (new DateTimeImmutable($data['reservation_date']))->format('l');

        $class = $this->repository->findScheduleConflict(
            $pdo,
            $data['room_id'],
            $day,
            $data['start_time'],
            $data['end_time']
        );

        if ($class) {
            throw new ApiException(
                'Class schedule conflict: the room is used for "' . $class['subject_title'] . '" from '
                . $this->shortTime($class['start_time']) . ' to ' . $this->shortTime($class['end_time']) . '.',
                409
            );
        }

        $approved = $this->repository->findApprovedOverlap(
            $pdo,
            $data['room_id'],
            $data['reservation_date'],
            $data['start_time'],
            $data['end_time']
        );

        if ($approved) {
            throw new ApiException(
                'This time overlaps an approved reservation ('
                . $this->shortTime($approved['start_time']) . ' - ' . $this->shortTime($approved['end_time']) . ').',
                409
            );
        }

        $pending = $this->repository->findOwnPendingOverlap(
            $pdo,
            $user->getId(),
            $data['room_id'],
            $data['reservation_date'],
            $data['start_time'],
            $data['end_time']
        );

        if ($pending) {
            throw new ApiException(
                'You already have a pending request for this time ('
                . $this->shortTime($pending['start_time']) . ' - ' . $this->shortTime($pending['end_time']) . ').',
                409
            );
        }
    }

    private function assertActiveAccount(PDO $pdo, AuthenticatedUser $user): void
    {
        $access = $this->repository->findUserAccess($pdo, $user->getId());

        if (!$access || $access['account_status'] !== 'active') {
            throw new ApiException('Your account is inactive.', 403);
        }
    }

    // ------------------------------------------------------------------
    // Input validation
    // ------------------------------------------------------------------

    private function validateCreate(array $input): array
    {
        $allowed = ['room_id', 'faculty_id', 'subject', 'reservation_date', 'start_time', 'end_time'];

        $unknown = array_diff(array_keys($input), $allowed);

        if (!empty($unknown)) {
            throw new ApiException('Invalid fields: ' . implode(', ', $unknown), 422);
        }

        $roomId = filter_var($input['room_id'] ?? null, FILTER_VALIDATE_INT);

        if ($roomId === false || $roomId < 1) {
            throw new ApiException('A valid room_id is required.', 422);
        }

        $facultyId = trim((string) ($input['faculty_id'] ?? ''));

        if (!$this->isUuid($facultyId)) {
            throw new ApiException('A valid faculty_id is required.', 422);
        }

        $subject = trim((string) ($input['subject'] ?? ''));

        if ($subject === '' || mb_strlen($subject) > 150) {
            throw new ApiException('Subject is required and must not exceed 150 characters.', 422);
        }

        $date = $this->parseDate($input['reservation_date'] ?? null, 'reservation_date');
        $start = $this->parseTime($input['start_time'] ?? null, 'start_time');
        $end = $this->parseTime($input['end_time'] ?? null, 'end_time');

        $startMinutes = $this->minutes($start);
        $endMinutes = $this->minutes($end);

        if ($startMinutes >= $endMinutes) {
            throw new ApiException('Start time must be earlier than end time.', 422);
        }

        if ($startMinutes < self::OPEN_MINUTES || $endMinutes > self::CLOSE_MINUTES) {
            throw new ApiException('Reservations are only allowed between 07:00 and 21:00.', 422);
        }

        $now = new DateTimeImmutable('now');
        $today = $now->format('Y-m-d');

        if ($date < $today) {
            throw new ApiException('You cannot reserve a room for a past date.', 422);
        }

        if ($date === $today && $startMinutes <= ((int) $now->format('G')) * 60 + (int) $now->format('i')) {
            throw new ApiException('Start time must be later than the current time.', 422);
        }

        return [
            'room_id' => $roomId,
            'faculty_id' => strtolower($facultyId),
            'subject' => $subject,
            'reservation_date' => $date,
            'start_time' => $start,
            'end_time' => $end,
        ];
    }

    private function validateDecision(array $input): array
    {
        $unknown = array_diff(array_keys($input), ['approve', 'reason']);

        if (!empty($unknown)) {
            throw new ApiException('Invalid fields: ' . implode(', ', $unknown), 422);
        }

        if (!array_key_exists('approve', $input) || !is_bool($input['approve'])) {
            throw new ApiException('approve must be true or false.', 422);
        }

        $reason = null;

        if (isset($input['reason'])) {
            $reason = trim((string) $input['reason']);

            if (mb_strlen($reason) > 500) {
                throw new ApiException('Reason must not exceed 500 characters.', 422);
            }

            if ($reason === '') {
                $reason = null;
            }
        }

        return ['approve' => $input['approve'], 'reason' => $reason];
    }

    /** Validates the date range used by the taken-slots endpoint. */
    private function validateRange(mixed $from, mixed $to): array
    {
        $fromDate = $this->parseDate($from, 'from');
        $toDate = $this->parseDate($to, 'to');

        if ($fromDate > $toDate) {
            throw new ApiException('"from" must not be later than "to".', 422);
        }

        $days = (new DateTimeImmutable($fromDate))->diff(new DateTimeImmutable($toDate))->days;

        if ($days > self::MAX_RANGE_DAYS) {
            throw new ApiException('The date range cannot exceed ' . self::MAX_RANGE_DAYS . ' days.', 422);
        }

        return [$fromDate, $toDate];
    }

    private function parseDate(mixed $value, string $field): string
    {
        $text = trim((string) $value);
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $text);

        if (!$date || $date->format('Y-m-d') !== $text) {
            throw new ApiException($field . ' must be a valid date in YYYY-MM-DD format.', 422);
        }

        return $text;
    }

    private function parseTime(mixed $value, string $field): string
    {
        $text = trim((string) $value);

        if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/', $text, $m)) {
            throw new ApiException($field . ' must be a valid time in HH:MM format.', 422);
        }

        return $m[1] . ':' . $m[2] . ':' . ($m[3] ?? '00');
    }

    private function minutes(string $time): int
    {
        [$h, $m] = array_map('intval', explode(':', $time));

        return $h * 60 + $m;
    }

    private function shortTime(string $time): string
    {
        return substr($time, 0, 5);
    }

    private function isUuid(string $value): bool
    {
        return (bool) preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
            $value
        );
    }

    // ------------------------------------------------------------------
    // Database error translation
    // ------------------------------------------------------------------

    private function run(AuthenticatedUser $user, callable $callback): mixed
    {
        try {
            return Database::runInUserContext($user, $callback);
        } catch (PDOException $e) {
            throw $this->translate($e);
        }
    }

    /**
     * Turns raw PostgreSQL errors (including the messages raised by
     * decide_reservation / cancel_reservation) into clean API errors.
     */
    private function translate(PDOException $e): Throwable
    {
        $state = (string) ($e->errorInfo[0] ?? $e->getCode());
        $raw = (string) ($e->errorInfo[2] ?? $e->getMessage());

        if ($state === 'P0001') {
            $message = $raw;

            if (preg_match('/ERROR:\s+(.+?)(?:\R\s*CONTEXT:|$)/s', $raw, $m)) {
                $message = trim($m[1]);
            }

            if (preg_match('/unauthorized|only active|only admin/i', $message)) {
                return new ApiException($message, 403);
            }

            if (preg_match('/not found/i', $message)) {
                return new ApiException($message, 404);
            }

            return new ApiException($message, 409);
        }

        if ($state === '23P01') {
            return new ApiException('This time overlaps an approved reservation for the room.', 409);
        }

        if ($state === '42501') {
            return new ApiException('You do not have permission to do this.', 403);
        }

        if ($state === '23503' || $state === '23514') {
            return new ApiException('The reservation data is invalid.', 422);
        }

        return $e;
    }
}