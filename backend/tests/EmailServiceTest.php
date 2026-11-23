<?php

namespace App\Tests;

use App\Services\EmailService;
use PHPUnit\Framework\TestCase;

class EmailServiceTest extends TestCase
{
    private const SETTINGS = [
        'enabled' => true,
        'api_key' => 'test-key',
        'from_email' => 'crs@example.com',
        'from_name' => 'PUP CRS',
        'frontend_url' => 'http://127.0.0.1:5500/',
    ];

    private const USER = [
        'full_name' => 'Juan Dela Cruz',
        'pup_webmail' => 'juan@iskolarngbayan.pup.edu.ph',
    ];

    public function testApprovedEmailIsSentToTheUsersWebmail(): void
    {
        $sent = [];
        $service = new EmailService(function (array $payload) use (&$sent) {
            $sent[] = $payload;

            return ['status' => 201, 'body' => '{}'];
        }, self::SETTINGS);

        $this->assertTrue($service->sendAccountApproved(self::USER));
        $this->assertCount(1, $sent);
        $this->assertSame('juan@iskolarngbayan.pup.edu.ph', $sent[0]['to'][0]['email']);
        $this->assertStringContainsString('approved', $sent[0]['subject']);
        $this->assertStringContainsString('http://127.0.0.1:5500/login.html', $sent[0]['textContent']);
    }

    public function testRejectedEmailSaysNotApproved(): void
    {
        $sent = [];
        $service = new EmailService(function (array $payload) use (&$sent) {
            $sent[] = $payload;

            return ['status' => 201, 'body' => '{}'];
        }, self::SETTINGS);

        $this->assertTrue($service->sendAccountRejected(self::USER));
        $this->assertStringContainsString("We're sorry", $sent[0]['textContent']);
        $this->assertStringContainsString('not approved', $sent[0]['textContent']);
    }

    public function testNothingIsSentWhenMailIsTurnedOff(): void
    {
        $called = false;
        $service = new EmailService(function () use (&$called) {
            $called = true;

            return ['status' => 201, 'body' => ''];
        }, ['enabled' => false] + self::SETTINGS);

        $this->assertFalse($service->sendAccountApproved(self::USER));
        $this->assertFalse($called);
    }

    public function testProviderErrorReturnsFalseInsteadOfThrowing(): void
    {
        $service = new EmailService(fn () => ['status' => 401, 'body' => 'bad key'], self::SETTINGS);

        $this->assertFalse($service->sendAccountApproved(self::USER));
    }

    public function testTransportExceptionReturnsFalseInsteadOfThrowing(): void
    {
        $service = new EmailService(function () {
            throw new \RuntimeException('network down');
        }, self::SETTINGS);

        $this->assertFalse($service->sendAccountRejected(self::USER));
    }

    public function testInvalidAddressIsNotSent(): void
    {
        $called = false;
        $service = new EmailService(function () use (&$called) {
            $called = true;

            return ['status' => 201, 'body' => ''];
        }, self::SETTINGS);

        $this->assertFalse($service->sendAccountApproved(['full_name' => 'X', 'pup_webmail' => 'not-an-email']));
        $this->assertFalse($called);
    }

    public function testNameIsEscapedInTheHtml(): void
    {
        $sent = [];
        $service = new EmailService(function (array $payload) use (&$sent) {
            $sent[] = $payload;

            return ['status' => 201, 'body' => '{}'];
        }, self::SETTINGS);

        $service->sendAccountApproved(['full_name' => '<script>x</script>', 'pup_webmail' => 'a@pup.edu.ph']);

        $this->assertStringNotContainsString('<script>', $sent[0]['htmlContent']);
    }
}