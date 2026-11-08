<?php

namespace App\Http;

use App\Config;

class Response
{
    private static bool $shouldExit = true;

    public static function setShouldExit(bool $exit): void
    {
        self::$shouldExit = $exit;
    }

    public static function json(array $data, int $statusCode = 200, array $headers = []): void
    {
        if (!headers_sent()) {
            http_response_code($statusCode);

            // CORS headers
            self::sendCorsHeaders();

            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('X-Frame-Options: DENY');

            foreach ($headers as $key => $value) {
                header("$key: $value");
            }
        }

        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        if (self::$shouldExit) {
            exit;
        }
    }

    public static function success(mixed $data = null, string $message = 'Request completed successfully.', int $statusCode = 200): void
    {
        self::json([
            'success' => true,
            'message' => $message,
            'data' => $data,
        ], $statusCode);
    }

    public static function error(string $message = 'The request could not be completed.', int $statusCode = 400, array $errors = []): void
    {
        self::json([
            'success' => false,
            'message' => $message,
            'errors' => $errors,
        ], $statusCode);
    }

    public static function sendCorsHeaders(): void
    {
        if (headers_sent()) {
            return;
        }

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowedOrigins = Config::getCorsOrigins();

        if (!empty($origin)) {
            if (in_array($origin, $allowedOrigins, true) || in_array('*', $allowedOrigins, true)) {
                header("Access-Control-Allow-Origin: $origin");
                header('Access-Control-Allow-Credentials: true');
            }
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, apikey');
        header('Access-Control-Max-Age: 86400');
    }
}
