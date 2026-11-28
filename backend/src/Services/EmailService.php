<?php

namespace App\Services;

use App\Config;
use Throwable;

/**
 * Sends the system's emails through Brevo's HTTPS API.
 *
 * Why HTTPS and not SMTP: Render's free plan blocks the SMTP ports, but normal
 * HTTPS requests always work (locally and on Render).
 *
 * This class NEVER throws. If an email cannot be sent it writes a line to the
 * error log and returns false, so a mail problem can never break an approval.
 */
class EmailService
{
    private const API_URL = 'https://api.brevo.com/v3/smtp/email';

    /** @var callable|null  fn(array $payload): array{status:int, body:string} (used by tests) */
    private $transport;

    private array $settings;

    /**
     * @param callable|null $transport Replaces the real HTTPS call (tests only).
     * @param array|null    $settings  Replaces the .env values (tests only).
     */
    public function __construct(?callable $transport = null, ?array $settings = null)
    {
        $this->transport = $transport;
        $this->settings = $settings ?? [
            'enabled' => (bool) Config::get('mail_enabled', false),
            'api_key' => (string) Config::get('mail_api_key', ''),
            'from_email' => (string) Config::get('mail_from_email', ''),
            'from_name' => (string) Config::get('mail_from_name', 'PUP CRS'),
            'frontend_url' => (string) Config::get('frontend_url', ''),
        ];
    }

    /** Tells a registered user that their account was approved. */
    public function sendAccountApproved(array $user): bool
    {
        $name = $this->cleanName($user['full_name'] ?? '');
        $loginUrl = $this->loginUrl();
        $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        $safeUrl = htmlspecialchars($loginUrl, ENT_QUOTES, 'UTF-8');

        $text = "Hello {$name},\n\n"
            . "Good news! Your account for the PUP Canlalay Campus - CRS has been approved. "
            . "You can now log in and access the website:\n{$loginUrl}\n\n"
            . "Thank you,\nPUP Canlalay Campus - CRS";

        $body = '<p>Hello <strong>' . $safeName . '</strong>,</p>'
            . '<p>Good news! Your account for the PUP Canlalay Campus - CRS has been <strong>approved</strong>. '
            . 'You can now log in and access the website.</p>'
            . '<p><a href="' . $safeUrl . '" style="display:inline-block;background:#800000;color:#ffffff;'
            . 'padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Log in</a></p>'
            . '<p style="color:#666666;font-size:13px;">If the button does not work, copy this link into your browser:<br>'
            . $safeUrl . '</p>';

        return $this->send(
            (string) ($user['pup_webmail'] ?? ''),
            $name,
            'Your PUP CRS account has been approved',
            $this->wrap('Account approved', $body),
            $text
        );
    }

    /** Tells a registered user that their account was not approved. */
    public function sendAccountRejected(array $user): bool
    {
        $name = $this->cleanName($user['full_name'] ?? '');
        $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');

        $text = "Hello {$name},\n\n"
            . "We're sorry, but your account registration for the PUP Canlalay Campus - CRS was not approved.\n"
            . "If you think this was a mistake, please contact the campus administrator.\n\n"
            . "Thank you,\nPUP Canlalay Campus - CRS";

        $body = '<p>Hello <strong>' . $safeName . '</strong>,</p>'
            . '<p>We\'re sorry, but your account registration for the PUP Canlalay Campus - CRS '
            . 'was <strong>not approved</strong>.</p>'
            . '<p>If you think this was a mistake, please contact the campus administrator.</p>';

        return $this->send(
            (string) ($user['pup_webmail'] ?? ''),
            $name,
            'Update on your PUP CRS registration',
            $this->wrap('Registration not approved', $body),
            $text
        );
    }

    /**
     * Sends a faculty member's daily schedule digest for a given date.
     * Returns false without sending if both lists are empty.
     *
     * @param array<string, mixed>       $faculty
     * @param string                     $date                YYYY-MM-DD
     * @param array<int, array<string, mixed>> $reservedClasses
     * @param array<int, array<string, mixed>> $unreservedSchedules
     */
    public function sendFacultyDailySchedule(
        array $faculty,
        string $date,
        array $reservedClasses,
        array $unreservedSchedules,
        ?string $overrideTo = null
    ): bool {
        if (empty($reservedClasses) && empty($unreservedSchedules)) {
            return false;
        }

        $name = $this->cleanName($faculty['full_name'] ?? 'Faculty');
        $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
        $formattedDate = $this->formatDateLabel($date);
        $safeDate = htmlspecialchars($formattedDate, ENT_QUOTES, 'UTF-8');
        $scheduleUrl = $this->scheduleUrl();
        $safeUrl = htmlspecialchars($scheduleUrl, ENT_QUOTES, 'UTF-8');

        $htmlParts = [
            '<p>Hello <strong>' . $safeName . '</strong>,</p>',
            '<p>Here is your class summary for <strong>' . $safeDate . '</strong> (ordered from earliest to latest):</p>',
        ];

        $textParts = [
            "Hello {$name},",
            '',
            "Here is your class summary for {$formattedDate} (ordered from earliest to latest):",
        ];

        if (!empty($reservedClasses)) {
            $htmlParts[] = $this->buildReservedClassesHtml($reservedClasses);
            $textParts[] = '';
            $textParts[] = '=== RESERVED CLASSES FOR TODAY ===';
            foreach ($reservedClasses as $row) {
                $time = $this->formatTimeRange($row['start_time'] ?? '', $row['end_time'] ?? '');
                $room = $this->formatRoomLabel($row);
                $section = $this->formatProgramSection($row);
                $subject = trim((string) ($row['subject'] ?? '—'));
                $status = strtoupper((string) ($row['status'] ?? 'approved'));
                $textParts[] = "- {$time} | {$room} | {$section} | {$subject} [{$status}]";
            }
        }

        if (!empty($unreservedSchedules)) {
            $htmlParts[] = $this->buildUnreservedSchedulesHtml($unreservedSchedules);
            $textParts[] = '';
            $textParts[] = '=== CLASS SCHEDULES NOT YET RESERVED ===';
            foreach ($unreservedSchedules as $row) {
                $time = $this->formatTimeRange($row['start_time'] ?? '', $row['end_time'] ?? '');
                $room = $this->formatRoomLabel($row);
                $section = $this->formatProgramSection($row);
                $subject = $this->formatScheduleSubject($row);
                $textParts[] = "- {$time} | {$room} | {$section} | {$subject} [Not yet reserved]";
            }
        }

        $htmlParts[] = '<p style="margin-top:20px;"><a href="' . $safeUrl . '" style="display:inline-block;background:#800000;color:#ffffff;'
            . 'padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Open My Schedule</a></p>';

        $textParts[] = '';
        $textParts[] = "View your schedule online: {$scheduleUrl}";
        $textParts[] = '';
        $textParts[] = "Thank you,\nPUP Canlalay Campus - CRS";

        $originalEmail = (string) ($faculty['pup_webmail'] ?? '');
        $overrideTo = $overrideTo !== null ? trim($overrideTo) : '';
        $recipientEmail = $overrideTo !== '' ? $overrideTo : $originalEmail;
        $subject = "Your Daily Class Schedule - {$formattedDate}";
        if ($overrideTo !== '') {
            $subject = "[TEST for {$originalEmail}] " . $subject;
        }

        return $this->send(
            $recipientEmail,
            $name,
            $subject,
            $this->wrap('Daily Class Schedule', implode("\n", $htmlParts)),
            implode("\n", $textParts)
        );
    }

    /** Tells a student that their room reservation request was approved. */
    public function sendReservationApproved(array $reservation): bool
    {
        return $this->sendReservationEmail(
            $reservation,
            'Your room reservation has been approved',
            'Reservation approved',
            'Good news! Your room reservation request has been approved.',
            ['Please claim the physical key from the guard.'],
            'View My Reservations',
            'my-reservations.html'
        );
    }

    /** Tells a student that their room reservation request was declined (with the admin's reason). */
    public function sendReservationDeclined(array $reservation): bool
    {
        $notes = [];
        $reason = $this->cleanName($reservation['admin_remarks'] ?? '');

        // "Declined by Administrator" is only the system's default text, not a real reason.
        if ($reason !== '' && strcasecmp($reason, 'Declined by Administrator') !== 0) {
            $notes[] = 'Reason: ' . $reason;
        }

        $notes[] = 'You are welcome to submit a new request for another time or room.';

        return $this->sendReservationEmail(
            $reservation,
            'Your room reservation was declined',
            'Reservation declined',
            "We're sorry, but your room reservation request was declined.",
            $notes,
            'Browse Rooms',
            'browse-rooms.html'
        );
    }

    /**
     * Tells a student that their reservation was cancelled by an administrator or the system.
     * Pass $reason for system cancellations; without it the email says an administrator did it.
     */
    public function sendReservationCancelled(array $reservation, ?string $reason = null): bool
    {
        $reason = $reason !== null ? $this->cleanName($reason) : '';

        return $this->sendReservationEmail(
            $reservation,
            'Your room reservation was cancelled',
            'Reservation cancelled',
            $reason !== ''
                ? 'Your room reservation was cancelled.'
                : 'Your room reservation was cancelled by an administrator.',
            $reason !== '' ? ['Reason: ' . $reason] : [],
            'View My Reservations',
            'my-reservations.html'
        );
    }

    /**
     * Emails the student about a reservation the SYSTEM changed for them
     * (not the admin's own click): an auto-cancel, an override by an admin
     * booking, or a competing request that was auto-rejected.
     *
     * @param array<string, mixed> $row needs status and admin_remarks plus the usual reservation fields
     */
    public function sendReservationSystemChange(array $row): bool
    {
        $status = (string) ($row['status'] ?? '');
        $remarks = $this->cleanName($row['admin_remarks'] ?? '');

        if ($status === 'cancelled') {
            // "Automatically cancelled: no admin decision was made ..." -> keep only the reason part.
            $reason = preg_match('/^Automatically cancelled:\s*(.+)$/i', $remarks, $m) ? $m[1] : $remarks;
            $reason = trim($reason) !== '' ? ucfirst(trim($reason)) : 'No admin decision was made in time.';

            return $this->sendReservationCancelled($row, $reason);
        }

        if ($status === 'rejected') {
            // An admin booking took over an already approved reservation.
            if (stripos($remarks, 'Overridden by Administrator booking') === 0) {
                return $this->sendReservationCancelled(
                    $row,
                    'An administrator booking replaced your reserved time slot.'
                );
            }

            // "Auto-rejected: Slot booked by another ..." -> keep only the reason part.
            if (preg_match('/^Auto-rejected:\s*(.+)$/i', $remarks, $m)) {
                $row['admin_remarks'] = trim($m[1]);
            }

            return $this->sendReservationDeclined($row);
        }

        return false;
    }

    /**
     * Shared layout of the three reservation emails: greeting, one sentence,
     * the reservation details, optional notes and one button.
     *
     * @param array<int, string> $notes
     */
    private function sendReservationEmail(
        array $reservation,
        string $subject,
        string $title,
        string $intro,
        array $notes,
        string $buttonLabel,
        string $page
    ): bool {
        $name = $this->cleanName($reservation['student_name'] ?? '');
        $greetingName = $name !== '' ? $name : 'Student';
        $url = $this->pageUrl($page);
        $details = $this->reservationDetails($reservation);

        $rowsHtml = '';
        $detailsText = [];

        foreach ($details as $label => $value) {
            $rowsHtml .= '<tr><td style="padding:6px 16px 6px 0;color:#666666;">'
                . htmlspecialchars($label, ENT_QUOTES, 'UTF-8') . '</td>'
                . '<td style="padding:6px 0;font-weight:bold;">'
                . htmlspecialchars($value, ENT_QUOTES, 'UTF-8') . '</td></tr>';
            $detailsText[] = $label . ': ' . $value;
        }

        $htmlParts = [
            '<p>Hello <strong>' . htmlspecialchars($greetingName, ENT_QUOTES, 'UTF-8') . '</strong>,</p>',
            '<p>' . htmlspecialchars($intro, ENT_QUOTES, 'UTF-8') . '</p>',
            '<table style="border-collapse:collapse;margin:12px 0;">' . $rowsHtml . '</table>',
        ];

        $textParts = ["Hello {$greetingName},", '', $intro, '', ...$detailsText];

        foreach ($notes as $note) {
            $htmlParts[] = '<p>' . htmlspecialchars($note, ENT_QUOTES, 'UTF-8') . '</p>';
            $textParts[] = '';
            $textParts[] = $note;
        }

        $htmlParts[] = '<p style="margin-top:20px;"><a href="' . htmlspecialchars($url, ENT_QUOTES, 'UTF-8')
            . '" style="display:inline-block;background:#800000;color:#ffffff;padding:10px 20px;'
            . 'border-radius:6px;text-decoration:none;font-weight:bold;">'
            . htmlspecialchars($buttonLabel, ENT_QUOTES, 'UTF-8') . '</a></p>';

        $textParts[] = '';
        $textParts[] = "{$buttonLabel}: {$url}";
        $textParts[] = '';
        $textParts[] = "Thank you,\nPUP Canlalay Campus - CRS";

        return $this->send(
            (string) ($reservation['student_webmail'] ?? ''),
            $name,
            $subject,
            $this->wrap($title, implode('', $htmlParts)),
            implode("\n", $textParts)
        );
    }

    /** @return array<string, string> label => value */
    private function reservationDetails(array $reservation): array
    {
        $subject = trim((string) ($reservation['subject'] ?? ''));

        return [
            'Room' => $this->formatRoomLabel($reservation),
            'Date' => $this->formatDateLabel((string) ($reservation['reservation_date'] ?? '')),
            'Time' => $this->formatTimeRange($reservation['start_time'] ?? '', $reservation['end_time'] ?? ''),
            'Subject' => $subject !== '' ? $subject : '—',
        ];
    }

    private function pageUrl(string $page): string
    {
        return rtrim((string) $this->settings['frontend_url'], '/') . '/' . $page;
    }

    private function send(string $toEmail, string $toName, string $subject, string $html, string $text): bool
    {
        if (empty($this->settings['enabled'])) {
            error_log('[Email] Skipped (MAIL_ENABLED is not true): ' . $subject);

            return false;
        }

        if ($this->settings['api_key'] === '' || $this->settings['from_email'] === '') {
            error_log('[Email] Not sent: MAIL_API_KEY or MAIL_FROM_EMAIL is empty.');

            return false;
        }

        if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            error_log('[Email] Not sent: the user has no valid email address.');

            return false;
        }

        $recipient = ['email' => $toEmail];

        if ($toName !== '') {
            $recipient['name'] = $toName;
        }

        $payload = [
            'sender' => ['name' => $this->settings['from_name'], 'email' => $this->settings['from_email']],
            'to' => [$recipient],
            'subject' => $subject,
            'htmlContent' => $html,
            'textContent' => $text,
        ];

        try {
            $result = $this->transport
                ? ($this->transport)($payload)
                : $this->post($payload);
        } catch (Throwable $e) {
            error_log('[Email] Sending failed: ' . $e->getMessage());

            return false;
        }

        $status = (int) ($result['status'] ?? 0);

        if ($status >= 200 && $status < 300) {
            return true;
        }

        error_log('[Email] The mail service rejected the message (HTTP ' . $status . '): ' . (string) ($result['body'] ?? ''));

        return false;
    }

    /** The real HTTPS call to Brevo. */
    private function post(array $payload): array
    {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => self::API_URL,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => [
                'accept: application/json',
                'content-type: application/json',
                'api-key: ' . $this->settings['api_key'],
            ],
        ]);

        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            throw new \RuntimeException('cURL error: ' . $error);
        }

        return ['status' => $status, 'body' => (string) $body];
    }

    private function buildReservedClassesHtml(array $rows): string
    {
        $trs = [];
        foreach ($rows as $row) {
            $time = htmlspecialchars($this->formatTimeRange($row['start_time'] ?? '', $row['end_time'] ?? ''), ENT_QUOTES, 'UTF-8');
            $room = htmlspecialchars($this->formatRoomLabel($row), ENT_QUOTES, 'UTF-8');
            $section = htmlspecialchars($this->formatProgramSection($row), ENT_QUOTES, 'UTF-8');
            $subject = htmlspecialchars(trim((string) ($row['subject'] ?? '—')), ENT_QUOTES, 'UTF-8');
            $status = strtolower((string) ($row['status'] ?? 'approved'));
            $badge = $status === 'pending'
                ? '<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#FEF3C7;color:#92400E;font-size:12px;font-weight:bold;">Pending</span>'
                : '<span style="display:inline-block;padding:2px 8px;border-radius:12px;background:#ECFDF5;color:#065F46;font-size:12px;font-weight:bold;">Approved</span>';

            $trs[] = '<tr>'
                . '<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">' . $time . '</td>'
                . '<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">' . $room . '</td>'
                . '<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">' . $section . '</td>'
                . '<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">' . $subject . '</td>'
                . '<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">' . $badge . '</td>'
                . '</tr>';
        }

        return $this->buildScheduleTableHtml(
            'Reserved Classes for Today',
            'Confirmed and pending room reservations tagging you for today.',
            ['Time', 'Room', 'Program / Section', 'Subject', 'Status'],
            $trs
        );
    }

    private function buildUnreservedSchedulesHtml(array $rows): string
    {
        $trs = [];
        foreach ($rows as $row) {
            $time = htmlspecialchars($this->formatTimeRange($row['start_time'] ?? '', $row['end_time'] ?? ''), ENT_QUOTES, 'UTF-8');
            $room = htmlspecialchars($this->formatRoomLabel($row), ENT_QUOTES, 'UTF-8');
            $section = htmlspecialchars($this->formatProgramSection($row), ENT_QUOTES, 'UTF-8');
            $subject = htmlspecialchars($this->formatScheduleSubject($row), ENT_QUOTES, 'UTF-8');

            $trs[] = '<tr>'
                . '<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">' . $time . '</td>'
                . '<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">' . $room . '</td>'
                . '<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">' . $section . '</td>'
                . '<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">' . $subject . '</td>'
                . '</tr>';
        }

        return $this->buildScheduleTableHtml(
            'Class Schedules Not Yet Reserved',
            'Your regular weekly classes today that do not have a room reservation yet.',
            ['Time', 'Room', 'Program / Section', 'Subject'],
            $trs
        );
    }

    /**
     * @param string[] $headers
     * @param string[] $rowsHtml
     */
    private function buildScheduleTableHtml(string $heading, string $subtitle, array $headers, array $rowsHtml): string
    {
        $ths = implode('', array_map(
            fn (string $h) => '<th style="text-align:left;padding:8px 10px;background:#800000;color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:0.03em;">'
                . htmlspecialchars($h, ENT_QUOTES, 'UTF-8') . '</th>',
            $headers
        ));

        return '<div style="margin-top:18px;">'
            . '<h3 style="margin:0 0 4px 0;color:#800000;font-size:16px;">' . htmlspecialchars($heading, ENT_QUOTES, 'UTF-8') . '</h3>'
            . '<p style="margin:0 0 10px 0;color:#4b5563;font-size:13px;">' . htmlspecialchars($subtitle, ENT_QUOTES, 'UTF-8') . '</p>'
            . '<table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;">'
            . '<thead><tr>' . $ths . '</tr></thead>'
            . '<tbody>' . implode('', $rowsHtml) . '</tbody>'
            . '</table></div>';
    }

    private function formatDateLabel(string $date): string
    {
        $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $date);

        return $dt ? $dt->format('l, F j, Y') : $date;
    }

    private function formatTimeRange(mixed $start, mixed $end): string
    {
        return $this->formatSingleTime((string) $start) . ' - ' . $this->formatSingleTime((string) $end);
    }

    private function formatSingleTime(string $time): string
    {
        $time = trim($time);
        foreach (['H:i:s', 'H:i'] as $fmt) {
            $dt = \DateTimeImmutable::createFromFormat($fmt, $time);
            if ($dt) {
                return $dt->format('g:i A');
            }
        }

        return $time !== '' ? $time : '—';
    }

    private function formatRoomLabel(array $row): string
    {
        $number = trim((string) ($row['room_number'] ?? ''));
        $name = trim((string) ($row['room_name'] ?? ''));

        if ($number !== '' && $name !== '' && strcasecmp($number, $name) !== 0) {
            return $number . ' — ' . $name;
        }

        return $name !== '' ? $name : ($number !== '' ? $number : '—');
    }

    private function formatProgramSection(array $row): string
    {
        $program = trim((string) ($row['program_course'] ?? ''));
        if ($program !== '' && preg_match('/\(([^)]+)\)\s*$/', $program, $m)) {
            $program = trim($m[1]);
        }

        $year = $row['year_level'] ?? null;
        $section = $row['section'] ?? null;

        if ($program !== '' && $year !== null && $section !== null) {
            return "{$program} {$year}-{$section}";
        }

        if ($program !== '') {
            return $program;
        }

        $fallback = trim((string) ($row['course_section'] ?? ''));

        return $fallback !== '' ? $fallback : '—';
    }

    private function formatScheduleSubject(array $row): string
    {
        $code = trim((string) ($row['subject_code'] ?? ''));
        $title = trim((string) ($row['subject_title'] ?? ''));

        if ($code !== '' && $title !== '') {
            return $code . ' — ' . $title;
        }

        return $title !== '' ? $title : ($code !== '' ? $code : '—');
    }

    private function loginUrl(): string
    {
        return rtrim((string) $this->settings['frontend_url'], '/') . '/login.html';
    }

    private function scheduleUrl(): string
    {
        return rtrim((string) $this->settings['frontend_url'], '/') . '/schedule.html';
    }

    /** Removes line breaks so a name can never inject extra email headers or lines. */
    private function cleanName(mixed $name): string
    {
        return trim(preg_replace('/[\r\n]+/', ' ', (string) $name));
    }

    private function wrap(string $title, string $content): string
    {
        return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">'
            . '<div style="max-width:680px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;">'
            . '<div style="background:#800000;color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold;">'
            . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</div>'
            . '<div style="padding:24px;color:#222222;font-size:15px;line-height:1.5;">' . $content . '</div>'
            . '<div style="padding:12px 24px;background:#fafafa;color:#888888;font-size:12px;">'
            . 'PUP Canlalay Campus - CRS - This is an automated message.</div>'
            . '</div></body></html>';
    }
}