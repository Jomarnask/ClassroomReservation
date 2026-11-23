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
            . "Good news! Your account for the PUP Campus Reservation System has been approved. "
            . "You can now log in and access the website:\n{$loginUrl}\n\n"
            . "Thank you,\nPUP Canlalay Campus - CCIS";

        $body = '<p>Hello <strong>' . $safeName . '</strong>,</p>'
            . '<p>Good news! Your account for the PUP Campus Reservation System has been <strong>approved</strong>. '
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
            . "We're sorry, but your account registration for the PUP Campus Reservation System was not approved.\n"
            . "If you think this was a mistake, please contact the campus administrator.\n\n"
            . "Thank you,\nPUP Canlalay Campus - CCIS";

        $body = '<p>Hello <strong>' . $safeName . '</strong>,</p>'
            . '<p>We\'re sorry, but your account registration for the PUP Campus Reservation System '
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

    private function loginUrl(): string
    {
        return rtrim((string) $this->settings['frontend_url'], '/') . '/login.html';
    }

    /** Removes line breaks so a name can never inject extra email headers or lines. */
    private function cleanName(mixed $name): string
    {
        return trim(preg_replace('/[\r\n]+/', ' ', (string) $name));
    }

    private function wrap(string $title, string $content): string
    {
        return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">'
            . '<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;">'
            . '<div style="background:#800000;color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold;">'
            . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</div>'
            . '<div style="padding:24px;color:#222222;font-size:15px;line-height:1.5;">' . $content . '</div>'
            . '<div style="padding:12px 24px;background:#fafafa;color:#888888;font-size:12px;">'
            . 'PUP Canlalay Campus - This is an automated message.</div>'
            . '</div></body></html>';
    }
}