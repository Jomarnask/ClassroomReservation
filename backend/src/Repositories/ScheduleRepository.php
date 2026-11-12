<?php

namespace App\Repositories;

use PDO;

/**
 * All SQL for the weekly class schedules (Schedule Manager).
 * Every method expects to run inside Database::runInUserContext(), so
 * Row Level Security applies to the caller.
 */
class ScheduleRepository
{
    private const SELECT = "
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
            s.program_course,
            s.year_level,
            s.section,
            s.course_section,
            s.faculty_id,
            f.full_name AS faculty_name,
            s.created_by,
            s.created_at,
            s.updated_at
        FROM public.room_schedules s
        LEFT JOIN public.rooms rm ON rm.room_id = s.room_id
        LEFT JOIN public.list_active_faculty() f ON f.user_id = s.faculty_id
    ";

    private const DAY_ORDER = "
        CASE LOWER(s.day_of_week)
            WHEN 'monday' THEN 1
            WHEN 'tuesday' THEN 2
            WHEN 'wednesday' THEN 3
            WHEN 'thursday' THEN 4
            WHEN 'friday' THEN 5
            WHEN 'saturday' THEN 6
            ELSE 7
        END
    ";

    public function findUserProfile(PDO $pdo, string $userId): ?array
    {
        $stmt = $pdo->prepare("
            SELECT role::text AS role, account_status::text AS account_status,
                   program_course, year_level, section
            FROM public.users
            WHERE user_id = CAST(:id AS uuid)
            LIMIT 1
        ");
        $stmt->execute(['id' => $userId]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /** filters: room_id, day, faculty_id, program_course, year_level, section */
    public function findAll(PDO $pdo, array $filters = []): array
    {
        $sql = self::SELECT . ' WHERE s.is_active = TRUE';
        $params = [];

        if (isset($filters['room_id'])) {
            $sql .= ' AND s.room_id = :room_id';
            $params['room_id'] = $filters['room_id'];
        }

        if (isset($filters['day'])) {
            $sql .= ' AND LOWER(s.day_of_week) = LOWER(:day)';
            $params['day'] = $filters['day'];
        }

        if (isset($filters['faculty_id'])) {
            $sql .= ' AND s.faculty_id = CAST(:faculty_id AS uuid)';
            $params['faculty_id'] = $filters['faculty_id'];
        }

        if (isset($filters['program_course'])) {
            $sql .= ' AND LOWER(s.program_course) = LOWER(:program_course)';
            $params['program_course'] = $filters['program_course'];
        }

        if (isset($filters['year_level'])) {
            $sql .= ' AND s.year_level = :year_level';
            $params['year_level'] = $filters['year_level'];
        }

        if (isset($filters['section'])) {
            $sql .= ' AND s.section = :section';
            $params['section'] = $filters['section'];
        }

        $sql .= ' ORDER BY s.room_id ASC, ' . self::DAY_ORDER . ', s.start_time ASC, s.schedule_id ASC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function findById(PDO $pdo, int $scheduleId): ?array
    {
        $stmt = $pdo->prepare(self::SELECT . ' WHERE s.schedule_id = :id AND s.is_active = TRUE LIMIT 1');
        $stmt->execute(['id' => $scheduleId]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /** @return int the new schedule_id */
    public function insert(PDO $pdo, array $data): int
    {
        $stmt = $pdo->prepare("
            INSERT INTO public.room_schedules (
                room_id, faculty_id, day_of_week, start_time, end_time,
                subject_code, subject_title,
                program_course, year_level, section, course_section,
                created_by
            )
            VALUES (
                :room_id,
                CAST(:faculty_id AS uuid),
                :day_of_week,
                CAST(:start_time AS time),
                CAST(:end_time AS time),
                :subject_code,
                :subject_title,
                :program_course,
                :year_level,
                :section,
                :course_section,
                CAST(:created_by AS uuid)
            )
            RETURNING schedule_id
        ");
        $stmt->execute([
            'room_id' => $data['room_id'],
            'faculty_id' => $data['faculty_id'],
            'day_of_week' => $data['day_of_week'],
            'start_time' => $data['start_time'],
            'end_time' => $data['end_time'],
            'subject_code' => $data['subject_code'],
            'subject_title' => $data['subject_title'],
            'program_course' => $data['program_course'],
            'year_level' => $data['year_level'],
            'section' => $data['section'],
            'course_section' => $data['course_section'],
            'created_by' => $data['created_by'],
        ]);

        return (int) $stmt->fetchColumn();
    }

    /** Overwrites every editable column (the service merges the patch first). */
    public function update(PDO $pdo, int $scheduleId, array $data): bool
    {
        $stmt = $pdo->prepare("
            UPDATE public.room_schedules
            SET room_id = :room_id,
                faculty_id = CAST(:faculty_id AS uuid),
                day_of_week = :day_of_week,
                start_time = CAST(:start_time AS time),
                end_time = CAST(:end_time AS time),
                subject_code = :subject_code,
                subject_title = :subject_title,
                program_course = :program_course,
                year_level = :year_level,
                section = :section,
                course_section = :course_section,
                updated_at = now()
            WHERE schedule_id = :id AND is_active = TRUE
        ");
        $stmt->execute([
            'id' => $scheduleId,
            'room_id' => $data['room_id'],
            'faculty_id' => $data['faculty_id'],
            'day_of_week' => $data['day_of_week'],
            'start_time' => $data['start_time'],
            'end_time' => $data['end_time'],
            'subject_code' => $data['subject_code'],
            'subject_title' => $data['subject_title'],
            'program_course' => $data['program_course'],
            'year_level' => $data['year_level'],
            'section' => $data['section'],
            'course_section' => $data['course_section'],
        ]);

        return $stmt->rowCount() > 0;
    }

    /** Permanent delete: the class stops repeating every week from now on. */
    public function delete(PDO $pdo, int $scheduleId): bool
    {
        $stmt = $pdo->prepare('DELETE FROM public.room_schedules WHERE schedule_id = :id');
        $stmt->execute(['id' => $scheduleId]);

        return $stmt->rowCount() > 0;
    }

    /** Another active class in the same room/day that overlaps the given time. */
    public function findOverlap(
        PDO $pdo,
        int $roomId,
        string $dayName,
        string $start,
        string $end,
        ?int $ignoreId = null
    ): ?array {
        $stmt = $pdo->prepare("
            SELECT schedule_id, subject_title, start_time, end_time
            FROM public.room_schedules
            WHERE room_id = :room_id
              AND LOWER(day_of_week) = LOWER(:day_name)
              AND is_active = TRUE
              AND start_time < CAST(:end_time AS time)
              AND end_time > CAST(:start_time AS time)
              AND (CAST(:ignore_id AS integer) IS NULL OR schedule_id <> CAST(:ignore_id AS integer))
            ORDER BY start_time ASC
            LIMIT 1
        ");
        $stmt->execute([
            'room_id' => $roomId,
            'day_name' => $dayName,
            'start_time' => $start,
            'end_time' => $end,
            'ignore_id' => $ignoreId,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    public function roomExists(PDO $pdo, int $roomId): bool
    {
        $stmt = $pdo->prepare('SELECT 1 FROM public.rooms WHERE room_id = :id LIMIT 1');
        $stmt->execute(['id' => $roomId]);

        return (bool) $stmt->fetchColumn();
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
}
