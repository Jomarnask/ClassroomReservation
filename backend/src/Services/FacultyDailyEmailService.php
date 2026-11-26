<?php

namespace App\Services;

use App\Database\Database;
use App\Http\ApiException;
use App\Repositories\FacultyDailyEmailRepository;
use DateTimeImmutable;
use DateTimeZone;
use PDO;

/**
 * Sends the 4:00 AM PH-time daily class schedule digest to active faculty.
 * Only faculty who have at least one reserved class or unreserved schedule
 * on the target date receive an email.
 */
class FacultyDailyEmailService
{
    private FacultyDailyEmailRepository $repository;
    private EmailService $mailer;
    private ?PDO $pdo;

    public function __construct(
        ?FacultyDailyEmailRepository $repository = null,
        ?EmailService $mailer = null,
        ?PDO $pdo = null
    ) {
        $this->repository = $repository ?? new FacultyDailyEmailRepository();
        $this->mailer = $mailer ?? new EmailService();
        $this->pdo = $pdo;
    }

    /**
     * @return array{
     *     date: string,
     *     dry_run: bool,
     *     force: bool,
     *     qualifying_faculty: int,
     *     sent: int,
     *     skipped_already_sent: int,
     *     failed: int
     * }
     */
    public function runForDate(
        ?string $date = null,
        bool $dryRun = false,
        bool $force = false,
        bool $skipLog = false,
        ?string $overrideTo = null
    ): array {
        $targetDate = $this->resolveDate($date);
        $pdo = $this->pdo ?? Database::getConnection();

        $reservations = $this->repository->getDailyReservations($pdo, $targetDate);
        $schedules = $this->repository->getDailyUnreservedSchedules($pdo, $targetDate);

        $grouped = $this->groupByFaculty($reservations, $schedules);
        $alreadySent = ($force || $overrideTo !== null || $skipLog)
            ? []
            : array_flip($this->repository->getSentFacultyIds($pdo, $targetDate));

        $sent = 0;
        $skipped = 0;
        $failed = 0;

        foreach ($grouped as $facultyId => $entry) {
            if (isset($alreadySent[strtolower($facultyId)])) {
                $skipped++;
                continue;
            }

            if ($dryRun) {
                $sent++;
                continue;
            }

            $ok = $this->mailer->sendFacultyDailySchedule(
                $entry['faculty'],
                $targetDate,
                $entry['reserved'],
                $entry['unreserved'],
                $overrideTo
            );

            if ($ok) {
                if (!$skipLog && $overrideTo === null) {
                    $this->repository->recordEmailSent(
                        $pdo,
                        $facultyId,
                        $targetDate,
                        count($entry['reserved']),
                        count($entry['unreserved'])
                    );
                }
                $sent++;
            } else {
                $failed++;
            }
        }

        return [
            'date' => $targetDate,
            'dry_run' => $dryRun,
            'force' => $force,
            'qualifying_faculty' => count($grouped),
            'sent' => $sent,
            'skipped_already_sent' => $skipped,
            'failed' => $failed,
        ];
    }

    private function resolveDate(?string $date): string
    {
        if ($date === null || trim($date) === '') {
            return (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
        }

        $date = trim($date);
        $parsed = DateTimeImmutable::createFromFormat('Y-m-d', $date, new DateTimeZone('Asia/Manila'));

        if (!$parsed || $parsed->format('Y-m-d') !== $date) {
            throw new ApiException('Invalid date format. Expected YYYY-MM-DD.', 422);
        }

        return $date;
    }

    /**
     * Groups reservations and unreserved schedules by faculty_id.
     * Faculty with neither are never added, so they receive no email.
     *
     * @param array<int, array<string, mixed>> $reservations
     * @param array<int, array<string, mixed>> $schedules
     * @return array<string, array{
     *     faculty: array{user_id: string, full_name: string, pup_webmail: string},
     *     reserved: array<int, array<string, mixed>>,
     *     unreserved: array<int, array<string, mixed>>
     * }>
     */
    private function groupByFaculty(array $reservations, array $schedules): array
    {
        $grouped = [];

        foreach ($reservations as $row) {
            $id = (string) ($row['faculty_id'] ?? '');
            if ($id === '') {
                continue;
            }
            $grouped[$id] ??= $this->initFacultyEntry($row);
            $grouped[$id]['reserved'][] = $row;
        }

        foreach ($schedules as $row) {
            $id = (string) ($row['faculty_id'] ?? '');
            if ($id === '') {
                continue;
            }
            $grouped[$id] ??= $this->initFacultyEntry($row);
            $grouped[$id]['unreserved'][] = $row;
        }

        return $grouped;
    }

    /** @return array{faculty: array{user_id: string, full_name: string, pup_webmail: string}, reserved: array, unreserved: array} */
    private function initFacultyEntry(array $row): array
    {
        return [
            'faculty' => [
                'user_id' => (string) $row['faculty_id'],
                'full_name' => (string) ($row['faculty_name'] ?? 'Faculty'),
                'pup_webmail' => (string) ($row['faculty_email'] ?? ''),
            ],
            'reserved' => [],
            'unreserved' => [],
        ];
    }
}
