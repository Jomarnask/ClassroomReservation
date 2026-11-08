<?php

namespace App;

class Config
{
    private static ?Config $instance = null;
    private array $settings;

    private function __construct()
    {
        $this->settings = [
            'app_env' => $_ENV['APP_ENV'] ?? 'production',
            'app_debug' => filter_var($_ENV['APP_DEBUG'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'app_timezone' => $_ENV['APP_TIMEZONE'] ?? 'Asia/Manila',
            'frontend_url' => $_ENV['FRONTEND_URL'] ?? 'http://127.0.0.1:5500',
            'cors_allowed_origins' => array_filter(
                array_map('trim', explode(',', $_ENV['CORS_ALLOWED_ORIGINS'] ?? 'http://127.0.0.1:5500,http://localhost:5500'))
            ),
            'supabase_url' => rtrim($_ENV['SUPABASE_URL'] ?? '', '/'),
            'supabase_publishable_key' => $_ENV['SUPABASE_PUBLISHABLE_KEY'] ?? '',
            'db_host' => $_ENV['DB_HOST'] ?? '',
            'db_port' => (int)($_ENV['DB_PORT'] ?? 5432),
            'db_name' => $_ENV['DB_NAME'] ?? 'postgres',
            'db_user' => $_ENV['DB_USER'] ?? '',
            'db_password' => $_ENV['DB_PASSWORD'] ?? '',
            'db_sslmode' => $_ENV['DB_SSLMODE'] ?? 'require',
            // Keep the database connection open between requests (faster). Set DB_PERSISTENT=false to turn off.
            'db_persistent' => filter_var($_ENV['DB_PERSISTENT'] ?? true, FILTER_VALIDATE_BOOLEAN),
            // Seconds to remember a verified access token. Set AUTH_CACHE_TTL=0 to turn off.
            'auth_cache_ttl' => max(0, (int) ($_ENV['AUTH_CACHE_TTL'] ?? 60)),
        ];
    }

    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return self::getInstance()->settings[$key] ?? $default;
    }

    public static function isDebug(): bool
    {
        return (bool)self::get('app_debug', false);
    }

    public static function getCorsOrigins(): array
    {
        return self::get('cors_allowed_origins', []);
    }
}