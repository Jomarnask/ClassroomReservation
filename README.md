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
│   │   └── js/                # Page scripts, crs-modal.js, and api.js (PHP API client)
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
│   ├── .env.example           # Base environment configuration template
│   ├── .env.*.example         # Environment-specific overrides (local, testing, production)
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
| Schedule manager | `schedule-manager.html` | Admins assign recurring weekly class schedules, approve or decline pending student reservation requests, monitor room utilization stats, and navigate schedules via a mobile-responsive Day-by-Day tab view and stacked cards. | PHP API (`room_schedules`, `room_reservations`) |
| Audit logs | `logs.html` | Admins review immutable system audit logs with category filtering (Reservations, Approvals, Rooms, Schedules), search, and pagination. | PHP API (`audit_logs`) |

Visibility rules in Browse Rooms: **students** see their own requests in detail and other students' requests only as busy time slots; **faculty** see only the requests that tag them, with the applicant's details; **administrators** see everything.

### Not implemented yet

- **Email notifications.**

---

## API overview

All endpoints except `/api/health` need `Authorization: Bearer <Supabase access token>`. Full details are in [backend/README.md](backend/README.md#api-reference).

| Area | Endpoints |
|---|---|
| Foundation | `GET /api/health`, `GET /api/me`, `GET /api/admin/check` |
| Admin | `GET /api/admin/dashboard`, `POST /api/admin/reservations`, `GET /api/booking-window` |
| Rooms | `GET /api/rooms`, `GET /api/rooms/{id}`, `POST /api/rooms` (admin), `PATCH /api/rooms/{id}` (admin), `GET /api/rooms/{id}/taken-slots` |
| Reservations | `GET /api/reservations`, `GET /api/reservations/{id}`, `POST /api/reservations` (student), `PATCH /api/reservations/{id}/decision` (admin), `PATCH /api/reservations/{id}/cancel` |
| Schedules | `GET /api/schedules`, `POST /api/schedules` (admin), `GET /api/schedules/{id}`, `PATCH /api/schedules/{id}` (admin), `DELETE /api/schedules/{id}` (admin) |
| Users | `GET /api/users` (admin), `PATCH /api/users/{id}/status` (admin) |
| Faculty | `GET /api/faculty/schedule` (faculty), `GET /api/faculty` (active faculty list) |
| Audit Logs | `GET /api/audit-logs` (admin) |
| Notifications | `GET /api/notifications`, `PATCH /api/notifications/read-all`, `PATCH /api/notifications/{id}/read` |

---

## Recent updates (November 19, 2026)

### 1. Custom PUP-Branded Dialog & Modal System (`frontend/assets/js/crs-modal.js`)
- **Native Dialog Replacement:** Replaced standard browser popup alerts (`window.alert`) and prompts (`window.confirm`) across all pages with custom, non-blocking modals built specifically for the PUP-CRS design system.
- **Visual Design & Brand Identity:** Styled with PUP Maroon (`#880000`), Dark Maroon (`#5c0000`), and Gold (`#ffd658`) accent strip, institutional subheadings (`PUP CANLALAY CAMPUS CRS`), and contextual icons:
  - **Success (Emerald):** Account creation submission, login success redirect, and profile update alerts.
  - **Error / Declination (Crimson):** Authentication errors, profile database failures, and declined credentials.
  - **Warning (Amber):** Admin privilege granting, validation issues, email domain mismatch, inactive status notices.
  - **Info (PUP Blue):** General notices and system messages.
- **Asynchronous Confirmation Dialog (`crsConfirm`):** Promise-based confirmation workflow (`await crsConfirm(...)`) with customizable button labels, destructive/danger styles, and seamless keyboard navigation (<kbd>Enter</kbd> to confirm, <kbd>Escape</kbd> / backdrop click to cancel). Applied to:
  - User Approvals (`user-approvals.html`): Admin approval, decline, deactivate, and reactivate account workflows.
  - Reservation Cancellations (`browse-rooms.js`, `dashboard.js`, `my-reservations.js`): User cancellation confirmations.
  - Schedule Manager (`schedule-manager.js`): Deleting recurring weekly classes and overriding reservation overlap appointments.
- **Safety Net & Seamless Integration:** Automatically injected into dashboard views via `api.js` while globally routing legacy `window.alert` calls to `crsModal` without altering any underlying application or API logic.

### 2. Multi-Environment Configuration & Cascading Overrides (`backend/`)
- **Dynamic `.env` Loading (`backend/src/bootstrap.php`):** Implemented a layered environment configuration that loads the base `.env` file first, then dynamically loads and overrides with `.env.{APP_ENV}` (`.env.local`, `.env.testing`, `.env.production`).
- **Environment Templates:** Added `.env.local.example`, `.env.testing.example`, and `.env.production.example` alongside the base `.env.example`.
- **Git Protection:** Updated `.gitignore` to safeguard all `.env.*` secrets while keeping example templates tracked.

---

## Roadmap

- [x] Rooms API and Room Management page
- [x] Reservations API (create, list, approve/decline, cancel, taken slots) and the booking, My Requests and Review pages
- [x] Users API and User Approvals page
- [x] Faculty schedule API and Schedule page
- [x] Schedules API (`GET/POST/PATCH/DELETE /api/schedules`) and Schedule Manager backed by `room_schedules`
- [x] Direct admin booking: `POST /api/admin/reservations`
- [x] Active faculty directory (`GET /api/faculty`)
- [x] Audit trail: backend writes to `audit_logs` and `GET /api/audit-logs`, wired to `logs.html`
- [x] Notifications API (`GET/PATCH /api/notifications`)
- [x] UI/UX: Mobile-responsive layouts on Schedule Manager (Day-by-Day Tab Selector, responsive card stacks, mobile modals)
- [x] UI/UX: Custom PUP-CRS branded modal and confirmation dialog system (`crsModal` / `crsConfirm`) replacing native browser `alert()` and `confirm()` dialogs across all pages
- [x] Environment management: Multi-environment `.env` cascading loader (`.env.local`, `.env.testing`, `.env.production`) in backend bootstrap
- [ ] Email notifications for approved, declined and cancelled requests
- [ ] More PHPUnit tests (booking rules, role checks, token handling) and a GitHub Actions workflow
- [ ] Additional UI/UX: dark mode, loading skeletons, keyboard accessibility

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