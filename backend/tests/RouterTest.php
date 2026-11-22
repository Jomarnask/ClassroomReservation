<?php

namespace App\Tests;

use App\Http\Request;
use App\Http\Router;
use PHPUnit\Framework\TestCase;

class RouterTest extends TestCase
{
    private Router $router;

    protected function setUp(): void
    {
        $this->router = new Router();
    }

    public function testStaticRouteMatching(): void
    {
        $called = false;

        $this->router->get('/api/test', function (Request $request) use (&$called) {
            $called = true;
        });

        $request = $this->createConfiguredMock(Request::class, [
            'getMethod' => 'GET',
            'getPath' => '/api/test',
        ]);

        $this->router->dispatch($request);

        $this->assertTrue($called);
    }

    public function testDynamicRouteParameters(): void
    {
        $capturedParams = [];

        $this->router->get('/users/{id}/orders/{orderId}', function ($request, $params) use (&$capturedParams) {
            $capturedParams = $params;
        });

        $request = $this->createConfiguredMock(Request::class, [
            'getMethod' => 'GET',
            'getPath' => '/users/10/orders/abc-999',
        ]);

        $this->router->dispatch($request);

        $this->assertEquals([
            'id' => '10',
            'orderId' => 'abc-999',
        ], $capturedParams);
    }
}