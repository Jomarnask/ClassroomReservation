<?php

namespace App\Controllers;

use App\Auth\AuthenticatedUser;
use App\Http\ApiException;
use App\Http\Request;
use App\Http\Response;
use App\Services\AuditLogService;

class AuditLogController
{
    private const DEFAULT_LIMIT = 200;
    private const MAX_LIMIT = 1000;

    private AuditLogService $service;

    public function __construct(?AuditLogService $service = null)
    {
        $this->service = $service ?? new AuditLogService();
    }

    /**
     * GET /api/audit-logs (admin only)
     * Query: category (RESERVATION | USER_APPROVAL | ROOM | SCHEDULE), search, limit, offset
     * -> { items: [...], matched: n, total: n }
     */
    public function index(Request $request): void
    {
        $user = $this->user($request);
        $filters = [];

        $category = strtoupper(trim((string) $request->getQuery('category', '')));

        if ($category !== '' && $category !== 'ALL') {
            $filters['category'] = $category;
        }

        $search = trim((string) $request->getQuery('search', ''));

        if ($search !== '') {
            $filters['search'] = mb_substr($search, 0, 100);
        }

        $limit = filter_var($request->getQuery('limit', self::DEFAULT_LIMIT), FILTER_VALIDATE_INT);
        $offset = filter_var($request->getQuery('offset', 0), FILTER_VALIDATE_INT);

        if ($limit === false || $limit < 1) {
            throw new ApiException('limit must be a positive number.', 422);
        }

        if ($offset === false || $offset < 0) {
            throw new ApiException('offset must be 0 or more.', 422);
        }

        Response::success(
            $this->service->list($user, $filters, min($limit, self::MAX_LIMIT), $offset),
            'Audit logs retrieved successfully.'
        );
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