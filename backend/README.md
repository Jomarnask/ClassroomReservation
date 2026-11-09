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

---

## TODO

> _Last updated: November 2026_

### API Endpoints to Implement

- [ ] **Rooms**
  - [ ] `GET /api/rooms` — List all rooms with floor grouping, search, and availability filter.
  - [ ] `GET /api/rooms/{id}/timetable` — 2-day timetable for a room with role-scoped reservation visibility.
- [ ] **Reservations**
  - [ ] `GET /api/reservations` — Fetch reservations filtered by the caller's role (student/faculty/admin).
  - [ ] `POST /api/reservations` — Create a new student reservation with overlap validation.
  - [ ] `POST /api/reservations/{id}/cancel` — Cancel own pending reservation (student).
  - [ ] `POST /api/reservations/{id}/approve` — Approve a reservation and auto-reject conflicting pending requests (admin).
  - [ ] `POST /api/reservations/{id}/reject` — Reject a reservation with an optional remarks field (admin).
  - [ ] `POST /api/admin/reservations` — Directly book/block a room as admin (auto-approved, cancels conflicts).
- [ ] **Schedules**
  - [ ] `GET /api/schedules` — Retrieve recurring weekly class schedules.
  - [ ] `POST /api/schedules` — Create a new recurring class schedule block.
  - [ ] `DELETE /api/schedules/{id}` — Delete an existing recurring schedule.
- [ ] **Users & Faculty**
  - [ ] `GET /api/users` — Admin-only list of all registered accounts for the approval queue.
  - [ ] `PATCH /api/users/{id}/status` — Update account status (`active`, `rejected`, `inactive`).
  - [ ] `PATCH /api/users/{id}/profile` — Allow users to update their own academic profile metadata.
  - [ ] `GET /api/faculty` — Public (authenticated) list of active faculty for reservation dropdowns.
- [ ] **Logs**
  - [ ] `GET /api/logs` — Paginated audit log retrieval for admin dashboard (`logs.html`).

### Testing

- [ ] **PHPUnit Test Suite**
  - [ ] Unit tests for reservation overlap detection and half-open time boundary edge cases.
  - [ ] Role-authorization tests ensuring RLS is enforced per endpoint.
  - [ ] JWT token validation and expiry handling tests.

### DevOps & CI

- [ ] **GitHub Actions Workflow**
  - [ ] Run `composer validate` and `composer install --no-dev` checks on PRs.
  - [ ] Execute PHPUnit test suite on every push to `main` and all pull requests.
  - [ ] Lint PHP code with PHP CS Fixer or PHP_CodeSniffer.
- [ ] **Health Monitoring** — Add uptime and latency monitoring for the Render-hosted API (e.g., UptimeRobot or BetterStack).

### Security Hardening

- [ ] **Rate Limiting** — Implement per-IP or per-user request throttling on write endpoints.
- [ ] **Input Sanitization Audit** — Review all controller inputs for injection vulnerabilities.
- [ ] **Token Refresh Handling** — Gracefully handle expired Supabase JWT tokens with a `401` response and a clear error body.
