<?php

namespace App\Services;

use App\Database\Database;
use App\Repositories\RoomRepository;
use App\Auth\AuthenticatedUser;
use App\Http\ApiException;
use PDO;
use PDOException;

class RoomService
{
    private RoomRepository $repository;

    public function __construct(?RoomRepository $repository = null)
    {
        $this->repository = $repository ?? new RoomRepository();
    }

    public function list(AuthenticatedUser $user, array $filters = []): array
    {
        return Database::runInUserContext($user, function (PDO $pdo) use ($user, $filters) {
            $this->assertActiveAccount($pdo, $user);

            return $this->repository->findAll($pdo, $filters);
        });
    }

    public function get(AuthenticatedUser $user, int $roomId): array
    {
        return Database::runInUserContext($user, function (PDO $pdo) use ($user, $roomId) {
            $this->assertActiveAccount($pdo, $user);

            $room = $this->repository->findById($pdo, $roomId);

            if (!$room) {
                throw new ApiException('Room not found.', 404);
            }

            return $room;
        });
    }

    public function create(AuthenticatedUser $user, array $input): array
    {
        $data = $this->validate($input, true);

        try {
            return Database::runInUserContext($user, function (PDO $pdo) use ($user, $data) {
                $this->assertAdmin($pdo, $user);

                return $this->repository->create($pdo, $data);
            });
        } catch (PDOException $e) {
            if ($e->getCode() === '23505') {
                throw new ApiException('A room with this room number already exists.', 409);
            }

            throw $e;
        }
    }

    public function update(
        AuthenticatedUser $user,
        int $roomId,
        array $input
    ): array {
        if (empty($input)) {
            throw new ApiException('No update data provided.', 422);
        }

        $data = $this->validate($input, false);

        try {
            return Database::runInUserContext($user, function (PDO $pdo) use ($user, $roomId, $data) {
                $this->assertAdmin($pdo, $user);

                $room = $this->repository->update($pdo, $roomId, $data);

                if (!$room) {
                    throw new ApiException('Room not found.', 404);
                }

                return $room;
            });
        } catch (PDOException $e) {
            if ($e->getCode() === '23505') {
                throw new ApiException('A room with this room number already exists.', 409);
            }

            throw $e;
        }
    }

    private function assertActiveAccount(PDO $pdo, AuthenticatedUser $user): void
    {
        $stmt = $pdo->prepare("
            SELECT 1
            FROM public.users
            WHERE user_id = :user_id
              AND account_status = 'active'
            LIMIT 1
        ");

        $stmt->execute(['user_id' => $user->getId()]);

        if (!$stmt->fetchColumn()) {
            throw new ApiException('Your account is inactive.', 403);
        }
    }

    private function assertAdmin(PDO $pdo, AuthenticatedUser $user): void
    {
        $stmt = $pdo->prepare("
            SELECT 1
            FROM public.users
            WHERE user_id = :user_id
              AND role = 'admin'
              AND account_status = 'active'
            LIMIT 1
        ");

        $stmt->execute(['user_id' => $user->getId()]);

        if (!$stmt->fetchColumn()) {
            throw new ApiException('Administrator access required.', 403);
        }
    }

    private function validate(array $input, bool $isCreate): array
    {
        $allowedFields = [
            'room_number',
            'room_name',
            'floor',
            'room_type',
            'is_active'
        ];

        $unknownFields = array_diff(array_keys($input), $allowedFields);

        if (!empty($unknownFields)) {
            throw new ApiException(
                'Invalid fields: ' . implode(', ', $unknownFields),
                422
            );
        }

        $data = [];

        if ($isCreate || array_key_exists('room_number', $input)) {
            $number = trim((string) ($input['room_number'] ?? ''));

            if ($number === '' || strlen($number) > 50) {
                throw new ApiException(
                    'Room number is required and must not exceed 50 characters.',
                    422
                );
            }

            $data['room_number'] = $number;
        }

        if ($isCreate || array_key_exists('room_name', $input)) {
            $name = isset($input['room_name'])
                ? trim((string) $input['room_name'])
                : '';

            if (strlen($name) > 150) {
                throw new ApiException('Room name must not exceed 150 characters.', 422);
            }

            $data['room_name'] = $name === '' ? null : $name;
        }

        if ($isCreate || array_key_exists('floor', $input)) {
            $floor = filter_var(
                $input['floor'] ?? 1,
                FILTER_VALIDATE_INT
            );

            if ($floor === false || $floor < 0 || $floor > 100) {
                throw new ApiException('Floor must be an integer between 0 and 100.', 422);
            }

            $data['floor'] = $floor;
        }

        if ($isCreate || array_key_exists('room_type', $input)) {
            $type = trim((string) ($input['room_type'] ?? 'Lecture'));

            if ($type === '' || strlen($type) > 50) {
                throw new ApiException('Room type is required and must not exceed 50 characters.', 422);
            }

            $data['room_type'] = $type;
        }

        if ($isCreate || array_key_exists('is_active', $input)) {
            $active = $input['is_active'] ?? true;

            if (!is_bool($active)) {
                throw new ApiException('is_active must be a boolean.', 422);
            }

            $data['is_active'] = $active;
        }

        return $data;
    }
}