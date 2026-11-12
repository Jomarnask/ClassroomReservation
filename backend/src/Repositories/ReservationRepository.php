<?php

namespace App\Repositories;

use PDO;

/**
 * All SQL for reservations. Every method expects to run inside
 * Database::runInUserContext(), so Row Level Security applies to the caller.
 */
class ReservationRepository
{
    private const SELECT = "
        SELECT
            r.reservation_id,
            r.room_id,
            rm.room_number,
            rm.room_name,
            rm.floor,
            r.student_id,
            s.full_name AS student_name,
            s.pup_webmail AS student_webmail,
            s.student_number,
            s.program_course,
            s.year_level,
            s.section,
            r.faculty_id,
            COALESCE(f.full_name, fu.full_name) AS faculty_name,
            r.admin_id,
            a.full_name AS admin_name,
            r.subject,
            r.reservation_date,
            r.start_time,
            r.end_time,
            r.status,
            r.admin_remarks,
            r.responded_at,
            r.created_at
        FROM public.room_reservations r
        LEFT JOIN public.rooms rm ON rm.room_id = r.room_id
        LEFT JOIN public.users s ON s.user_id = r.student_id
        LEFT JOIN public.users fu ON fu.user_id = r.faculty_id
        LEFT JOIN public.users a ON a.user_id = r.admin_id
        LEFT JOIN public.list_active_faculty() f ON f.user_id = r.faculty_id
    ";

    // ------------------------------------------------------------------
    // Reading reservations
    // ------------------------------------------------------------------

    public function findAll(PDO $pdo, array $filters = []): array
    {
        $sql = self::SELECT . ' WHERE 1 = 1';
        $params = [];

        if (isset($filters['student_id'])) {
            $sql .= ' AND r.student_id = CAST(:student_id AS uuid)';
            $params['student_id'] = $filters['student_id'];
        }

        if (isset($filters['status'])) {
            $sql .= ' AND r.status = CAST(:status AS public.reservation_status_type)';
            $params['status'] = $filters['status'];
        }

        if (isset($filters['room_id'])) {
            $sql .= ' AND r.room_id = :room_id';
            $params['room_id'] = $filters['room_id'];
        }

        if (isset($filters['date_from'])) {
            $sql .= ' AND r.reservation_date >= CAST(:date_from AS date)';
            $params['date_from'] = $filters['date_from'];
        }

        if (isset($filters['date_to'])) {
            $sql .= ' AND r.reservation_date <= CAST(:date_to AS date)';
            $params['date_to'] = $filters['date_to'];
        }

        $limit = (int) ($filters['limit'] ?? 200);

        $sql .= ' ORDER BY r.created_at DESC, r.reservation_id DESC LIMIT ' . $limit;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function findById(PDO $pdo, int $reservationId): ?array
    {
        $stmt = $pdo->prepare(self::SELECT . ' WHERE r.reservation_id = :id LIMIT 1');
        $stmt->execute(['id' => $reservationId]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    // ------------------------------------------------------------------
    // Writing reservations
    // ------------------------------------------------------------------

    /** @return int the new reservation_id */
    public function insert(PDO $pdo, array $data): int
    {
        $stmt = $pdo->prepare("
            INSERT INTO public.room_reservations (
                room_id,
                student_id,
                faculty_id,
                subject,
                reservation_date,
                start_time,
                end_time
            )
            VALUES (
                :room_id,
                CAST(:student_id AS uuid),
                CAST(:faculty_id AS uuid),
                :subject,
                CAST(:reservation_date AS date),
                CAST(:start_time AS time),
                CAST(:end_time AS time)
            )
            RETURNING reservation_id
        ");

        $stmt->execute([
            'room_id' => $data['room_id'],
            'student_id' => $data['student_id'],
            'faculty_id' => $data['faculty_id'],
            'subject' => $data['subject'],
            'reservation_date' => $data['reservation_date'],
            'start_time' => $data['start_time'],
            'end_time' => $data['end_time'],
        ]);

        return (int) $stmt->fetchColumn();
    }

    /** Calls the database function public.decide_reservation(). */
    public function decide(PDO $pdo, int $reservationId, bool $approve, ?string $reason): array
    {
        $stmt = $pdo->prepare("
            SELECT public.decide_reservation(
                :id,
                CAST(:approve AS boolean),
                CAST(:reason AS text)
            ) AS result
        ");

        $stmt->execute([
            'id' => $reservationId,
            'approve' => $approve ? 'true' : 'false',
            'reason' => $reason,
        ]);

        return json_decode((string) $stmt->fetchColumn(), true) ?: [];
    }

    /** Calls the database function public.cancel_reservation(). */
    public function cancel(PDO $pdo, int $reservationId): array
    {
        $stmt = $pdo->prepare('SELECT public.cancel_reservation(:id) AS result');
        $stmt->execute(['id' => $reservationId]);

        return json_decode((string) $stmt->fetchColumn(), true) ?: [];
    }

    // ------------------------------------------------------------------
    // Lookups used by the booking rules
    // ------------------------------------------------------------------

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

    public function findRoomState(PDO $pdo, int $roomId): ?array
    {
        $stmt = $pdo->prepare("
            SELECT room_id, room_number, is_active
            FROM public.rooms
            WHERE room_id = :id
            LIMIT 1
        ");
        $stmt->execute(['id' => $roomId]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    public function isActiveFaculty(PDO $pdo, string $facultyId): bool
    {
        $stmt = $pdo->prepare("
            SELECT 1
            FROM public.list_active_faculty()
            WHERE user_id = CAST(:id AS uuid)
            LIMIT 1
        ");
        $stmt->execute(['id' => $facultyId]);

        return (bool) $stmt->fetchColumn();
    }

    /**
     * Calls public.create_student_reservation(), which applies the class rules:
     *  - slot owned by another program / year level / section -> exception
     *  - slot owned by the student's own class                -> inserted as 'approved'
     *  - free slot                                            -> inserted as 'pending'
     *
     * @return array{reservation_id:int,status:string,auto_approved:bool,auto_rejected_competing_count:int}
     */
    public function createStudentReservation(PDO $pdo, array $data): array
    {
        $stmt = $pdo->prepare("
            SELECT public.create_student_reservation(
                :room_id,
                CAST(:faculty_id AS uuid),
                CAST(:subject AS varchar),
                CAST(:reservation_date AS date),
                CAST(:start_time AS time),
                CAST(:end_time AS time)
            ) AS result
        ");

        $stmt->execute([
            'room_id' => $data['room_id'],
            'faculty_id' => $data['faculty_id'],
            'subject' => $data['subject'],
            'reservation_date' => $data['reservation_date'],
            'start_time' => $data['start_time'],
            'end_time' => $data['end_time'],
        ]);

        return json_decode((string) $stmt->fetchColumn(), true) ?: [];
    }

    /**
     * An APPROVED reservation (anyone's) that overlaps the requested time.
     * Uses get_taken_slots() because students cannot see other people's
     * reservations through Row Level Security.
     */
    public function findApprovedOverlap(PDO $pdo, int $roomId, string $date, string $start, string $end): ?array
    {
        $stmt = $pdo->prepare("
            SELECT start_time, end_time
            FROM public.get_taken_slots(:room_id, CAST(:date_from AS date), CAST(:date_to AS date))
            WHERE status = 'approved'
              AND start_time < CAST(:end_time AS time)
              AND end_time > CAST(:start_time AS time)
            LIMIT 1
        ");
        $stmt->execute([
            'room_id' => $roomId,
            'date_from' => $date,
            'date_to' => $date,
            'start_time' => $start,
            'end_time' => $end,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /** One of the caller's own PENDING reservations that overlaps the requested time. */
    public function findOwnPendingOverlap(
        PDO $pdo,
        string $userId,
        int $roomId,
        string $date,
        string $start,
        string $end
    ): ?array {
        $stmt = $pdo->prepare("
            SELECT start_time, end_time
            FROM public.room_reservations
            WHERE student_id = CAST(:user_id AS uuid)
              AND room_id = :room_id
              AND reservation_date = CAST(:the_date AS date)
              AND status = 'pending'
              AND start_time < CAST(:end_time AS time)
              AND end_time > CAST(:start_time AS time)
            LIMIT 1
        ");
        $stmt->execute([
            'user_id' => $userId,
            'room_id' => $roomId,
            'the_date' => $date,
            'start_time' => $start,
            'end_time' => $end,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /** Pending + approved slots of a room in a date range (anonymous). */
    public function takenSlots(PDO $pdo, int $roomId, string $from, string $to): array
    {
        $stmt = $pdo->prepare("
            SELECT reservation_date, start_time, end_time, status::text AS status
            FROM public.get_taken_slots(
                :room_id,
                CAST(:date_from AS date),
                CAST(:date_to AS date)
            )
        ");
        $stmt->execute([
            'room_id' => $roomId,
            'date_from' => $from,
            'date_to' => $to,
        ]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}