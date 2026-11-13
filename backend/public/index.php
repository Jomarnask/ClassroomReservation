<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use App\Auth\AuthMiddleware;
use App\Controllers\AdminController;
use App\Controllers\AdminDashboardController;
use App\Controllers\AuditLogController;
use App\Controllers\FacultyScheduleController;
use App\Controllers\ScheduleController;
use App\Controllers\HealthController;
use App\Controllers\NotificationController;
use App\Controllers\UserController;
use App\Controllers\ReservationController;
use App\Controllers\RoomController;
use App\Controllers\UserManagementController;
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

// 3b. Admin dashboard numbers, room status and today's activity (Protected, admin only)
$router->get('/api/admin/dashboard', [AdminDashboardController::class, 'index'], [$authMiddleware]);

// 4. Rooms API (Protected)
$router->get('/api/rooms', [RoomController::class, 'index'], [$authMiddleware]);

$router->get('/api/rooms/{roomId}', [RoomController::class, 'show'], [$authMiddleware]);

$router->post('/api/rooms', [RoomController::class, 'store'], [$authMiddleware]);

$router->patch('/api/rooms/{roomId}', [RoomController::class, 'update'], [$authMiddleware]);

// 5. Reservations API (Protected)
$router->get('/api/rooms/{roomId}/taken-slots', [ReservationController::class, 'takenSlots'], [$authMiddleware]);

$router->get('/api/reservations', [ReservationController::class, 'index'], [$authMiddleware]);

$router->post('/api/reservations', [ReservationController::class, 'store'], [$authMiddleware]);

$router->get('/api/reservations/{reservationId}', [ReservationController::class, 'show'], [$authMiddleware]);

$router->patch('/api/reservations/{reservationId}/decision', [ReservationController::class, 'decide'], [$authMiddleware]);

$router->patch('/api/reservations/{reservationId}/cancel', [ReservationController::class, 'cancel'], [$authMiddleware]);

$router->get('/api/booking-window', [ReservationController::class, 'bookingWindow'], [$authMiddleware]);

// 6. User management API - admin only (Protected)
$router->get('/api/users', [UserManagementController::class, 'index'], [$authMiddleware]);

$router->patch('/api/users/{userId}/status', [UserManagementController::class, 'updateStatus'], [$authMiddleware]);

// 7. Faculty schedule API - active faculty only (Protected)
$router->get('/api/faculty/schedule', [FacultyScheduleController::class, 'index'], [$authMiddleware]);

// 8. Schedule Manager API - master timetable (Protected)
//    Read: admin (all), student (all), faculty (own classes only). Write: admin only.
$router->get('/api/schedules', [ScheduleController::class, 'index'], [$authMiddleware]);

$router->post('/api/schedules', [ScheduleController::class, 'store'], [$authMiddleware]);

$router->get('/api/schedules/{scheduleId}', [ScheduleController::class, 'show'], [$authMiddleware]);

$router->patch('/api/schedules/{scheduleId}', [ScheduleController::class, 'update'], [$authMiddleware]);

$router->delete('/api/schedules/{scheduleId}', [ScheduleController::class, 'destroy'], [$authMiddleware]);

// 9. Notification bell - each user reads only their own notifications (Protected)
$router->get('/api/notifications', [NotificationController::class, 'index'], [$authMiddleware]);

$router->patch('/api/notifications/read-all', [NotificationController::class, 'markAllRead'], [$authMiddleware]);

$router->patch('/api/notifications/{notificationId}/read', [NotificationController::class, 'markRead'], [$authMiddleware]);

// 10. System audit trail - admin only, read-only (Protected)
$router->get('/api/audit-logs', [AuditLogController::class, 'index'], [$authMiddleware]);

// -------------------------------------------------------------
// Dispatch incoming request
// -------------------------------------------------------------

$router->dispatch($request);