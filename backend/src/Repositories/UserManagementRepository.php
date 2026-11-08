<?php

namespace App\Repositories;

use PDO;

/**
 * SQL for the admin "User Approvals" features.
 * Every method expects to run inside Database::runInUserContext(), so Row Level
 * Security (and the protect_user_privileges trigger) apply to the caller.
 */
class UserManagementRepository
{
    private const COLUMNS = "
        user_id,
        full_name,
        pup_webmail,
        role::text AS role,
        account_status::text AS account_status,
        student_number,
        program_course,
        year_level,
        section,
        created_at,
        updated_at
    ";

    public function findAll(PDO $pdo, array $filters = []): array
    {
        $sql = 'SELECT ' . self::COLUMNS . ' FROM public.users WHERE 1 = 1';
        $params = [];

        if (isset($filters['status'])) {
            $sql .= ' AND account_status = CAST(:status AS public.account_status_type)';
            $params['status'] = $filters['status'];
        }

        if (isset($filters['role'])) {
            $sql .= ' AND role = CAST(:role AS public.user_role)';
            $params['role'] = $filters['role'];
        }

        $limit = (int) ($filters['limit'] ?? 500);

        $sql .= ' ORDER BY created_at DESC, user_id ASC LIMIT ' . $limit;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function findById(PDO $pdo, string $userId): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT ' . self::COLUMNS . ' FROM public.users WHERE user_id = CAST(:id AS uuid) LIMIT 1'
        );
        $stmt->execute(['id' => $userId]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    public function updateStatus(PDO $pdo, string $userId, string $status): ?array
    {
        $stmt = $pdo->prepare(
            'UPDATE public.users
             SET account_status = CAST(:status AS public.account_status_type),
                 updated_at = now()
             WHERE user_id = CAST(:id AS uuid)
             RETURNING ' . self::COLUMNS
        );
        $stmt->execute([
            'status' => $status,
            'id' => $userId,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }
}