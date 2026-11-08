<?php

namespace App\Services;

use App\Auth\AuthenticatedUser;
use App\Database\Database;
use App\Http\ApiException;
use App\Repositories\FacultyScheduleRepository;
use PDO;
use PDOException;
use Throwable;

class FacultyScheduleService
{
    private FacultyScheduleRepository $repository;

    public function __construct(?FacultyScheduleRepository $repository = null)
    {
        $this->repository = $repository ?? new FacultyScheduleRepository();
    }

    /**
     * Everything the faculty Schedule page needs in one call:
     *  - classes:      the faculty's own weekly class schedules
     *  - reservations: student reservations that tag this faculty
     */
    public function getSchedule(AuthenticatedUser $user): array
    {
        return $this->run($user, function (PDO $pdo) use ($user) {
            $access = $this->repository->findUserAccess($pdo, $user->getId());

            if (!$access
                || $access['role'] !== 'faculty'
                || $access['account_status'] !== 'active') {
                throw new ApiException('Active faculty access required.', 403);
            }

            return [
                'classes' => $this->repository->findClasses($pdo, $user->getId()),
                'reservations' => $this->repository->findTaggedReservations($pdo),
            ];
        });
    }

    // ------------------------------------------------------------------
    // Database error translation
    // ------------------------------------------------------------------

    private function run(AuthenticatedUser $user, callable $callback): mixed
    {
        try {
            return Database::runInUserContext($user, $callback);
        } catch (PDOException $e) {
            throw $this->translate($e);
        }
    }

    /** Turns raw PostgreSQL errors into clean API errors. */
    private function translate(PDOException $e): Throwable
    {
        $state = (string) ($e->errorInfo[0] ?? $e->getCode());
        $raw = (string) ($e->errorInfo[2] ?? $e->getMessage());

        if ($state === 'P0001') {
            $message = $raw;

            if (preg_match('/ERROR:\s+(.+?)(?:\R\s*CONTEXT:|$)/s', $raw, $m)) {
                $message = trim($m[1]);
            }

            if (preg_match('/only active|unauthorized|only admin/i', $message)) {
                return new ApiException($message, 403);
            }

            return new ApiException($message, 409);
        }

        if ($state === '42501') {
            return new ApiException('You do not have permission to do this.', 403);
        }

        return $e;
    }
}