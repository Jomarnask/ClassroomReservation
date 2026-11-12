<?php

namespace App\Controllers;

use App\Auth\AuthenticatedUser;
use App\Http\ApiException;
use App\Http\Request;
use App\Http\Response;
use App\Services\ScheduleService;

class ScheduleController
{
    private ScheduleService $service;

    public function __construct(?ScheduleService $service = null)
    {
        $this->service = $service ?? new ScheduleService();
    }

    /**
     * GET /api/schedules
     * Query: room_id, day, faculty_id, program_course, year_level, section
     * Students see every room; faculty only see classes tagged to them.
     */
    public function index(Request $request): void
    {
        $user = $this->user($request);
        $filters = [];

        $roomId = $request->getQuery('room_id');

        if ($roomId !== null && $roomId !== '') {
            $filters['room_id'] = $this->parseId($roomId, 'room_id');
        }

        $day = trim((string) $request->getQuery('day', ''));

        if ($day !== '') {
            $match = array_values(array_filter(
                ScheduleService::DAYS,
                fn (string $d) => strcasecmp($d, $day) === 0
            ));

            if (empty($match)) {
                throw new ApiException('day must be one of: ' . implode(', ', ScheduleService::DAYS) . '.', 422);
            }

            $filters['day'] = $match[0];
        }

        $facultyId = trim((string) $request->getQuery('faculty_id', ''));

        if ($facultyId !== '') {
            $filters['faculty_id'] = strtolower($facultyId);
        }

        $program = trim((string) $request->getQuery('program_course', ''));

        if ($program !== '') {
            $filters['program_course'] = $program;
        }

        foreach (['year_level', 'section'] as $key) {
            $value = $request->getQuery($key);

            if ($value !== null && $value !== '') {
                $filters[$key] = $this->parseId($value, $key);
            }
        }

        Response::success($this->service->list($user, $filters), 'Schedules retrieved successfully.');
    }

    /** GET /api/schedules/{scheduleId} */
    public function show(Request $request, array $params): void
    {
        $user = $this->user($request);
        $id = $this->parseId($params['scheduleId'] ?? null, 'schedule ID');

        Response::success($this->service->get($user, $id), 'Schedule retrieved successfully.');
    }

    /** POST /api/schedules (admin only) */
    public function store(Request $request): void
    {
        $user = $this->user($request);

        Response::success(
            $this->service->create($user, $request->getBody()),
            'Class schedule created. It repeats every week until it is deleted.',
            201
        );
    }

    /** PATCH /api/schedules/{scheduleId} (admin only) */
    public function update(Request $request, array $params): void
    {
        $user = $this->user($request);
        $id = $this->parseId($params['scheduleId'] ?? null, 'schedule ID');

        Response::success(
            $this->service->update($user, $id, $request->getBody()),
            'Class schedule updated.'
        );
    }

    /** DELETE /api/schedules/{scheduleId} (admin only) */
    public function destroy(Request $request, array $params): void
    {
        $user = $this->user($request);
        $id = $this->parseId($params['scheduleId'] ?? null, 'schedule ID');

        Response::success($this->service->delete($user, $id), 'Class schedule deleted.');
    }

    private function user(Request $request): AuthenticatedUser
    {
        $user = $request->getUser();

        if (!$user) {
            throw new ApiException('Authentication required.', 401);
        }

        return $user;
    }

    private function parseId(mixed $value, string $label): int
    {
        $id = filter_var($value, FILTER_VALIDATE_INT);

        if ($id === false || $id < 1) {
            throw new ApiException('Invalid ' . $label . '.', 422);
        }

        return $id;
    }
}
