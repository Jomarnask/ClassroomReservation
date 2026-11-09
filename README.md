# PUP Canlalay Campus - Classroom & Facility Reservation System (PUP-CRS)

This repository contains the Polytechnic University of the Philippines – Canlalay Campus Classroom Reservation System (CRS), structured as a monorepo with an independent static frontend and a PHP REST API backend.

---

## Repository Structure

```text
ClassroomReservation/
├── frontend/               # Static Frontend (Hosted on Vercel)
│   ├── assets/             # CSS, JS, Images
│   ├── *.html              # HTML Pages
│   ├── build.js            # Build script generating frontend config.js
│   └── config-template.js  # Frontend configuration template
│
├── backend/                # REST API Backend (Hosted on Render via Docker)
│   ├── public/             # API Entry Point (index.php)
│   ├── src/                # Controllers, Services, Repositories, Auth, DB
│   ├── database/           # PostgreSQL Schema, Triggers, RLS, & Role scripts
│   ├── tests/              # PHPUnit & Endpoint verification tests
│   ├── Dockerfile          # Production container specification
│   ├── composer.json       # Backend PHP dependencies
│   └── .env.example        # Environment variable template
│
├── docs/                   # Architectural & design guidelines
│   └── design.md
│
├── .gitignore              # Ignores all secrets, private keys, .env, and generated configs
└── README.md
```

---

## Quick Start

### 1. Frontend (Vercel or Local Static Server)
```bash
cd frontend
# Copy config template if running locally
copy config-template.js config.js # On Windows
# Or generate using Node:
node build.js
```
Run using any static web server (such as VS Code Live Server or `npx serve frontend`).

### 2. Backend (Render or Local PHP)
```bash
cd backend
composer install
copy .env.example .env
# Edit backend/.env with your Supabase credentials
composer start
# Or manually:
php -S 127.0.0.1:8000 -t public public/index.php
```

See [backend/README.md](backend/README.md) for detailed backend instructions, database instructions, and deployment settings.

---

## Currently Working Functions & Features (Bug-Free & Verified)

### 1. Authentication & Session Management
- **Registration & Sign Up (`signup.html`)**: Validated account creation using PUP webmail (`@pup.edu.ph`), password hashing via Supabase Auth, and automatic student/faculty profile creation in `public.users`.
- **Sign In & Route Protection (`login.html`)**: Authenticated sign-in with active-account verification. Pending or deactivated accounts are cleanly notified.
- **Role-Based Routing**: Dynamic role detection redirecting users seamlessly to student, faculty, or administrator dashboards.
- **Account Recovery & Password Reset**: Password reset flow integrated with Supabase Auth webmail delivery.
- **Academic Profile Management (`profile.html`)**: Viewing and editing academic metadata (Student Number, Program/Course, Year Level, Section).

### 2. Classroom Directory & Interactive Timetable (`browse-rooms.html`)
- **Floor Directory & Search**: Real-time room cards grouped by floor levels with instant keyword search and availability badges.
- **Two-Day Timetable Grid Overlay**: 30-minute interval visual schedule blocks for Today and Tomorrow.
- **Weekly Class Schedules**: Overlaid class schedule indicators with subject title, section, and scheduled times.
- **Role-Scoped Reservation Visibility**:
  - **Students**: View their own submitted reservation cards with full details, while other students' bookings are masked as busy/occupied timeslots without exposing personal details.
  - **Faculty**: Strictly scoped to only show reservations where that particular faculty member was tagged, displaying full applicant information (Student Name, Program/Course, Year Level, and Section).
  - **Administrators**: Complete campus-wide timetable view with applicant and assigned faculty details.
- **Conflict & Overlap Prevention**: Client and database constraint checks preventing requests from overlapping existing approved reservations.
- **Student Cancellation**: Students can cancel their own pending reservation requests directly from the timetable or reservation modal.

### 3. Student Reservations Hub (`my-reservations.html`)
- Categorized reservation tracking tabs: **Pending**, **Approved**, and **Past / Cancelled**.
- Status badges with admin feedback remarks.
- Cancellation action for pending requests.

### 4. Admin Reservations & Review Center (`all-reservations.html`)
- Campus-wide reservation request management categorized by status.
- **Approval Workflow**: Approves pending student requests and automatically auto-rejects competing overlapping requests for the same room and time block.
- **Rejection Workflow**: Rejects requests with custom administrator remarks.

### 5. Room Management (`room-management.html`)
- Add new lecture rooms, laboratories, and halls.
- Modify room numbers, names, floor assignments, and types.
- Toggle active/inactive operational status (inactive rooms cannot be reserved).

### 6. Weekly Class Schedule Manager (`schedule-manager.html`)
- Set up recurring weekly class schedules by room, day of the week, time interval, subject code, and student section.
- Assign active faculty members to recurring schedule blocks.

### 7. Personal Schedule Viewer (`schedule.html`)
- Consolidated weekly calendar for Faculty and Students showing both assigned class schedules and approved student reservation blocks.

### 8. User Approvals & Access Control (`user-approvals.html`)
- Administrator review queue for newly registered student and faculty accounts.
- Actions: **Approve**, **Reject**, **Deactivate**, and **Reactivate**.

### 9. PHP REST API Foundation (`backend/`)
- Pure PHP 8.2+ REST backend using PDO PostgreSQL with connection pooler support.
- **Token Verification**: Validates Supabase JWT access tokens via `SupabaseAuthService`.
- **User-Scoped Context**: Preserves Supabase PostgreSQL Row Level Security (RLS) by executing queries with transaction-local JWT claims.
- **Verified Foundation Endpoints**:
  - `GET /api/health`: Service health status.
  - `GET /api/me`: Authenticated user profile lookup with RLS protection.
  - `GET /api/admin/check`: Server-side active administrator privilege check.

---

## TODO

> _Last updated: November 2026_

### Phase 1 — API Endpoint Migration (Transferring Business Logic to PHP)

- [ ] **Classroom Directory Endpoints**
  - [ ] `GET /api/rooms` — List rooms and floors with search/filter support.
  - [ ] `GET /api/rooms/{id}/timetable` — Fetch 2-day room timetable with role-based filtering (students see busy slots; faculty see only tagged reservations with student details; admins see all).
- [ ] **Reservation API Endpoints**
  - [ ] `GET /api/reservations` — List reservations scoped to the caller's role.
  - [ ] `POST /api/reservations` — Submit student reservation requests with overlap validation.
  - [ ] `POST /api/reservations/{id}/cancel` — Student cancellation of own pending request.
  - [ ] `POST /api/reservations/{id}/approve` — Administrator approval with auto-rejection of competing pending requests.
  - [ ] `POST /api/reservations/{id}/reject` — Administrator rejection with optional remarks.
- [ ] **Direct Admin Booking Endpoint**
  - [ ] `POST /api/admin/reservations` — Allow administrators to directly reserve/block rooms with automatic approval and auto-cancellation of conflicting pending requests.
- [ ] **Schedule Management Endpoints**
  - [ ] `GET /api/schedules` — Retrieve recurring room schedules.
  - [ ] `POST /api/schedules` — Add a new recurring class schedule block.
  - [ ] `DELETE /api/schedules/{id}` — Remove an existing recurring schedule.
- [ ] **User & Faculty Endpoints**
  - [ ] `GET /api/users` — Admin user list for account approval queue.
  - [ ] `PATCH /api/users/{id}/status` — Admin update of account status (`active`, `rejected`, `inactive`).
  - [ ] `GET /api/faculty` — Active faculty directory for student reservation dropdowns.
  - [ ] `PATCH /api/users/{id}/profile` — Allow users to update their own academic profile metadata.

### Phase 2 — Notifications & Auditing

- [ ] **Webmail Notifications** — Send automated email notifications via PUP webmail (`@pup.edu.ph`) when a reservation request is approved, rejected, or cancelled.
- [ ] **Audit Trail & System Logs (`logs.html`)**
  - [ ] Implement `GET /api/logs` endpoint with pagination and role-based filtering.
  - [ ] Record audit log entries on: room status modifications, reservation approvals/rejections, and account privilege changes.
- [ ] **Real-Time Status Updates** — Explore Supabase Realtime channels for live timetable refresh without full page reload.

### Phase 3 — Automated Testing & Deployment CI

- [ ] **PHPUnit Test Suite** — Add comprehensive unit tests for:
  - Reservation overlap algorithms and half-open time boundary conditions.
  - Role authorization checks (student, faculty, admin scoping).
  - JWT token validation edge cases.
- [ ] **Continuous Integration** — Configure GitHub Actions workflow to:
  - Run PHPUnit test suite on every pull request.
  - Validate Composer dependencies (`composer validate`).
  - Enforce PHP code style (e.g., PHP CS Fixer or PHP_CodeSniffer).
- [ ] **Frontend Build Pipeline** — Add a CI step to run `node build.js` and validate generated `config.js` structure.

### Phase 4 — UI/UX Enhancements

- [ ] **Mobile-Responsive Layouts** — Audit and improve all HTML pages for small-screen usability.
- [ ] **Dark Mode Support** — Add a user-toggle theme preference persisted to `localStorage`.
- [ ] **Pagination & Infinite Scroll** — Implement server-side pagination on `all-reservations.html` and `user-approvals.html` for large datasets.
- [ ] **Loading Skeletons** — Replace blank loading states with skeleton screen placeholders across all data-fetching pages.

---

## Security & Secrets Policy

All sensitive files, private keys, environment files, and credentials are strictly excluded from source control:

- **`.gitignore` Rules**:
  - Environment files: `.env`, `*.env`, `.env.*`, `backend/.env` (safe template `!.env.example` committed).
  - Private Keys & Certificates: `*.pem`, `*.key`, `*.pkcs12`, `*.pfx`, `*.p12`, `*.crt`, `*.cert`, `id_rsa*`, `id_ed25519*`, `*.secret`.
  - Frontend generated config: `config.js`, `frontend/config.js`.
  - Dependencies & caches: `vendor/`, `backend/vendor/`, `.phpunit.result.cache`.
- **`backend/.dockerignore` Rules**:
  - Ensures no `.env`, private keys, Git history, local caches, or test files are bundled into Docker container images deployed to Render.
