<?php

namespace App\Controllers;

use App\Config;
use App\Http\ApiException;
use App\Http\Request;
use App\Http\Response;
use App\Services\FacultyDailyEmailService;

class CronController
{
    private FacultyDailyEmailService $service;

    public function __construct(?FacultyDailyEmailService $service = null)
    {
        $this->service = $service ?? new FacultyDailyEmailService();
    }

    public function sendFacultyDailySchedule(Request $request): void
    {
        $expected = (string) Config::get('cron_secret', '');
        if ($expected === '') {
            throw new ApiException('Cron secret is not configured on the server.', 503);
        }

        $provided = (string) ($request->getHeader('x-cron-secret') ?? '');
        if ($provided === '' || !hash_equals($expected, $provided)) {
            throw new ApiException('Invalid or missing cron secret.', 401);
        }

        $body = $request->getBody();
        $date = $request->getQuery('date') ?? ($body['date'] ?? null);
        $dryRun = filter_var(
            $request->getQuery('dry_run') ?? ($body['dry_run'] ?? false),
            FILTER_VALIDATE_BOOLEAN
        );
        $force = filter_var(
            $request->getQuery('force') ?? ($body['force'] ?? false),
            FILTER_VALIDATE_BOOLEAN
        );
        $rawTo = $request->getQuery('to') ?? ($body['to'] ?? null);
        $overrideTo = is_string($rawTo) && trim($rawTo) !== '' ? trim($rawTo) : null;

        if ($overrideTo !== null && !filter_var($overrideTo, FILTER_VALIDATE_EMAIL)) {
            throw new ApiException('Invalid "to" email address.', 422);
        }

        $summary = $this->service->runForDate(
            is_string($date) ? $date : null,
            $dryRun,
            $force,
            $overrideTo !== null,
            $overrideTo
        );

        if ($overrideTo !== null) {
            $summary['redirected_to'] = $overrideTo;
        }

        Response::success($summary, 'Faculty daily schedule email job completed.');
    }
}
