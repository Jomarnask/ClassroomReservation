<?php

namespace App\Services;

use App\Auth\AuthenticatedUser;
use App\Database\Database;
use App\Http\ApiException;
use App\Repositories\UserManagementRepository;
use PDO;
use PDOException;
use Throwable;

class UserManagementService
{
    /**
     * Which current statuses each new status may be set from.
     * (A pending account can be approved or rejected, an active one can be
     * deactivated, and a rejected or inactive one can be reactivated.)
     */
    private const ALLOWED_FROM = [
        'active' => ['pending', 'rejected', 'inactive'],
        'rejected' => ['pending'],
        'inactive' => ['active'],
    ];

    private UserManagementRepository $repository;

    public function __construct(?UserManagementRepository $repository = null)
    {
        $this->repository = $repository ?? new UserManagementRepository();
    }

    /** Admin only: list user accounts. */
    public function list(AuthenticatedUser $admin, array $filters = []): array
    {
        return $this->run($admin, function (PDO $pdo) use ($admin, $filters) {
            $this->assertAdmin($pdo, $admin);

            return $this->repository->findAll($pdo, $filters);
        });
    }

    /** Admin only: approve, reject, deactivate or reactivate an account. */
    public function setStatus(AuthenticatedUser $admin, string $userId, array $input): array
    {
        $status = $this->validateStatusInput($input);

        return $this->run($admin, function (PDO $pdo) use ($admin, $userId, $status) {
            $this->assertAdmin($pdo, $admin);

            if (strtolower($userId) === strtolower($admin->getId())) {
                throw new ApiException('You cannot change the status of your own account.', 409);
            }

            $target = $this->repository->findById($pdo, $userId);

            if (!$target) {
                throw new ApiException('User not found.', 404);
            }

            $current = $target['account_status'];

            if ($current === $status) {
                throw new ApiException('This account is already ' . $status . '.', 409);
            }

            if (!in_array($current, self::ALLOWED_FROM[$status], true)) {
                throw new ApiException(
                    'An account that is ' . $current . ' cannot be changed to ' . $status . '.',
                    409
                );
            }

            $updated = $this->repository->updateStatus($pdo, $userId, $status);

            if (!$updated) {
                throw new ApiException('User not found.', 404);
            }

            return $updated;
        });
    }

    private function assertAdmin(PDO $pdo, AuthenticatedUser $user): void
    {
        $me = $this->repository->findById($pdo, $user->getId());

        if (!$me || $me['role'] !== 'admin' || $me['account_status'] !== 'active') {
            throw new ApiException('Administrator access required.', 403);
        }
    }

    private function validateStatusInput(array $input): string
    {
        $unknown = array_diff(array_keys($input), ['status']);

        if (!empty($unknown)) {
            throw new ApiException('Invalid fields: ' . implode(', ', $unknown), 422);
        }

        $status = strtolower(trim((string) ($input['status'] ?? '')));

        if (!array_key_exists($status, self::ALLOWED_FROM)) {
            throw new ApiException('status must be one of: ' . implode(', ', array_keys(self::ALLOWED_FROM)) . '.', 422);
        }

        return $status;
    }

    private function run(AuthenticatedUser $user, callable $callback): mixed
    {
        try {
            return Database::runInUserContext($user, $callback);
        } catch (PDOException $e) {
            throw $this->translate($e);
        }
    }

    /** Turns raw PostgreSQL errors (including the privilege trigger's message) into API errors. */
    private function translate(PDOException $e): Throwable
    {
        $state = (string) ($e->errorInfo[0] ?? $e->getCode());
        $raw = (string) ($e->errorInfo[2] ?? $e->getMessage());

        if ($state === 'P0001') {
            $message = $raw;

            if (preg_match('/ERROR:\s+(.+?)(?:\R\s*CONTEXT:|$)/s', $raw, $m)) {
                $message = trim($m[1]);
            }

            return new ApiException($message, preg_match('/unauthorized|only an? (active )?admin/i', $message) ? 403 : 409);
        }

        if ($state === '42501') {
            return new ApiException('You do not have permission to do this.', 403);
        }

        return $e;
    }
}