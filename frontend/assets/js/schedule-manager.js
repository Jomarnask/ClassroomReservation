/**
 * PUP Canlalay Campus CRS - Academic Schedule Manager (Admin Only)
 *
 * Every piece of data comes from the PHP API (window.api, see api.js):
 *   - rooms ............ api.rooms.list()
 *   - faculty .......... api.users.list({ role: 'faculty', status: 'active' })
 *   - class schedules .. api.schedules.list / create / update / remove
 *   - reservations ..... api.reservations.list / decide
 *
 * Timetable (Monday to Saturday, 7:00 AM to 9:00 PM):
 *   Blue   = recurring weekly class (repeats every week until an admin deletes it)
 *   Red    = approved reservation (a student's own-class booking is auto-approved)
 *   Yellow = pending reservation waiting for the admin
 *   Green  = available slot (click to schedule a class there)
 *
 * No localStorage and no demo data: nothing is shown that is not in the database.
 */

(() => {
  'use strict';

  const client = (typeof window !== 'undefined' && window.supabaseClient) ? window.supabaseClient : null;

  // ── Constants ───────────────────────────────────────────────────────────
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; // Sunday is closed
  const START_MINUTES = 420; // 7:00 AM
  const END_MINUTES = 1260;  // 9:00 PM

  // These MUST match the options students pick in signup.html, because a
  // student is matched to a class by program + year level + section.
  const PROGRAMS = [
    'BS of Information Technology (BSIT)',
    'BS of Computer Engineering (BSCpE)',
    'BS of Industrial Engineering (BSIE)',
    'Diploma in Information Technology (DIT)',
    'Diploma in Computer Engineering Technology (DCpET)'
  ];
  const YEAR_LEVELS = [
    { value: 1, label: '1st Year' },
    { value: 2, label: '2nd Year' },
    { value: 3, label: '3rd Year' },
    { value: 4, label: '4th Year' }
  ];
  const SECTIONS = [1, 2];

  // ── Helpers ─────────────────────────────────────────────────────────────
  // '08:00 AM' -> 480
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

  // 480 -> '08:00 AM'
  function minutesToTime(mins) {
    let hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    const modifier = hours >= 12 ? 'PM' : 'AM';
    if (hours > 12) hours -= 12;
    if (hours === 0) hours = 12;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${modifier}`;
  }

  // '08:00:00' (database TIME) -> 480
  function sqlTimeToMinutes(value) {
    const [h, m] = String(value || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  // '08:00 AM' -> '08:00' (what the API expects)
  function toApiTime(label) {
    const mins = timeToMinutes(label);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }

  // 'BS of Information Technology (BSIT)' -> 'bsit' (same rule as the backend)
  function programKey(program) {
    const text = String(program || '').trim().toLowerCase();
    const m = text.match(/\(([^)]+)\)\s*$/);
    return m ? m[1].trim() : text;
  }

  function programShort(program) {
    const m = String(program || '').match(/\(([^)]+)\)\s*$/);
    return m ? m[1] : String(program || '');
  }

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }

  function dateToStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Monday to Saturday only (Sunday is closed)
  function getWeekDates(baseMonday) {
    return DAY_NAMES.map((dayName, i) => {
      const d = new Date(baseMonday);
      d.setDate(baseMonday.getDate() + i);
      return {
        dateStr: dateToStr(d),
        dayName,
        shortDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      };
    });
  }

  function prettyDate(dateStr) {
    const d = new Date(String(dateStr) + 'T00:00:00');
    return isNaN(d) ? String(dateStr || '') : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function initials(name) {
    return (name || 'Admin').replace(/[^A-Za-z\s,]/g, '').split(/[\s,]+/).filter(Boolean)
      .slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'AD';
  }

  function roomTypeLabel(v) {
    const map = { lecture: 'Lecture Room', laboratory: 'Laboratory', office: 'Office', 'stock room': 'Stock Room', other: 'Other' };
    return map[String(v || '').toLowerCase()] || v || 'Lecture Room';
  }

  function floorMeta(n) {
    if (!n) return { name: 'Unassigned', sub: 'No floor set' };
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return { name: n + (s[(v - 20) % 10] || s[v] || s[0]) + ' Floor', sub: n === 1 ? 'Ground Level' : 'Level ' + n };
  }

  function errorText(err) {
    // 422 responses carry per-field messages in err.errors
    const fields = err && err.errors && typeof err.errors === 'object' ? Object.values(err.errors) : [];
    return fields.length ? `${err.message} ${fields[0]}` : (err && err.message) || 'Something went wrong.';
  }

  // ── Global State ────────────────────────────────────────────────────────
  const state = {
    user: null,
    profile: null,
    rooms: [],
    faculty: [],
    selectedRoom: null,
    currentMonday: getMonday(new Date()),
    schedules: [],      // every active class (all rooms)
    reservations: [],   // pending + approved of the selected room in the shown week
    pending: [],        // every pending request (all rooms)
    saving: false,
    toastTimer: null
  };

  // ── Normalisers (API row -> what the screen uses) ───────────────────────
  function normSchedule(c) {
    const startMinutes = sqlTimeToMinutes(c.start_time);
    const endMinutes = sqlTimeToMinutes(c.end_time);
    return {
      id: c.schedule_id,
      roomId: c.room_id,
      day: c.day_of_week,
      startMinutes,
      endMinutes,
      start: minutesToTime(startMinutes),
      end: minutesToTime(endMinutes),
      subject: c.subject_title || '',
      code: c.subject_code || '',
      programCourse: c.program_course || '',
      year: c.year_level,
      section: c.section,
      label: c.course_section || [programShort(c.program_course), c.year_level != null ? `${c.year_level}-${c.section ?? '?'}` : ''].join(' ').trim() || 'Untagged class',
      facultyId: c.faculty_id || '',
      faculty: c.faculty_name || ''
    };
  }

  function normReservation(r) {
    const startMinutes = sqlTimeToMinutes(r.start_time);
    const endMinutes = sqlTimeToMinutes(r.end_time);
    const cls = r.year_level != null ? ` (${programShort(r.program_course)} ${r.year_level}-${r.section ?? '?'})` : '';
    return {
      id: r.reservation_id,
      roomId: r.room_id,
      roomLabel: r.room_number ? `Room ${r.room_number}` : (r.room_name || `Room ${r.room_id}`),
      date: String(r.reservation_date || '').slice(0, 10),
      startMinutes,
      endMinutes,
      start: minutesToTime(startMinutes),
      end: minutesToTime(endMinutes),
      subject: r.subject || '',
      faculty: r.faculty_name || '',
      requester: `${r.student_name || 'Student'}${cls}`,
      status: r.status,
      autoApproved: r.status === 'approved' && !r.admin_id
    };
  }

  // ── Toast ───────────────────────────────────────────────────────────────
  function showToast(msg, isSuccess = true) {
    const toast = document.getElementById('smToast');
    const toastMsg = document.getElementById('smToastMsg');
    if (!toast || !toastMsg) return;
    if (state.toastTimer) clearTimeout(state.toastTimer);

    toastMsg.textContent = msg;
    toast.className = isSuccess
      ? 'fixed bottom-5 right-5 z-50 bg-[#111111] text-white px-4 py-3 rounded-[6px] shadow-2xl border-l-4 border-emerald-500 flex items-center gap-3 text-xs max-w-sm transition-all duration-300 translate-y-0 opacity-100'
      : 'fixed bottom-5 right-5 z-50 bg-[#880000] text-white px-4 py-3 rounded-[6px] shadow-2xl border-l-4 border-amber-400 flex items-center gap-3 text-xs max-w-sm transition-all duration-300 translate-y-0 opacity-100';

    state.toastTimer = setTimeout(() => {
      toast.classList.add('translate-y-12', 'opacity-0');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 4500);
  }

  // ── Auth guard (admin only, checked by the API) ─────────────────────────
  async function guard() {
    if (!client || !window.api) {
      window.location.replace('login.html');
      return false;
    }

    let admin;
    try {
      // 401 -> api.js sends you to login; 403 -> not an active admin
      admin = await api.request('/api/admin/check');
    } catch (err) {
      console.warn('Admin check failed:', err);
      window.location.replace(err.status === 403 ? 'browse-rooms.html' : 'login.html');
      return false;
    }

    let email = '';
    try {
      const { data: { session } } = await client.auth.getSession();
      email = session?.user?.email || '';
    } catch (_) { /* email is only cosmetic */ }

    state.user = { id: admin.user_id, email };
    state.profile = { full_name: admin.full_name, role: admin.role };

    initProfileUI();
    document.body.style.visibility = 'visible';
    return true;
  }

  function initProfileUI() {
    const name = state.profile?.full_name || 'Admin';
    const email = state.user?.email || '';

    const avatarEl = document.getElementById('adminAvatar');
    if (avatarEl) avatarEl.textContent = initials(name);
    const nameEl = document.getElementById('profileDropdownName');
    if (nameEl) nameEl.textContent = name;
    const emailEl = document.getElementById('profileDropdownEmail');
    if (emailEl) emailEl.textContent = email;

    const menuBtn = document.getElementById('profileMenuBtn');
    const dropdown = document.getElementById('profileDropdown');
    const signOutBtn = document.getElementById('btnSignOut');
    const mobileToggle = document.getElementById('mobileNavToggle');

    if (menuBtn && dropdown) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mobileToggle) mobileToggle.checked = false;
        dropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        dropdown.classList.add('hidden');
        if (mobileToggle && !e.target.closest('#nav') && !e.target.closest('.mobile-menu-button') && !e.target.closest('#mobileNavToggle')) {
          mobileToggle.checked = false;
        }
      });
    }

    if (mobileToggle) {
      mobileToggle.addEventListener('change', () => {
        if (mobileToggle.checked && dropdown) dropdown.classList.add('hidden');
      });
    }

    // System Administration sub-menu toggle on mobile
    document.querySelectorAll('nav .group > button').forEach(subBtn => {
      subBtn.addEventListener('click', (e) => {
        if (window.innerWidth < 640) {
          e.preventDefault();
          const sub = subBtn.nextElementSibling;
          if (sub) sub.classList.toggle('hidden');
        }
      });
    });

    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        try { await client.auth.signOut(); } catch (_) { /* go to login anyway */ }
        window.location.replace('login.html');
      });
    }
  }

  // ── Data loading (all through the API) ──────────────────────────────────
  async function loadRooms() {
    const data = await api.rooms.list();

    state.rooms = (data || [])
      .slice()
      .sort((a, b) => ((a.floor ?? 0) - (b.floor ?? 0)) || (a.room_id - b.room_id))
      .map(r => ({
        id: r.room_id,
        number: r.room_number || '',
        name: r.room_name || '',
        floor: r.floor ?? 0,
        roomType: r.room_type || 'other',
        active: r.is_active !== false
      }));
  }

  async function loadFaculty() {
    try {
      const rows = await api.users.list({ role: 'faculty', status: 'active', limit: 1000 });
      state.faculty = (rows || [])
        .map(u => ({ id: u.user_id, name: u.full_name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      console.warn('Could not load faculty:', err);
      state.faculty = [];
      showToast('Could not load the faculty list: ' + errorText(err), false);
    }
    fillFacultySelect();
  }

  async function loadSchedules() {
    const rows = await api.schedules.list();
    state.schedules = (rows || []).map(normSchedule);
  }

  async function loadPending() {
    const rows = await api.reservations.list({ status: 'pending', limit: 500 });
    state.pending = (rows || []).map(normReservation);
  }

  async function loadWeekReservations() {
    if (!state.selectedRoom) { state.reservations = []; return; }
    const week = getWeekDates(state.currentMonday);
    const rows = await api.reservations.list({
      room_id: state.selectedRoom.id,
      status: 'pending',
      date_from: week[0].dateStr,
      date_to: week[week.length - 1].dateStr,
      limit: 500
    });
    state.reservations = (rows || []).map(normReservation);
  }

  async function refreshAll() {
    try {
      await Promise.all([loadSchedules(), loadPending(), loadWeekReservations()]);
    } catch (err) {
      console.error('Refresh failed:', err);
      showToast('Could not load data: ' + errorText(err), false);
    }
    renderAll();
  }

  function renderAll() {
    renderWeeklyTimetable();
    renderClassSchedulesTable();
    renderPendingReservationsTable();
    updateStats();
  }

  // ── Selectors ───────────────────────────────────────────────────────────
  function roomOptionLabel(r) {
    return `${r.number ? 'Room ' + r.number : 'Room'} - ${r.name || 'Lecture Room'} (Flr ${r.floor})`;
  }

  function populateFloorAndRoomSelectors() {
    const floorFilter = document.getElementById('floorFilter');
    const roomSelector = document.getElementById('roomSelector');
    const schedRoom = document.getElementById('schedRoom');
    if (!roomSelector) return;

    const floorVal = floorFilter ? floorFilter.value : 'all';
    const filtered = floorVal === 'all' ? state.rooms : state.rooms.filter(r => String(r.floor) === String(floorVal));

    roomSelector.innerHTML = '';
    filtered.forEach(r => {
      const opt = document.createElement('option');
      opt.value = String(r.id);
      opt.textContent = roomOptionLabel(r);
      roomSelector.appendChild(opt);
    });

    if (schedRoom) {
      schedRoom.innerHTML = '';
      state.rooms.forEach(r => {
        const opt = document.createElement('option');
        opt.value = String(r.id);
        opt.textContent = roomOptionLabel(r);
        schedRoom.appendChild(opt);
      });
    }

    const room = filtered.find(r => String(r.number) === '202') || filtered[0] || state.rooms[0];
    if (room) {
      roomSelector.value = String(room.id);
      selectRoom(room);
    } else {
      state.selectedRoom = null;
      renderAll();
    }
  }

  function populateClassSelects() {
    const program = document.getElementById('schedProgram');
    if (program) program.innerHTML = PROGRAMS.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');

    const year = document.getElementById('schedYear');
    if (year) year.innerHTML = YEAR_LEVELS.map(y => `<option value="${y.value}">${y.label}</option>`).join('');

    const section = document.getElementById('schedSection');
    if (section) section.innerHTML = SECTIONS.map(s => `<option value="${s}">Section ${s}</option>`).join('');
  }

  function fillFacultySelect() {
    const sel = document.getElementById('schedFaculty');
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = '<option value="">-- Unassigned --</option>' +
      state.faculty.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
    sel.value = keep;
  }

  function populateTimeDropdowns() {
    const startSelect = document.getElementById('schedStart');
    const endSelect = document.getElementById('schedEnd');
    if (!startSelect || !endSelect) return;

    startSelect.innerHTML = '';
    endSelect.innerHTML = '';

    for (let m = 420; m <= 1230; m += 30) { // 7:00 AM - 8:30 PM
      const opt = document.createElement('option');
      opt.value = opt.textContent = minutesToTime(m);
      startSelect.appendChild(opt);
    }
    for (let m = 450; m <= 1260; m += 30) { // 7:30 AM - 9:00 PM
      const opt = document.createElement('option');
      opt.value = opt.textContent = minutesToTime(m);
      endSelect.appendChild(opt);
    }
    startSelect.value = '08:00 AM';
    endSelect.value = '01:00 PM';
  }

  async function selectRoom(room) {
    if (!room) return;
    state.selectedRoom = room;

    const flr = floorMeta(room.floor);
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

    set('ttFloorBadge', flr.name);
    set('ttTypeBadge', roomTypeLabel(room.roomType));
    set('ttRoomTitle', room.number ? `Room ${room.number}${room.name ? ' - ' + room.name : ''}` : (room.name || `Room ${room.id}`));
    set('ttRoomMeta', `${flr.sub} • ${roomTypeLabel(room.roomType)}${room.active ? '' : ' • Inactive'}`);
    set('statRoomInfo', room.number ? `Room ${room.number}` : room.name);

    const schedRoom = document.getElementById('schedRoom');
    if (schedRoom) schedRoom.value = String(room.id);

    try {
      await loadWeekReservations();
    } catch (err) {
      state.reservations = [];
      showToast('Could not load reservations: ' + errorText(err), false);
    }
    renderAll();
  }

  // ── Stats ───────────────────────────────────────────────────────────────
  function updateStats() {
    const roomId = state.selectedRoom?.id;

    const classCount = state.schedules.filter(c => c.roomId === roomId).length;
    const statClassCount = document.getElementById('statClassCount');
    if (statClassCount) statClassCount.textContent = `${classCount} ${classCount === 1 ? 'Class' : 'Classes'}`;

    const pendingCount = state.pending.length;
    const statPendingCount = document.getElementById('statPendingCount');
    if (statPendingCount) statPendingCount.textContent = `${pendingCount} ${pendingCount === 1 ? 'Request' : 'Requests'}`;
    const pendingTableCount = document.getElementById('pendingTableCount');
    if (pendingTableCount) pendingTableCount.textContent = `${pendingCount} Pending`;

    
  }

  // ── Weekly timetable ────────────────────────────────────────────────────
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && aEnd > bStart;
  }

  function renderWeeklyTimetable() {
    const daysHeader = document.getElementById('timetableDaysHeader');
    const gridBody = document.getElementById('timetableGridBody');
    const weekDates = getWeekDates(state.currentMonday);

    const rangeLabel = document.getElementById('ttWeekRangeLabel');
    if (rangeLabel) {
      rangeLabel.textContent = `${weekDates[0].shortDate} – ${weekDates[weekDates.length - 1].shortDate}, ${state.currentMonday.getFullYear()}`;
    }

    if (daysHeader) {
      const todayStr = dateToStr(new Date());
      daysHeader.innerHTML = weekDates.map(w => {
        const isToday = w.dateStr === todayStr;
        return `
          <div class="py-2.5 px-2 border-r border-gray-200 last:border-r-0 ${isToday ? 'bg-amber-50/70 text-[#880000] font-bold' : 'text-gray-700 font-semibold'} text-xs">
            <span class="block">${w.dayName}</span>
            <span class="text-[11px] font-normal text-gray-500">${w.shortDate}</span>
          </div>`;
      }).join('');
    }

    const axisLabels = document.getElementById('timeAxisLabels');
    if (axisLabels) {
      axisLabels.innerHTML = '';
      for (let h = 7; h <= 21; h++) {
        const d = new Date();
        d.setHours(h, 0, 0, 0);
        const slotEl = document.createElement('div');
        slotEl.className = 'time-slot-label';
        slotEl.textContent = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        axisLabels.appendChild(slotEl);
      }
    }

    if (!gridBody) return;
    gridBody.innerHTML = '';
    if (!state.selectedRoom) return;

    const roomId = state.selectedRoom.id;

    weekDates.forEach(dayInfo => {
      const dayCol = document.createElement('div');
      dayCol.className = 'day-column';

      for (let i = 0; i < 14; i++) {
        const line = document.createElement('div');
        line.className = 'grid-hour-line';
        dayCol.appendChild(line);
      }

      // Blue classes repeat every week
      const dayClasses = state.schedules.filter(c =>
        c.roomId === roomId && String(c.day).toLowerCase() === dayInfo.dayName.toLowerCase());

      // Red / yellow reservations of this exact date
      const dayReservations = state.reservations.filter(r => r.roomId === roomId && r.date === dayInfo.dateStr);

      // Green gaps between everything that is taken
      const busy = [
        ...dayClasses.map(c => ({ start: c.startMinutes, end: c.endMinutes })),
        ...dayReservations.map(r => ({ start: r.startMinutes, end: r.endMinutes }))
      ].sort((a, b) => a.start - b.start);

      if (state.selectedRoom.active) {
        let cur = START_MINUTES;
        busy.forEach(b => {
          if (b.start > cur) dayCol.appendChild(createAvailableSlotCard(dayInfo.dayName, cur, b.start));
          cur = Math.max(cur, b.end);
        });
        if (cur < END_MINUTES) dayCol.appendChild(createAvailableSlotCard(dayInfo.dayName, cur, END_MINUTES));
      }

      // A reservation that sits on a class (the student's own class) is drawn beside it
      dayClasses.forEach(cls => {
        const shared = dayReservations.some(r => overlaps(r.startMinutes, r.endMinutes, cls.startMinutes, cls.endMinutes));
        dayCol.appendChild(createClassScheduleCard(cls, shared));
      });

      dayReservations.forEach(res => {
        const shared = dayClasses.some(c => overlaps(res.startMinutes, res.endMinutes, c.startMinutes, c.endMinutes));
        dayCol.appendChild(createReservationCard(res, shared));
      });

      gridBody.appendChild(dayCol);
    });
  }

  // ── Card builders ───────────────────────────────────────────────────────
  function createClassScheduleCard(cls, sharedWithReservation) {
    const card = document.createElement('div');
    card.className = 'schedule-card class-schedule';

    const height = Math.max(cls.endMinutes - cls.startMinutes - 4, 34);
    card.style.top = `${cls.startMinutes - START_MINUTES}px`;
    card.style.height = `${height}px`;
    if (sharedWithReservation) card.style.right = '50%';
    card.title = `Click to edit: ${cls.label} - ${cls.subject} (${cls.start} - ${cls.end})`;

    card.innerHTML = `
      <div class="card-top-bar"></div>
      <div class="card-title">${esc(cls.label)}: ${esc(cls.subject)}</div>
      <div class="card-time">${esc(cls.start)} – ${esc(cls.end)}</div>
      ${height > 75 ? `<div class="card-meta">Prof. ${esc(cls.faculty || 'Unassigned')}</div>` : ''}
      ${height > 110 && cls.code ? `<div class="card-meta text-[9px] font-semibold text-blue-900">${esc(cls.code)}</div>` : ''}
    `;

    card.addEventListener('click', () => openScheduleModalForEdit(cls));
    return card;
  }

  function createReservationCard(res, sharedWithClass) {
    const card = document.createElement('div');
    const isApproved = res.status === 'approved';
    card.className = `schedule-card ${isApproved ? 'occupied' : 'pending'}`;

    const height = Math.max(res.endMinutes - res.startMinutes - 4, 34);
    card.style.top = `${res.startMinutes - START_MINUTES}px`;
    card.style.height = `${height}px`;
    if (sharedWithClass) card.style.left = '50%';

    const title = isApproved ? (res.autoApproved ? '🟥 Auto-approved (own class)' : '🟥 Approved Reservation') : '🟨 Pending Approval';
    card.title = `${isApproved ? 'Approved' : 'Pending'}: ${res.subject} (${res.start} - ${res.end})`;

    card.innerHTML = `
      <div class="card-top-bar"></div>
      <div class="card-title">${title}</div>
      <div class="card-time">${esc(res.start)} – ${esc(res.end)}</div>
      ${height > 65 ? `<div class="card-meta font-semibold">${esc(res.subject || 'Student Reservation')}</div>` : ''}
      ${height > 95 ? `<div class="card-meta">By: ${esc(res.requester)}</div>` : ''}
      ${height > 120 && res.faculty ? `<div class="card-meta">Faculty: ${esc(res.faculty)}</div>` : ''}
    `;

    card.addEventListener('click', () => {
      if (!isApproved) highlightPendingRow(res.id);
      else showToast(`Reservation #${res.id}: ${res.subject} (${res.requester})`);
    });
    return card;
  }

  function createAvailableSlotCard(dayName, startMin, endMin) {
    const card = document.createElement('div');
    card.className = 'schedule-card available';

    const height = Math.max(endMin - startMin - 4, 26);
    card.style.top = `${startMin - START_MINUTES}px`;
    card.style.height = `${height}px`;

    const startStr = minutesToTime(startMin);
    const endStr = minutesToTime(endMin);
    card.title = `Available: ${startStr} – ${endStr}. Click to schedule a class here.`;

    card.innerHTML = `
      <div class="card-top-bar"></div>
      <div class="card-title text-emerald-800">Available</div>
      <div class="card-time text-emerald-700 font-semibold">${startStr} – ${endStr}</div>
      ${height > 70 ? '<div class="card-meta text-emerald-700 text-[10px]">+ Click to Schedule</div>' : ''}
    `;

    card.addEventListener('click', () => openScheduleModalForAdd(dayName, startStr, endStr));
    return card;
  }

  // ── Assigned weekly classes table ───────────────────────────────────────
  function renderClassSchedulesTable() {
    const tableBody = document.getElementById('classSchedulesTable');
    if (!tableBody) return;

    if (!state.selectedRoom) {
      tableBody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-gray-400">Select a room to see its classes.</td></tr>';
      return;
    }

    const roomClasses = state.schedules.filter(c => c.roomId === state.selectedRoom.id);

    if (roomClasses.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="py-8 text-center text-gray-400">
            <span class="text-2xl block mb-1">📚</span>
            No weekly recurring class schedules assigned to this room yet.<br />
            <button type="button" class="mt-2 text-xs font-bold text-[#880000] hover:underline" id="btnEmptyAddSchedule">
              + Assign First Class Schedule
            </button>
          </td>
        </tr>`;
      const btn = document.getElementById('btnEmptyAddSchedule');
      if (btn) btn.addEventListener('click', () => openScheduleModalForAdd());
      return;
    }

    const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    roomClasses.sort((a, b) => (dayOrder[a.day] || 99) - (dayOrder[b.day] || 99) || a.startMinutes - b.startMinutes);

    tableBody.innerHTML = roomClasses.map(cls => `
      <tr class="hover:bg-blue-50/50 transition">
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1.5 font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            <span class="w-2 h-2 rounded-full bg-blue-600"></span>
            ${esc(cls.label)}
          </span>
        </td>
        <td class="py-3 px-3">
          <div class="font-bold text-gray-900">${esc(cls.subject)}</div>
          ${cls.code ? `<div class="text-[10px] text-gray-500 font-mono">${esc(cls.code)}</div>` : ''}
        </td>
        <td class="py-3 px-3 font-semibold text-gray-800">${esc(cls.day)}</td>
        <td class="py-3 px-3 font-medium text-gray-700 whitespace-nowrap">${esc(cls.start)} – ${esc(cls.end)}</td>
        <td class="py-3 px-3 text-gray-800">${esc(cls.faculty || 'Unassigned')}</td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          <button type="button" class="btn-edit-sched text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1 rounded font-bold text-xs mr-1 transition" data-id="${cls.id}">Edit</button>
          <button type="button" class="btn-del-sched text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1 rounded font-bold text-xs transition" data-id="${cls.id}">Delete</button>
        </td>
      </tr>
    `).join('');

    tableBody.querySelectorAll('.btn-edit-sched').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = state.schedules.find(c => String(c.id) === btn.getAttribute('data-id'));
        if (item) openScheduleModalForEdit(item);
      });
    });
    tableBody.querySelectorAll('.btn-del-sched').forEach(btn => {
      btn.addEventListener('click', () => confirmDeleteSchedule(btn.getAttribute('data-id')));
    });
  }

  // ── Pending reservations table ──────────────────────────────────────────
  function renderPendingReservationsTable() {
    const tableBody = document.getElementById('pendingReservationsTable');
    if (!tableBody) return;

    if (state.pending.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-emerald-600">
            <span class="text-2xl block mb-1">🎉</span>
            All student reservation requests have been reviewed! No pending approvals.
          </td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = state.pending.map(res => `
      <tr id="row-pending-${res.id}" class="hover:bg-amber-50/60 transition">
        <td class="py-3 px-3 font-mono font-bold text-amber-900">#${esc(res.id)}</td>
        <td class="py-3 px-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-gray-100 text-gray-800 border border-gray-200">${esc(res.roomLabel)}</span>
        </td>
        <td class="py-3 px-3 font-semibold text-gray-900">${esc(res.requester)}</td>
        <td class="py-3 px-3 whitespace-nowrap">
          <div class="font-bold text-gray-800">${esc(prettyDate(res.date))}</div>
          <div class="text-[11px] text-gray-600">${esc(res.start)} – ${esc(res.end)}</div>
        </td>
        <td class="py-3 px-3 max-w-[200px]">
          <p class="font-medium text-gray-900 truncate" title="${esc(res.subject)}">${esc(res.subject || 'Room Reservation')}</p>
        </td>
        <td class="py-3 px-3 text-gray-700 whitespace-nowrap">${esc(res.faculty || 'Unassigned')}</td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          <button type="button" class="btn-approve-res px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-[6px] text-xs shadow-sm transition mr-1.5" data-id="${res.id}">✔ Approve (Red)</button>
          <button type="button" class="btn-decline-res px-2.5 py-1.5 text-red-600 hover:bg-red-50 border border-red-300 font-bold rounded-[6px] text-xs transition" data-id="${res.id}">✕ Decline</button>
        </td>
      </tr>
    `).join('');

    tableBody.querySelectorAll('.btn-approve-res').forEach(btn => {
      btn.addEventListener('click', () => handleDecision(btn.getAttribute('data-id'), true));
    });
    tableBody.querySelectorAll('.btn-decline-res').forEach(btn => {
      btn.addEventListener('click', () => handleDecision(btn.getAttribute('data-id'), false));
    });
  }

  function highlightPendingRow(resId) {
    const row = document.getElementById(`row-pending-${resId}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('bg-amber-200/80');
      setTimeout(() => row.classList.remove('bg-amber-200/80'), 2500);
    } else {
      showToast(`Reservation #${resId} is pending admin review in the table below.`);
    }
  }

  // ── Approve / decline (PATCH /api/reservations/{id}/decision) ───────────
  async function handleDecision(id, approve) {
    const res = state.pending.find(r => String(r.id) === String(id));
    if (!res) return;

    let reason;
    if (!approve) {
      reason = window.prompt(`Decline reservation #${res.id} (${res.subject})?\nOptional reason for the student:`, '');
      if (reason === null) return; // cancelled
    }

    try {
      await api.reservations.decide(res.id, approve, reason ? reason.trim() : undefined);
    } catch (err) {
      showToast(errorText(err), false);
      await refreshAll(); // the request may already have been decided
      return;
    }

    await refreshAll();
    showToast(approve
    ? `✔ Reservation #${res.id} approved.`
    : `Reservation #${res.id} declined.`);
  }

  // ── Add / edit class schedule modal ─────────────────────────────────────
  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  // Select the dropdown option that is the same program (BSIT == BS of Information Technology (BSIT))
  function selectProgram(program) {
    const sel = document.getElementById('schedProgram');
    if (!sel) return;
    const key = programKey(program);
    const match = [...sel.options].find(o => programKey(o.value) === key);
    if (match) { sel.value = match.value; return; }
    if (program) { // old data with an unknown program: keep it selectable
      const opt = document.createElement('option');
      opt.value = program;
      opt.textContent = program;
      sel.appendChild(opt);
      sel.value = program;
    }
  }

  function openScheduleModalForAdd(prefillDay = 'Tuesday', prefillStart = '08:00 AM', prefillEnd = '01:00 PM') {
    const modal = document.getElementById('scheduleModalOverlay');
    const form = document.getElementById('scheduleForm');
    if (!modal || !form) return;

    document.getElementById('scheduleModalTitle').textContent = 'Add Class Schedule (Blue)';
    document.getElementById('btnDeleteSchedule').classList.add('hidden');
    form.reset();
    setValue('editScheduleId', '');

    if (state.selectedRoom) setValue('schedRoom', String(state.selectedRoom.id));
    setValue('schedDay', prefillDay);
    setValue('schedStart', prefillStart);
    setValue('schedEnd', prefillEnd);

    validateScheduleTime();
    modal.hidden = false;
  }

  function openScheduleModalForEdit(cls) {
    const modal = document.getElementById('scheduleModalOverlay');
    if (!modal || !cls) return;

    document.getElementById('scheduleModalTitle').textContent = `Edit Class Schedule: ${cls.label}`;
    document.getElementById('btnDeleteSchedule').classList.remove('hidden');

    setValue('editScheduleId', String(cls.id));
    setValue('schedRoom', String(cls.roomId));
    selectProgram(cls.programCourse);
    setValue('schedYear', cls.year != null ? String(cls.year) : '1');
    setValue('schedSection', cls.section != null ? String(cls.section) : '1');
    setValue('schedDay', cls.day);
    setValue('schedStart', cls.start);
    setValue('schedEnd', cls.end);
    setValue('schedCode', cls.code);
    setValue('schedSubject', cls.subject);
    setValue('schedFaculty', cls.facultyId);

    validateScheduleTime();
    modal.hidden = false;
  }

  function closeScheduleModal() {
    const modal = document.getElementById('scheduleModalOverlay');
    if (modal) modal.hidden = true;
  }

  // Instant feedback only. The API and the database check everything again.
  function validateScheduleTime() {
    const alertBox = document.getElementById('schedAlertBox');
    const startSelect = document.getElementById('schedStart');
    const endSelect = document.getElementById('schedEnd');
    if (!alertBox || !startSelect || !endSelect) return true;

    const startM = timeToMinutes(startSelect.value);
    const endM = timeToMinutes(endSelect.value);

    if (endM <= startM) {
      alertBox.className = 'alert error p-2.5 rounded-[6px] text-xs border border-red-300 bg-red-50 text-red-700 font-medium';
      alertBox.textContent = '⚠️ Invalid Time: Class End Time must be later than Start Time.';
      return false;
    }

    const roomId = Number(document.getElementById('schedRoom')?.value);
    const day = document.getElementById('schedDay')?.value || 'Monday';
    const currentId = document.getElementById('editScheduleId')?.value;

    const conflict = state.schedules.find(c => {
      if (currentId && String(c.id) === String(currentId)) return false;
      if (c.roomId !== roomId) return false;
      if (String(c.day).toLowerCase() !== String(day).toLowerCase()) return false;
      return overlaps(startM, endM, c.startMinutes, c.endMinutes);
    });

    if (conflict) {
      alertBox.className = 'alert error p-2.5 rounded-[6px] text-xs border border-amber-300 bg-amber-50 text-amber-800 font-medium';
      alertBox.textContent = `⚠️ Schedule Conflict: ${conflict.label} (${conflict.subject}) already uses this room on ${conflict.day} from ${conflict.start} to ${conflict.end}.`;
      return false;
    }

    alertBox.className = 'alert ok p-2.5 rounded-[6px] text-xs border border-emerald-300 bg-emerald-50 text-emerald-800 font-medium';
    alertBox.textContent = '✔ Selected schedule time is clear and non-conflicting.';
    return true;
  }

  function setSaving(on) {
    state.saving = on;
    const btn = document.getElementById('btnSaveSchedule');
    if (btn) {
      btn.disabled = on;
      btn.classList.toggle('opacity-60', on);
      btn.textContent = on ? 'Saving…' : 'Save Class Schedule';
    }
  }

  // Saves the class. If an approved reservation already uses that room and time,
// the API answers 409 RESERVATION_OVERLAP and we ask the admin first.
async function saveSchedule(editId, payload) {
  const send = (body) => (editId ? api.schedules.update(editId, body) : api.schedules.create(body));

  try {
    return await send(payload);
  } catch (err) {
    if (err.status === 409 && err.errors && err.errors.code === 'RESERVATION_OVERLAP') {
      const list = (err.errors.reservations || []).map(r =>
        `• ${prettyDate(String(r.reservation_date).slice(0, 10))}, ` +
        `${minutesToTime(sqlTimeToMinutes(r.start_time))} – ${minutesToTime(sqlTimeToMinutes(r.end_time))} ` +
        `(${r.subject}, ${r.student_name})`
      ).join('\n');

      const ok = window.confirm(
        `There is currently an approved reservation in this room at this time:\n\n${list}\n\n` +
        'Are you sure you want to appoint this schedule?\n\n' +
        'OK = the schedule is saved and the reservation continues for that day as it is.\n' +
        'Cancel = the schedule is not saved.'
      );

      if (!ok) {
        const cancelled = new Error('Schedule not saved.');
        cancelled.cancelled = true;
        throw cancelled;
      }

      return send({ ...payload, confirm_reservation_overlap: true });
    }
    throw err;
  }
}

  async function handleSaveSchedule(e) {
    e.preventDefault();
    if (state.saving) return;

    if (!validateScheduleTime()) {
      showToast('Please resolve the schedule conflict or invalid time interval.', false);
      return;
    }

    const editId = document.getElementById('editScheduleId')?.value;
    const subject = document.getElementById('schedSubject')?.value.trim();

    if (!subject) {
      showToast('Subject Title is required.', false);
      return;
    }

    const payload = {
      room_id: Number(document.getElementById('schedRoom')?.value),
      day_of_week: document.getElementById('schedDay')?.value,
      start_time: toApiTime(document.getElementById('schedStart')?.value),
      end_time: toApiTime(document.getElementById('schedEnd')?.value),
      subject_title: subject,
      subject_code: document.getElementById('schedCode')?.value.trim() || null,
      program_course: document.getElementById('schedProgram')?.value,
      year_level: Number(document.getElementById('schedYear')?.value),
      section: Number(document.getElementById('schedSection')?.value),
      faculty_id: document.getElementById('schedFaculty')?.value || null
    };

    setSaving(true);
    let saved;
    try {
      saved = await saveSchedule(editId, payload);
    } catch (err) {
      setSaving(false);
      showToast(err.cancelled ? 'Schedule not saved.' : errorText(err), false);
      return;
    }
    setSaving(false);

    closeScheduleModal();
    await loadSchedules();

    // Saved into another room? Jump to it so the new class is visible.
    if (state.selectedRoom?.id !== payload.room_id) {
      const room = state.rooms.find(r => r.id === payload.room_id);
      if (room) {
        const floorFilter = document.getElementById('floorFilter');
        if (floorFilter && floorFilter.value !== 'all' && String(room.floor) !== floorFilter.value) {
          floorFilter.value = 'all';
          populateFloorAndRoomSelectors();
        }
        const selector = document.getElementById('roomSelector');
        if (selector) selector.value = String(room.id);
        await selectRoom(room);
      }
    } else {
      await loadWeekReservations().catch(() => {});
      renderAll();
    }

    const label = saved && saved.course_section ? saved.course_section : 'Class';
    showToast(editId ? `✔ Class schedule ${label} updated.` : `✔ Class schedule ${label} saved. It repeats every week until you delete it.`);
  }

  async function confirmDeleteSchedule(id) {
    const item = state.schedules.find(c => String(c.id) === String(id));
    if (!item) return;

    if (!window.confirm(`Delete the weekly class "${item.label} - ${item.subject}" on ${item.day}?\nIt will stop repeating every week.`)) {
      return;
    }

    try {
      await api.schedules.remove(item.id);
    } catch (err) {
      showToast(errorText(err), false);
      return;
    }

    closeScheduleModal();
    await refreshAll();
    showToast(`Class schedule ${item.label} deleted. The slot is Available again.`);
  }

  // ── Event listeners ─────────────────────────────────────────────────────
  function wireEvents() {
    const floorFilter = document.getElementById('floorFilter');
    if (floorFilter) floorFilter.addEventListener('change', populateFloorAndRoomSelectors);

    const roomSelector = document.getElementById('roomSelector');
    if (roomSelector) {
      roomSelector.addEventListener('change', () => {
        const room = state.rooms.find(r => String(r.id) === roomSelector.value);
        if (room) selectRoom(room);
      });
    }

    async function changeWeek(nextMonday) {
      state.currentMonday = nextMonday;
      try { await loadWeekReservations(); } catch (err) { showToast(errorText(err), false); }
      renderWeeklyTimetable();
      updateStats();
    }

    const prevBtn = document.getElementById('ttBtnPrevWeek');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      const d = new Date(state.currentMonday); d.setDate(d.getDate() - 7); changeWeek(d);
    });
    const nextBtn = document.getElementById('ttBtnNextWeek');
    if (nextBtn) nextBtn.addEventListener('click', () => {
      const d = new Date(state.currentMonday); d.setDate(d.getDate() + 7); changeWeek(d);
    });
    const thisWeekBtn = document.getElementById('ttBtnThisWeek');
    if (thisWeekBtn) thisWeekBtn.addEventListener('click', () => changeWeek(getMonday(new Date())));

    const btnOpenAdd = document.getElementById('btnOpenAddSchedule');
    if (btnOpenAdd) btnOpenAdd.addEventListener('click', () => openScheduleModalForAdd());
    const btnTableAdd = document.getElementById('btnTableAddSchedule');
    if (btnTableAdd) btnTableAdd.addEventListener('click', () => openScheduleModalForAdd());

    const btnCloseModal = document.getElementById('btnCloseScheduleModal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeScheduleModal);
    const btnCancel = document.getElementById('btnCancelSchedule');
    if (btnCancel) btnCancel.addEventListener('click', closeScheduleModal);

    const btnDelete = document.getElementById('btnDeleteSchedule');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        const editId = document.getElementById('editScheduleId')?.value;
        if (editId) confirmDeleteSchedule(editId);
      });
    }

    ['schedStart', 'schedEnd', 'schedDay', 'schedRoom'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', validateScheduleTime);
    });

    const schedForm = document.getElementById('scheduleForm');
    if (schedForm) schedForm.addEventListener('submit', handleSaveSchedule);

    const btnCloseToast = document.getElementById('btnCloseSmToast');
    if (btnCloseToast) {
      btnCloseToast.addEventListener('click', () => {
        const toast = document.getElementById('smToast');
        if (toast) {
          toast.classList.add('translate-y-12', 'opacity-0');
          toast.classList.remove('translate-y-0', 'opacity-100');
        }
      });
    }

    // Come back to the tab: pick up new requests and changes made elsewhere
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.selectedRoom) refreshAll();
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  async function init() {
    try {
      populateTimeDropdowns();
      populateClassSelects();

      const isAllowed = await guard();
      if (!isAllowed) return;

      wireEvents();

      await Promise.all([loadRooms(), loadFaculty(), loadSchedules(), loadPending()]);
      populateFloorAndRoomSelectors(); // selects a room, then loads that week's reservations
    } catch (err) {
      console.error('Schedule manager initialization error:', err);
      document.body.style.visibility = 'visible';
      showToast('Could not load the Schedule Manager: ' + errorText(err), false);
    }
  }

  if (client && client.auth) {
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') window.location.replace('login.html');
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