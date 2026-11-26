<?php

namespace App\Repositories;

use PDO;

/**
 * Reads daily faculty reservations, unreserved weekly schedules, and email
 * delivery logs via SECURITY DEFINER functions in PostgreSQL.
 */
class FacultyDailyEmailRepository
{
    /** @return array<int, array<string, mixed>> */
    public function getDailyReservations(PDO $pdo, string $date): array
    {
        $stmt = $pdo->prepare('SELECT * FROM public.get_daily_faculty_reservations(CAST(:date AS date))');
        $stmt->execute(['date' => $date]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array<int, array<string, mixed>> */
    public function getDailyUnreservedSchedules(PDO $pdo, string $date): array
    {
        $stmt = $pdo->prepare('SELECT * FROM public.get_daily_faculty_unreserved_schedules(CAST(:date AS date))');
        $stmt->execute(['date' => $date]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return string[] List of faculty UUIDs already emailed for $date */
    public function getSentFacultyIds(PDO $pdo, string $date): array
    {
        $stmt = $pdo->prepare('SELECT faculty_id::text AS faculty_id FROM public.get_sent_faculty_daily_email_ids(CAST(:date AS date))');
        $stmt->execute(['date' => $date]);

        return array_map(
            fn (array $row) => strtolower((string) $row['faculty_id']),
            $stmt->fetchAll(PDO::FETCH_ASSOC)
        );
    }

    public function recordEmailSent(
        PDO $pdo,
        string $facultyId,
        string $date,
        int $reservedCount,
        int $scheduleCount
    ): void {
        $stmt = $pdo->prepare(
            'SELECT public.record_faculty_daily_email_log(
                CAST(:faculty_id AS uuid),
                CAST(:date AS date),
                :reserved_count,
                :schedule_count
            )'
        );
        $stmt->execute([
            'faculty_id' => $facultyId,
            'date' => $date,
            'reserved_count' => $reservedCount,
            'schedule_count' => $scheduleCount,
        ]);
    }
}
