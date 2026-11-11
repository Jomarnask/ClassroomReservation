/**
 * PUP Canlalay Campus CRS - Browse Rooms & Today/Tomorrow Timetable Controller
 *
 * Connected to Supabase (run supabase_reservations.sql first):
 * - Rooms:            public.rooms
 * - Reservations:     public.room_reservations (RLS)
 * - Busy slots:       rpc get_taken_slots   (times + status only, no names/subjects)
 * - Faculty dropdown: rpc list_active_faculty
 * - Cancel:           rpc cancel_reservation (student, own, pending only)
 *
 * Rules shown in the UI:
 * - Only students can reserve. Admin / faculty can browse only.
 * - A slot with other students' PENDING requests shows as yellow "In Process",
 *   but a student can still request it. The admin approves only one; the rest
 *   are auto-rejected by the database.
 * - APPROVED slots are red / occupied and cannot be requested.
 * - Regular class schedules (blue) will come from room_schedules later.
 */

(() => {
  'use strict';

  // ── Supabase client: reuse the one from config.js (no hardcoded keys here) ──
  const client = (typeof supabaseClient !== 'undefined') ? supabaseClient : window.supabaseClient;

  // ── Constants & Helpers ─────────────────────────────────────────────────
  const ICONS = {
    'Library': '📚',
    'Campus Library': '📚',
    'Reading Room': '📖',
    'Prayers Room': '🕌',
    'Sports Dev Office': '🏅'
  };

  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // A new request must start at least this many minutes from now, so the admin
  // has time to decide before the 1-hour auto-cancel cutoff. Keep in sync with
  // MIN_LEAD_MINUTES in ReservationService.php.
  const MIN_LEAD_MINUTES = 120;

  function goToLogin() {
    window.location.replace('login.html');
  }

  function iconFor(r) {
    return ICONS[r.number] || ICONS[r.name] || '';
  }

  function isFacility(r) {
    return !!iconFor(r);
  }

  function displayName(r) {
    return r.name || (r.number ? 'Room ' + r.number : 'Unnamed Room');
  }

  function roomTypeLabel(v) {
    const map = {
      lecture: 'Lecture Room',
      laboratory: 'Laboratory',
      office: 'Office',
      'stock room': 'Stock Room',
      other: 'Other'
    };
    return map[v] || v || 'Lecture Room';
  }

  function floorMeta(n) {
    if (!n) return { name: 'Unassigned', sub: 'No floor set' };
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    const suffix = s[(v - 20) % 10] || s[v] || s[0];
    return {
      name: n + suffix + ' Floor',
      sub: n === 1 ? 'Ground Level' : 'Level ' + n
    };
  }

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  // ── Time Conversion Utilities ───────────────────────────────────────────
  // '08:30 AM' -> 510
  function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(' ');
    if (parts.length < 2) return 0;
    const [time, modifier] = parts;
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + (minutes || 0);
  }

  // 510 -> '08:30 AM'
  function minutesToTime(mins) {
    let hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    const modifier = hours >= 12 ? 'PM' : 'AM';
    if (hours > 12) hours -= 12;
    if (hours === 0) hours = 12;
    const hStr = hours < 10 ? '0' + hours : String(hours);
    const mStr = minutes < 10 ? '0' + minutes : String(minutes);
    return `${hStr}:${mStr} ${modifier}`;
  }

  // '08:30:00' (database TIME) -> 510
  function sqlTimeToMinutes(t) {
    const [h, m] = String(t || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  // "BS of Information Technology (BSIT)", 3, 1 -> "BSIT 3-1"
  function formatStudentSection(u) {
    if (!u) return '';
    let code = u.program_course || '';
    const m = code.match(/\(([^)]+)\)/);
    if (m) code = m[1];
    if (u.year_level && u.section) return `${code} ${u.year_level}-${u.section}`.trim();
    return code;
  }

  // '08:30 AM' -> '08:30:00' (database TIME)
  function toSqlTime(label) {
    const mins = timeToMinutes(label);
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    return `${h}:${m}:00`;
  }

  function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Sunday is closed: schedules and reservations are Monday to Saturday only.
  function isSundayDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').getDay() === 0;
  }

  function getTodayAndTomorrowDates() {
    const dates = [];
    const now = new Date();
    for (let i = 0; i < 2; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dayIndex = d.getDay();
      const dayName = DAY_NAMES[dayIndex === 0 ? 6 : dayIndex - 1];
      const labelPrefix = i === 0 ? 'Today' : 'Tomorrow';
      dates.push({
        dateStr: `${y}-${m}-${day}`,
        dayName: dayName,
        closed: dayIndex === 0, // Sunday: no schedules or reservations (Mon-Sat only)
        labelPrefix: labelPrefix,
        shortDate: `${labelPrefix} • ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      });
    }
    return dates;
  }

  // ── Global State ────────────────────────────────────────────────────────
  const state = {
    user: null,
    profile: null,
    role: 'Student',
    canReserve: false,          // only students can reserve
    rooms: [],
    byId: {},
    selectedRoom: null,
    classSchedules: [],         // BLUE cards: will come from room_schedules later
    reservations: [],           // reservations of the selected room (today & tomorrow)
    facultyMap: {},             // faculty user_id -> full name
    submitting: false,
    toastTimer: null
  };

  function normalizeRole(raw) {
    if (!raw) return 'Student';
    const r = String(raw).trim().toLowerCase();
    if (r === 'admin' || r === 'super admin' || r === 'superadmin') return 'Admin';
    if (r === 'faculty') return 'Faculty';
    return 'Student';
  }

  function initials(name) {
    return (String(name || '').replace(/[^A-Za-z\s,]/g, '').split(/[\s,]+/).filter(Boolean)
      .slice(0, 2).map(w => w[0].toUpperCase()).join('')) || 'PU';
  }

  function showToast(msg) {
    const toast = document.getElementById('brToast');
    const msgEl = document.getElementById('brToastMsg');
    if (!toast || !msgEl) return;
    msgEl.textContent = msg;
    toast.classList.remove('translate-y-12', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toast.classList.add('translate-y-12', 'opacity-0');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 4500);
  }

  // ── Auth Guard: signed in + profile exists + account active ──────────────
  // Any active user (student, faculty, admin) may view this page.
  async function guard() {
    if (!client || !client.auth) return goToLogin();

    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session || !session.user) return goToLogin();

    const { data: profile, error: profileError } = await client
      .from('users')
      .select('user_id, full_name, role, account_status')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (profileError || !profile || String(profile.account_status).toLowerCase() !== 'active') {
      try { await client.auth.signOut(); } catch (e) { /* ignore */ }
      return goToLogin();
    }

    state.user = session.user;
    state.profile = profile;
    state.role = normalizeRole(profile.role);
    state.canReserve = state.role === 'Student';

    initProfileUI();
    renderNavbar(state.role);
    document.body.style.visibility = 'visible';
    return true;
  }

  function initProfileUI() {
    const name = state.profile?.full_name || 'User';
    const email = state.user?.email || '';

    const avatarEl = document.getElementById('brAvatarText');
    if (avatarEl) avatarEl.textContent = initials(name);

    const nameEl = document.getElementById('brProfileName');
    if (nameEl) nameEl.textContent = name;

    const emailEl = document.getElementById('brProfileEmail');
    if (emailEl) emailEl.textContent = email;

    const roleBadge = document.getElementById('brProfileRoleBadge');
    if (roleBadge) roleBadge.textContent = 'Role: ' + state.role;

    const menuBtn = document.getElementById('brProfileMenuBtn');
    const dropdown = document.getElementById('brProfileDropdown');
    const signOutBtn = document.getElementById('brBtnSignOut');
    const mobileToggle = document.getElementById('mobileNavToggle');

    if (menuBtn && dropdown) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mobileToggle) mobileToggle.checked = false;
        dropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        dropdown.classList.add('hidden');
        if (mobileToggle && !e.target.closest('#brNavLinks') && !e.target.closest('.mobile-menu-button') && !e.target.closest('#mobileNavToggle')) {
          mobileToggle.checked = false;
        }
      });
    }

    if (mobileToggle) {
      mobileToggle.addEventListener('change', () => {
        if (mobileToggle.checked && dropdown) {
          dropdown.classList.add('hidden');
        }
      });
    }

    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        signOutBtn.disabled = true;
        if (client && client.auth) {
          try { await client.auth.signOut(); } catch (e) { /* ignore */ }
        }
        localStorage.removeItem('user_role');
        localStorage.removeItem('pup_user');
        localStorage.removeItem('demoRole');
        goToLogin();
      });
    }
  }

  function renderNavbar(role) {
    const nav = document.getElementById('brNavLinks');
    if (!nav) return;

    if (role === 'Admin') {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-item">Dashboard</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="room-management.html" class="pup-nav-item">Room Management</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="schedule-manager.html" class="pup-nav-item">Schedule Manager</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item active">Browse Rooms</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="all-reservations.html" class="pup-nav-item">All Reservations</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="user-approvals.html" class="pup-nav-item">User Approvals</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="logs.html" class="pup-nav-item">Logs</a>
      `;
    } else if (role === 'Faculty') {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-item">Dashboard</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item active">Browse Rooms</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="schedule.html" class="pup-nav-item">Schedule</a>
      `;
    } else {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-item">Dashboard</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item active">Browse Rooms</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="my-reservations.html" class="pup-nav-item">My Reservations</a>
      `;
    }
  }

  // ── Load Rooms (database only) ──────────────────────────────────────────
  async function loadRooms() {
    const floorsEl = document.getElementById('floors');

    let data;
    try {
      data = await api.rooms.list();
    } catch (error) {
      console.error('Load rooms failed:', error);
      if (floorsEl) floorsEl.innerHTML = `<div class="muted" style="padding:16px">Could not load rooms: ${esc(error.message)}</div>`;
      state.rooms = [];
      return;
    }

    // same order as before: by floor, then room id
    data = (data || []).slice().sort((a, b) => ((a.floor ?? 0) - (b.floor ?? 0)) || (a.room_id - b.room_id));

    state.rooms = data.map(r => ({
      id: r.room_id,
      number: r.room_number || '',
      name: r.room_name || '',
      floor: r.floor ?? 0,
      roomType: r.room_type || 'other',
      active: r.is_active !== false
    }));

    state.byId = {};
    state.rooms.forEach(r => {
      state.byId[String(r.id)] = r;
      if (r.number) state.byId[String(r.number)] = r;
    });

    if (state.rooms.length === 0) {
      if (floorsEl) floorsEl.innerHTML = '<div class="muted" style="padding:16px">No rooms found in the database.</div>';
      const totalEl = document.getElementById('totalRooms');
      if (totalEl) totalEl.textContent = 'Total: 0 Rooms';
      return;
    }

    renderFloors();
  }

  // ── Faculty dropdown (real faculty from the database) ───────────────────
  async function loadFacultyList() {
    const facultySel = document.getElementById('resFaculty');
    if (!client || !facultySel) return;

    // remove any hardcoded options, keep only the placeholder
    facultySel.innerHTML = '<option value="" disabled selected>-- Select Faculty Professor --</option>';

    const { data, error } = await client.rpc('list_active_faculty');
    if (error) {
      console.error('Faculty list failed:', error);
      showToast('Could not load the faculty list: ' + error.message);
      return;
    }

    state.facultyMap = {};
    (data || []).forEach(u => {
      state.facultyMap[u.user_id] = u.full_name;
      const opt = document.createElement('option');
      opt.value = u.user_id;          // the tagged faculty's user_id is what gets saved
      opt.textContent = u.full_name;
      facultySel.appendChild(opt);
    });

    if (!data || data.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.disabled = true;
      opt.textContent = 'No active faculty available yet';
      facultySel.appendChild(opt);
    }
  }

  // ── Load reservations for the selected room (today & tomorrow) ───────────
  // Two sources:
  //  1. room_reservations (RLS): full details of MY requests (admin: all; faculty: tagged)
  //  2. get_taken_slots: other students' busy slots, TIMES + STATUS only
  async function loadReservationsForRoom(room) {
    const days = getTodayAndTomorrowDates();
    const from = days[0].dateStr;
    const to = days[1].dateStr;

    // Faculty: see ONLY reservations of this room where this faculty is tagged,
    // with the student's name and year & section.
    if (state.role === 'Faculty') {
      try {
        const { data, error } = await client.rpc('get_room_timetable_for_faculty', {
          p_room_id: room.id, p_from: from, p_to: to, p_faculty_id: state.user?.id
        });
        if (error) throw error;

        state.reservations = (data || []).map(r => {
          const startMinutes = sqlTimeToMinutes(r.start_time);
          const endMinutes = sqlTimeToMinutes(r.end_time);
          return {
            id: r.reservation_id,
            roomId: room.id,
            date: r.reservation_date,
            startMinutes,
            endMinutes,
            start: minutesToTime(startMinutes),
            end: minutesToTime(endMinutes),
            status: r.status,
            subject: r.subject,
            faculty: state.facultyMap[r.faculty_id] || 'Tagged faculty',
            requester: r.student_name || 'Student',
            requesterSection: formatStudentSection(r),
            mine: false,
            detail: true
          };
        });
        return;
      } catch (err) {
        console.warn('get_room_timetable_for_faculty failed, falling back to tagged query:', err);
        const { data: visibleData, error: visibleErr } = await client
          .from('room_reservations')
          .select('reservation_id, room_id, student_id, faculty_id, subject, reservation_date, start_time, end_time, status')
          .eq('room_id', room.id)
          .eq('faculty_id', state.user?.id)
          .gte('reservation_date', from)
          .lte('reservation_date', to)
          .in('status', ['pending', 'approved']);

        if (visibleErr) throw visibleErr;

        state.reservations = (visibleData || []).map(r => {
          const startMinutes = sqlTimeToMinutes(r.start_time);
          const endMinutes = sqlTimeToMinutes(r.end_time);
          return {
            id: r.reservation_id,
            roomId: r.room_id,
            date: r.reservation_date,
            startMinutes,
            endMinutes,
            start: minutesToTime(startMinutes),
            end: minutesToTime(endMinutes),
            status: r.status,
            subject: r.subject,
            faculty: state.facultyMap[r.faculty_id] || 'Tagged faculty',
            requester: 'Student',
            requesterSection: '',
            mine: false,
            detail: true
          };
        });
        return;
      }
    }

    // Both calls go through the PHP API
    const [allVisible, takenRows] = await Promise.all([
      api.reservations.list({ room_id: room.id, date_from: from, date_to: to, limit: 500 }),
      api.rooms.takenSlots(room.id, from, to)
    ]);

    // only pending and approved requests block the timetable
    const visibleRows = (allVisible || []).filter(r => r.status === 'pending' || r.status === 'approved');

    const withDetails = visibleRows.map(r => {
      const mine = r.student_id === state.user.id;
      const startMinutes = sqlTimeToMinutes(r.start_time);
      const endMinutes = sqlTimeToMinutes(r.end_time);
      return {
        id: r.reservation_id,
        roomId: r.room_id,
        date: r.reservation_date,
        startMinutes,
        endMinutes,
        start: minutesToTime(startMinutes),
        end: minutesToTime(endMinutes),
        status: r.status,
        subject: r.subject,
        faculty: state.facultyMap[r.faculty_id] || 'Tagged faculty',
        requester: mine ? (state.profile?.full_name || 'You') : 'Student',
        mine,
        detail: true
      };
    });

    const knownIds = new Set(withDetails.map(r => r.id));

    // taken slots carry no reservation id, so also skip a slot that matches one we already show in detail
    const slotKey = (date, startMin, endMin, status) => `${date}|${startMin}|${endMin}|${status}`;
    const knownSlots = new Set(withDetails.map(r => slotKey(r.date, r.startMinutes, r.endMinutes, r.status)));

    const timesOnly = (takenRows || [])
      .filter(t => !knownIds.has(t.reservation_id) &&
        !knownSlots.has(slotKey(t.reservation_date, sqlTimeToMinutes(t.start_time), sqlTimeToMinutes(t.end_time), t.status)))
      .map(t => {
        const startMinutes = sqlTimeToMinutes(t.start_time);
        const endMinutes = sqlTimeToMinutes(t.end_time);
        return {
          id: t.reservation_id,
          roomId: room.id,
          date: t.reservation_date,
          startMinutes,
          endMinutes,
          start: minutesToTime(startMinutes),
          end: minutesToTime(endMinutes),
          status: t.status,
          mine: false,
          detail: false
        };
      });

    state.reservations = [...withDetails, ...timesOnly];
  }

  async function refreshReservations() {
    if (!state.selectedRoom) return;
    try {
      await loadReservationsForRoom(state.selectedRoom);
    } catch (e) {
      console.error('Load reservations failed:', e);
      state.reservations = [];
      showToast('Could not load reservations: ' + (e.message || e));
    }
  }

  // ── Render Floor Manager Directory ───────────────────────────────────
  function renderFloors() {
    const floorFilter = document.getElementById('floorFilter')?.value || 'all';
    const search = (document.getElementById('roomSearchInput')?.value || '').toLowerCase().trim();
    const floorsEl = document.getElementById('floors');
    if (!floorsEl) return;

    floorsEl.innerHTML = '';

    const matchingRooms = state.rooms.filter(r => {
      const matchFloor = floorFilter === 'all' || String(r.floor) === floorFilter;
      const matchSearch = !search ||
        displayName(r).toLowerCase().includes(search) ||
        String(r.number).toLowerCase().includes(search) ||
        String(r.roomType).toLowerCase().includes(search);
      return matchFloor && matchSearch;
    });

    const totalEl = document.getElementById('totalRooms');
    if (totalEl) totalEl.textContent = 'Total: ' + matchingRooms.length + ' Rooms';

    if (matchingRooms.length === 0) {
      floorsEl.innerHTML = `
        <div class="col-span-full p-8 text-center bg-gray-50 rounded-[12px] border border-gray-200 text-gray-500">
          <p class="font-semibold text-sm">No classrooms found matching your filters.</p>
        </div>
      `;
      return;
    }

    const floorNums = [...new Set(matchingRooms.map(r => r.floor))].sort((a, b) => a - b);
    floorsEl.style.gridTemplateColumns = floorNums.length === 1 ? 'minmax(0, 480px)' : '';

    floorNums.forEach(n => {
      const meta = floorMeta(n);
      const floorRooms = matchingRooms.filter(r => r.floor === n);

      const col = document.createElement('div');
      col.className = 'floor';
      col.innerHTML = `
        <div class="floor-head">
          <div>
            <strong>${esc(meta.name)}</strong>
            <small>${esc(meta.sub)} (${floorRooms.length} Rooms)</small>
          </div>
          <span class="lvl">L${n}</span>
        </div>
        <div class="room-grid"></div>
      `;

      const grid = col.querySelector('.room-grid');
      floorRooms.forEach(r => {
        const b = document.createElement('button');
        b.type = 'button';
        const isSel = state.selectedRoom && (String(state.selectedRoom.id) === String(r.id) || String(state.selectedRoom.number) === String(r.number));
        b.className = 'room' + (isFacility(r) ? ' facility' : '') + (isSel ? ' selected' : '');
        b.dataset.id = String(r.id);
        b.dataset.number = String(r.number);
        b.dataset.gma = r.active ? 'full' : 'not available';

        if (!r.active) {
          // Inactive rooms are shown but cannot be opened or reserved
          b.disabled = true;
          b.title = `${displayName(r)}\nFloor: ${meta.name}\nType: ${roomTypeLabel(r.roomType)}\nStatus: Inactive / Unavailable (Cannot be reserved)`;
        } else {
          b.title = `${displayName(r)}\nFloor: ${meta.name}\nType: ${roomTypeLabel(r.roomType)}\nStatus: Available\n\nClick to view timetable panel`;
          b.addEventListener('click', () => selectRoom(r));
        }

        const icon = iconFor(r) ? `<span class="fi" aria-hidden="true">${iconFor(r)}</span>` : '';
        const text = displayName(r);

        b.innerHTML = `${icon}<span>${esc(text)}</span><span class="badge" aria-hidden="true"></span>`;
        grid.appendChild(b);
      });

      floorsEl.appendChild(col);
    });
  }

  // ── Select Room & Launch Timetable Panel ─────────────────────────────────
  async function selectRoom(r) {
    if (!r || !r.active) return;
    state.selectedRoom = r;

    document.querySelectorAll('.room').forEach(btn => {
      const matches = btn.dataset.id === String(r.id) || btn.dataset.number === String(r.number);
      btn.classList.toggle('selected', matches);
    });

    await refreshReservations();
    renderWeeklyTimetable();
    openTimetablePanel();
  }

  function openTimetablePanel() {
    const overlay = document.getElementById('timetableOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeTimetablePanel() {
    const overlay = document.getElementById('timetableOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');

    const resOverlay = document.getElementById('reservationOverlay');
    if (resOverlay && resOverlay.hidden) {
      document.body.style.overflow = '';
    }
  }

  // ── Card builders ───────────────────────────────────────────────────────
  function cardFrame(cls, top, height) {
    const card = document.createElement('div');
    card.className = 'schedule-card ' + cls;
    card.style.top = `${top}px`;
    card.style.height = `${height}px`;
    return card;
  }

  // A reservation counts as BLOCKING (no green slot, cannot be requested) when:
  // it is APPROVED, or it is MY OWN pending request. Other students' pending
  // requests do NOT block: they show as yellow but the slot can still be requested.
  // ── AFTER (Fixes green/yellow scroll flickering) ─────────────────────────
  function isBlocking(item) {
    if (item.isClassSchedule) return true;
    if (item.status === 'approved' || item.status === 'pending') return true;
    return false;
  }

  function buildReservationCard(item, top, height, dayInfo) {
    const isApproved = item.status === 'approved';
    const card = cardFrame(isApproved ? 'occupied' : 'pending', top, height);
    const canRequestThisSlot = !isApproved && !item.mine && state.canReserve;

    let title, meta, badge;

    if (item.detail) {
      title = item.subject || 'Room Reservation';
            meta = `
        <div>Faculty: ${esc(item.faculty || 'Unassigned')}</div>
        <div class="text-gray-500 mt-0.5">Applicant: ${esc(item.mine ? 'You' : item.requester)}</div>
        ${item.requesterSection ? `<div class="text-gray-500">Year &amp; Section: ${esc(item.requesterSection)}</div>` : ''}`;
      badge = isApproved ? 'Approved / Occupied' : (item.mine ? 'Your request - Pending approval' : 'Pending approval');
    } else {
      title = isApproved ? 'Occupied' : 'In Process';
      meta = isApproved
        ? '<div>Reserved</div>'
        : '<div>Requested by another student.</div>' + (state.canReserve ? '<div class="mt-0.5 font-semibold">You can still request this time.</div>' : '');
      badge = isApproved ? 'Approved / Occupied' : 'In Process (Pending)';
    }

    const titleColor = isApproved ? 'text-[#880000]' : 'text-[#b45309]';
    const timeColor = isApproved ? 'text-[#b91c1c]' : 'text-[#d97706]';
    const badgeClass = isApproved ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';

    const cancelBtn = (item.mine && item.status === 'pending' && state.role === 'Student')
      ? `<button type="button" data-cancel-id="${item.id}" class="mt-1 text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-red-300 text-red-700 hover:bg-red-50">Cancel request</button>`
      : '';

    card.innerHTML = `
      <div class="card-top-bar"></div>
      <div class="card-title ${titleColor}">${esc(title)}</div>
      <div class="card-time ${timeColor}">${esc(item.start)} – ${esc(item.end)}</div>
      <div class="card-meta">
        ${meta}
        <div class="mt-1">
          <span class="inline-block text-[9.5px] font-bold px-1.5 py-0.5 rounded ${badgeClass}">${esc(badge)}</span>
        </div>
        ${cancelBtn}
      </div>
    `;

    const cancel = card.querySelector('[data-cancel-id]');
    if (cancel) {
      cancel.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelMyReservation(item.id);
      });
    }

    card.addEventListener('click', (e) => {
      e.stopPropagation();
      if (canRequestThisSlot) {
        // yellow slot of another student: still requestable
        openReservationModal(item.start, item.end, item.date);
            } else if (item.detail) {
        const who = item.requesterSection ? ` • ${item.requester} (${item.requesterSection})` : '';
        showToast(`${item.subject} (${item.start} – ${item.end}) • ${badge}${who}`);
      } else {
        showToast(`${title}: ${item.start} – ${item.end}`);
      }
    });

    return card;
  }

  // ── Render Today & Tomorrow Room Timetable Overlay ───────────────────────
  function renderWeeklyTimetable() {
    const r = state.selectedRoom;
    if (!r) return;

    const floorData = floorMeta(r.floor);

    const headerTitle = document.getElementById('ttPanelHeaderTitle');
    if (headerTitle) headerTitle.textContent = `${displayName(r)} — Timetable & Reservation`;

    const floorBadge = document.getElementById('ttFloorBadge');
    if (floorBadge) floorBadge.textContent = floorData.name;

    const typeBadge = document.getElementById('ttTypeBadge');
    if (typeBadge) typeBadge.textContent = roomTypeLabel(r.roomType);

    const statusBadge = document.getElementById('ttStatusBadge');
    if (statusBadge) {
      if (r.active) {
        statusBadge.className = 'text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1.5';
        statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span> Active (Open for Reservations)';
      } else {
        statusBadge.className = 'text-[10px] font-bold text-rose-800 bg-rose-50 px-2.5 py-0.5 rounded border border-rose-200 flex items-center gap-1.5';
        statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-500"></span> Inactive';
      }
    }

    // Only students can reserve: hide the Reserve button for admin / faculty
    const btnReserve = document.getElementById('btnReserveTime');
    if (btnReserve) btnReserve.classList.toggle('hidden', !state.canReserve);

    const titleEl = document.getElementById('ttRoomTitle');
    if (titleEl) titleEl.textContent = displayName(r);

    const metaEl = document.getElementById('ttRoomMeta');
    if (metaEl) {
      metaEl.textContent = `${floorData.name} (${floorData.sub}) • ${roomTypeLabel(r.roomType)}`;
    }

    const activeDays = getTodayAndTomorrowDates();

    const weekLabel = document.getElementById('ttWeekRangeLabel');
    if (weekLabel) {
      weekLabel.textContent = `Schedule: ${activeDays[0].shortDate} & ${activeDays[1].shortDate}`;
    }

    const headersContainer = document.getElementById('timetableDaysHeader');
    if (headersContainer) {
      headersContainer.innerHTML = activeDays.map((wd, idx) => `
        <div class="p-3 border-r border-gray-200 ${idx === 1 ? 'border-r-0' : ''} ${wd.closed ? 'bg-gray-100' : 'bg-red-50/50'}">
          <div class="font-extrabold text-xs uppercase tracking-wider ${wd.closed ? 'text-gray-400' : 'text-[#880000]'}">${wd.labelPrefix} (${wd.dayName})${wd.closed ? ' • Closed' : ''}</div>
          <div class="text-[11px] ${wd.closed ? 'text-gray-400' : 'text-gray-600'} font-bold mt-0.5">${wd.shortDate.split('• ')[1]}</div>
        </div>
      `).join('');
    }

    const timeAxis = document.getElementById('timeAxisLabels');
    if (timeAxis) {
      let labelsHtml = '';
      for (let h = 7; h <= 21; h++) {
        const mins = h * 60;
        labelsHtml += `<div class="time-slot-label">${minutesToTime(mins)}</div>`;
      }
      timeAxis.innerHTML = labelsHtml;
    }

    const gridBody = document.getElementById('timetableGridBody');
    if (!gridBody) return;

    gridBody.innerHTML = '';

    const startBoundary = 7 * 60;   // 07:00 AM
    const endBoundary = 21 * 60;    // 09:00 PM

    activeDays.forEach((wd) => {
      const colEl = document.createElement('div');
      colEl.className = 'day-column';

      let linesHtml = '';
      for (let h = 7; h < 21; h++) {
        linesHtml += `<div class="grid-hour-line" data-hour="${h}"></div>`;
      }
      colEl.innerHTML = linesHtml;

      // Sunday is closed: gray out the whole column, no slots, nothing clickable
      if (wd.closed) {
        colEl.classList.add('closed-day');
        colEl.insertAdjacentHTML('beforeend', `
          <div style="position:absolute;inset:0;z-index:5;pointer-events:none;display:flex;justify-content:center;padding-top:28px;background:repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6 10px,#e5e7eb 10px,#e5e7eb 20px);">
            <span style="height:fit-content;background:#fff;border:1px solid #d1d5db;color:#6b7280;font-weight:800;font-size:11px;letter-spacing:.05em;text-transform:uppercase;padding:6px 12px;border-radius:6px;">Closed – Sunday</span>
          </div>`);
        gridBody.appendChild(colEl);
        return;
      }

      // 1. Regular class schedules (BLUE) - empty until room_schedules exists
      const dayClasses = state.classSchedules.filter(c => {
        const matchRoom = String(c.roomId) === String(r.id) || String(c.roomId) === String(r.number);
        const matchDay = c.day && c.day.toLowerCase() === wd.dayName.toLowerCase();
        return matchRoom && matchDay;
      }).map(c => ({ ...c, isClassSchedule: true }));

      // 2. Reservations from the database for this room and date
      const dayReservations = state.reservations.filter(b =>
        String(b.roomId) === String(r.id) && b.date === wd.dateStr
      ).map(b => ({ ...b, isClassSchedule: false }));

      const allEvents = [...dayClasses, ...dayReservations];
      allEvents.sort((a, b) => {
        const aStart = a.startMinutes ?? timeToMinutes(a.start);
        const bStart = b.startMinutes ?? timeToMinutes(b.start);
        return aStart - bStart;
      });

      // Green "available" gaps are computed from BLOCKING items only
      // (class, approved, my own pending). Other students' pending requests
      // do not block, so they are drawn on top of the green slot.
      if (r.active) {
        const blockers = allEvents.filter(isBlocking);
        let currentPointer = startBoundary;
        blockers.forEach(item => {
          const iStart = item.startMinutes ?? timeToMinutes(item.start);
          const iEnd = item.endMinutes ?? timeToMinutes(item.end);
          if (iStart > currentPointer) {
            renderAvailableSlot(colEl, currentPointer, iStart, wd.dateStr);
          }
          currentPointer = Math.max(currentPointer, iEnd);
        });
        if (currentPointer < endBoundary) {
          renderAvailableSlot(colEl, currentPointer, endBoundary, wd.dateStr);
        }
      }

      // Event cards are drawn after the green slots so they sit on top
      allEvents.forEach(item => {
        const iStart = item.startMinutes ?? timeToMinutes(item.start);
        const iEnd = item.endMinutes ?? timeToMinutes(item.end);

        const visualStart = Math.max(iStart, startBoundary);
        const visualEnd = Math.min(iEnd, endBoundary);
        if (visualEnd <= visualStart) return;

        const top = visualStart - startBoundary;
        const height = Math.max((visualEnd - visualStart) - 4, 38);

        let card;

        if (item.isClassSchedule) {
          // BLUE: regular class (will be filled from room_schedules later)
          card = cardFrame('class-schedule', top, height);
          card.innerHTML = `
            <div class="card-top-bar"></div>
            <div class="card-title text-[#1d4ed8]">${esc(item.subject)}</div>
            <div class="card-time text-[#2563eb]">${esc(item.start)} – ${esc(item.end)}</div>
            <div class="card-meta">
              <div class="font-bold text-[#1e40af]">${esc(item.section || '')} ${item.code ? '• ' + esc(item.code) : ''}</div>
              <div class="text-gray-600 mt-0.5">Prof. ${esc(item.faculty || 'Unassigned')}</div>
              <div class="mt-1">
                <span class="inline-block text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                  Scheduled Class (Admin)
                </span>
              </div>
            </div>
          `;
          card.addEventListener('click', (e) => {
            e.stopPropagation();
            showToast(`[Scheduled Class] ${item.section}: ${item.subject} (${item.start} – ${item.end})`);
          });
        } else {
          card = buildReservationCard(item, top, height, wd);
        }

        colEl.appendChild(card);
      });

      gridBody.appendChild(colEl);
    });
  }

  // ── Render Green Available Slot Block (hides past hours today) ───────────
  function renderAvailableSlot(container, startMin, endMin, dateStr) {
    const todayStr = getTodayString();
    const now = new Date();
    // Earliest bookable minute today = now + the minimum lead time
    const earliestMins = now.getHours() * 60 + now.getMinutes() + MIN_LEAD_MINUTES;

    // Do not show slots that end before the earliest bookable time today
    if (dateStr === todayStr && endMin <= earliestMins) {
      return;
    }

    // Clip slot start to the next 30-minute mark after the earliest bookable time
    let effectiveStartMin = startMin;
    if (dateStr === todayStr && startMin < earliestMins) {
      effectiveStartMin = Math.ceil(earliestMins / 30) * 30;
    }

    if (endMin - effectiveStartMin < 30) return;

    const startBoundary = 7 * 60;
    const top = effectiveStartMin - startBoundary;
    const height = (endMin - effectiveStartMin) - 4;

    const slotCard = document.createElement('div');
    slotCard.className = 'schedule-card available';
    slotCard.style.top = `${top}px`;
    slotCard.style.height = `${height}px`;

    const startStr = minutesToTime(effectiveStartMin);
    const endStr = minutesToTime(endMin);

    slotCard.innerHTML = `
      <div class="card-top-bar"></div>
      <div class="card-title text-emerald-800 flex items-center justify-between">
        <span>Available Time</span>
        <span class="text-[10px] font-bold px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded">Open</span>
      </div>
      <div class="card-time text-emerald-700">${startStr} – ${endStr}</div>
      <div class="card-meta text-emerald-900/80">
        ${state.canReserve
          ? '<div>Click to Reserve this time slot</div><div class="text-[10px] font-semibold text-emerald-700 mt-1 flex items-center gap-1"><span>+ Reserve Slot</span></div>'
          : '<div>Open for student reservations</div>'}
      </div>
    `;

    if (state.canReserve) {
      slotCard.addEventListener('click', () => {
        const preferredEndMin = Math.min(effectiveStartMin + 60, endMin);
        openReservationModal(startStr, minutesToTime(preferredEndMin), dateStr);
      });
    } else {
      slotCard.style.cursor = 'default';
    }

    container.appendChild(slotCard);
  }

  // ── Populate Start & End 30-min Interval Dropdowns ───────────────────────
  function populateTimeDropdowns() {
    const startSel = document.getElementById('resStart');
    const endSel = document.getElementById('resEnd');
    if (!startSel || !endSel) return;

    startSel.innerHTML = '';
    endSel.innerHTML = '';

    const startM = 7 * 60;
    const endM = 21 * 60;
    const step = 30;

    for (let m = startM; m < endM; m += step) {
      const timeStr = minutesToTime(m);
      const opt = document.createElement('option');
      opt.value = timeStr;
      opt.textContent = timeStr;
      startSel.appendChild(opt);
    }

    for (let m = startM + step; m <= endM; m += step) {
      const timeStr = minutesToTime(m);
      const opt = document.createElement('option');
      opt.value = timeStr;
      opt.textContent = timeStr;
      endSel.appendChild(opt);
    }
  }

  // ── Open Reservation Modal Panel (students only, today & tomorrow) ───────
  function openReservationModal(preferredStart, preferredEnd, preferredDate) {
    const r = state.selectedRoom;
    if (!r) return;

    if (!state.canReserve) {
      showToast('Only students can reserve rooms.');
      return;
    }

    if (!r.active) {
      showToast(`${displayName(r)} is inactive and cannot be reserved.`);
      return;
    }

    const overlay = document.getElementById('reservationOverlay');
    if (!overlay) return;

    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = `Reserve a Time - ${displayName(r)}`;

    const roomNameEl = document.getElementById('modalRoomName');
    if (roomNameEl) roomNameEl.textContent = displayName(r);

    const roomFloorEl = document.getElementById('modalRoomFloor');
    if (roomFloorEl) roomFloorEl.textContent = `${floorMeta(r.floor).name} • ${roomTypeLabel(r.roomType)}`;

    // Only open days (Mon-Sat) can be picked: on Saturday that is today only,
    // on Sunday it is tomorrow (Monday) only.
    const bookable = getTodayAndTomorrowDates().filter(d => !d.closed);
    const dateInput = document.getElementById('resDate');
    if (dateInput && bookable.length) {
      dateInput.min = bookable[0].dateStr;
      dateInput.max = bookable[bookable.length - 1].dateStr;
      dateInput.value = (preferredDate && !isSundayDate(preferredDate)) ? preferredDate : bookable[0].dateStr;
    }

    const startSel = document.getElementById('resStart');
    const endSel = document.getElementById('resEnd');

    if (startSel) {
      if (preferredStart && [...startSel.options].some(o => o.value === preferredStart)) {
        startSel.value = preferredStart;
      } else {
        startSel.value = '08:00 AM';
      }
    }

    if (endSel) {
      if (preferredEnd && [...endSel.options].some(o => o.value === preferredEnd)) {
        endSel.value = preferredEnd;
      } else {
        const sMin = timeToMinutes(startSel.value);
        const eMin = Math.min(sMin + 60, 21 * 60);
        endSel.value = minutesToTime(eMin);
      }
    }

    const subjInput = document.getElementById('resSubject');
    if (subjInput) subjInput.value = '';

    const facultySel = document.getElementById('resFaculty');
    if (facultySel) facultySel.value = '';

    validateReservationForm();

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (subjInput) subjInput.focus();
  }

  function closeReservationModal() {
    const overlay = document.getElementById('reservationOverlay');
    if (!overlay) return;
    overlay.hidden = true;

    const ttOverlay = document.getElementById('timetableOverlay');
    if (ttOverlay && ttOverlay.classList.contains('hidden')) {
      document.body.style.overflow = '';
    }
  }

  // ── Live Validation ─────────────────────────────────────────────────────
  // The database re-checks everything; this only gives instant feedback.
  function validateReservationForm() {
    const r = state.selectedRoom;
    const alertBox = document.getElementById('resAlertBox');
    const dateVal = document.getElementById('resDate')?.value;
    const startVal = document.getElementById('resStart')?.value;
    const endVal = document.getElementById('resEnd')?.value;
    const submitBtn = document.getElementById('btnConfirmReservation');

    if (!alertBox || !r) return true;

    const sMins = timeToMinutes(startVal);
    const eMins = timeToMinutes(endVal);
    const dates = getTodayAndTomorrowDates();
    const todayStr = dates[0].dateStr;
    const tomorrowStr = dates[1].dateStr;
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    let type = 'ok';
    let msg = 'Selected slot is clear. Your request will be sent to the Admin for approval.';
    let isValid = true;

    if (!state.canReserve) {
      type = 'bad';
      msg = 'Only students can reserve rooms.';
      isValid = false;
    } else if (!r.active) {
      type = 'bad';
      msg = 'This room is inactive and cannot be reserved.';
      isValid = false;
    } else if (!dateVal) {
      type = 'bad';
      msg = 'Reservation date is required.';
      isValid = false;
    } else if (dateVal < todayStr) {
      type = 'bad';
      msg = 'Invalid Date: You cannot reserve room slots for past dates.';
      isValid = false;
    } else if (isSundayDate(dateVal)) {
      type = 'bad';
      msg = 'Sunday is closed. Reservations are only allowed from Monday to Saturday.';
      isValid = false;
    } else if (dateVal > tomorrowStr) {
      type = 'bad';
      msg = 'Reservations are only allowed for today and tomorrow.';
      isValid = false;
    } else if (dateVal === todayStr && sMins < currentMins + MIN_LEAD_MINUTES) {
      const earliestSlot = Math.ceil((currentMins + MIN_LEAD_MINUTES) / 30) * 30;
      type = 'bad';
      msg = `Invalid Time: Requests must start at least ${MIN_LEAD_MINUTES / 60} hours from now so the admin has time to review.`
        + (earliestSlot < 21 * 60 ? ` Earliest start today: ${minutesToTime(earliestSlot)}.` : ' No more slots are available today.');
      isValid = false;
    } else if (eMins <= sMins) {
      type = 'bad';
      msg = 'Invalid Time: Reservation End must be later than Reservation Start.';
      isValid = false;
    } else {
      const dObj = new Date(dateVal + 'T00:00:00');
      const dayIndex = dObj.getDay();
      const dayName = DAY_NAMES[dayIndex === 0 ? 6 : dayIndex - 1];

      // 1. Regular class (BLUE) - empty until room_schedules exists
      const classConflict = state.classSchedules.find(c => {
        const matchRoom = String(c.roomId) === String(r.id) || String(c.roomId) === String(r.number);
        const matchDay = c.day && c.day.toLowerCase() === dayName.toLowerCase();
        if (!matchRoom || !matchDay) return false;
        const cStart = c.startMinutes ?? timeToMinutes(c.start);
        const cEnd = c.endMinutes ?? timeToMinutes(c.end);
        return cStart < eMins && cEnd > sMins;
      });

      // 2. Reservations of this room on that date that overlap the chosen time
      const overlapping = state.reservations.filter(b =>
        String(b.roomId) === String(r.id) &&
        b.date === dateVal &&
        b.startMinutes < eMins &&
        b.endMinutes > sMins
      );

      const approved = overlapping.find(b => b.status === 'approved');
      const myPending = overlapping.find(b => b.status === 'pending' && b.mine);
      const othersPending = overlapping.filter(b => b.status === 'pending' && !b.mine);

      if (classConflict) {
        type = 'bad';
        msg = `Class Schedule Conflict: Room is reserved for scheduled class "${classConflict.subject}" from ${classConflict.start} to ${classConflict.end}.`;
        isValid = false;
      } else if (approved) {
        type = 'bad';
        msg = `This time overlaps an approved reservation (${approved.start} – ${approved.end}).`;
        isValid = false;
      } else if (myPending) {
        type = 'bad';
        msg = `You already have a pending request for this time (${myPending.start} – ${myPending.end}).`;
        isValid = false;
      } else if (othersPending.length > 0) {
        type = 'warn';
        msg = 'Other students already have pending requests for this time. You can still request it, but the Admin approves only one request.';
      }
    }

    alertBox.className = `alert ${type} p-2.5 rounded-[6px] text-xs border font-medium`;
    alertBox.textContent = (type === 'ok' ? '✔ ' : type === 'warn' ? '⚠ ' : '✖ ') + msg;

    if (submitBtn) {
      submitBtn.disabled = !isValid || state.submitting;
      submitBtn.classList.toggle('opacity-50', !isValid || state.submitting);
      submitBtn.classList.toggle('cursor-not-allowed', !isValid || state.submitting);
    }

    return isValid;
  }

  // ── Submit: create the reservation through the PHP API (status starts as 'pending') ──
  async function handleReservationSubmit(e) {
    e.preventDefault();
    if (state.submitting) return;

    const r = state.selectedRoom;
    if (!r) return;

    const dateVal = document.getElementById('resDate')?.value;
    const startVal = document.getElementById('resStart')?.value;
    const endVal = document.getElementById('resEnd')?.value;
    const facultyVal = document.getElementById('resFaculty')?.value;
    const subjectVal = document.getElementById('resSubject')?.value.trim();

    if (!dateVal || !startVal || !endVal || !facultyVal || !subjectVal) {
      showToast('Please complete all required fields.');
      return;
    }

    if (!validateReservationForm()) {
      showToast('Cannot submit: Please resolve the highlighted problem.');
      return;
    }

    state.submitting = true;
    validateReservationForm();

    let error = null;
    try {
      await api.reservations.create({
        room_id: r.id,
        faculty_id: facultyVal,
        subject: subjectVal.slice(0, 150),
        reservation_date: dateVal,
        start_time: toSqlTime(startVal),
        end_time: toSqlTime(endVal)
      });
    } catch (err) {
      error = err;
    }

    state.submitting = false;

    if (error) {
      console.error('Reservation request failed:', error);
      showToast(error.message || 'Could not submit the reservation.');
      validateReservationForm();
      return;
    }

    await refreshReservations();
    renderWeeklyTimetable();
    closeReservationModal();
    showToast('Reservation request submitted! It is now Pending until the Admin decides.');
  }

  // ── Cancel my own pending request ───────────────────────────────────────
  async function cancelMyReservation(id) {
    if (!confirm('Cancel this pending reservation request?')) return;

    try {
      await api.reservations.cancel(id);
    } catch (error) {
      console.error('Cancel failed:', error);
      showToast(error.message || 'Could not cancel the request.');
      return;
    }

    await refreshReservations();
    renderWeeklyTimetable();
    showToast('Your pending request was cancelled.');
  }

  // ── Event Wireup ────────────────────────────────────────────────────────
  function wireEvents() {
    const floorFilter = document.getElementById('floorFilter');
    if (floorFilter) {
      floorFilter.addEventListener('change', renderFloors);
    }

    const searchInput = document.getElementById('roomSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', renderFloors);
    }

    const btnCloseTT = document.getElementById('btnCloseTimetablePanel');
    if (btnCloseTT) {
      btnCloseTT.addEventListener('click', closeTimetablePanel);
    }

    const ttOverlay = document.getElementById('timetableOverlay');
    if (ttOverlay) {
      ttOverlay.addEventListener('mousedown', (e) => {
        if (e.target === ttOverlay) closeTimetablePanel();
      });
    }

    const btnReserve = document.getElementById('btnReserveTime');
    if (btnReserve) {
      btnReserve.addEventListener('click', () => {
        openReservationModal('08:00 AM', '10:00 AM', getTodayString());
      });
    }

    const btnCloseModal = document.getElementById('btnCloseReserveModal');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', closeReservationModal);
    }

    const btnCancel = document.getElementById('btnCancelReservation');
    if (btnCancel) {
      btnCancel.addEventListener('click', closeReservationModal);
    }

    const resOverlay = document.getElementById('reservationOverlay');
    if (resOverlay) {
      resOverlay.addEventListener('mousedown', (e) => {
        if (e.target === resOverlay) closeReservationModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (resOverlay && !resOverlay.hidden) {
          closeReservationModal();
        } else if (ttOverlay && !ttOverlay.classList.contains('hidden')) {
          closeTimetablePanel();
        }
      }
    });

    const resDate = document.getElementById('resDate');
    const resStart = document.getElementById('resStart');
    const resEnd = document.getElementById('resEnd');
    const resSubject = document.getElementById('resSubject');
    const resFaculty = document.getElementById('resFaculty');

    [resDate, resStart, resEnd, resSubject, resFaculty].forEach(el => {
      if (el) {
        el.addEventListener('input', validateReservationForm);
        el.addEventListener('change', validateReservationForm);
      }
    });

    if (resStart && resEnd) {
      resStart.addEventListener('change', () => {
        const sMins = timeToMinutes(resStart.value);
        const eMins = timeToMinutes(resEnd.value);
        if (eMins <= sMins) {
          const newEnd = Math.min(sMins + 60, 21 * 60);
          resEnd.value = minutesToTime(newEnd);
        }
        validateReservationForm();
      });
    }

    const form = document.getElementById('reservationForm');
    if (form) {
      form.addEventListener('submit', handleReservationSubmit);
    }

    const btnCloseToast = document.getElementById('btnCloseToast');
    if (btnCloseToast) {
      btnCloseToast.addEventListener('click', () => {
        const toast = document.getElementById('brToast');
        if (toast) {
          toast.classList.add('translate-y-12', 'opacity-0');
          toast.classList.remove('translate-y-0', 'opacity-100');
        }
      });
    }
  }

  // ── Global Boot ─────────────────────────────────────────────────────────
  async function init() {
    try {
      const ok = await guard();
      if (!ok) return; // guard already redirected to login

      // remove old demo data left in this browser by earlier versions
      ['crs_custom_reservations', 'crs_room_class_schedules'].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
      });

      populateTimeDropdowns();
      wireEvents();
      await loadRooms();
      await loadFacultyList();
    } catch (err) {
      console.error('Browse rooms initialization error:', err);
      goToLogin(); // fail closed
    }
  }

  if (client && client.auth) {
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') goToLogin();
    });
  }

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();