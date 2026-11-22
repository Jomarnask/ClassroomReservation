<?php

namespace App\Controllers;

use App\Http\ApiException;
use App\Http\Request;
use App\Http\Response;
use App\Services\UserService;

class UserController
{
    private UserService $userService;

    public function __construct(?UserService $userService = null)
    {
        $this->userService = $userService ?? new UserService();
    }

    public function me(Request $request): void
    {
        $authUser = $request->getUser();

        if (!$authUser) {
            throw new ApiException('Unauthorized request.', 401);
        }

        $profile = $this->userService->getProfile($authUser);

        Response::success($profile, 'User profile retrieved successfully.');
    }
}
