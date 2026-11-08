<?php

namespace App\Controllers;

use App\Config;
use App\Http\Request;
use App\Http\Response;

class HealthController
{
    public function index(Request $request): void
    {
        $payload = [
            'status' => 'healthy',
            'app' => 'PUP-CRS API',
            'timestamp' => date('c'),
            'php_version' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
            'environment' => Config::get('app_env', 'production'),
        ];

        Response::success($payload, 'PUP-CRS API is running and operational.');
    }
}
