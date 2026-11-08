<?php

namespace App\Repositories;

use PDO;

class RoomRepository
{
    public function findAll(PDO $pdo, array $filters = []): array
    {
        $sql = "
            SELECT
                room_id,
                room_number,
                room_name,
                floor,
                room_type,
                is_active,
                created_at,
                updated_at
            FROM public.rooms
            WHERE 1 = 1
        ";

        $params = [];

        if (!empty($filters['active_only'])) {
            $sql .= " AND is_active = TRUE";
        }

        if (isset($filters['floor'])) {
            $sql .= " AND floor = :floor";
            $params['floor'] = $filters['floor'];
        }

        if (!empty($filters['room_type'])) {
            $sql .= " AND LOWER(room_type) = LOWER(:room_type)";
            $params['room_type'] = $filters['room_type'];
        }

        if (!empty($filters['search'])) {
            $sql .= "
                AND (
                    room_number ILIKE :search
                    OR room_name ILIKE :search
                )
            ";

            $params['search'] = '%' . $filters['search'] . '%';
        }

        $sql .= " ORDER BY floor ASC, room_id ASC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function findById(PDO $pdo, int $roomId): ?array
    {
        $stmt = $pdo->prepare("
            SELECT
                room_id,
                room_number,
                room_name,
                floor,
                room_type,
                is_active,
                created_at,
                updated_at
            FROM public.rooms
            WHERE room_id = :room_id
            LIMIT 1
        ");

        $stmt->execute(['room_id' => $roomId]);

        $room = $stmt->fetch(PDO::FETCH_ASSOC);

        return $room ?: null;
    }

    public function create(PDO $pdo, array $data): array
    {
        $stmt = $pdo->prepare("
            INSERT INTO public.rooms (
                room_number,
                room_name,
                floor,
                room_type,
                is_active
            )
            VALUES (
                :room_number,
                :room_name,
                :floor,
                :room_type,
                :is_active
            )
            RETURNING
                room_id,
                room_number,
                room_name,
                floor,
                room_type,
                is_active,
                created_at,
                updated_at
        ");

        $stmt->execute($this->normalizeParams([
            'room_number' => $data['room_number'],
            'room_name' => $data['room_name'],
            'floor' => $data['floor'],
            'room_type' => $data['room_type'],
            'is_active' => $data['is_active']
        ]));

        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function update(PDO $pdo, int $roomId, array $data): ?array
    {
        $allowedFields = [
            'room_number',
            'room_name',
            'floor',
            'room_type',
            'is_active'
        ];

        $setClauses = [];
        $params = ['room_id' => $roomId];

        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $data)) {
                $setClauses[] = "$field = :$field";
                $params[$field] = $data[$field];
            }
        }

        if (empty($setClauses)) {
            return $this->findById($pdo, $roomId);
        }

        $setClauses[] = "updated_at = NOW()";

        $sql = "
            UPDATE public.rooms
            SET " . implode(', ', $setClauses) . "
            WHERE room_id = :room_id
            RETURNING
                room_id,
                room_number,
                room_name,
                floor,
                room_type,
                is_active,
                created_at,
                updated_at
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($this->normalizeParams($params));

        $room = $stmt->fetch(PDO::FETCH_ASSOC);

        return $room ?: null;
    }

    /**
     * PDO sends PHP booleans as strings, and false becomes '' which PostgreSQL
     * rejects for boolean columns. Send explicit 'true' / 'false' instead.
     */
    private function normalizeParams(array $params): array
    {
        foreach ($params as $key => $value) {
            if (is_bool($value)) {
                $params[$key] = $value ? 'true' : 'false';
            }
        }

        return $params;
    }
}