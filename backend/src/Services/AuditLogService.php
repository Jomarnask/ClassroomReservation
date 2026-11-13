<?php

namespace App\Services;

use App\Auth\AuthenticatedUser;
use App\Database\Database;
use App\Http\ApiException;
use App\Repositories\AuditLogRepository;
use DateTimeImmutable;
use PDO;

/**
 * Read-only view of the System Audit Trail for admins.
 * The trail itself is written by database triggers, so no code path here (or in
 * the browser) can add, change or remove a log entry.
 */
class AuditLogService
{
    /** Event categories the Audit Logs page can filter by. */
    public const CATEGORIES = ['RESERVATION', 'USER_APPROVAL', 'ROOM', 'SCHEDULE'];

    private AuditLogRepository $repository;

    public function __construct(?AuditLogRepository $repository = null)
    {
        $this->repository = $repository ?? new AuditLogRepository();
    }

    /** @return array{items: array, matched: int, total: int} */
    public function list(AuthenticatedUser $user, array $filters, int $limit, int $offset): array
    {
        if (!empty($filters['category']) && !in_array($filters['category'], self::CATEGORIES, true)) {
            throw new ApiException('category must be one of: ' . implode(', ', self::CATEGORIES) . '.', 422);
        }

        return Database::runInUserContext($user, function (PDO $pdo) use ($user, $filters, $limit, $offset) {
            if (!$this->repository->isActiveAdmin($pdo, $user->getId())) {
                throw new ApiException('Administrator access required.', 403);
            }

            $rows = $this->repository->findAll($pdo, $filters, $limit, $offset);

            return [
                'items' => array_map(fn (array $row) => $this->present($row), $rows),
                'matched' => $this->repository->countMatching($pdo, $filters),
                'total' => $this->repository->countAll($pdo),
            ];
        });
    }

    /** ISO 8601 timestamp every browser can parse. */
    private function present(array $row): array
    {
        $row['log_id'] = (int) $row['log_id'];
        $row['created_at'] = (new DateTimeImmutable((string) $row['created_at']))->format(DATE_ATOM);

        return $row;
    }
}