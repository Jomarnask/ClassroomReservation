<?php

namespace App\Repositories;

use PDO;

/**
 * Read-only queries for the admin dashboard. Every method expects to run inside
 * Database::runInUserContext(), so Row Level Security applies to the caller.
 * "Today" and "now" are always Philippine time (Asia/Manila).
 */
class AdminDashboardRepository
{
    /** Cancels pending requests that reached 1 hour before their start time. */
    public function expireStalePending(PDO $pdo): int
    {
        return (int) $pdo->query('SELECT public.expire_stale_pending_reservations()')->fetchColumn();
    }

    public function isActiveAdmin(PDO $pdo, string $userId): bool
    {
        $stmt = $pdo->prepare("
            SELECT 1
            FROM public.users
            WHERE user_id = CAST(:id AS uuid)
              AND role = 'admin'
              AND account_status = 'active'
            LIMIT 1
        ");
        $stmt->execute(['id' => $userId]);

        return (bool) $stmt->fetchColumn();
    }

    /** All the headline numbers in one query. */
    public function summary(PDO $pdo): array
    {
        $stmt = $pdo->query("
            WITH t AS (
                SELECT (now() AT TIME ZONE 'Asia/Manila')::date AS today
            )
            SELECT
                (SELECT today FROM t) AS today,
                (SELECT COUNT(*) FROM public.rooms) AS rooms_total,
                (SELECT COUNT(*) FROM public.rooms WHERE is_active) AS rooms_active,
                (SELECT COUNT(*) FROM public.users WHERE account_status = 'pending') AS pending_users,
                (SELECT COUNT(*) FROM public.room_reservations WHERE status = 'pending') AS pending_reservations,
                (SELECT COUNT(*) FROM public.room_reservations r, t
                  WHERE r.reservation_date = t.today AND r.status = 'approved') AS today_approved,
                (SELECT COUNT(*) FROM public.room_reservations r, t
                  WHERE r.reservation_date = t.today AND r.status = 'pending') AS today_pending,
                (SELECT COUNT(*) FROM public.room_reservations r, t
                  WHERE r.reservation_date = t.today AND r.status = 'rejected') AS today_rejected,
                (SELECT COUNT(*) FROM public.room_reservations r, t
                  WHERE r.reservation_date = t.today AND r.status = 'cancelled') AS today_cancelled
        ");

        return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    }

    /** Pending requests that start soonest (they are the most urgent to decide). */
    public function pendingReservations(PDO $pdo, int $limit): array
    {
        $stmt = $pdo->prepare("
            SELECT
                r.reservation_id,
                rm.room_number,
                rm.room_name,
                s.full_name AS student_name,
                f.full_name AS faculty_name,
                r.subject,
                r.reservation_date,
                r.start_time,
                r.end_time,
                r.created_at
            FROM public.room_reservations r
            LEFT JOIN public.rooms rm ON rm.room_id = r.room_id
            LEFT JOIN public.users s ON s.user_id = r.student_id
            LEFT JOIN public.users f ON f.user_id = r.faculty_id
            WHERE r.status = 'pending'
            ORDER BY r.reservation_date, r.start_time, r.reservation_id
            LIMIT :limit
        ");
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * One row per room with what is happening in it right now:
     * an approved reservation and/or a weekly class schedule.
     */
    public function roomStatus(PDO $pdo): array
    {
        $stmt = $pdo->query("
            WITH t AS (
                SELECT
                    (now() AT TIME ZONE 'Asia/Manila')::date AS today,
                    (now() AT TIME ZONE 'Asia/Manila')::time AS now_time,
                    (ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])
                        [EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Asia/Manila'))::int] AS dow
            )
            SELECT
                r.room_id,
                r.room_number,
                r.room_name,
                r.floor,
                r.room_type,
                r.is_active,
                res.reservation_id,
                res.subject AS res_subject,
                res.start_time AS res_start,
                res.end_time AS res_end,
                res.student_name AS res_student,
                res.faculty_name AS res_faculty,
                cls.subject_title AS cls_title,
                cls.subject_code AS cls_code,
                cls.start_time AS cls_start,
                cls.end_time AS cls_end,
                cls.program_course AS cls_program,
                cls.year_level AS cls_year,
                cls.section AS cls_section,
                cls.faculty_name AS cls_faculty
            FROM t
            CROSS JOIN public.rooms r
            LEFT JOIN LATERAL (
                SELECT rr.reservation_id, rr.subject, rr.start_time, rr.end_time,
                       s.full_name AS student_name, f.full_name AS faculty_name
                FROM public.room_reservations rr
                LEFT JOIN public.users s ON s.user_id = rr.student_id
                LEFT JOIN public.users f ON f.user_id = rr.faculty_id
                WHERE rr.room_id = r.room_id
                  AND rr.status = 'approved'
                  AND rr.reservation_date = t.today
                  AND rr.start_time <= t.now_time
                  AND rr.end_time > t.now_time
                ORDER BY rr.start_time
                LIMIT 1
            ) res ON TRUE
            LEFT JOIN LATERAL (
                SELECT sc.subject_title, sc.subject_code, sc.start_time, sc.end_time,
                       sc.program_course, sc.year_level, sc.section,
                       f.full_name AS faculty_name
                FROM public.room_schedules sc
                LEFT JOIN public.users f ON f.user_id = sc.faculty_id
                WHERE sc.room_id = r.room_id
                  AND sc.is_active
                  AND LOWER(sc.day_of_week) = t.dow
                  AND sc.start_time <= t.now_time
                  AND sc.end_time > t.now_time
                ORDER BY sc.start_time
                LIMIT 1
            ) cls ON TRUE
            ORDER BY r.floor, r.room_number
        ");

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** Reservations that were requested or decided today (newest first). */
    public function todayActivity(PDO $pdo, int $limit): array
    {
        $stmt = $pdo->prepare("
            SELECT
                r.reservation_id,
                rm.room_number,
                rm.room_name,
                s.full_name AS student_name,
                s.role::text AS requester_role,
                f.full_name AS faculty_name,
                r.subject,
                r.reservation_date,
                r.start_time,
                r.end_time,
                r.status::text AS status,
                r.admin_remarks,
                r.created_at,
                r.responded_at
            FROM public.room_reservations r
            LEFT JOIN public.rooms rm ON rm.room_id = r.room_id
            LEFT JOIN public.users s ON s.user_id = r.student_id
            LEFT JOIN public.users f ON f.user_id = r.faculty_id
            WHERE (r.created_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
               OR (r.responded_at AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date
            ORDER BY GREATEST(r.created_at, COALESCE(r.responded_at, r.created_at)) DESC, r.reservation_id DESC
            LIMIT :limit
        ");
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}