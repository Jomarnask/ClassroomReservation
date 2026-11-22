<?php

namespace App\Database;

use App\Auth\AuthenticatedUser;
use App\Config;
use App\Http\ApiException;
use PDO;
use PDOException;
use Throwable;

class Database
{
    private static ?PDO $pdo = null;

    public static function getConnection(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $host = Config::get('db_host');
        $port = Config::get('db_port', 5432);
        $dbname = Config::get('db_name', 'postgres');
        $user = Config::get('db_user');
        $password = Config::get('db_password');
        $sslmode = Config::get('db_sslmode', 'require');

        if (empty($host) || empty($user)) {
            throw new ApiException('Database connection settings are incomplete on the server.', 500);
        }

        $dsn = "pgsql:host={$host};port={$port};dbname={$dbname};sslmode={$sslmode}";

        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // Client-side parameter binding: one round trip per query instead of two
            // (prepare + execute), and it also works behind a transaction-mode pooler.
            PDO::ATTR_EMULATE_PREPARES => true,
            PDO::ATTR_TIMEOUT => 5,
            // Reuse the open connection for the next request instead of reconnecting
            // (TLS + login to the pooler is the slowest part of a request).
            PDO::ATTR_PERSISTENT => (bool) Config::get('db_persistent', true),
        ];

        try {
            self::$pdo = new PDO($dsn, $user, $password, $options);

            // A reused connection must never start inside a leftover transaction.
            if (self::$pdo->inTransaction()) {
                self::$pdo->rollBack();
            }

            return self::$pdo;
        } catch (PDOException $e) {
            error_log('[Database Connection Error] ' . $e->getMessage());

            throw new ApiException(
                'Database connection failed: ' . $e->getMessage(),
                500
            );
        }
    }

    /**
     * Executes queries within a transaction with PostgreSQL transaction-local JWT claims
     * and switches to the 'authenticated' role to preserve Supabase Row Level Security (RLS).
     *
     * @template T
     * @param AuthenticatedUser $user
     * @param callable(PDO): T $callback
     * @return T
     */
    public static function runInUserContext(AuthenticatedUser $user, callable $callback): mixed
    {
        $pdo = self::getConnection();

        $pdo->beginTransaction();

        try {
            $claimsJson = json_encode($user->getClaims(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            // One round trip: set the JWT claims (PostgREST JSON format plus the individual
            // claim variables) and switch to the 'authenticated' role so RLS applies.
            // is_local = true makes every setting vanish on commit or rollback.
            // set_config('role', ..., true) is the same as SET LOCAL ROLE.
            try {
                $stmt = $pdo->prepare(
                    "SELECT
                        set_config('request.jwt.claims', :claims, true),
                        set_config('request.jwt.claim.sub', :sub, true),
                        set_config('request.jwt.claim.role', :role, true),
                        set_config('role', 'authenticated', true)"
                );
                $stmt->execute([
                    ':claims' => $claimsJson,
                    ':sub' => $user->getId(),
                    ':role' => $user->getRole(),
                ]);
            } catch (Throwable $e) {
                throw new \RuntimeException(
                    'Unable to establish authenticated database role.',
                    0,
                    $e
                );
            }

            // Execute the caller's repository/service operations
            $result = $callback($pdo);

            $pdo->commit();

            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            throw $e;
        }
    }
}