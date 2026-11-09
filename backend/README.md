# PUP-CRS Backend API

PHP REST API for the PUP Canlalay Campus Classroom & Facility Reservation System. It is plain PHP (no framework) that talks to Supabase PostgreSQL through PDO and verifies users with Supabase Auth.

## How a request is handled

```text
public/index.php  (routes)
  -> Router  ->  AuthMiddleware (verifies the Supabase access token)
  -> Controller (reads and validates the HTTP input)
  -> Service    (business rules, role checks, error translation)
  -> Repository (SQL)
  -> Database::runInUserContext()
```

`runInUserContext()` opens a transaction, sets the user's JWT claims as transaction-local settings and switches to the `authenticated` role. Every query then runs under Supabase **Row Level Security** with the caller's identity. Admin-only endpoints also check the caller's role and status in the service layer.

### Response format

```json
{ "success": true,  "message": "Rooms retrieved successfully.", "data": [ ... ] }
{ "success": false, "message": "Administrator access required.", "errors": [] }
```

| Status | Meaning |
|---|---|
| 200 / 201 | Success / created |
| 401 | Missing, invalid or expired access token |
| 403 | Wrong role, or the account is not active |
| 404 | Not found (or hidden from you by RLS) |
| 409 | Conflict with the current state (overlap, already decided, invalid status change) |
| 422 | Invalid input |
| 500 / 503 | Server error / Supabase Auth unreachable |

---

## Requirements

- PHP **8.1 or newer** with the `pdo`, `pdo_pgsql`, `curl` and `json` extensions
- Composer
- A Supabase project (Auth + PostgreSQL)

### Windows (XAMPP) note

`pdo_pgsql` and `curl` are often disabled by default.

1. Run `php --ini` and open the file shown as "Loaded Configuration File" (for example `C:\xampp\php\php.ini`).
2. Remove the leading `;` from `extension=pdo_pgsql`, `extension=pgsql` and `extension=curl`.
3. Check with `php -m | findstr /i "pgsql curl"`.
4. Stop any old server (`taskkill /F /IM php.exe`) and start it again. A running server does not pick up `php.ini` changes.

If token checks fail with "Authentication service temporarily unreachable", PHP may be missing a certificate bundle: download `cacert.pem` from curl.se and set `curl.cainfo` in `php.ini`.

---

## Local setup

```bash
cd backend
composer install
copy .env.example .env          # macOS/Linux: cp .env.example .env
```

1. Run the database scripts (see [Database setup](#database-setup)).
2. Fill in `.env` (see [Environment variables](#environment-variables)).
3. Start the server:

```bash
php -S 127.0.0.1:8000 -t public public/index.php
```

`composer start` does the same but listens on all network interfaces (`0.0.0.0:8000`). Prefer the command above for local work.

4. Open <http://localhost:8000/api/health>. You should see `"success": true`.

PHP's built-in server handles one request at a time, so parallel requests from the browser queue up locally. This is not a problem on Render.

---

## Environment variables

Set these in `backend/.env` locally and in the Render dashboard in production.

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `production` | Environment name. `.env.example` uses `local`. |
| `APP_DEBUG` | `false` | `true` adds error details to 500 responses. Never enable it in production. |
| `APP_TIMEZONE` | `Asia/Manila` | Used for date checks such as "no reservations in the past". |
| `FRONTEND_URL` | `http://127.0.0.1:5500` | Frontend origin. |
| `CORS_ALLOWED_ORIGINS` | `http://127.0.0.1:5500,http://localhost:5500` | Comma-separated list of exact origins (scheme, host and port, no trailing slash). `127.0.0.1` and `localhost` are different origins. In production, add your Vercel URL. |
| `SUPABASE_URL` | none | `https://<project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | none | Used to verify access tokens with Supabase Auth. |
| `DB_HOST` | none | Use the **Session Pooler** host (`...pooler.supabase.com`), which also works from Render. |
| `DB_PORT` | `5432` | Session pooler port. |
| `DB_NAME` | `postgres` | Database name. |
| `DB_USER` | none | With the pooler, `postgres.<project-ref>` or your restricted login (see `setup_backend_role.sql`). It must be allowed to `SET ROLE authenticated`. |
| `DB_PASSWORD` | none | Database password. Keep it out of Git. |
| `DB_SSLMODE` | `require` | PostgreSQL SSL mode. |
| `DB_PERSISTENT` | `true` | Reuse the database connection between requests. Set `false` to turn off. Not listed in `.env.example`. |
| `AUTH_CACHE_TTL` | `60` | Seconds a verified token is remembered (never longer than the token's own expiry). Set `0` to turn off. Not listed in `.env.example`. |

---

## Database setup

Run these in the Supabase **SQL Editor**, in this order:

| # | Script | Purpose |
|---|---|---|
| 1 | `database/schema.sql` | Creates the enums, tables (`users`, `rooms`, `room_reservations`, `room_schedules`, `audit_logs`), triggers, functions, RLS policies and seed rooms. A database constraint stops two **approved** reservations from overlapping in the same room. |
| 2 | `database/create_initial_admin.sql` | Creates the first administrator (`admin@pup.edu.ph` by default). **Change the default password** before or right after running it. |
| 3 | `database/faculty_schedule.sql` | Adds the database function used by `GET /api/faculty/schedule`. Run it once, or that endpoint fails. |
| 4 | `database/setup_backend_role.sql` | Optional. Creates a restricted login (`crs_backend_user`) for the API instead of a powerful database user. Recommended for production. |

Notes:

- A database trigger creates a `users` profile row when someone signs up, with status `pending`. Roles are `student`, `faculty`, `admin`; account statuses are `pending`, `active`, `rejected`, `inactive`; reservation statuses are `pending`, `approved`, `rejected`, `cancelled`.
- Approving and declining go through the database functions `decide_reservation()` and `cancel_reservation()`. Approving a reservation automatically declines competing pending requests for the same time.
- The dashboard's direct admin booking calls a function named `admin_create_reservation()`, which is **not** defined in any script here yet.
- The `audit_logs` table exists but nothing writes to it yet.

---

## API reference

Every endpoint except `/api/health` needs `Authorization: Bearer <Supabase access token>`.

### Foundation

| Method and path | Access | Description |
|---|---|---|
| `GET /api/health` | public | Service status. |
| `GET /api/me` | any signed-in user | The caller's profile, read under RLS. |
| `GET /api/admin/check` | active admin | Confirms the caller is an active administrator. |

### Rooms

| Method and path | Access | Description |
|---|---|---|
| `GET /api/rooms` | any active user | List rooms. Optional query: `active_only=true`, `search`, `room_type`, `floor`. |
| `GET /api/rooms/{id}` | any active user | One room. |
| `POST /api/rooms` | admin | Create a room. Fields: `room_number` (required), `room_name`, `floor`, `room_type`, `is_active`. |
| `PATCH /api/rooms/{id}` | admin | Update any of those fields. |
| `GET /api/rooms/{id}/taken-slots?from=YYYY-MM-DD&to=YYYY-MM-DD` | any active user | Pending and approved time slots of a room (anonymous), range up to 92 days. |

There is no delete endpoint on purpose. Deactivate a room with `is_active: false` instead, so existing reservations stay intact.

### Reservations

| Method and path | Access | Description |
|---|---|---|
| `GET /api/reservations` | any active user | Admins see all, students their own, faculty the ones that tag them. Optional query: `status`, `room_id`, `date_from`, `date_to`, `mine=true`, `limit` (1 to 500, default 200). Newest first. |
| `GET /api/reservations/{id}` | any active user | One reservation (404 if you cannot see it). |
| `POST /api/reservations` | active student | Create a pending request. Body: `room_id`, `faculty_id`, `subject`, `reservation_date` (`YYYY-MM-DD`), `start_time`, `end_time` (`HH:MM`). |
| `PATCH /api/reservations/{id}/decision` | admin | Body: `{ "approve": true }` or `{ "approve": false, "reason": "..." }`. Returns the reservation and the database result. |
| `PATCH /api/reservations/{id}/cancel` | owner or admin | Cancels a pending or approved reservation. |

Each reservation includes the room number and name, the student's name, webmail, student number, course, year and section, the faculty name, the admin who responded, the subject, date, times, status, remarks and timestamps.

**Booking rules** enforced on create:

- Only an active student can book, and the room must exist and be active.
- `faculty_id` must be an active faculty member.
- The date cannot be in the past, times must be between 07:00 and 21:00, and the start must be before the end. For today, the start must be later than the current time.
- It cannot overlap a weekly class schedule (`room_schedules`), an approved reservation, or your own pending request. Other students' pending requests are allowed.

### Users (admin only)

| Method and path | Description |
|---|---|
| `GET /api/users` | List accounts. Optional query: `status`, `role`, `limit` (1 to 1000, default 500). |
| `PATCH /api/users/{userId}/status` | Body: `{ "status": "active" \| "rejected" \| "inactive" }`. |

Allowed changes: pending to active or rejected, active to inactive, rejected or inactive to active. You cannot change your own account.

### Faculty

| Method and path | Access | Description |
|---|---|---|
| `GET /api/faculty/schedule` | active faculty | Returns `classes` (the faculty's own weekly class schedules) and `reservations` (student requests that tag them). |

---

## Testing

**REST Client requests.** `rooms-api.http` and `reservations-api.http` in the repository root work with the VS Code *REST Client* extension.

1. Sign in on the frontend, then run this in the browser DevTools console to copy the token:
   ```js
   (await supabaseClient.auth.getSession()).data.session.access_token
   ```
2. Paste it after `@token = ` with **no quotes** and no line breaks.
3. Tokens last one hour. Use an admin token for admin endpoints and a student token to create reservations.
4. Do not commit a file that contains a real token.

**Automated checks.**

```bash
php tests/verify_foundation.php      # foundation check script
vendor/bin/phpunit tests             # PHPUnit (currently RouterTest only)
```

---

## Performance notes

Each request verifies the token with Supabase and opens a database transaction. To keep that fast, the API reuses the database connection between requests (`DB_PERSISTENT`), remembers a verified token for 60 seconds (`AUTH_CACHE_TTL`), sets the user context in one query, binds parameters on the client side (one round trip per query), and resolves Supabase over IPv4 only. A revoked or signed-out token can still be accepted for up to the cache time. Roles and account status are still read from the database on every request.

---

## Deployment (Render)

1. Create a **Web Service** from this repository: Runtime **Docker**, Root Directory `backend`, Dockerfile Path `./Dockerfile`.
2. Set the environment variables from the table above. Use `APP_ENV=production`, `APP_DEBUG=false`, the Supabase **Session Pooler** host with port `5432`, and `CORS_ALLOWED_ORIGINS` set to your Vercel URL (for example `https://your-app.vercel.app`, no trailing slash).
3. Set the health check path to `/api/health`.
4. In the frontend, set `API_BASE_URL` to the Render service URL (see `frontend/README.md`).

Render's free tier puts services to sleep when idle, so the first request after a pause can take 30 to 60 seconds.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `Database connection failed: could not find driver` | `pdo_pgsql` is not enabled. See the Windows note, then restart the server. |
| `401 Invalid or expired authentication token` | The token expired (one hour), or it was pasted with quotes in the `.http` file. Get a fresh one. |
| `403 Your account is inactive` | The user's `account_status` is not `active`. Approve it in User Approvals, or update `public.users`. |
| `500 permission denied for table ...` | The `authenticated` role lacks privileges on that table in your project. Grant `SELECT` or `INSERT, UPDATE` to `authenticated`. |
| `503 Authentication service temporarily unreachable` | PHP cannot reach or verify Supabase. Check the network and `curl.cainfo`. |
| Browser CORS error | The page's origin is not in `CORS_ALLOWED_ORIGINS`. Restart the server after editing `.env`. |
| Page says "Cannot reach the server" | The API is not running on the URL in `API_BASE_URL`. |
| Everything is slow locally | PHP's built-in server is single-threaded, and the first request after a restart has to open the database connection. |

---

## Remaining work

- Schedules API (`GET/POST/DELETE /api/schedules`) and moving the Schedule Manager page onto it
- Direct admin booking: the `admin_create_reservation` SQL function and an API endpoint
- `GET /api/faculty` (active faculty directory) and an endpoint for users to edit their own profile
- Audit log endpoints (`GET /api/logs`) and writing to `audit_logs`
- More PHPUnit tests (booking rules, role checks, token handling), CI, and rate limiting