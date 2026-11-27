<?php

namespace App\Tests;

use App\Services\EmailService;
use PHPUnit\Framework\TestCase;

class ReservationEmailTest extends TestCase
{
    private const SETTINGS = [
        'enabled' => true,
        'api_key' => 'test-key',
        'from_email' => 'crs@example.com',
        'from_name' => 'PUP CRS',
        'frontend_url' => 'http://127.0.0.1:5500/',
    ];

    private function reservation(array $override = []): array
    {
        return $override + [
            'student_name' => 'Juan Dela Cruz',
            'student_webmail' => 'juan@iskolarngbayan.pup.edu.ph',
            'room_number' => '301',
            'room_name' => 'Computer Lab',
            'subject' => 'Capstone Meeting',
            'reservation_date' => '2026-12-01',
            'start_time' => '09:00:00',
            'end_time' => '11:00:00',
            'admin_remarks' => null,
        ];
    }

    /** @return array{0: EmailService, 1: array} */
    private function service(): array
    {
        $box = new \ArrayObject();
        $service = new EmailService(function (array $payload) use ($box) {
            $box[] = $payload;

            return ['status' => 201, 'body' => '{}'];
        }, self::SETTINGS);

        return [$service, $box];
    }

    public function testApprovedEmailHasDetailsAndKeyReminder(): void
    {
        [$service, $sent] = $this->service();

        $this->assertTrue($service->sendReservationApproved($this->reservation()));
        $this->assertCount(1, $sent);
        $mail = $sent[0];
        $this->assertSame('juan@iskolarngbayan.pup.edu.ph', $mail['to'][0]['email']);
        $this->assertStringContainsString('approved', $mail['subject']);
        $this->assertStringContainsString('Capstone Meeting', $mail['textContent']);
        $this->assertStringContainsString('9:00 AM - 11:00 AM', $mail['textContent']);
        $this->assertStringContainsString('Tuesday, December 1, 2026', $mail['textContent']);
        $this->assertStringContainsString('claim the physical key', $mail['textContent']);
        $this->assertStringContainsString('http://127.0.0.1:5500/my-reservations.html', $mail['textContent']);
    }

    public function testDeclinedEmailShowsTheAdminsReason(): void
    {
        [$service, $sent] = $this->service();

        $this->assertTrue($service->sendReservationDeclined($this->reservation(['admin_remarks' => 'Room is under repair'])));
        $this->assertStringContainsString("We're sorry", $sent[0]['textContent']);
        $this->assertStringContainsString('Reason: Room is under repair', $sent[0]['textContent']);
    }

    public function testDeclinedEmailHidesTheDefaultRemark(): void
    {
        [$service, $sent] = $this->service();

        $service->sendReservationDeclined($this->reservation(['admin_remarks' => 'Declined by Administrator']));

        $this->assertStringNotContainsString('Reason:', $sent[0]['textContent']);
    }

    public function testCancelledEmailByAdminAndWithReason(): void
    {
        [$service, $sent] = $this->service();

        $service->sendReservationCancelled($this->reservation());
        $service->sendReservationCancelled($this->reservation(), 'It was not approved before the deadline.');

        $this->assertStringContainsString('cancelled by an administrator', $sent[0]['textContent']);
        $this->assertStringContainsString('Reason: It was not approved before the deadline.', $sent[1]['textContent']);
        $this->assertStringNotContainsString('by an administrator', $sent[1]['textContent']);
    }

    public function testNothingIsSentWithoutAValidAddress(): void
    {
        [$service, $sent] = $this->service();

        $this->assertFalse($service->sendReservationApproved($this->reservation(['student_webmail' => ''])));
        $this->assertCount(0, $sent);
    }

    public function testSubjectIsEscapedInTheHtml(): void
    {
        [$service, $sent] = $this->service();

        $service->sendReservationApproved($this->reservation(['subject' => '<script>x</script>']));

        $this->assertStringNotContainsString('<script>', $sent[0]['htmlContent']);
    }
}