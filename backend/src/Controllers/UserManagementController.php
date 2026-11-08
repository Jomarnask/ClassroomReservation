<?php

namespace App\Controllers;

use App\Auth\AuthenticatedUser;
use App\Http\ApiException;
use App\Http\Request;
use App\Http\Response;
use App\Services\UserManagementService;

class UserManagementController
{
    private const STATUSES = ['pending', 'active', 'rejected', 'inactive'];
    private const ROLES = ['student', 'faculty', 'admin'];

    private UserManagementService $service;

    public function __construct()
    {
        $this->service = new UserManagementService();
    }

    /**
     * GET /api/users  (admin only)
     * Query: status, role, limit
     */
    public function index(Request $request): void
    {
        $admin = $this->user($request);
        $filters = [];

        $status = strtolower(trim((string) $request->getQuery('status', '')));

        if ($status !== '') {
            if (!in_array($status, self::STATUSES, true)) {
                throw new ApiException('status must be one of: ' . implode(', ', self::STATUSES) . '.', 422);
            }

            $filters['status'] = $status;
        }

        $role = strtolower(trim((string) $request->getQuery('role', '')));

        if ($role !== '') {
            if (!in_array($role, self::ROLES, true)) {
                throw new ApiException('role must be one of: ' . implode(', ', self::ROLES) . '.', 422);
            }

            $filters['role'] = $role;
        }

        $limit = $request->getQuery('limit');

        if ($limit !== null && $limit !== '') {
            $parsed = filter_var($limit, FILTER_VALIDATE_INT);

            if ($parsed === false || $parsed < 1 || $parsed > 1000) {
                throw new ApiException('limit must be between 1 and 1000.', 422);
            }

            $filters['limit'] = $parsed;
        }

        Response::success($this->service->list($admin, $filters), 'Users retrieved successfully.');
    }

    /** PATCH /api/users/{userId}/status  body: { "status": "active" | "rejected" | "inactive" } */
    public function updateStatus(Request $request, array $params): void
    {
        $admin = $this->user($request);

        $userId = trim((string) ($params['userId'] ?? ''));

        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $userId)) {
            throw new ApiException('Invalid user ID.', 422);
        }

        $updated = $this->service->setStatus($admin, strtolower($userId), $request->getBody());

        Response::success($updated, 'Account status updated.');
    }

    private function user(Request $request): AuthenticatedUser
    {
        $user = $request->getUser();

        if (!$user) {
            throw new ApiException('Authentication required.', 401);
        }

        return $user;
    }
}