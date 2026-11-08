<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use App\Auth\AuthMiddleware;
use App\Controllers\AdminController;
use App\Controllers\HealthController;
use App\Controllers\UserController;
use App\Controllers\RoomController;
use App\Http\Request;
use App\Http\Router;

$request = Request::createFromGlobals();
$router = new Router();
$authMiddleware = new AuthMiddleware();

// -------------------------------------------------------------
// Routes definition
// -------------------------------------------------------------

// 1. Health check (Public)
$router->get('/api/health', [HealthController::class, 'index']);

// 2. Authenticated user profile (Protected)
$router->get('/api/me', [UserController::class, 'me'], [$authMiddleware]);

// 3. Admin verification check (Protected)
$router->get('/api/admin/check', [AdminController::class, 'check'], [$authMiddleware]);

// 4. Rooms API (Protected)
$router->get('/api/rooms', [RoomController::class, 'index'], [$authMiddleware]);

$router->get('/api/rooms/{roomId}', [RoomController::class, 'show'], [$authMiddleware]);

$router->post('/api/rooms', [RoomController::class, 'store'], [$authMiddleware]);

$router->patch('/api/rooms/{roomId}', [RoomController::class, 'update'], [$authMiddleware]);

// -------------------------------------------------------------
// Dispatch incoming request
// -------------------------------------------------------------

$router->dispatch($request);
