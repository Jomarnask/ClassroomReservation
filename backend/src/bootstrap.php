<?php

declare(strict_types=1);

$backendRoot = dirname(__DIR__);

require_once $backendRoot . '/vendor/autoload.php';

use Dotenv\Dotenv;
use App\Config;

// ── Load environment variables ──────────────────────────────
// 1. Load the base .env file (shared defaults)
if (file_exists($backendRoot . '/.env')) {
    $dotenv = Dotenv::createImmutable($backendRoot);
    $dotenv->safeLoad();
}

// 2. Load environment-specific overrides (.env.local, .env.staging, .env.production)
//    APP_ENV can be set in the base .env or as a system environment variable.
$appEnv = $_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? getenv('APP_ENV') ?: 'local';
$envFile = '.env.' . $appEnv;

if (file_exists($backendRoot . '/' . $envFile)) {
    $dotenvOverride = Dotenv::createMutable($backendRoot, $envFile);
    $dotenvOverride->safeLoad();
}

// Set default timezone
date_default_timezone_set(Config::get('app_timezone', 'Asia/Manila'));

// Set error reporting
if (Config::isDebug()) {
    ini_set('display_errors', '1');
    ini_set('display_startup_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
    ini_set('display_startup_errors', '0');
    error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
}
