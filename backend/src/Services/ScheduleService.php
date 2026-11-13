<?php

namespace App\Services;

use App\Auth\AuthenticatedUser;
use App\Database\Database;
use App\Http\ApiException;
use App\Repositories\ScheduleRepository;
use PDO;
use PDOException;
use Throwable;

/**
 * Schedule Manager: the master timetable of recurring weekly classes.
 *  - Admin: create / edit / delete schedules for every room.
 *  - Student: read-only view of every room's timetable.
 *  - Faculty: read-only, and only the classes tagged to their own account.
 */
class ScheduleService
{
    /** Classes run Monday to Saturday only. */
    public const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    private const OPEN_MINUTES = 7 * 60;
    private const CLOSE_MINUTES = 21 * 60;

    private const EDITABLE = [
        'room_id', 'day_of_week', 'start_time', 'end_time',
        'subject_code', 'subject_title',
        'program_course', 'year_level', 'section', 'faculty_id',
    ];

    private ScheduleRepository $repository;

    public function __construct(?ScheduleRepository $repository = null)
    {
        $this->repository = $repository ?? new ScheduleRepository();
    }

    // ------------------------------------------------------------------
    // Queries
    // ------------------------------------------------------------------

    public function list(AuthenticatedUser $user, array $filters = []): array
    {
        return $this->run($user, function (PDO $pdo) use ($user, $filters) {
            $me = $this->activeProfile($pdo, $user);

            // Faculty only ever see classes tagged to them (RLS enforces it too).
            if ($me['role'] === 'faculty') {
                $filters['faculty_id'] = $user->getId();
            }

            $rows = $this->repository->findAll($pdo, $filters);

            if ($me['role'] === 'student') {
                $rows = array_map(fn (array $row) => $row + [
                    'is_my_class' => $this->matchesClass($row, $me),
                ], $rows);
            }

            return $rows;
        });
    }

    public function get(AuthenticatedUser $user, int $scheduleId): array
    {
        return $this->run($user, function (PDO $pdo) use ($user, $scheduleId) {
            $me = $this->activeProfile($pdo, $user);

            $row = $this->repository->findById($pdo, $scheduleId);

            // RLS hides a faculty's other classes, so "hidden" and "missing" look the same.
            if (!$row || ($me['role'] === 'faculty' && $row['faculty_id'] !== $user->getId())) {
                throw new ApiException('Schedule not found.', 404);
            }

            if ($me['role'] === 'student') {
                $row['is_my_class'] = $this->matchesClass($row, $me);
            }

            return $row;
        });
    }

    // ------------------------------------------------------------------
    // Commands (admin only)
    // ------------------------------------------------------------------

    public function create(AuthenticatedUser $user, array $input): array
    {
        $confirmed = $this->takeOverlapConfirmation($input);
        $data = $this->validate($input, null);

        return $this->run($user, function (PDO $pdo) use ($user, $data, $confirmed) {
            $this->assertAdmin($pdo, $user);
            $this->assertReferences($pdo, $data);
            $this->assertNoOverlap($pdo, $data, null);
            $this->assertReservationOverlapConfirmed($pdo, $data, $confirmed);

            $data['created_by'] = $user->getId();

            $id = $this->repository->insert($pdo, $data);

            return $this->repository->findById($pdo, $id);
        });
    }

    /** PATCH: only the fields that were sent change. */
    public function update(AuthenticatedUser $user, int $scheduleId, array $input): array
    {
        $confirmed = $this->takeOverlapConfirmation($input);

        return $this->run($user, function (PDO $pdo) use ($user, $scheduleId, $input, $confirmed) {
            $this->assertAdmin($pdo, $user);

            $current = $this->repository->findById($pdo, $scheduleId);

            if (!$current) {
                throw new ApiException('Schedule not found.', 404);
            }

            $data = $this->validate($input, $current);

            $this->assertReferences($pdo, $data);
            $this->assertNoOverlap($pdo, $data, $scheduleId);

            // Only ask again when the room, day or time actually changed
            $sameSlot = $data['room_id'] === (int) $current['room_id']
                && strcasecmp($data['day_of_week'], (string) $current['day_of_week']) === 0
                && $data['start_time'] === $current['start_time']
                && $data['end_time'] === $current['end_time'];

            $this->assertReservationOverlapConfirmed($pdo, $data, $confirmed || $sameSlot);

            if (!$this->repository->update($pdo, $scheduleId, $data)) {
                throw new ApiException('Schedule not found.', 404);
            }

            return $this->repository->findById($pdo, $scheduleId);
        });
    }

    public function delete(AuthenticatedUser $user, int $scheduleId): array
    {
        return $this->run($user, function (PDO $pdo) use ($user, $scheduleId) {
            $this->assertAdmin($pdo, $user);

            $existing = $this->repository->findById($pdo, $scheduleId);

            if (!$existing || !$this->repository->delete($pdo, $scheduleId)) {
                throw new ApiException('Schedule not found.', 404);
            }

            return ['schedule_id' => $scheduleId, 'deleted' => true];
        });
    }

    // ------------------------------------------------------------------
    // Rules
    // ------------------------------------------------------------------

    private function assertAdmin(PDO $pdo, AuthenticatedUser $user): void
    {
        $me = $this->repository->findUserProfile($pdo, $user->getId());

        if (!$me || $me['role'] !== 'admin' || $me['account_status'] !== 'active') {
            throw new ApiException('Administrator access required.', 403);
        }
    }

    private function activeProfile(PDO $pdo, AuthenticatedUser $user): array
    {
        $me = $this->repository->findUserProfile($pdo, $user->getId());

        if (!$me || $me['account_status'] !== 'active') {
            throw new ApiException('Your account is inactive.', 403);
        }

        return $me;
    }

    private function assertReferences(PDO $pdo, array $data): void
    {
        if (!$this->repository->roomExists($pdo, $data['room_id'])) {
            throw new ApiException('Room not found.', 404);
        }

        if ($data['faculty_id'] !== null && !$this->repository->isActiveFaculty($pdo, $data['faculty_id'])) {
            throw new ApiException('The selected faculty member is not available.', 422);
        }
    }

    private function assertNoOverlap(PDO $pdo, array $data, ?int $ignoreId): void
    {
        $clash = $this->repository->findOverlap(
            $pdo,
            $data['room_id'],
            $data['day_of_week'],
            $data['start_time'],
            $data['end_time'],
            $ignoreId
        );

        if ($clash) {
            throw new ApiException(
                'Schedule conflict: the room already has "' . $clash['subject_title'] . '" on '
                . $data['day_of_week'] . ' from ' . substr($clash['start_time'], 0, 5)
                . ' to ' . substr($clash['end_time'], 0, 5) . '.',
                409
            );
        }
    }

    /**
     * Students store the signup text ("BS of Information Technology (BSIT)").
     * Programs are compared by the short code in brackets (BSIT).
     */
    private function programKey(string $program): string
    {
        $program = mb_strtolower(trim($program));

        return preg_match('/\(([^)]+)\)\s*$/u', $program, $m) ? trim($m[1]) : $program;
    }

    /** Pulls the admin's "yes, save it anyway" flag out of the request body. */
    private function takeOverlapConfirmation(array &$input): bool
    {
        $confirmed = filter_var($input['confirm_reservation_overlap'] ?? false, FILTER_VALIDATE_BOOLEAN);

        unset($input['confirm_reservation_overlap']);

        return $confirmed;
    }

    /**
     * An approved reservation already uses this room and time on some upcoming
     * date. The admin may still schedule the class: the reservation stays as it
     * is for that day. Without confirmation the save stops with a 409 that lists
     * the reservations so the screen can ask.
     */
    private function assertReservationOverlapConfirmed(PDO $pdo, array $data, bool $confirmed): void
    {
        if ($confirmed) {
            return;
        }

        $isoDay = (int) array_search($data['day_of_week'], self::DAYS, true) + 1;

        $rows = $this->repository->findApprovedReservationOverlaps(
            $pdo,
            $data['room_id'],
            $isoDay,
            $data['start_time'],
            $data['end_time'],
            date('Y-m-d')
        );

        if (!empty($rows)) {
            throw new ApiException(
                'There is currently an approved reservation in this room at this time.',
                409,
                ['code' => 'RESERVATION_OVERLAP', 'reservations' => $rows]
            );
        }
    }

    private function matchesClass(array $schedule, array $student): bool
    {
        return $schedule['program_course'] !== null
            && $student['program_course'] !== null
            && $this->programKey((string) $schedule['program_course']) === $this->programKey((string) $student['program_course'])
            && (int) $schedule['year_level'] === (int) $student['year_level']
            && (int) $schedule['section'] === (int) $student['section'];
    }

    // ------------------------------------------------------------------
    // Input validation
    // ------------------------------------------------------------------

    /**
     * Validates a create body (when $current is null) or a PATCH body merged
     * over the existing row, and returns the full set of editable columns.
     */
    private function validate(array $input, ?array $current): array
    {
        $unknown = array_diff(array_keys($input), self::EDITABLE);

        if (!empty($unknown)) {
            throw new ApiException('Invalid fields: ' . implode(', ', $unknown), 422);
        }

        if ($current !== null && empty($input)) {
            throw new ApiException('Send at least one field to update.', 422);
        }

        $pick = function (string $key) use ($input, $current) {
            if (array_key_exists($key, $input)) {
                return $input[$key];
            }

            return $current[$key] ?? null;
        };

        $errors = [];

        $roomId = filter_var($pick('room_id'), FILTER_VALIDATE_INT);

        if ($roomId === false || $roomId < 1) {
            $errors['room_id'] = 'A valid room_id is required.';
        }

        $day = $this->parseDay($pick('day_of_week'));

        if ($day === null) {
            $errors['day_of_week'] = 'day_of_week must be Monday to Saturday (Sunday is not allowed).';
        }

        $start = $this->parseTime($pick('start_time'));
        $end = $this->parseTime($pick('end_time'));

        if ($start === null) {
            $errors['start_time'] = 'start_time must be a valid time in HH:MM format.';
        }

        if ($end === null) {
            $errors['end_time'] = 'end_time must be a valid time in HH:MM format.';
        }

        if ($start !== null && $end !== null) {
            $startMinutes = $this->minutes($start);
            $endMinutes = $this->minutes($end);

            if ($startMinutes >= $endMinutes) {
                $errors['end_time'] = 'Start time must be earlier than end time.';
            } elseif ($startMinutes < self::OPEN_MINUTES || $endMinutes > self::CLOSE_MINUTES) {
                $errors['start_time'] = 'Classes must be scheduled between 07:00 and 21:00.';
            }
        }

        $title = trim((string) $pick('subject_title'));

        if ($title === '' || mb_strlen($title) > 150) {
            $errors['subject_title'] = 'subject_title is required (max 150 characters).';
        }

        $code = $pick('subject_code');
        $code = $code === null ? '' : trim((string) $code);

        if (mb_strlen($code) > 30) {
            $errors['subject_code'] = 'subject_code must not exceed 30 characters.';
        }

        $program = trim((string) $pick('program_course'));

        if ($program === '' || mb_strlen($program) > 50) {
            $errors['program_course'] = 'program_course is required (max 50 characters).';
        }

        $year = filter_var($pick('year_level'), FILTER_VALIDATE_INT);

        if ($year === false || $year < 1 || $year > 6) {
            $errors['year_level'] = 'year_level must be a number from 1 to 6.';
        }

        $section = filter_var($pick('section'), FILTER_VALIDATE_INT);

        if ($section === false || $section < 1 || $section > 99) {
            $errors['section'] = 'section must be a number from 1 to 99.';
        }

        $facultyId = $pick('faculty_id');
        $facultyId = $facultyId === null || $facultyId === '' ? null : strtolower(trim((string) $facultyId));

        if ($facultyId !== null && !$this->isUuid($facultyId)) {
            $errors['faculty_id'] = 'faculty_id must be a valid user ID.';
        }

        if (!empty($errors)) {
            throw new ApiException('The schedule data is invalid.', 422, $errors);
        }

        return [
            'room_id' => $roomId,
            'day_of_week' => $day,
            'start_time' => $start,
            'end_time' => $end,
            'subject_code' => $code === '' ? null : $code,
            'subject_title' => $title,
            'program_course' => $program,
            'year_level' => $year,
            'section' => $section,
            // Keeps the older "BSIT 2-2" text column in sync for existing screens.
            'course_section' => $this->programKey($program) === mb_strtolower($program)
                ? $program . ' ' . $year . '-' . $section
                : mb_strtoupper($this->programKey($program)) . ' ' . $year . '-' . $section,
            'faculty_id' => $facultyId,
        ];
    }

    private function parseDay(mixed $value): ?string
    {
        $text = trim((string) $value);

        foreach (self::DAYS as $day) {
            if (strcasecmp($day, $text) === 0) {
                return $day;
            }
        }

        return null;
    }

    private function parseTime(mixed $value): ?string
    {
        $text = trim((string) $value);

        if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/', $text, $m)) {
            return null;
        }

        return $m[1] . ':' . $m[2] . ':' . ($m[3] ?? '00');
    }

    private function minutes(string $time): int
    {
        [$h, $m] = array_map('intval', explode(':', $time));

        return $h * 60 + $m;
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

    private function translate(PDOException $e): Throwable
    {
        $state = (string) ($e->errorInfo[0] ?? $e->getCode());

        if ($state === '23P01') {
            return new ApiException('This class overlaps another class scheduled in the same room.', 409);
        }

        if ($state === '42501') {
            return new ApiException('You do not have permission to do this.', 403);
        }

        if ($state === '23503' || $state === '23514') {
            return new ApiException('The schedule data is invalid.', 422);
        }

        return $e;
    }
}