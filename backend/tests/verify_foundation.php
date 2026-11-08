<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use App\Auth\AuthenticatedUser;
use App\Auth\AuthMiddleware;
use App\Controllers\HealthController;
use App\Http\ApiException;
use App\Http\Request;
use App\Http\Response;

Response::setShouldExit(false);

echo "========================================================\n";
echo " PUP-CRS Backend Foundation Automated Verification \n";
echo "========================================================\n\n";

$testsPassed = 0;
$totalTests = 0;

function assertCheck(string $description, bool $condition, string $detail = ''): void {
    global $testsPassed, $totalTests;
    $totalTests++;
    if ($condition) {
        $testsPassed++;
        echo " [PASS] {$description}\n";
    } else {
        echo " [FAIL] {$description} - {$detail}\n";
    }
}

// -------------------------------------------------------------
// Test 1: HealthController response structure
// -------------------------------------------------------------
try {
    $request = new Request('GET', '/api/health');
    $controller = new HealthController();
    
    ob_start();
    $controller->index($request);
    $output = ob_get_clean();
    $data = json_decode($output, true);

    assertCheck(
        'GET /api/health returns valid JSON with success=true and status=healthy',
        isset($data['success']) && $data['success'] === true &&
        isset($data['data']['status']) && $data['data']['status'] === 'healthy'
    );

    assertCheck(
        'GET /api/health does not expose database credentials or secrets',
        !isset($data['data']['db_password']) &&
        !isset($data['data']['db_user']) &&
        !isset($data['data']['db_host'])
    );
} catch (\Throwable $e) {
    assertCheck('HealthController test', false, $e->getMessage());
}

// -------------------------------------------------------------
// Test 2: AuthMiddleware rejects missing token
// -------------------------------------------------------------
try {
    $requestWithoutToken = new Request('GET', '/api/me');
    $authMiddleware = new AuthMiddleware();
    
    $threwExpected401 = false;
    try {
        $authMiddleware->handle($requestWithoutToken);
    } catch (ApiException $e) {
        if ($e->getStatusCode() === 401 && str_contains($e->getMessage(), 'Missing Authorization header')) {
            $threwExpected401 = true;
        }
    }

    assertCheck(
        'AuthMiddleware rejects requests without Bearer token with 401',
        $threwExpected401
    );
} catch (\Throwable $e) {
    assertCheck('AuthMiddleware missing token test', false, $e->getMessage());
}

// -------------------------------------------------------------
// Test 3: AuthenticatedUser encapsulates claims correctly
// -------------------------------------------------------------
try {
    $userId = 'a0000000-0000-0000-0000-000000000001';
    $email = 'student@iskolarngbayan.pup.edu.ph';
    $claims = ['sub' => $userId, 'role' => 'authenticated', 'email' => $email];
    $authUser = new AuthenticatedUser($userId, $email, 'authenticated', $claims);

    assertCheck(
        'AuthenticatedUser encapsulates sub UUID, email, and claims safely',
        $authUser->getId() === $userId &&
        $authUser->getEmail() === $email &&
        $authUser->getClaims()['sub'] === $userId
    );
} catch (\Throwable $e) {
    assertCheck('AuthenticatedUser test', false, $e->getMessage());
}

// -------------------------------------------------------------
// Test 4: Environment & Configuration
// -------------------------------------------------------------
assertCheck(
    'Config loader reads defaults and handles CORS origins array properly',
    is_array(\App\Config::getCorsOrigins()) &&
    in_array('http://127.0.0.1:5500', \App\Config::getCorsOrigins())
);

// -------------------------------------------------------------
// Test 5: Route matching in Router
// -------------------------------------------------------------
try {
    $router = new \App\Http\Router();
    $matched = false;
    $router->get('/api/health', function (Request $req) use (&$matched) {
        $matched = true;
    });

    $router->dispatch(new Request('GET', '/api/health'));
    assertCheck('Router dispatches matching routes correctly', $matched);
} catch (\Throwable $e) {
    assertCheck('Router dispatch test', false, $e->getMessage());
}

// -------------------------------------------------------------
// Test 6: 404 Route handling in Router
// -------------------------------------------------------------
try {
    $router = new \App\Http\Router();
    ob_start();
    $router->dispatch(new Request('GET', '/api/non-existent-endpoint'));
    $output = ob_get_clean();
    $notFoundData = json_decode($output, true);

    assertCheck(
        'Router returns 404 JSON for non-existent routes',
        isset($notFoundData['success']) && $notFoundData['success'] === false &&
        str_contains($notFoundData['message'], 'Endpoint not found')
    );
} catch (\Throwable $e) {
    assertCheck('Router 404 test', false, $e->getMessage());
}

echo "\n--------------------------------------------------------\n";
echo " Results: {$testsPassed} / {$totalTests} tests passed.\n";
echo "========================================================\n";

if ($testsPassed === $totalTests) {
    exit(0);
} else {
    exit(1);
}
