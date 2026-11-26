<?php

namespace App\Tests;

use App\Http\ApiException;
use App\Repositories\FacultyDailyEmailRepository;
use App\Services\EmailService;
use App\Services\FacultyDailyEmailService;
use PDO;
use PHPUnit\Framework\TestCase;

class FacultyDailyEmailTest extends TestCase
{
    private const SETTINGS = [
        'enabled' => true,
        'api_key' => 'test-key',
        'from_email' => 'crs@example.com',
        'from_name' => 'PUP CRS',
        'frontend_url' => 'http://127.0.0.1:5500/',
    ];

    private const FACULTY = [
        'user_id' => '11111111-1111-1111-1111-111111111111',
        'full_name' => 'Prof. Maria Santos',
        'pup_webmail' => 'msantos@pup.edu.ph',
    ];

    public function testDailyScheduleEmailRendersBothTablesAndLabels(): void
    {
        $sent = [];
        $mailer = new EmailService(function (array $payload) use (&$sent) {
            $sent[] = $payload;
            return ['status' => 201, 'body' => '{}'];
        }, self::SETTINGS);

        $reserved = [
            [
                'start_time' => '07:30:00',
                'end_time' => '09:30:00',
                'room_number' => '201',
                'room_name' => 'Computer Lab 1',
                'program_course' => 'BS of Information Technology (BSIT)',
                'year_level' => 3,
                'section' => 2,
                'subject' => 'Web Development',
                'status' => 'approved',
            ],
            [
                'start_time' => '13:00:00',
                'end_time' => '15:00:00',
                'room_number' => '202',
                'room_name' => 'Lecture Room 202',
                'program_course' => 'BSIT',
                'year_level' => 2,
                'section' => 1,
                'subject' => 'Database Systems',
                'status' => 'pending',
            ],
        ];

        $unreserved = [
            [
                'start_time' => '10:00:00',
                'end_time' => '12:00:00',
                'room_number' => '305',
                'room_name' => 'Lecture Room 305',
                'program_course' => 'BSIT',
                'year_level' => 4,
                'section' => 1,
                'subject_code' => 'COMP 401',
                'subject_title' => 'Capstone Project',
            ],
        ];

        $ok = $mailer->sendFacultyDailySchedule(self::FACULTY, '2026-11-26', $reserved, $unreserved);

        $this->assertTrue($ok);
        $this->assertCount(1, $sent);
        $this->assertSame('msantos@pup.edu.ph', $sent[0]['to'][0]['email']);
        $this->assertStringContainsString('Thursday, November 26, 2026', $sent[0]['subject']);

        $html = $sent[0]['htmlContent'];
        $this->assertStringContainsString('Reserved Classes for Today', $html);
        $this->assertStringContainsString('Class Schedules Not Yet Reserved', $html);
        $this->assertStringContainsString('7:30 AM - 9:30 AM', $html);
        $this->assertStringContainsString('201 — Computer Lab 1', $html);
        $this->assertStringContainsString('BSIT 3-2', $html);
        $this->assertStringContainsString('Web Development', $html);
        $this->assertStringContainsString('Approved', $html);
        $this->assertStringContainsString('Pending', $html);
        $this->assertStringContainsString('10:00 AM - 12:00 PM', $html);
        $this->assertStringContainsString('COMP 401 — Capstone Project', $html);
        $this->assertStringContainsString('http://127.0.0.1:5500/schedule.html', $html);
    }

    public function testDailyScheduleEmailOmitsEmptySectionAndSkipsWhenBothEmpty(): void
    {
        $sent = [];
        $mailer = new EmailService(function (array $payload) use (&$sent) {
            $sent[] = $payload;
            return ['status' => 201, 'body' => '{}'];
        }, self::SETTINGS);

        // Both empty -> nothing sent
        $this->assertFalse($mailer->sendFacultyDailySchedule(self::FACULTY, '2026-11-26', [], []));
        $this->assertCount(0, $sent);

        // Only unreserved schedules -> only second table rendered
        $this->assertTrue($mailer->sendFacultyDailySchedule(self::FACULTY, '2026-11-26', [], [[
            'start_time' => '08:00:00',
            'end_time' => '10:00:00',
            'room_number' => '101',
            'room_name' => 'Room 101',
            'course_section' => 'BSIT 1-1',
            'subject_title' => 'Intro to Computing',
        ]]));

        $this->assertCount(1, $sent);
        $this->assertStringNotContainsString('Reserved Classes for Today', $sent[0]['htmlContent']);
        $this->assertStringContainsString('Class Schedules Not Yet Reserved', $sent[0]['htmlContent']);
    }

    public function testServiceGroupsByFacultySkipsAlreadySentAndSupportsDryRunAndForce(): void
    {
        $sentPayloads = [];
        $mailer = new EmailService(function (array $payload) use (&$sentPayloads) {
            $sentPayloads[] = $payload;
            return ['status' => 201, 'body' => '{}'];
        }, self::SETTINGS);

        $recordedLogs = [];
        $repo = $this->createMock(FacultyDailyEmailRepository::class);
        $repo->method('getDailyReservations')->willReturn([
            [
                'faculty_id' => 'aaaa-1111',
                'faculty_name' => 'Prof. A',
                'faculty_email' => 'profa@pup.edu.ph',
                'start_time' => '08:00:00',
                'end_time' => '10:00:00',
                'room_number' => '201',
                'room_name' => 'Lab 1',
                'program_course' => 'BSIT',
                'year_level' => 3,
                'section' => 1,
                'subject' => 'IT 101',
                'status' => 'approved',
            ],
            [
                'faculty_id' => 'bbbb-2222',
                'faculty_name' => 'Prof. B (already sent)',
                'faculty_email' => 'profb@pup.edu.ph',
                'start_time' => '09:00:00',
                'end_time' => '11:00:00',
                'room_number' => '202',
                'room_name' => 'Room 202',
                'program_course' => 'BSIT',
                'year_level' => 2,
                'section' => 1,
                'subject' => 'IT 102',
                'status' => 'pending',
            ],
        ]);
        $repo->method('getDailyUnreservedSchedules')->willReturn([
            [
                'faculty_id' => 'aaaa-1111',
                'faculty_name' => 'Prof. A',
                'faculty_email' => 'profa@pup.edu.ph',
                'start_time' => '13:00:00',
                'end_time' => '15:00:00',
                'room_number' => '203',
                'room_name' => 'Room 203',
                'program_course' => 'BSIT',
                'year_level' => 3,
                'section' => 2,
                'subject_code' => 'IT 201',
                'subject_title' => 'Networking',
            ],
        ]);
        $repo->method('getSentFacultyIds')->willReturn(['bbbb-2222']);
        $repo->method('recordEmailSent')->willReturnCallback(
            function (PDO $pdo, string $facultyId, string $date, int $resCount, int $schedCount) use (&$recordedLogs) {
                $recordedLogs[] = [$facultyId, $date, $resCount, $schedCount];
            }
        );

        $pdo = $this->createMock(PDO::class);
        $service = new FacultyDailyEmailService($repo, $mailer, $pdo);

        // 1. Dry run: sends nothing, records nothing, counts Prof. A as would-send and Prof. B as skipped
        $drySummary = $service->runForDate('2026-11-26', true, false);
        $this->assertSame(2, $drySummary['qualifying_faculty']);
        $this->assertSame(1, $drySummary['sent']);
        $this->assertSame(1, $drySummary['skipped_already_sent']);
        $this->assertCount(0, $sentPayloads);
        $this->assertCount(0, $recordedLogs);

        // 2. Normal run: sends only to Prof. A, skips Prof. B
        $summary = $service->runForDate('2026-11-26', false, false);
        $this->assertSame(1, $summary['sent']);
        $this->assertSame(1, $summary['skipped_already_sent']);
        $this->assertSame(0, $summary['failed']);
        $this->assertCount(1, $sentPayloads);
        $this->assertSame('profa@pup.edu.ph', $sentPayloads[0]['to'][0]['email']);
        $this->assertSame([['aaaa-1111', '2026-11-26', 1, 1]], $recordedLogs);

        // 3. Force run: sends to both Prof. A and Prof. B
        $forceSummary = $service->runForDate('2026-11-26', false, true);
        $this->assertSame(2, $forceSummary['sent']);
        $this->assertSame(0, $forceSummary['skipped_already_sent']);
        $this->assertCount(3, $sentPayloads);
    }

    public function testInvalidDateThrowsValidationException(): void
    {
        $repo = $this->createMock(FacultyDailyEmailRepository::class);
        $mailer = new EmailService(fn () => ['status' => 201, 'body' => '{}'], self::SETTINGS);
        $pdo = $this->createMock(PDO::class);

        $service = new FacultyDailyEmailService($repo, $mailer, $pdo);

        $this->expectException(ApiException::class);
        $service->runForDate('26-11-2026');
    }

    public function testOverrideToRedirectsRecipientAndSkipsLogging(): void
    {
        $sent = [];
        $mailer = new EmailService(function (array $payload) use (&$sent) {
            $sent[] = $payload;
            return ['status' => 201, 'body' => '{}'];
        }, self::SETTINGS);

        $repo = $this->createMock(FacultyDailyEmailRepository::class);
        $repo->method('getDailyReservations')->willReturn([
            [
                'faculty_id' => 'aaaa-1111',
                'faculty_name' => 'Prof. A',
                'faculty_email' => 'profa@pup.edu.ph',
                'start_time' => '08:00:00',
                'end_time' => '10:00:00',
                'room_number' => '201',
                'room_name' => 'Lab 1',
                'program_course' => 'BSIT',
                'year_level' => 3,
                'section' => 1,
                'subject' => 'IT 101',
                'status' => 'approved',
            ],
        ]);
        $repo->method('getDailyUnreservedSchedules')->willReturn([]);
        $repo->expects($this->never())->method('recordEmailSent');

        $pdo = $this->createMock(PDO::class);
        $service = new FacultyDailyEmailService($repo, $mailer, $pdo);

        $summary = $service->runForDate('2026-11-26', false, false, false, 'tester@gmail.com');

        $this->assertSame(1, $summary['sent']);
        $this->assertCount(1, $sent);
        $this->assertSame('tester@gmail.com', $sent[0]['to'][0]['email']);
        $this->assertStringStartsWith('[TEST for profa@pup.edu.ph] ', $sent[0]['subject']);
    }
}
