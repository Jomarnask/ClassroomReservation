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
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 5,
        ];

        try {
            self::$pdo = new PDO($dsn, $user, $password, $options);
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
            // Set transaction-local claims in both PostgREST JSON format and individual claim variables
            $claimsJson = json_encode($user->getClaims(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $userId = $user->getId();
            $role = $user->getRole();

            // is_local = true ensures these settings vanish automatically on commit or rollback
            $stmt = $pdo->prepare("SELECT set_config('request.jwt.claims', :claims, true);");
            $stmt->execute([':claims' => $claimsJson]);

            $stmtSub = $pdo->prepare("SELECT set_config('request.jwt.claim.sub', :sub, true);");
            $stmtSub->execute([':sub' => $userId]);

            $stmtRole = $pdo->prepare("SELECT set_config('request.jwt.claim.role', :role, true);");
            $stmtRole->execute([':role' => $role]);

            // Switch to the authenticated role for RLS policy evaluation
            // Fallback silently if role switching is not supported by current db user
            try {
                $pdo->exec("SET LOCAL ROLE authenticated;");
            } catch (\Throwable $e) {
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
            try {
                $pdo->exec("RESET ROLE;");
            } catch (Throwable) {
                // Ignore reset error if already rolled back
            }
            throw $e;
        }
    }
}
