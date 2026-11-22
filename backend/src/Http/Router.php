<?php

namespace App\Http;

use App\Config;
use Throwable;

class Router
{
    private array $routes = [];
    private array $globalMiddlewares = [];

    public function addGlobalMiddleware(callable $middleware): void
    {
        $this->globalMiddlewares[] = $middleware;
    }

    public function get(string $path, callable|array $handler, array $middlewares = []): void
    {
        $this->addRoute('GET', $path, $handler, $middlewares);
    }

    public function post(string $path, callable|array $handler, array $middlewares = []): void
    {
        $this->addRoute('POST', $path, $handler, $middlewares);
    }

    public function patch(string $path, callable|array $handler, array $middlewares = []): void
    {
        $this->addRoute('PATCH', $path, $handler, $middlewares);
    }

    public function delete(string $path, callable|array $handler, array $middlewares = []): void
    {
        $this->addRoute('DELETE', $path, $handler, $middlewares);
    }

    public function options(string $path, callable|array $handler, array $middlewares = []): void
    {
        $this->addRoute('OPTIONS', $path, $handler, $middlewares);
    }

    private function addRoute(string $method, string $path, callable|array $handler, array $middlewares = []): void
    {
        $normalizedPath = '/' . trim($path, '/');
        $compiled = $this->compileRoute($normalizedPath);
        $this->routes[] = [
            'method' => strtoupper($method),
            'path' => $normalizedPath,
            'pattern' => $compiled['pattern'],
            'paramNames' => $compiled['paramNames'],
            'handler' => $handler,
            'middlewares' => $middlewares,
        ];
    }

    public function dispatch(Request $request): void
    {
        try {
            // Handle CORS preflight OPTIONS request
            if ($request->getMethod() === 'OPTIONS') {
                Response::sendCorsHeaders();
                http_response_code(204);
                exit;
            }

            // Run global middlewares
            foreach ($this->globalMiddlewares as $middleware) {
                $middleware($request);
            }

            $requestMethod = $request->getMethod();
            $requestPath = $request->getPath();

            foreach ($this->routes as $route) {
                if ($route['method'] !== $requestMethod) {
                    continue;
                }

                if (preg_match($route['pattern'], $requestPath, $matches)) {
                    $params = [];
                    foreach ($route['paramNames'] as $name) {
                        $params[$name] = $matches[$name] ?? null;
                    }

                    // Run route-specific middlewares
                    foreach ($route['middlewares'] as $middleware) {
                        $middleware($request);
                    }

                    // Execute handler
                    $handler = $route['handler'];
                    if (is_array($handler)) {
                        [$controllerClass, $action] = $handler;
                        $controller = new $controllerClass();
                        $controller->$action($request, $params);
                    } else {
                        $handler($request, $params);
                    }
                    return;
                }
            }

            // Route not found
            throw new ApiException("Endpoint not found: {$requestMethod} {$requestPath}", 404);

        } catch (ApiException $e) {
            Response::error($e->getMessage(), $e->getStatusCode(), $e->getErrors());
        } catch (Throwable $e) {
            error_log('[PUP-CRS Error] ' . $e->getMessage() . "\n" . $e->getTraceAsString());

            $message = Config::isDebug()
                ? $e->getMessage()
                : 'An unexpected server error occurred. Please try again later.';

            $errors = Config::isDebug() ? [
                'exception' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ] : [];

            Response::error($message, 500, $errors);
        }
    }

    /**
     * @return array{pattern: string, paramNames: array<int, string>}
     */
    private function compileRoute(string $routePath): array
    {
        $paramNames = [];
        $pattern = preg_replace_callback('/\{([a-zA-Z0-9_]+)\}/', function ($matches) use (&$paramNames) {
            $paramNames[] = $matches[1];
            return '(?P<' . $matches[1] . '>[^/]+)';
        }, $routePath);

        return [
            'pattern' => '#^' . $pattern . '$#',
            'paramNames' => $paramNames,
        ];
    }
}
