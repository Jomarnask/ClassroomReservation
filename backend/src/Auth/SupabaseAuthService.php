<?php

namespace App\Auth;

use App\Config;
use App\Http\ApiException;

class SupabaseAuthService
{
    /**
     * Verify the Bearer token with Supabase Auth endpoint GET /auth/v1/user
     */
    public function verifyToken(string $token): ?AuthenticatedUser
    {
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
            CURLOPT_TIMEOUT => 10,
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
}
