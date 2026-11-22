<?php

namespace App\Controllers;

use App\Auth\AuthenticatedUser;
use App\Http\ApiException;
use App\Http\Request;
use App\Http\Response;
use App\Services\NotificationService;

class NotificationController
{
    private const DEFAULT_LIMIT = 30;
    private const MAX_LIMIT = 100;

    private NotificationService $service;

    public function __construct(?NotificationService $service = null)
    {
        $this->service = $service ?? new NotificationService();
    }

    /** GET /api/notifications?limit=30 -> { items: [...], unread_count: n } */
    public function index(Request $request): void
    {
        $user = $this->user($request);

        $limit = filter_var($request->getQuery('limit', self::DEFAULT_LIMIT), FILTER_VALIDATE_INT);

        if ($limit === false || $limit < 1) {
            throw new ApiException('limit must be a positive number.', 422);
        }

        Response::success(
            $this->service->list($user, min($limit, self::MAX_LIMIT)),
            'Notifications retrieved successfully.'
        );
    }

    /** PATCH /api/notifications/{notificationId}/read */
    public function markRead(Request $request, array $params): void
    {
        $user = $this->user($request);

        $id = filter_var($params['notificationId'] ?? null, FILTER_VALIDATE_INT);

        if ($id === false || $id < 1) {
            throw new ApiException('Invalid notification ID.', 422);
        }

        Response::success($this->service->markRead($user, $id), 'Notification marked as read.');
    }

    /** PATCH /api/notifications/read-all */
    public function markAllRead(Request $request): void
    {
        $user = $this->user($request);

        Response::success($this->service->markAllRead($user), 'All notifications marked as read.');
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