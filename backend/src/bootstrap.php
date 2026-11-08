<?php

declare(strict_types=1);

$backendRoot = dirname(__DIR__);

require_once $backendRoot . '/vendor/autoload.php';

use Dotenv\Dotenv;
use App\Config;

// Load environment variables safely if .env exists
if (file_exists($backendRoot . '/.env')) {
    $dotenv = Dotenv::createImmutable($backendRoot);
    $dotenv->safeLoad();
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
