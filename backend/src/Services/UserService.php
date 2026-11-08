<?php

namespace App\Services;

use App\Auth\AuthenticatedUser;
use App\Database\Database;
use App\Http\ApiException;
use App\Repositories\UserRepository;
use PDO;

class UserService
{
    private UserRepository $userRepository;

    public function __construct(?UserRepository $userRepository = null)
    {
        $this->userRepository = $userRepository ?? new UserRepository();
    }

    /**
     * Retrieves the authenticated user's profile from the database under RLS context
     */
    public function getProfile(AuthenticatedUser $authUser): array
    {
        return Database::runInUserContext($authUser, function (PDO $pdo) use ($authUser) {
            $user = $this->userRepository->findById($authUser->getId(), $pdo);

            if (!$user) {
                throw new ApiException('User profile not found in database.', 404);
            }

            return $user;
        });
    }

    /**
     * Checks if the authenticated user has active administrator privileges
     */
    public function checkAdmin(AuthenticatedUser $authUser): array
    {
        return Database::runInUserContext($authUser, function (PDO $pdo) use ($authUser) {
            $user = $this->userRepository->findById($authUser->getId(), $pdo);

            if (!$user) {
                throw new ApiException('User record not found.', 404);
            }

            $role = strtolower(trim($user['role'] ?? ''));
            $status = strtolower(trim($user['account_status'] ?? ''));

            if ($role !== 'admin' || $status !== 'active') {
                throw new ApiException('Access denied. Active administrator privileges required.', 403, [
                    'role' => $user['role'] ?? 'unknown',
                    'status' => $user['account_status'] ?? 'unknown',
                ]);
            }

            return [
                'user_id' => $user['user_id'],
                'full_name' => $user['full_name'],
                'role' => $user['role'],
                'account_status' => $user['account_status'],
                'is_admin' => true,
            ];
        });
    }
}
