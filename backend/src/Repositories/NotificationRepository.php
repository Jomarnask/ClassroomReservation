<?php

namespace App\Repositories;

use PDO;

/**
 * SQL for the notification bell. Runs inside Database::runInUserContext(), so
 * Row Level Security already limits every query to the signed-in user's rows.
 * Notifications are created by database triggers (see database/notifications.sql).
 */
class NotificationRepository
{
    public function findByUser(PDO $pdo, string $userId, int $limit): array
    {
        $stmt = $pdo->prepare("
            SELECT
                notification_id,
                type,
                title,
                message,
                link_url,
                reservation_id,
                schedule_id,
                is_read,
                created_at
            FROM public.notifications
            WHERE user_id = CAST(:user_id AS uuid)
            ORDER BY created_at DESC, notification_id DESC
            LIMIT :limit
        ");
        $stmt->bindValue('user_id', $userId);
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function countUnread(PDO $pdo, string $userId): int
    {
        $stmt = $pdo->prepare("
            SELECT COUNT(*)
            FROM public.notifications
            WHERE user_id = CAST(:user_id AS uuid) AND is_read = FALSE
        ");
        $stmt->execute(['user_id' => $userId]);

        return (int) $stmt->fetchColumn();
    }

    public function exists(PDO $pdo, string $userId, int $notificationId): bool
    {
        $stmt = $pdo->prepare("
            SELECT 1
            FROM public.notifications
            WHERE notification_id = :id AND user_id = CAST(:user_id AS uuid)
            LIMIT 1
        ");
        $stmt->execute(['id' => $notificationId, 'user_id' => $userId]);

        return (bool) $stmt->fetchColumn();
    }

    public function markRead(PDO $pdo, string $userId, int $notificationId): void
    {
        $stmt = $pdo->prepare("
            UPDATE public.notifications
            SET is_read = TRUE, read_at = now()
            WHERE notification_id = :id
              AND user_id = CAST(:user_id AS uuid)
              AND is_read = FALSE
        ");
        $stmt->execute(['id' => $notificationId, 'user_id' => $userId]);
    }

    /** @return int how many notifications were switched to read */
    public function markAllRead(PDO $pdo, string $userId): int
    {
        $stmt = $pdo->prepare("
            UPDATE public.notifications
            SET is_read = TRUE, read_at = now()
            WHERE user_id = CAST(:user_id AS uuid) AND is_read = FALSE
        ");
        $stmt->execute(['user_id' => $userId]);

        return $stmt->rowCount();
    }
}