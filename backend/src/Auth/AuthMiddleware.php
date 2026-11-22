<?php

namespace App\Auth;

use App\Http\ApiException;
use App\Http\Request;

class AuthMiddleware
{
    private SupabaseAuthService $authService;

    public function __construct(?SupabaseAuthService $authService = null)
    {
        $this->authService = $authService ?? new SupabaseAuthService();
    }

    public function handle(Request $request): void
    {
        $token = $request->getBearerToken();

        if (empty($token)) {
            throw new ApiException('Missing Authorization header. Expected: Bearer <token>', 401);
        }

        $user = $this->authService->verifyToken($token);

        if (!$user) {
            throw new ApiException('Invalid or expired authentication token.', 401);
        }

        $request->setUser($user);
    }

    public function __invoke(Request $request): void
    {
        $this->handle($request);
    }
}
