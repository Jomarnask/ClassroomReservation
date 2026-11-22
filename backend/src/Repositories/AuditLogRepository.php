<?php

namespace App\Repositories;

use PDO;

/**
 * Reads the System Audit Trail (public.audit_logs).
 * Rows are written only by database triggers (database/audit_logs.sql); the
 * application never inserts, edits or deletes them.
 */
class AuditLogRepository
{
    public function isActiveAdmin(PDO $pdo, string $userId): bool
    {
        $stmt = $pdo->prepare("
            SELECT 1
            FROM public.users
            WHERE user_id = CAST(:id AS uuid)
              AND role = 'admin'
              AND account_status = 'active'
            LIMIT 1
        ");
        $stmt->execute(['id' => $userId]);

        return (bool) $stmt->fetchColumn();
    }

    /** filters: category (RESERVATION | USER_APPROVAL | ROOM | SCHEDULE), search */
    public function findAll(PDO $pdo, array $filters, int $limit, int $offset): array
    {
        [$where, $params] = $this->buildWhere($filters);

        $stmt = $pdo->prepare("
            SELECT
                log_id,
                created_at,
                event_category,
                action_type,
                user_name,
                user_role,
                room_name,
                details,
                status,
                subject_name,
                subject_class
            FROM public.audit_logs
            {$where}
            ORDER BY created_at DESC, log_id DESC
            LIMIT :limit OFFSET :offset
        ");

        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue('offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** How many events match the filters. */
    public function countMatching(PDO $pdo, array $filters): int
    {
        [$where, $params] = $this->buildWhere($filters);

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM public.audit_logs {$where}");
        $stmt->execute($params);

        return (int) $stmt->fetchColumn();
    }

    /** How many events exist in total (no filters). */
    public function countAll(PDO $pdo): int
    {
        return (int) $pdo->query('SELECT COUNT(*) FROM public.audit_logs')->fetchColumn();
    }

    /** @return array{0: string, 1: array<string, string>} */
    private function buildWhere(array $filters): array
    {
        $conditions = [];
        $params = [];

        if (!empty($filters['category'])) {
            $conditions[] = 'event_category = :category';
            $params['category'] = $filters['category'];
        }

        if (!empty($filters['search'])) {
            // One search box looks in every column the table shows
            $conditions[] = "(
                user_name ILIKE :search
                OR COALESCE(room_name, '') ILIKE :search
                OR details ILIKE :search
                OR action_type ILIKE :search
                OR COALESCE(subject_name, '') ILIKE :search
                OR COALESCE(subject_class, '') ILIKE :search
            )";
            $params['search'] = '%' . addcslashes($filters['search'], '\\%_') . '%';
        }

        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        return [$where, $params];
    }
}