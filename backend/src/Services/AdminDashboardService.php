<?php

namespace App\Services;

use App\Auth\AuthenticatedUser;
use App\Database\Database;
use App\Http\ApiException;
use App\Repositories\AdminDashboardRepository;
use DateTimeImmutable;
use PDO;
use PDOException;
use Throwable;

/**
 * Everything the admin dashboard shows, in one read-only call.
 */
class AdminDashboardService
{
    private const PENDING_LIMIT = 5;
    private const ACTIVITY_LIMIT = 10;

    private AdminDashboardRepository $repository;

    public function __construct(?AdminDashboardRepository $repository = null)
    {
        $this->repository = $repository ?? new AdminDashboardRepository();
    }

    public function get(AuthenticatedUser $user): array
    {
        try {
            return Database::runInUserContext($user, function (PDO $pdo) use ($user) {
                if (!$this->repository->isActiveAdmin($pdo, $user->getId())) {
                    throw new ApiException('Administrator access required.', 403);
                }

                // Cancel overdue pending requests first so the numbers are never stale
                $this->expireStalePending($pdo);

                $summary = $this->repository->summary($pdo);

                return [
                    'generated_at' => (new DateTimeImmutable('now'))->format(DATE_ATOM),
                    'today' => $summary['today'] ?? null,
                    'rooms' => [
                        'total' => (int) ($summary['rooms_total'] ?? 0),
                        'active' => (int) ($summary['rooms_active'] ?? 0),
                    ],
                    'pending_users' => (int) ($summary['pending_users'] ?? 0),
                    'pending_reservations' => [
                        'count' => (int) ($summary['pending_reservations'] ?? 0),
                        'items' => array_map(
                            fn (array $row) => $this->presentPending($row),
                            $this->repository->pendingReservations($pdo, self::PENDING_LIMIT)
                        ),
                    ],
                    'today_bookings' => [
                        'approved' => (int) ($summary['today_approved'] ?? 0),
                        'pending' => (int) ($summary['today_pending'] ?? 0),
                        'rejected' => (int) ($summary['today_rejected'] ?? 0),
                        'cancelled' => (int) ($summary['today_cancelled'] ?? 0),
                    ],
                    'room_status' => array_map(
                        fn (array $row) => $this->presentRoom($row),
                        $this->repository->roomStatus($pdo)
                    ),
                    'activity' => array_map(
                        fn (array $row) => $this->presentActivity($row),
                        $this->repository->todayActivity($pdo, self::ACTIVITY_LIMIT)
                    ),
                ];
            });
        } catch (PDOException $e) {
            throw $this->translate($e);
        }
    }

    /**
     * Runs the auto-cancel. If it ever fails, the error is logged and the dashboard
     * still loads (the savepoint keeps the transaction usable).
     */
    private function expireStalePending(PDO $pdo): void
    {
        try {
            $pdo->exec('SAVEPOINT crs_expire_pending');
            $this->repository->expireStalePending($pdo);
            $pdo->exec('RELEASE SAVEPOINT crs_expire_pending');
        } catch (Throwable $e) {
            error_log('[Auto-cancel] ' . $e->getMessage());

            try {
                $pdo->exec('ROLLBACK TO SAVEPOINT crs_expire_pending');
            } catch (Throwable $ignored) {
                // the next query will report any real problem
            }
        }
    }

    // ------------------------------------------------------------------
    // Presenting rows
    // ------------------------------------------------------------------

    private function presentPending(array $row): array
    {
        return [
            'reservation_id' => (int) $row['reservation_id'],
            'ref' => $this->ref($row['reservation_id']),
            'room' => $this->roomLabel($row),
            'requester' => $row['student_name'],
            'faculty' => $row['faculty_name'],
            'subject' => $row['subject'],
            'reservation_date' => $row['reservation_date'],
            'start_time' => $row['start_time'],
            'end_time' => $row['end_time'],
            'created_at' => $this->iso($row['created_at']),
        ];
    }

    /** status: in_use (reservation or class), free, inactive */
    private function presentRoom(array $row): array
    {
        $active = filter_var($row['is_active'], FILTER_VALIDATE_BOOLEAN);
        $current = null;

        if ($row['reservation_id'] !== null) {
            $current = [
                'type' => 'reservation',
                'ref' => $this->ref($row['reservation_id']),
                'title' => $row['res_subject'],
                'who' => $row['res_student'],
                'faculty' => $row['res_faculty'],
                'start_time' => $row['res_start'],
                'end_time' => $row['res_end'],
            ];
        } elseif ($row['cls_title'] !== null) {
            $current = [
                'type' => 'class',
                'ref' => null,
                'title' => trim($row['cls_title'] . ($row['cls_code'] ? ' (' . $row['cls_code'] . ')' : '')),
                'who' => $this->classLabel($row['cls_program'], $row['cls_year'], $row['cls_section']),
                'faculty' => $row['cls_faculty'],
                'start_time' => $row['cls_start'],
                'end_time' => $row['cls_end'],
            ];
        }

        return [
            'room_id' => (int) $row['room_id'],
            'room_number' => $row['room_number'],
            'room_name' => $row['room_name'],
            'floor' => (int) $row['floor'],
            'room_type' => $row['room_type'],
            'is_active' => $active,
            'status' => !$active ? 'inactive' : ($current ? 'in_use' : 'free'),
            'current' => $active ? $current : null,
        ];
    }

    private function presentActivity(array $row): array
    {
        return [
            'reservation_id' => (int) $row['reservation_id'],
            'ref' => $this->ref($row['reservation_id']),
            'room' => $this->roomLabel($row),
            'requester' => $row['student_name'],
            'requester_role' => $row['requester_role'],
            'faculty' => $row['faculty_name'],
            'subject' => $row['subject'],
            'reservation_date' => $row['reservation_date'],
            'start_time' => $row['start_time'],
            'end_time' => $row['end_time'],
            'status' => $row['status'],
            'auto_cancelled' => $row['status'] === 'cancelled'
                && str_starts_with((string) $row['admin_remarks'], 'Automatically cancelled'),
            'created_at' => $this->iso($row['created_at']),
            'responded_at' => $this->iso($row['responded_at']),
        ];
    }

    /** RES-0041 */
    private function ref(mixed $id): string
    {
        return 'RES-' . str_pad((string) $id, 4, '0', STR_PAD_LEFT);
    }

    /** "Room 201 - Multi-Purpose Seminar Hall" */
    private function roomLabel(array $row): string
    {
        $name = trim((string) ($row['room_name'] ?? ''));

        return 'Room ' . $row['room_number'] . ($name !== '' ? ' - ' . $name : '');
    }

    /** 'BS of Information Technology (BSIT)', 3, 1 -> 'BSIT 3-1' */
    private function classLabel(?string $program, mixed $year, mixed $section): ?string
    {
        $code = (string) $program;

        if (preg_match('/\(([^)]+)\)\s*$/', $code, $m)) {
            $code = $m[1];
        }

        $label = trim($code);

        if ($year !== null && $year !== '') {
            $label = trim($label . ' ' . $year . '-' . ($section !== null && $section !== '' ? $section : '?'));
        }

        return $label !== '' ? $label : null;
    }

    private function iso(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (new DateTimeImmutable((string) $value))->format(DATE_ATOM);
    }

    // ------------------------------------------------------------------
    // Database error translation
    // ------------------------------------------------------------------

    private function translate(PDOException $e): Throwable
    {
        $state = (string) ($e->errorInfo[0] ?? $e->getCode());

        if ($state === '42501') {
            return new ApiException('You do not have permission to do this.', 403);
        }

        return $e;
    }
}