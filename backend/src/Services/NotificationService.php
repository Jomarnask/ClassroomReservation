<?php

namespace App\Services;

use App\Auth\AuthenticatedUser;
use App\Database\Database;
use App\Http\ApiException;
use App\Repositories\NotificationRepository;
use DateTimeImmutable;
use PDO;

/**
 * Reads and marks the signed-in user's own notifications.
 * Creating them is the database's job (triggers), so a notice can never be
 * forged from the browser and no screen has to remember to send one.
 */
class NotificationService
{
    private NotificationRepository $repository;

    public function __construct(?NotificationRepository $repository = null)
    {
        $this->repository = $repository ?? new NotificationRepository();
    }

    /** @return array{items: array, unread_count: int} */
    public function list(AuthenticatedUser $user, int $limit): array
    {
        return Database::runInUserContext($user, function (PDO $pdo) use ($user, $limit) {
            $rows = $this->repository->findByUser($pdo, $user->getId(), $limit);

            return [
                'items' => array_map(fn (array $row) => $this->present($row), $rows),
                'unread_count' => $this->repository->countUnread($pdo, $user->getId()),
            ];
        });
    }

    public function markRead(AuthenticatedUser $user, int $notificationId): array
    {
        return Database::runInUserContext($user, function (PDO $pdo) use ($user, $notificationId) {
            if (!$this->repository->exists($pdo, $user->getId(), $notificationId)) {
                throw new ApiException('Notification not found.', 404);
            }

            $this->repository->markRead($pdo, $user->getId(), $notificationId);

            return [
                'notification_id' => $notificationId,
                'is_read' => true,
                'unread_count' => $this->repository->countUnread($pdo, $user->getId()),
            ];
        });
    }

    public function markAllRead(AuthenticatedUser $user): array
    {
        return Database::runInUserContext($user, function (PDO $pdo) use ($user) {
            return [
                'marked' => $this->repository->markAllRead($pdo, $user->getId()),
                'unread_count' => 0,
            ];
        });
    }

    /** Clean types for JSON: a real boolean and an ISO 8601 timestamp every browser can parse. */
    private function present(array $row): array
    {
        $read = $row['is_read'];

        $row['notification_id'] = (int) $row['notification_id'];
        $row['is_read'] = $read === true || $read === 't' || $read === 1 || $read === '1';
        $row['created_at'] = (new DateTimeImmutable((string) $row['created_at']))->format(DATE_ATOM);

        return $row;
    }
}