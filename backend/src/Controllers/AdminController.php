<?php

namespace App\Controllers;

use App\Http\ApiException;
use App\Http\Request;
use App\Http\Response;
use App\Services\UserService;

class AdminController
{
    private UserService $userService;

    public function __construct(?UserService $userService = null)
    {
        $this->userService = $userService ?? new UserService();
    }

    public function check(Request $request): void
    {
        $authUser = $request->getUser();

        if (!$authUser) {
            throw new ApiException('Unauthorized request.', 401);
        }

        $adminData = $this->userService->checkAdmin($authUser);

        Response::success($adminData, 'Admin status confirmed.');
    }
}
