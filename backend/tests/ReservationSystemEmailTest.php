<?php

namespace App\Tests;

use App\Services\EmailService;
use PHPUnit\Framework\TestCase;

class ReservationSystemEmailTest extends TestCase
{
    private const SETTINGS = [
        'enabled' => true,
        'api_key' => 'test-key',
        'from_email' => 'crs@example.com',
        'from_name' => 'PUP CRS',
        'frontend_url' => 'http://127.0.0.1:5500',
    ];

    private function row(string $status, ?string $remarks): array
    {
        return [
            'status' => $status,
            'admin_remarks' => $remarks,
            'student_name' => 'Juan Dela Cruz',
            'student_webmail' => 'juan@iskolarngbayan.pup.edu.ph',
            'room_number' => '301',
            'room_name' => 'Computer Lab',
            'subject' => 'Capstone Meeting',
            'reservation_date' => '2026-12-01',
            'start_time' => '09:00:00',
            'end_time' => '11:00:00',
        ];
    }

    private function sendAndCapture(array $row): ?array
    {
        $sent = [];
        $service = new EmailService(function (array $payload) use (&$sent) {
            $sent[] = $payload;

            return ['status' => 201, 'body' => '{}'];
        }, self::SETTINGS);

        $service->sendReservationSystemChange($row);

        return $sent[0] ?? null;
    }

    public function testAutoCancelSaysCancelledWithTheReason(): void
    {
        $mail = $this->sendAndCapture($this->row(
            'cancelled',
            'Automatically cancelled: no admin decision was made at least 1 hour before the start time.'
        ));

        $this->assertStringContainsString('cancelled', $mail['subject']);
        $this->assertStringContainsString(
            'Reason: No admin decision was made at least 1 hour before the start time.',
            $mail['textContent']
        );
        $this->assertStringNotContainsString('by an administrator', $mail['textContent']);
    }

    public function testOverrideByAdminBookingSaysCancelled(): void
    {
        $mail = $this->sendAndCapture($this->row('rejected', 'Overridden by Administrator booking (Class Meeting).'));

        $this->assertStringContainsString('cancelled', $mail['subject']);
        $this->assertStringContainsString('An administrator booking replaced your reserved time slot.', $mail['textContent']);
    }

    public function testCompetingRequestSaysDeclinedWithoutThePrefix(): void
    {
        $mail = $this->sendAndCapture($this->row('rejected', 'Auto-rejected: Slot booked by another approved reservation.'));

        $this->assertStringContainsString('declined', $mail['subject']);
        $this->assertStringContainsString('Reason: Slot booked by another approved reservation.', $mail['textContent']);
        $this->assertStringNotContainsString('Auto-rejected', $mail['textContent']);
    }

    public function testOtherStatusesSendNothing(): void
    {
        $this->assertNull($this->sendAndCapture($this->row('approved', null)));
        $this->assertNull($this->sendAndCapture($this->row('pending', null)));
    }
}