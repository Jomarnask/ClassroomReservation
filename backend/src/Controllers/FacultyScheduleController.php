<?php

namespace App\Controllers;

use App\Http\ApiException;
use App\Http\Request;
use App\Http\Response;
use App\Services\FacultyScheduleService;

class FacultyScheduleController
{
    private FacultyScheduleService $service;

    public function __construct(?FacultyScheduleService $service = null)
    {
        $this->service = $service ?? new FacultyScheduleService();
    }

    /** GET /api/faculty/schedule (active faculty only) */
    public function index(Request $request): void
    {
        $user = $request->getUser();

        if (!$user) {
            throw new ApiException('Authentication required.', 401);
        }

        Response::success(
            $this->service->getSchedule($user),
            'Faculty schedule retrieved successfully.'
        );
    }
}