# PUP-CRS Frontend

Static frontend for the PUP Canlalay Campus Classroom & Facility Reservation System. It is plain HTML, CSS and vanilla JavaScript, styled with the Tailwind CDN, and uses the Supabase JS v2 client (loaded from a CDN) for sign-in. Pages that have been moved to the PHP API use the small client in `assets/js/api.js`. There is no bundler.

## Pages

| Page | Who can use it | What it does | Data source |
|---|---|---|---|
| `index.html` | everyone | Landing page with links to log in and sign up. | none |
| `signup.html` | everyone | Create an account. Students use an `@iskolarngbayan.pup.edu.ph` webmail, faculty and admins an `@pup.edu.ph` webmail. | Supabase |
| `login.html` | everyone | Sign in. Pending, declined and deactivated accounts get a clear message. | Supabase |
| `terms.html` | everyone | Terms of classroom governance. | none |
| `dashboard.html` | all signed-in roles | Role-based home page. | Supabase |
| `profile.html` | all signed-in roles | View and edit your profile details. | Supabase |
| `browse-rooms.html` | all signed-in roles | Room directory and Today/Tomorrow timetable. Students can request a room and cancel their own request. | PHP API (rooms, reservations, taken slots); Supabase for the faculty dropdown and the faculty timetable view |
| `my-reservations.html` | students | Own requests with tabs: All Requests, Pending, Approved, Rejected / Cancelled. Cancel a request. | PHP API |
| `schedule.html` | faculty only (others are redirected) | Weekly view of your classes and the student requests that tag you. | PHP API (`/api/faculty/schedule`) |
| `all-reservations.html` | admin | Pending, Approved, and Declined & Cancelled requests. Approve or decline with remarks. | PHP API |
| `room-management.html` | admin | Edit a room's number, name, type and active status. | PHP API |
| `user-approvals.html` | admin | Approve, reject, deactivate and reactivate accounts. | PHP API |
| `schedule-manager.html` | admin | Edit weekly class schedules. **Saved only in the browser's `localStorage`**, not in the database. | none (local only) |
| `logs.html` | admin menu (no role check yet) | Shows audit entries that `all-reservations.html` stored in `localStorage`. | none (local only) |

The pages that read the PHP API need the API running and an API URL in `config.js`.

---

## Local setup

**1. Create `config.js`.** It is generated or copied locally and is listed in `.gitignore`. Choose one way:

*Copy the template (simplest):*

```bash
copy config-template.js config.js      # macOS/Linux: cp config-template.js config.js
```

Open `config.js` and replace `YOUR_SUPABASE_URL_HERE` and `YOUR_SUPABASE_PUBLISHABLE_KEY_HERE`. The template already creates `window.supabaseClient` and sets `window.API_BASE_URL` to `http://localhost:8000`.

*Generate it with the build script:*

```powershell
# PowerShell
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "<publishable key>"
node build.js
```

```bash
# macOS/Linux
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node build.js
```

`build.js` stops with an error if either Supabase value is missing. `API_BASE_URL` is optional locally and defaults to `http://localhost:8000`.

**2. Start the API** from the `backend` folder (see `backend/README.md`):

```bash
php -S 127.0.0.1:8000 -t public public/index.php
```

**3. Open the site with Live Server** (VS Code extension) at `http://127.0.0.1:5500/frontend/login.html`. The page's origin must be in the backend's `CORS_ALLOWED_ORIGINS`; `127.0.0.1` and `localhost` are different origins. Opening the files directly from disk does not work.

---

## Configuration

| Value | Where it comes from | Description |
|---|---|---|
| `SUPABASE_URL` | environment variable or `config.js` | Your Supabase project URL. |
| `SUPABASE_PUBLISHABLE_KEY` | environment variable or `config.js` | The **publishable** key only. Never put a secret or database password in the frontend. |
| `API_BASE_URL` | environment variable or `config.js` | Base URL of the PHP API, for example `http://localhost:8000` locally or `https://<service>.onrender.com` in production. |

`config.js` defines `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `window.supabaseClient` and `window.API_BASE_URL`. In production, `build.js` writes this file from environment variables.

---

## Calling the PHP API

`assets/js/api.js` adds a global `api` object. It reads the current Supabase session (refreshing an expired token), sends `Authorization: Bearer <token>`, and returns the `data` field of the response. On failure it throws an `Error` with the API's `message` and the HTTP `status`.

**Script order matters.** In every page that uses the API:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="config.js"></script>
<script src="assets/js/api.js"></script>
<script src="assets/js/your-page-script.js"></script>
```

```js
const rooms = await api.rooms.list();
const mine = await api.reservations.list({ mine: true });

try {
  await api.reservations.create({
    room_id: 17,
    faculty_id: facultyId,
    subject: 'Capstone consultation',
    reservation_date: '2026-11-12',
    start_time: '13:00',
    end_time: '15:00',
  });
} catch (err) {
  console.error(err.status, err.message);
}
```

Available helpers: `api.rooms` (`list`, `get`, `create`, `update`, `takenSlots`), `api.reservations` (`list`, `get`, `create`, `decide`, `cancel`), `api.users` (`list`, `setStatus`), `api.schedule` (`mine`), and `api.request(path, options)` for anything else. Endpoint details are in `backend/README.md`.

Sign-in, the sign-in guard on each page, the profile page and some dropdowns still call Supabase directly.

---

## Deployment (Vercel)

1. Import the repository and set the **Root Directory** to `frontend`.
2. Set the build command to `node build.js` and the output directory to `.`.
3. Add these environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `API_BASE_URL` (the `https` URL of the Render service). On Vercel the build stops if it is missing, so the site never points at `localhost`.
4. In Supabase, add the Vercel URL to the allowed redirect URLs (Authentication settings).
5. In Render, add the Vercel URL to `CORS_ALLOWED_ORIGINS`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `api is not defined` | `api.js` is missing from the page, or it is loaded after the page script. Check the script order above and hard-refresh with `Ctrl+Shift+R`. |
| "Cannot reach the server at ..." | The API is not running, or `API_BASE_URL` is wrong. |
| Red CORS error in the console | Add the page's exact origin to `CORS_ALLOWED_ORIGINS` and restart the API. |
| `Supabase client is not initialised` or `supabaseClient` is undefined | `config.js` is missing or was copied from an old template. Re-create it as described above. |
| 401 errors | The session expired. Sign out and sign in again. |
| Changes do not show | Hard-refresh. Live Server only serves saved files. |

---

## Known issues and to-do

- Move Schedule Manager and Audit Logs from `localStorage` to the database and the API.
- Add an "add room" form (and a floor field) to Room Management.
- Split the large inline `<script>` blocks in some pages into separate files, and show a friendly error banner for failed requests instead of `console.error` only.
- UI/UX: mobile layouts, dark mode, loading skeletons, empty states, pagination and keyboard accessibility.