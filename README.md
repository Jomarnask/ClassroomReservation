# PUP Canlalay Campus - Classroom & Facility Reservation System (PUP-CRS)

The Polytechnic University of the Philippines - Canlalay Campus Classroom Reservation System (CRS) lets students request classrooms and laboratories, lets faculty see the requests that tag them, and lets administrators approve requests and manage rooms and accounts.

It is a monorepo with three parts:

| Part | Technology | Hosting |
|---|---|---|
| `frontend/` | Static HTML, CSS and vanilla JavaScript | Vercel |
| `backend/` | PHP 8.1+ REST API (plain PHP, PDO) | Render (Docker) |
| Database and login | Supabase (PostgreSQL + Auth) | Supabase |

---

## How the pieces fit together

```text
Browser (frontend/)
   |-- login, sign-up, profile, dashboard ------------> Supabase Auth / Postgres (direct)
   |-- rooms, reservations, users, faculty schedule --> PHP API (backend/) --> Supabase Postgres
```

- The browser signs in with **Supabase Auth** and receives an access token (valid for 1 hour, refreshed automatically).
- Pages that have been moved to the API send that token in an `Authorization: Bearer ...` header through `frontend/assets/js/api.js`.
- The API verifies the token with Supabase, then runs every query inside a transaction with the user's JWT claims and the `authenticated` role. **Supabase Row Level Security (RLS) therefore still protects the data**, exactly as if the browser had queried it directly.
- Some pages still talk to Supabase directly. They are listed under [Feature status](#feature-status).

---

## Repository structure

```text
ClassroomReservation/
├── frontend/                  # Static frontend (Vercel)
│   ├── assets/
│   │   ├── css/
│   │   ├── images/
│   │   └── js/                # Page scripts + api.js (PHP API client)
│   ├── *.html                 # Pages
│   ├── build.js               # Generates config.js from environment variables (used by Vercel)
│   ├── config-template.js     # Template for a local config.js
│   └── README.md
│
├── backend/                   # PHP REST API (Render, Docker)
│   ├── public/                # Entry point: index.php (routes) + .htaccess
│   ├── src/                   # Auth, Controllers, Services, Repositories, Database, Http
│   ├── database/              # SQL scripts (schema, admin, faculty schedule, backend role)
│   ├── tests/                 # PHPUnit test + foundation check script
│   ├── Dockerfile
│   ├── composer.json
│   ├── .env.example
│   └── README.md
│
├── docs/design.md             # Design system and branding guidelines
├── rooms-api.http             # Optional REST Client requests for testing the Rooms API
├── reservations-api.http      # Optional REST Client requests for testing the Reservations API
└── README.md
```

`frontend/config.js` and `backend/.env` are created locally, are listed in `.gitignore` and must never be committed.

---

## Quick start (local)

You need a Supabase project, PHP 8.1+ with Composer, and VS Code with the Live Server extension (or any static server).

**1. Set up the database.** Run the SQL scripts in `backend/database/` in the Supabase SQL Editor. The order and purpose of each script are in [backend/README.md](backend/README.md#database-setup).

**2. Start the API.**

```bash
cd backend
composer install
copy .env.example .env        # macOS/Linux: cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, DB_HOST, DB_USER, DB_PASSWORD in .env
php -S 127.0.0.1:8000 -t public public/index.php
```

Check it at <http://localhost:8000/api/health>. Windows users: see the PHP extensions note in [backend/README.md](backend/README.md#windows-xampp-note).

**3. Create the frontend config.**

```bash
cd frontend
copy config-template.js config.js     # macOS/Linux: cp config-template.js config.js
# Open config.js and replace the two placeholder values
```

`config-template.js` already creates the Supabase client and sets `API_BASE_URL` to `http://localhost:8000`. Alternatively, `node build.js` generates `config.js` from environment variables (see [frontend/README.md](frontend/README.md#local-setup)).

**4. Open the site** with Live Server at `http://127.0.0.1:5500/frontend/login.html`. The origin must be one listed in `CORS_ALLOWED_ORIGINS` (`.env.example` lists `http://127.0.0.1:5500`, `http://localhost:5500` and `http://localhost:3000`; `127.0.0.1` and `localhost` count as different origins). Opening the HTML files directly from disk (`file://`) does not work.

**5. Create an administrator.** Run `backend/database/create_initial_admin.sql` once, then change the default password.

---

## Feature status

### Working

| Area | Page | What it does | Data goes through |
|---|---|---|---|
| Sign up | `signup.html` | Students register with an `@iskolarngbayan.pup.edu.ph` webmail, faculty and admins with an `@pup.edu.ph` webmail. A profile row is created automatically and the account waits for admin approval. | Supabase |
| Sign in | `login.html` | Sign-in with account-status messages: awaiting approval, declined, or deactivated. | Supabase |
| Profile | `profile.html` | View and edit Student Number, Program/Course, Year Level and Section. | Supabase |
| Dashboard | `dashboard.html` | Role-based home page for students, faculty and administrators. | Supabase |
| Browse rooms | `browse-rooms.html` | Floor directory with search, a Today/Tomorrow timetable in 30-minute steps, and class schedules overlaid from `room_schedules`. | PHP API, plus Supabase for the faculty dropdown and the faculty timetable view |
| Request a room | `browse-rooms.html` | Students submit a request (subject, tagged faculty, date, time) and can cancel it. The API enforces the booking rules. | PHP API |
| My requests | `my-reservations.html` | Tabs: All Requests, Pending, Approved, Rejected / Cancelled, with admin remarks and a cancel action. | PHP API |
| Review requests | `all-reservations.html` | Admins see Pending, Approved, and Declined & Cancelled requests, approve or decline with remarks, and competing pending requests for the same slot are declined automatically. | PHP API |
| Room management | `room-management.html` | Admins edit a room's number, name, type and active status. Inactive rooms cannot be reserved. | PHP API |
| User approvals | `user-approvals.html` | Admins approve, reject, deactivate and reactivate accounts. | PHP API |
| Faculty schedule | `schedule.html` | Faculty-only weekly view of their own class schedules and the student requests that tag them. | PHP API |

Visibility rules in Browse Rooms: **students** see their own requests in detail and other students' requests only as busy time slots; **faculty** see only the requests that tag them, with the applicant's details; **administrators** see everything.

### Partly working

| Page | Current behavior |
|---|---|
| `schedule-manager.html` | The editor works, but it saves class schedules and sample data in the browser's `localStorage`. It does **not** read or write the `room_schedules` table, so schedules created here are not visible to anyone else. |
| `logs.html` | Shows audit entries stored in the browser's `localStorage` by `all-reservations.html`. Nothing is written to the `audit_logs` table and the page has no role check. |

### Not implemented yet

- **Password reset.** The "Forgot PUP-CRS Password?" link on the login page is a placeholder.
- **Adding rooms from the UI.** The API supports `POST /api/rooms`, but `room-management.html` has no add form (and no floor field).
- **Email notifications.**
- **Direct admin booking** depends on a database function, `admin_create_reservation`, that the dashboard calls but that is not defined in any script in `backend/database/`.

---

## API overview

All endpoints except `/api/health` need `Authorization: Bearer <Supabase access token>`. Full details are in [backend/README.md](backend/README.md#api-reference).

| Area | Endpoints |
|---|---|
| Foundation | `GET /api/health`, `GET /api/me`, `GET /api/admin/check` |
| Rooms | `GET /api/rooms`, `GET /api/rooms/{id}`, `POST /api/rooms` (admin), `PATCH /api/rooms/{id}` (admin), `GET /api/rooms/{id}/taken-slots` |
| Reservations | `GET /api/reservations`, `GET /api/reservations/{id}`, `POST /api/reservations` (student), `PATCH /api/reservations/{id}/decision` (admin), `PATCH /api/reservations/{id}/cancel` |
| Users | `GET /api/users` (admin), `PATCH /api/users/{id}/status` (admin) |
| Faculty | `GET /api/faculty/schedule` (faculty) |

---

## Roadmap

- [x] Rooms API and Room Management page
- [x] Reservations API (create, list, approve/decline, cancel, taken slots) and the booking, My Requests and Review pages
- [x] Users API and User Approvals page
- [x] Faculty schedule API and Schedule page
- [ ] Schedules API (`GET/POST/DELETE /api/schedules`) and moving Schedule Manager from `localStorage` to the `room_schedules` table
- [ ] Direct admin booking: add the `admin_create_reservation` SQL function and an API endpoint
- [ ] `GET /api/faculty` (active faculty directory) and `PATCH` for the user's own profile
- [ ] Add-room form in Room Management; real password reset flow
- [ ] Audit trail: write to `audit_logs` and add `GET /api/logs`, then wire `logs.html`
- [ ] Email notifications for approved, declined and cancelled requests
- [ ] More PHPUnit tests (booking rules, role checks, token handling) and a GitHub Actions workflow
- [ ] UI/UX: mobile layouts, dark mode, loading skeletons, empty states, pagination, keyboard accessibility

---

## Known issues

- The local `rooms-api.http` and `reservations-api.http` files hold a placeholder token line. Paste a real token only while testing and clear it before committing.

---

## Security and secrets policy

- `.gitignore` excludes environment files (`.env`, `*.env`, `.env.*`, `backend/.env`, with `!.env.example` kept), private keys and certificates (`*.pem`, `*.key`, `*.pkcs12`, `*.pfx`, `*.p12`, `*.crt`, `*.cert`, `id_rsa*`, `id_ed25519*`, `*.secret`), the generated `config.js`, and dependencies and caches (`vendor/`, `.phpunit.result.cache`).
- `backend/.dockerignore` keeps `.env`, keys, Git history, `vendor/` and `tests` out of the Render image.
- Only the Supabase **publishable** key belongs in the frontend. The database password stays in `backend/.env` or the Render dashboard.
- Never commit access tokens. They expire after an hour but identify a real account.
- Change the default administrator password in `create_initial_admin.sql` before using it.