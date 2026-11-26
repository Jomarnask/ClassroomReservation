<?php

declare(strict_types=1);

/**
 * CLI runner for the 4:00 AM PH time faculty daily schedule email job.
 *
 * Usage:
 *   php backend/bin/send_faculty_daily_schedule.php
 *   php backend/bin/send_faculty_daily_schedule.php --date=2026-11-26 --dry-run
 *   php backend/bin/send_faculty_daily_schedule.php --to=you@gmail.com
 *   php backend/bin/send_faculty_daily_schedule.php --preview
 *   php backend/bin/send_faculty_daily_schedule.php --force
 */

require_once dirname(__DIR__) . '/src/bootstrap.php';

use App\Config;
use App\Services\EmailService;
use App\Services\FacultyDailyEmailService;

$options = getopt('', ['date:', 'dry-run', 'force', 'to:', 'preview']);

$date = isset($options['date']) && is_string($options['date']) ? $options['date'] : null;
$dryRun = array_key_exists('dry-run', $options);
$force = array_key_exists('force', $options);
$preview = array_key_exists('preview', $options);
$overrideTo = isset($options['to']) && is_string($options['to']) ? trim($options['to']) : null;

if ($overrideTo === '') {
    $overrideTo = null;
}

if ($overrideTo !== null && !filter_var($overrideTo, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Error: Invalid --to email address: {$overrideTo}" . PHP_EOL);
    exit(1);
}

$previewFiles = [];
$mailer = null;

if ($preview) {
    $previewDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pup-crs-email-previews';
    if (!is_dir($previewDir) && !mkdir($previewDir, 0777, true) && !is_dir($previewDir)) {
        fwrite(STDERR, "Error: Could not create preview directory: {$previewDir}" . PHP_EOL);
        exit(1);
    }

    $mailer = new EmailService(
        function (array $payload) use ($previewDir, &$previewFiles): array {
            $toEmail = $payload['to'][0]['email'] ?? 'faculty';
            $slug = preg_replace('/[^a-zA-Z0-9._-]+/', '_', $toEmail);
            $filePath = $previewDir . DIRECTORY_SEPARATOR . $slug . '.html';
            file_put_contents($filePath, (string) ($payload['htmlContent'] ?? ''));
            $previewFiles[] = [
                'to' => $toEmail,
                'subject' => $payload['subject'] ?? '',
                'file' => $filePath,
            ];

            return ['status' => 200, 'body' => 'preview'];
        },
        [
            'enabled' => true,
            'api_key' => 'preview-mode',
            'from_email' => (string) Config::get('mail_from_email', 'crs@example.com') ?: 'crs@example.com',
            'from_name' => (string) Config::get('mail_from_name', 'PUP CRS'),
            'frontend_url' => (string) Config::get('frontend_url', 'http://127.0.0.1:5500'),
        ]
    );
}

try {
    $service = new FacultyDailyEmailService(null, $mailer);
    $summary = $service->runForDate(
        $date,
        $dryRun,
        $force,
        $preview || $overrideTo !== null,
        $overrideTo
    );

    if ($overrideTo !== null) {
        $summary['redirected_to'] = $overrideTo;
    }

    if ($preview) {
        $summary['preview_files'] = $previewFiles;
    }

    echo json_encode([
        'success' => true,
        'data' => $summary,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;

    exit($summary['failed'] > 0 ? 1 : 0);
} catch (Throwable $e) {
    fwrite(STDERR, 'Error: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
