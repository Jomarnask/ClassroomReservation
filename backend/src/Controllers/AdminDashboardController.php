<?php

namespace App\Controllers;

use App\Http\ApiException;
use App\Http\Request;
use App\Http\Response;
use App\Services\AdminDashboardService;

class AdminDashboardController
{
    private AdminDashboardService $service;

    public function __construct(?AdminDashboardService $service = null)
    {
        $this->service = $service ?? new AdminDashboardService();
    }

    /** GET /api/admin/dashboard (active admins only) */
    public function index(Request $request): void
    {
        $user = $request->getUser();

        if (!$user) {
            throw new ApiException('Authentication required.', 401);
        }

        Response::success(
            $this->service->get($user),
            'Admin dashboard retrieved successfully.'
        );
    }
}