<?php

namespace App\Auth;

class AuthenticatedUser
{
    private string $id;
    private string $email;
    private string $role;
    private array $claims;
    private array $rawMetadata;

    public function __construct(string $id, string $email, string $role = 'authenticated', array $claims = [], array $rawMetadata = [])
    {
        $this->id = $id;
        $this->email = $email;
        $this->role = $role;
        $this->claims = $claims;
        $this->rawMetadata = $rawMetadata;
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getRole(): string
    {
        return $this->role;
    }

    public function getClaims(): array
    {
        return $this->claims;
    }

    public function getRawMetadata(): array
    {
        return $this->rawMetadata;
    }
}
