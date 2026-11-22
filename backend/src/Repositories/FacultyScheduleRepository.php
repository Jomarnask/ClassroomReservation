<?php

namespace App\Repositories;

use PDO;

/**
 * All SQL for the faculty schedule page. Every method expects to run inside
 * Database::runInUserContext(), so Row Level Security applies to the caller.
 */
class FacultyScheduleRepository
{
    /** Cancels pending requests that reached 1 hour before their start time. */
    public function expireStalePending(PDO $pdo): int
    {
        return (int) $pdo->query('SELECT public.expire_stale_pending_reservations()')->fetchColumn();
    }

    public function findUserAccess(PDO $pdo, string $userId): ?array
    {
        $stmt = $pdo->prepare("
            SELECT role::text AS role, account_status::text AS account_status
            FROM public.users
            WHERE user_id = CAST(:id AS uuid)
            LIMIT 1
        ");
        $stmt->execute(['id' => $userId]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * Reservations that tag the logged-in faculty, with student details.
     * Uses a database function because faculty cannot read student rows
     * in public.users directly (Row Level Security).
     */
    public function findTaggedReservations(PDO $pdo): array
    {
        $stmt = $pdo->query('SELECT * FROM public.get_faculty_schedule_reservations()');

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** The faculty's own active weekly class schedules, Monday first. */
    public function findClasses(PDO $pdo, string $facultyId): array
    {
        $stmt = $pdo->prepare("
            SELECT
                s.schedule_id,
                s.room_id,
                rm.room_number,
                rm.room_name,
                s.day_of_week,
                s.start_time,
                s.end_time,
                s.subject_code,
                s.subject_title,
                s.course_section
            FROM public.room_schedules s
            LEFT JOIN public.rooms rm ON rm.room_id = s.room_id
            WHERE s.faculty_id = CAST(:faculty_id AS uuid)
              AND s.is_active = TRUE
            ORDER BY
                CASE LOWER(s.day_of_week)
                    WHEN 'monday' THEN 1
                    WHEN 'tuesday' THEN 2
                    WHEN 'wednesday' THEN 3
                    WHEN 'thursday' THEN 4
                    WHEN 'friday' THEN 5
                    WHEN 'saturday' THEN 6
                    WHEN 'sunday' THEN 7
                    ELSE 8
                END,
                s.start_time ASC,
                s.schedule_id ASC
        ");
        $stmt->execute(['faculty_id' => $facultyId]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}