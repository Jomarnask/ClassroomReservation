<?php

namespace App\Http;

use App\Auth\AuthenticatedUser;

class Request
{
    private string $method;
    private string $path;
    private array $headers;
    private array $queryParams;
    private array $body;
    private ?AuthenticatedUser $user = null;

    public function __construct(
        string $method,
        string $path,
        array $headers = [],
        array $queryParams = [],
        array $body = []
    ) {
        $this->method = strtoupper($method);
        $this->path = '/' . trim($path, '/');
        $this->headers = array_change_key_case($headers, CASE_LOWER);
        $this->queryParams = $queryParams;
        $this->body = $body;
    }

    public static function createFromGlobals(): self
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?? '/';

        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $headerName = strtolower(str_replace('_', '-', substr($key, 5)));
                $headers[$headerName] = $value;
            } elseif (in_array($key, ['CONTENT_TYPE', 'CONTENT_LENGTH'])) {
                $headerName = strtolower(str_replace('_', '-', $key));
                $headers[$headerName] = $value;
            }
        }

        // Support Authorization header if stripped by Apache/FastCGI
        if (!isset($headers['authorization'])) {
            if (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
                $headers['authorization'] = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
            } elseif (function_exists('apache_request_headers')) {
                $apacheHeaders = apache_request_headers();
                if (isset($apacheHeaders['Authorization'])) {
                    $headers['authorization'] = $apacheHeaders['Authorization'];
                }
            }
        }

        $body = [];
        $rawInput = file_get_contents('php://input');
        if (!empty($rawInput)) {
            $contentType = $headers['content-type'] ?? '';
            if (str_contains($contentType, 'application/json')) {
                $decoded = json_decode($rawInput, true);
                if (is_array($decoded)) {
                    $body = $decoded;
                }
            }
        }

        return new self($method, $path, $headers, $_GET, $body);
    }

    public function getMethod(): string
    {
        return $this->method;
    }

    public function getPath(): string
    {
        return $this->path;
    }

    public function getHeaders(): array
    {
        return $this->headers;
    }

    public function getHeader(string $name, ?string $default = null): ?string
    {
        return $this->headers[strtolower($name)] ?? $default;
    }

    public function getQueryParams(): array
    {
        return $this->queryParams;
    }

    public function getQuery(string $key, mixed $default = null): mixed
    {
        return $this->queryParams[$key] ?? $default;
    }

    public function getBody(): array
    {
        return $this->body;
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $default;
    }

    public function getBearerToken(): ?string
    {
        $authHeader = $this->getHeader('authorization');
        if ($authHeader && preg_match('/Bearer\s+(.+)$/i', $authHeader, $matches)) {
            return trim($matches[1]);
        }
        return null;
    }

    public function setUser(AuthenticatedUser $user): void
    {
        $this->user = $user;
    }

    public function getUser(): ?AuthenticatedUser
    {
        return $this->user;
    }
}
