# PUP-CRS PHP REST API Backend

This is the backend service for the PUP Canlalay Campus Classroom Reservation System (CRS), built with PHP and PDO connecting to Supabase PostgreSQL with user-scoped Row Level Security (RLS) preservation.

## Requirements

- PHP 8.1+ (with `pdo`, `pdo_pgsql`, `curl`, `json` extensions)
- Composer 2+
- Supabase project credentials

## Local Setup

1. **Install dependencies**:
   ```bash
   cd backend
   composer install
   ```

2. **Configure environment**:
   ```bash
   copy .env.example .env
   ```
   Fill in your Supabase connection parameters:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `DB_HOST`
   - `DB_USER`
   - `DB_PASSWORD`

3. **Start local development server**:
   ```bash
   composer start
   # or
   php -S 127.0.0.1:8000 -t public public/index.php
   ```

## Initial Foundation Endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Public | Confirms API service is running |
| `GET` | `/api/me` | Bearer Token Required | Returns current authenticated user profile under RLS |
| `GET` | `/api/admin/check` | Bearer Token Required | Validates active administrator privileges |

## Database Remake Scripts

The `backend/database/` directory contains:
- `schema.sql`: Full, end-to-end database recreation script (tables, constraints, triggers, RLS, functions, seed rooms).
- `setup_backend_role.sql`: Dedicated restricted backend database login and role-switching setup.

## Render Deployment

- **Root Directory**: `backend`
- **Runtime**: `Docker`
- **Dockerfile Path**: `Dockerfile`
- Configure environment variables in the Render Dashboard matching `.env.example`.
