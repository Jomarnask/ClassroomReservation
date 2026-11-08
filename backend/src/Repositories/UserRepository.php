<?php

namespace App\Repositories;

use App\Database\Database;
use PDO;

class UserRepository
{
    private function getPdo(?PDO $pdo): PDO
    {
        return $pdo ?? Database::getConnection();
    }

    public function findById(string $userId, ?PDO $pdo = null): ?array
    {
        $conn = $this->getPdo($pdo);
        $sql = "SELECT 
                    user_id,
                    full_name,
                    pup_webmail,
                    role,
                    account_status,
                    student_number,
                    program_course,
                    year_level,
                    section,
                    created_at,
                    updated_at
                FROM users
                WHERE user_id = :user_id
                LIMIT 1";

        $stmt = $conn->prepare($sql);
        $stmt->execute([':user_id' => $userId]);
        $row = $stmt->fetch();

        return $row ?: null;
    }

    public function findByEmail(string $email, ?PDO $pdo = null): ?array
    {
        $conn = $this->getPdo($pdo);
        $sql = "SELECT 
                    user_id,
                    full_name,
                    pup_webmail,
                    role,
                    account_status,
                    student_number,
                    program_course,
                    year_level,
                    section,
                    created_at,
                    updated_at
                FROM users
                WHERE LOWER(pup_webmail) = LOWER(:email)
                LIMIT 1";

        $stmt = $conn->prepare($sql);
        $stmt->execute([':email' => trim($email)]);
        $row = $stmt->fetch();

        return $row ?: null;
    }
}
