# PUP-CRS Frontend

Static frontend for the PUP Canlalay Campus Classroom Reservation System (CRS), built with vanilla HTML, CSS, and JavaScript. Hosted on [Vercel](https://vercel.com).

---

## Pages

| File | Role Access | Purpose |
|---|---|---|
| `index.html` | Public | Landing / redirect page |
| `login.html` | Public | Sign-in form |
| `signup.html` | Public | Account registration (PUP webmail only) |
| `terms.html` | Public | Terms and conditions |
| `dashboard.html` | All roles | Role-based dashboard home |
| `browse-rooms.html` | All roles | Classroom directory & 2-day timetable |
| `my-reservations.html` | Student | Personal reservation tracker |
| `schedule.html` | Faculty / Student | Weekly personal schedule viewer |
| `all-reservations.html` | Admin | Campus-wide reservation management |
| `room-management.html` | Admin | Add / edit / deactivate rooms |
| `schedule-manager.html` | Admin | Recurring class schedule editor |
| `user-approvals.html` | Admin | Account approval queue |
| `profile.html` | All roles | Academic profile editor |
| `logs.html` | Admin | Audit trail viewer _(not yet wired)_ |

---

## Local Setup

```bash
cd frontend
# Copy the config template
copy config-template.js config.js       # Windows
# cp config-template.js config.js       # macOS / Linux

# Or generate via the build script (requires Node.js)
node build.js
```

Then open any `.html` page with a static server:

```bash
npx serve .
# or use VS Code Live Server extension
```

---

## Configuration

All API and Supabase settings live in `config.js` (generated from `config-template.js`, **not committed**).

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key |
| `API_BASE_URL` | Base URL of the PHP REST backend |

---

## Deployment (Vercel)

- **Framework preset**: Other (static)
- **Root directory**: `frontend`
- **Build command**: `node build.js`
- **Output directory**: `.` (same directory)
- Set environment variables in the Vercel Dashboard to match `config-template.js`.

---

## TODO

> _Last updated: November 2026_

### Pages & Features

- [ ] **`logs.html`** — Wire up to `GET /api/logs` backend endpoint once implemented; add pagination and filter controls.
- [ ] **Mobile Responsiveness** — Audit and fix layout breakpoints on `browse-rooms.html`, `all-reservations.html`, and `schedule-manager.html` for small screens.
- [ ] **Dark Mode** — Add a user-toggle theme preference, persisted to `localStorage`, across all pages.
- [ ] **Loading Skeletons** — Replace blank loading states with skeleton screen placeholders on data-fetching pages.
- [ ] **Empty States** — Add descriptive empty-state illustrations/messages when lists return no results (reservations, rooms, users).
- [ ] **Pagination / Infinite Scroll** — Add server-side pagination on `all-reservations.html` and `user-approvals.html` for large datasets.
- [ ] **Keyboard Accessibility** — Audit focus order and ARIA labels on all interactive components (modals, timetable cells, dropdowns).

### Code Quality

- [ ] **JavaScript Module Refactor** — Break large inline `<script>` blocks into ES modules under `assets/js/` for better maintainability.
- [ ] **Config Validation** — Add a startup check in `build.js` that validates all required config keys are present before writing `config.js`.
- [ ] **Error Boundary Handling** — Standardize API error display (toast/alert banner) instead of scattered `console.error` calls across pages.

### Build & CI

- [ ] **GitHub Actions Step** — Add a CI job that runs `node build.js` and verifies the generated `config.js` structure on each pull request.
- [ ] **Lighthouse Audit** — Set up automated Lighthouse CI to track Performance, Accessibility, and SEO scores.
