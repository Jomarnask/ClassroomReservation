<?php

namespace App\Auth;

use App\Config;
use App\Http\ApiException;

class SupabaseAuthService
{
    /**
     * Verify the Bearer token with Supabase Auth endpoint GET /auth/v1/user.
     *
     * A token that Supabase has just confirmed is remembered for a short time
     * (AUTH_CACHE_TTL seconds, never longer than the token's own expiry), so a page
     * that makes several API calls does not wait for Supabase on every one of them.
     */
    public function verifyToken(string $token): ?AuthenticatedUser
    {
        $cached = $this->readCache($token);

        if ($cached !== null) {
            return $cached;
        }

        $supabaseUrl = Config::get('supabase_url');
        $publishableKey = Config::get('supabase_publishable_key');

        if (empty($supabaseUrl) || empty($publishableKey)) {
            throw new ApiException('Supabase configuration is missing on the server.', 500);
        }

        $endpoint = rtrim($supabaseUrl, '/') . '/auth/v1/user';

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $endpoint,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            // Skip IPv6 attempts, which can add seconds of delay on some Windows networks.
            CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $token,
                'apikey: ' . $publishableKey,
                'Content-Type: application/json',
            ],
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            error_log('[SupabaseAuthService] cURL Error: ' . $curlError);
            throw new ApiException('Authentication service temporarily unreachable.', 503);
        }

        if ($httpCode !== 200 || empty($response)) {
            return null;
        }

        $userData = json_decode($response, true);
        if (!is_array($userData) || empty($userData['id'])) {
            return null;
        }

        $userId = $userData['id'];
        $email = $userData['email'] ?? '';
        $role = $userData['role'] ?? 'authenticated';
        $appMetadata = $userData['app_metadata'] ?? [];
        $userMetadata = $userData['user_metadata'] ?? [];

        $user = $this->buildUser($userId, $email, $role, $appMetadata, $userMetadata);

        $this->writeCache($token, $userId, $email, $role, $appMetadata, $userMetadata);

        return $user;
    }

    private function buildUser(
        string $userId,
        string $email,
        string $role,
        array $appMetadata,
        array $userMetadata
    ): AuthenticatedUser {
        // Build standard claims representation
        $claims = [
            'sub' => $userId,
            'email' => $email,
            'role' => $role,
            'app_metadata' => $appMetadata,
            'user_metadata' => $userMetadata,
        ];

        return new AuthenticatedUser($userId, $email, $role, $claims, $userMetadata);
    }

    // ------------------------------------------------------------------
    // Short-lived cache of verified tokens
    // ------------------------------------------------------------------

    private function cacheFile(string $token): string
    {
        // Only a hash of the token is used in the file name; the token itself is never stored.
        return sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pupcrs_auth_' . hash('sha256', $token) . '.json';
    }

    private function readCache(string $token): ?AuthenticatedUser
    {
        if ((int) Config::get('auth_cache_ttl', 60) <= 0) {
            return null;
        }

        $file = $this->cacheFile($token);

        if (!is_file($file)) {
            return null;
        }

        $data = json_decode((string) @file_get_contents($file), true);

        if (!is_array($data) || (int) ($data['expires'] ?? 0) < time() || empty($data['user_id'])) {
            @unlink($file);

            return null;
        }

        return $this->buildUser(
            (string) $data['user_id'],
            (string) ($data['email'] ?? ''),
            (string) ($data['role'] ?? 'authenticated'),
            (array) ($data['app_metadata'] ?? []),
            (array) ($data['user_metadata'] ?? [])
        );
    }

    private function writeCache(
        string $token,
        string $userId,
        string $email,
        string $role,
        array $appMetadata,
        array $userMetadata
    ): void {
        $ttl = (int) Config::get('auth_cache_ttl', 60);

        // Never remember a token past its own expiry.
        $tokenExpiry = $this->tokenExpiry($token);

        if ($tokenExpiry !== null) {
            $ttl = min($ttl, $tokenExpiry - time() - 5);
        }

        if ($ttl <= 0) {
            return;
        }

        $payload = json_encode([
            'expires' => time() + $ttl,
            'user_id' => $userId,
            'email' => $email,
            'role' => $role,
            'app_metadata' => $appMetadata,
            'user_metadata' => $userMetadata,
        ]);

        $file = $this->cacheFile($token);
        $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';

        if (@file_put_contents($tmp, $payload, LOCK_EX) !== false) {
            if (!@rename($tmp, $file)) {
                @unlink($tmp);
            }
        }

        // Occasionally remove old cache files so the temp folder does not fill up.
        if (random_int(1, 50) === 1) {
            foreach ((array) glob(sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pupcrs_auth_*.json') as $old) {
                if (@filemtime($old) < time() - 600) {
                    @unlink($old);
                }
            }
        }
    }

    /** Reads the "exp" claim of a JWT. The token was already verified by Supabase before this is used. */
    private function tokenExpiry(string $token): ?int
    {
        $parts = explode('.', $token);

        if (count($parts) !== 3) {
            return null;
        }

        $payload = json_decode((string) base64_decode(strtr($parts[1], '-_', '+/')), true);

        return is_array($payload) && isset($payload['exp']) ? (int) $payload['exp'] : null;
    }
}