/**
 * PUP Canlalay Campus CRS - Admin Room Browser (add-on for dashboard.html)
 *
 * Replaces the "Campus Slot Matrix" on the ADMIN dashboard with the same room
 * directory + Today/Tomorrow timetable used in browse-rooms.html, and lets the
 * admin reserve a room that is APPROVED immediately (no approval step).
 *
 * - Loads only on dashboard.html (one <script> tag, after dashboard.js).
 * - Does nothing for Student / Faculty (the admin-only #active-bookings section
 *   never exists for them), and does not modify dashboard.js.
 * - Everything goes through the PHP API (window.api, see api.js): rooms, faculty,
 *   reservations and the booking itself (POST /api/admin/reservations, which calls
 *   admin_create_reservation() from database/admin_booking.sql and re-checks that
 *   the caller is an active admin). The browser checks below are only for instant feedback.
 * - Student requests stay "pending" (yellow) and are still approved/declined
 *   on all-reservations.html.
 */
(function () {
  'use strict';

  var client = (typeof supabaseClient !== 'undefined') ? supabaseClient
    : (window.supabaseClient ||
       ((window.supabase && window.supabase.createClient && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_PUBLISHABLE_KEY !== 'undefined')
         ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null));
window.supabaseClient = client;
  // ── Helpers ──────────────────────────────────────────────────────────────
  var DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var START_BOUNDARY = 7 * 60;   // 07:00 AM
  var END_BOUNDARY = 21 * 60;    // 09:00 PM

  function $(id) { return document.getElementById(id); }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function displayName(r) { return r.name || (r.number ? 'Room ' + r.number : 'Unnamed Room'); }

  function roomTypeLabel(v) {
    var map = { lecture: 'Lecture Room', laboratory: 'Laboratory', office: 'Office', 'stock room': 'Stock Room', other: 'Other' };
    return map[v] || v || 'Lecture Room';
  }

  function floorMeta(n) {
    if (!n) return { name: 'Unassigned', sub: 'No floor set' };
    var s = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    var suffix = s[(v - 20) % 10] || s[v] || s[0];
    return { name: n + suffix + ' Floor', sub: n === 1 ? 'Ground Level' : 'Level ' + n };
  }

  function timeToMinutes(t) {
    if (!t) return 0;
    var parts = t.trim().split(' ');
    if (parts.length < 2) return 0;
    var hm = parts[0].split(':').map(Number);
    var h = hm[0], m = hm[1] || 0;
    if (parts[1] === 'PM' && h !== 12) h += 12;
    if (parts[1] === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }

  function minutesToTime(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    var mod = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m) + ' ' + mod;
  }

  function sqlTimeToMinutes(t) {
    var p = String(t || '0:0').split(':').map(Number);
    return (p[0] || 0) * 60 + (p[1] || 0);
  }

  function toSqlTime(label) {
    var mins = timeToMinutes(label);
    return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0') + ':00';
  }

  function dateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getTodayString() { return dateStr(new Date()); }

  // Sunday is closed: schedules and reservations are Monday to Saturday only.
  function isSundayDate(ds) {
    return new Date(ds + 'T00:00:00').getDay() === 0;
  }

  function getTodayAndTomorrowDates() {
    var out = [], now = new Date();
    for (var i = 0; i < 2; i++) {
      var d = new Date(now);
      d.setDate(now.getDate() + i);
      var idx = d.getDay();
      out.push({
        dateStr: dateStr(d),
        dayName: DAY_NAMES[idx === 0 ? 6 : idx - 1],
        labelPrefix: i === 0 ? 'Today' : 'Tomorrow',
        closed: idx === 0, // Sunday: no schedules or reservations (Mon-Sat only)
        dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      });
    }
    return out;
  }

  // ── State ────────────────────────────────────────────────────────────────
  var state = {
    user: null,
    adminName: 'Admin',
    rooms: [],
    faculty: [],
    facultyMap: {},
    names: {},              // user_id -> full_name
    selectedRoom: null,
    reservations: [],       // for the room open in the timetable
    bk: { roomId: null, reservations: [] },   // for the room chosen in the booking form
    submitting: false,
    ready: false,
    overlaysReady: false,
    toastTimer: null
  };

  function toast(msg) {
    var t = $('admToast'), m = $('admToastMsg');
    if (!t || !m) return;
    m.textContent = msg;
    t.classList.remove('adm-toast-hide');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { t.classList.add('adm-toast-hide'); }, 4500);
  }

  // ── Styles (injected once) ───────────────────────────────────────────────
  function injectStyles() {
    if ($('admRoomsStyles')) return;
    var s = document.createElement('style');
    s.id = 'admRoomsStyles';
    s.textContent = [
      '.adm-room{display:inline-flex;align-items:center;gap:4px;padding:6px 10px;font-size:11px;font-weight:700;color:#374151;background:#fff;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;user-select:none;transition:all .15s ease}',
      '.adm-room:hover{transform:translateY(-1px);border-color:#880000;box-shadow:0 3px 10px rgba(136,0,0,.12)}',
      '.adm-room.selected{background:#fff8f8;border:2px solid #880000;color:#880000;font-weight:800;box-shadow:0 0 0 3px rgba(136,0,0,.18)}',
      '.adm-room:disabled{cursor:not-allowed;opacity:.55;background:#f1f5f9;border-color:#cbd5e1;transform:none;box-shadow:none}',
      '.adm-dot{width:8px;height:8px;border-radius:999px;background:#22c55e;display:inline-block}',
      '.adm-room:disabled .adm-dot{background:#ef4444}',
      '.adm-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;background:rgba(15,23,42,.65);backdrop-filter:blur(4px)}',
      '.adm-overlay[hidden]{display:none!important}',
      '.adm-tt-wrap{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow-x:auto}',
      '.adm-axis{width:76px;flex-shrink:0;border-right:1px solid #e2e8f0;background:#fff;position:sticky;left:0;z-index:25}',
      '.adm-time-label{height:60px;font-size:11px;font-weight:600;color:#64748b;text-align:right;padding-right:12px;box-sizing:border-box;transform:translateY(-8px)}',
      '.adm-day{position:relative;border-right:1px solid #e2e8f0;background:#fff}',
      '.adm-day:last-child{border-right:none}',
      '.adm-hour{height:60px;border-bottom:1px solid #f1f5f9;box-sizing:border-box}',
      '.adm-card{position:absolute;left:6px;right:6px;border-radius:8px;padding:8px 10px;box-sizing:border-box;z-index:10;display:flex;flex-direction:column;overflow:hidden;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}',
      '.adm-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:20}',
      '.adm-bar{height:6px;width:100%;border-radius:4px;margin-bottom:6px;flex-shrink:0}',
      '.adm-title{font-weight:800;font-size:12.5px;line-height:1.25;word-break:break-word}',
      '.adm-time{font-weight:700;font-size:11px;margin-top:4px}',
      '.adm-meta{font-size:10px;line-height:1.35;margin-top:4px;color:#4b5563}',
      '.adm-card.occupied{background:#fef2f2;border:2px solid #ef4444}.adm-card.occupied .adm-bar{background:#880000}.adm-card.occupied .adm-title{color:#880000}.adm-card.occupied .adm-time{color:#b91c1c}',
      '.adm-card.pending{background:#fffbeb;border:2px solid #f59e0b}.adm-card.pending .adm-bar{background:#f59e0b}.adm-card.pending .adm-title{color:#b45309}.adm-card.pending .adm-time{color:#d97706}',
      '.adm-card.available{background:#f0fdf4;border:1.5px dashed #22c55e;opacity:.88}.adm-card.available:hover{background:#dcfce7;border-style:solid;border-color:#16a34a;opacity:1}.adm-card.available .adm-bar{background:#22c55e}.adm-card.available .adm-title{color:#15803d}.adm-card.available .adm-time{color:#16a34a}',
      '.adm-alert{padding:10px;border-radius:6px;font-size:12px;font-weight:500;border:1px solid}',
      '.adm-alert.ok{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}',
      '.adm-alert.warn{background:#fffbeb;border-color:#fde68a;color:#92400e}',
      '.adm-alert.bad{background:#fef2f2;border-color:#fecaca;color:#991b1b}',
      '#admToast{transition:all .3s ease}',
      '#admToast.adm-toast-hide{opacity:0;transform:translateY(48px);pointer-events:none}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Overlays (timetable + booking modal + toast), created once ───────────
  function ensureOverlays() {
    if (state.overlaysReady) return;
    state.overlaysReady = true;

    var wrap = document.createElement('div');
    wrap.innerHTML = '' +
      '<div id="admTtOverlay" class="adm-overlay" style="z-index:70" hidden>' +
        '<div class="bg-white border border-gray-200 rounded-[20px] shadow-2xl w-full max-w-6xl flex flex-col overflow-hidden" style="max-height:92vh">' +
          '<div class="flex items-center justify-between px-6 py-4 bg-[#880000] text-white shrink-0">' +
            '<div><h3 id="admTtHeader" class="font-bold text-base leading-snug">Room Timetable</h3>' +
            '<p class="text-xs text-[#ffd658] font-medium">Every reservation for this room is shown. Click a green slot to book it as Admin.</p></div>' +
            '<button type="button" id="admTtClose" class="text-white hover:bg-white/20 rounded-lg transition text-lg w-8 h-8 font-bold" aria-label="Close timetable">&#10005;</button>' +
          '</div>' +
          '<div class="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">' +
            '<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-200">' +
              '<div>' +
                '<div class="flex items-center gap-2 mb-1">' +
                  '<span id="admTtFloor" class="text-[10px] font-bold uppercase tracking-wider text-[#880000] bg-red-50 px-2.5 py-0.5 rounded border border-red-200"></span>' +
                  '<span id="admTtType" class="text-[10px] font-bold text-gray-700 bg-gray-100 px-2.5 py-0.5 rounded border border-gray-200"></span>' +
                '</div>' +
                '<h2 id="admTtTitle" class="text-xl sm:text-2xl font-bold text-[#111111] leading-tight"></h2>' +
                '<p id="admTtMeta" class="text-xs text-gray-500 mt-0.5"></p>' +
              '</div>' +
              '<div class="flex flex-wrap items-center gap-3">' +
                '<div class="flex flex-wrap items-center gap-3 text-xs bg-gray-50 px-3 py-1.5 rounded-[8px] border border-gray-200">' +
                  '<span class="inline-flex items-center gap-1.5 font-bold text-gray-700"><span class="w-3 h-3 rounded-[3px] bg-[#dc2626]"></span>Approved (Red)</span>' +
                  '<span class="inline-flex items-center gap-1.5 font-bold text-gray-700"><span class="w-3 h-3 rounded-[3px] bg-[#f59e0b]"></span>Pending (Yellow)</span>' +
                  '<span class="inline-flex items-center gap-1.5 font-bold text-gray-700"><span class="w-3 h-3 rounded-[3px] bg-[#22c55e]"></span>Available (Green)</span>' +
                '</div>' +
                '<div class="flex items-center bg-red-50 px-3 py-1.5 border border-red-200 rounded-[8px]"><span id="admTtRange" class="text-xs font-bold text-[#880000] whitespace-nowrap"></span></div>' +
                '<button type="button" id="admTtReserve" class="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-[8px] bg-[#880000] hover:bg-[#5c0000] text-white shadow transition">+ Reserve a Time (Admin)</button>' +
              '</div>' +
            '</div>' +
            '<div class="adm-tt-wrap">' +
              '<div>' +
                '<div class="flex border-b border-gray-200 bg-gray-50/80">' +
                  '<div class="adm-axis p-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right bg-gray-50">Time</div>' +
                  '<div id="admTtDays" class="grid grid-cols-2 flex-grow text-center"></div>' +
                '</div>' +
                '<div class="flex relative" style="height:840px">' +
                  '<div id="admTtAxis" class="adm-axis"></div>' +
                  '<div id="admTtGrid" class="grid grid-cols-2 flex-grow relative"></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div id="admResOverlay" class="adm-overlay" style="z-index:80" hidden>' +
        '<div class="bg-white rounded-[12px] shadow-2xl w-full overflow-hidden" style="max-width:560px" role="dialog" aria-modal="true" aria-labelledby="admResTitle">' +
          '<div class="flex items-center justify-between p-4 bg-[#880000] text-white">' +
            '<div><h3 id="admResTitle" class="font-bold text-sm">Admin Booking</h3>' +
            '<p class="text-[11px] text-[#ffd658]">Booked by an admin: approved immediately, no approval needed</p></div>' +
            '<button type="button" id="admResClose" class="text-white hover:bg-white/20 p-1.5 rounded transition" aria-label="Close">&#10005;</button>' +
          '</div>' +
          '<form id="admResForm" novalidate class="p-6 space-y-4 text-xs">' +
            '<div><label for="admResRoom" class="block font-bold text-gray-700 mb-1">Room *</label>' +
              '<select id="admResRoom" required class="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-xs bg-white font-medium focus:outline-none focus:border-[#880000]"></select></div>' +
            '<div><label for="admResDate" class="block font-bold text-gray-700 mb-1">Reservation Date *</label>' +
              '<input type="date" id="admResDate" required class="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-xs bg-white font-medium focus:outline-none focus:border-[#880000]" /></div>' +
            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
              '<div><label for="admResStart" class="block font-bold text-gray-700 mb-1">Start (30-min interval) *</label>' +
                '<select id="admResStart" required class="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-xs bg-white font-medium focus:outline-none focus:border-[#880000]"></select></div>' +
              '<div><label for="admResEnd" class="block font-bold text-gray-700 mb-1">End *</label>' +
                '<select id="admResEnd" required class="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-xs bg-white font-medium focus:outline-none focus:border-[#880000]"></select></div>' +
            '</div>' +
            '<div><label for="admResFaculty" class="block font-bold text-gray-700 mb-1">Tagged Faculty Professor *</label>' +
              '<select id="admResFaculty" required class="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-xs bg-white font-medium focus:outline-none focus:border-[#880000]"></select></div>' +
            '<div><label for="admResSubject" class="block font-bold text-gray-700 mb-1">Subject Code &amp; Reservation Purpose *</label>' +
              '<input type="text" id="admResSubject" required placeholder="e.g. CS314 - OS Laboratory / Department Meeting" class="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-xs bg-white font-medium focus:outline-none focus:border-[#880000]" /></div>' +
            '<div id="admResAlert" class="adm-alert ok"></div>' +
            '<div class="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">' +
              '<button type="button" id="admResCancel" class="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-[4px]">Cancel</button>' +
              '<button type="submit" id="admResSubmit" class="px-5 py-2 text-xs font-bold bg-[#880000] hover:bg-[#5c0000] text-white rounded-[4px] shadow transition">Reserve &amp; Approve</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>' +

      '<div id="admToast" class="adm-toast-hide fixed bottom-5 right-5 bg-[#111111] text-white px-4 py-3 rounded-[6px] shadow-2xl border border-gray-700 text-xs max-w-sm" style="z-index:90">' +
        '<p id="admToastMsg" class="font-medium text-gray-100"></p></div>';

    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

    // time dropdowns (30-minute steps)
    var startSel = $('admResStart'), endSel = $('admResEnd');
    for (var m = START_BOUNDARY; m < END_BOUNDARY; m += 30) {
      startSel.appendChild(new Option(minutesToTime(m), minutesToTime(m)));
    }
    for (var e = START_BOUNDARY + 30; e <= END_BOUNDARY; e += 30) {
      endSel.appendChild(new Option(minutesToTime(e), minutesToTime(e)));
    }

    // events (wired once)
    $('admTtClose').addEventListener('click', closeTimetable);
    $('admTtOverlay').addEventListener('mousedown', function (ev) { if (ev.target === $('admTtOverlay')) closeTimetable(); });
    $('admTtReserve').addEventListener('click', function () {
      openBooking({ roomId: state.selectedRoom && state.selectedRoom.id, start: '08:00 AM', end: '10:00 AM', date: getTodayString() });
    });
    $('admResClose').addEventListener('click', closeBooking);
    $('admResCancel').addEventListener('click', closeBooking);
    $('admResOverlay').addEventListener('mousedown', function (ev) { if (ev.target === $('admResOverlay')) closeBooking(); });
    $('admResForm').addEventListener('submit', submitBooking);

    ['admResDate', 'admResStart', 'admResEnd', 'admResFaculty', 'admResSubject'].forEach(function (id) {
      $(id).addEventListener('input', validateBooking);
      $(id).addEventListener('change', validateBooking);
    });
    $('admResStart').addEventListener('change', function () {
      if (timeToMinutes($('admResEnd').value) <= timeToMinutes($('admResStart').value)) {
        $('admResEnd').value = minutesToTime(Math.min(timeToMinutes($('admResStart').value) + 60, END_BOUNDARY));
      }
      validateBooking();
    });
    $('admResRoom').addEventListener('change', async function () {
      await loadBookingReservations($('admResRoom').value);
      validateBooking();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!$('admResOverlay').hidden) closeBooking();
      else if (!$('admTtOverlay').hidden) closeTimetable();
    });
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  function roomById(id) {
    return state.rooms.find(function (r) { return String(r.id) === String(id); }) || null;
  }

  async function loadRooms() {
    var rows = await window.api.rooms.list();   // already ordered by floor, then room
    state.rooms = (rows || []).map(function (r) {
      return { id: r.room_id, number: r.room_number || '', name: r.room_name || '', floor: r.floor == null ? 0 : r.floor, roomType: r.room_type || 'other', active: r.is_active !== false };
    });
  }

  async function loadFaculty() {
    try {
      state.faculty = (await window.api.faculty.list()) || [];
    } catch (err) {
      console.error('Faculty list failed:', err);
      toast('Could not load the faculty list: ' + (err.message || err));
      return;
    }
    state.facultyMap = {};
    state.faculty.forEach(function (u) { state.facultyMap[u.user_id] = u.full_name; });
  }

  // Reservations of one room for today & tomorrow (pending + approved)
  async function fetchReservations(room) {
    var days = getTodayAndTomorrowDates();
    var from = days[0].dateStr, to = days[1].dateStr;

    var results = await Promise.all([
      window.api.reservations.list({ room_id: room.id, date_from: from, date_to: to, limit: 500 }),
      window.api.rooms.takenSlots(room.id, from, to).catch(function (err) { console.warn('Taken slots failed:', err); return []; })
    ]);

    // The API returns every status; the timetable shows pending + approved only
    var visible = (results[0] || []).filter(function (r) { return r.status === 'pending' || r.status === 'approved'; });
    var taken = results[1] || [];

    var detailed = visible.map(function (r) {
      var s = sqlTimeToMinutes(r.start_time), e = sqlTimeToMinutes(r.end_time);
      return {
        id: r.reservation_id, roomId: r.room_id, date: r.reservation_date,
        startMinutes: s, endMinutes: e, start: minutesToTime(s), end: minutesToTime(e),
        status: r.status, subject: r.subject,
        faculty: r.faculty_name || state.facultyMap[r.faculty_id] || 'Tagged faculty',
        requester: r.student_name || 'Student',
        adminBooking: !!(state.user && r.student_id === state.user.id),
        detail: true
      };
    });

    var known = {};
    detailed.forEach(function (r) { known[r.id] = true; });

    // Safety net: slots the list above did not return (times + status only)
    var timesOnly = taken.filter(function (t) { return !known[t.reservation_id]; }).map(function (t) {
      var s = sqlTimeToMinutes(t.start_time), e = sqlTimeToMinutes(t.end_time);
      return { id: t.reservation_id, roomId: room.id, date: t.reservation_date, startMinutes: s, endMinutes: e, start: minutesToTime(s), end: minutesToTime(e), status: t.status, detail: false };
    });

    return detailed.concat(timesOnly);
  }

  async function refreshTimetableData() {
    if (!state.selectedRoom) return;
    try { state.reservations = await fetchReservations(state.selectedRoom); }
    catch (e) { console.error('Load reservations failed:', e); state.reservations = []; toast('Could not load reservations: ' + (e.message || e)); }
  }

  async function loadBookingReservations(roomId) {
    var room = roomById(roomId);
    state.bk.roomId = roomId;
    state.bk.reservations = [];
    if (!room) return;
    try { state.bk.reservations = await fetchReservations(room); }
    catch (e) { console.error('Load reservations failed:', e); }
  }

  // ── Directory (inside the dashboard) ─────────────────────────────────────
  function browserSkeleton() {
    return '' +
      '<div id="admRoomBrowser" class="space-y-3">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div class="text-xs font-bold text-gray-700">Room Directory <span class="text-emerald-700 ml-2">Live</span></div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<select id="admFloorFilter" aria-label="Filter by floor" class="px-2.5 py-1.5 text-xs border border-gray-300 rounded-[3px] bg-white font-medium text-gray-700 focus:outline-none focus:border-[#880000]"><option value="all">All Floors</option></select>' +
            '<input type="text" id="admRoomSearch" placeholder="Search room or lab..." class="px-2.5 py-1.5 text-xs border border-gray-300 rounded-[3px] w-40 focus:outline-none focus:border-[#880000]" />' +
          '</div>' +
        '</div>' +
        '<div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">' +
          '<span class="inline-flex items-center gap-3">' +
            '<span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#22c55e]"></span>Active</span>' +
            '<span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#ef4444]"></span>Inactive</span>' +
          '</span>' +
          '<span id="admTotalRooms" class="font-bold bg-gray-100 border border-gray-200 rounded px-2 py-0.5">Total: 0 Rooms</span>' +
        '</div>' +
        '<p class="text-[11px] text-gray-500">Click a room to see every reservation on its timetable, or to reserve it as Admin (approved right away).</p>' +
        '<div id="admFloors" class="space-y-3"><div class="text-xs text-gray-500 p-4 text-center">Loading rooms...</div></div>' +
      '</div>';
  }

  function renderFloors() {
    var wrap = $('admFloors');
    if (!wrap) return;

    var floorFilter = ($('admFloorFilter') || {}).value || 'all';
    var search = (($('admRoomSearch') || {}).value || '').toLowerCase().trim();

    var list = state.rooms.filter(function (r) {
      var okFloor = floorFilter === 'all' || String(r.floor) === floorFilter;
      var okSearch = !search || displayName(r).toLowerCase().indexOf(search) > -1 ||
        String(r.number).toLowerCase().indexOf(search) > -1 || String(r.roomType).toLowerCase().indexOf(search) > -1;
      return okFloor && okSearch;
    });

    var total = $('admTotalRooms');
    if (total) total.textContent = 'Total: ' + list.length + ' Rooms';

    if (!list.length) {
      wrap.innerHTML = '<div class="p-6 text-center bg-gray-50 rounded-[4px] border border-gray-200 text-xs text-gray-500 font-semibold">No rooms match your filters.</div>';
      return;
    }

    var floors = list.map(function (r) { return r.floor; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });

    wrap.innerHTML = floors.map(function (n) {
      var meta = floorMeta(n);
      var rooms = list.filter(function (r) { return r.floor === n; });
      return '<div class="border border-gray-200 rounded-[4px] bg-white">' +
        '<div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-[4px]">' +
          '<div><strong class="text-xs text-gray-900">' + esc(meta.name) + '</strong> <small class="text-[10px] text-gray-500">' + esc(meta.sub) + ' (' + rooms.length + ' Rooms)</small></div>' +
          '<span class="text-[10px] font-bold text-[#880000] bg-red-50 border border-red-200 rounded px-1.5">L' + n + '</span>' +
        '</div>' +
        '<div class="p-3 flex flex-wrap gap-2">' +
        rooms.map(function (r) {
          var sel = state.selectedRoom && String(state.selectedRoom.id) === String(r.id);
          var tip = displayName(r) + '\nFloor: ' + meta.name + '\nType: ' + roomTypeLabel(r.roomType) + '\nStatus: ' + (r.active ? 'Active' : 'Inactive (cannot be reserved)');
          return '<button type="button" class="adm-room' + (sel ? ' selected' : '') + '" data-room-id="' + esc(r.id) + '"' + (r.active ? '' : ' disabled') + ' title="' + esc(tip) + '">' +
            '<span class="adm-dot"></span><span>' + esc(displayName(r)) + '</span></button>';
        }).join('') +
        '</div></div>';
    }).join('');
  }

  function fillFloorFilter() {
    var sel = $('admFloorFilter');
    if (!sel) return;
    var floors = state.rooms.map(function (r) { return r.floor; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    sel.innerHTML = '<option value="all">All Floors</option>' + floors.map(function (n) { return '<option value="' + n + '">' + esc(floorMeta(n).name) + '</option>'; }).join('');
  }

  // ── Timetable ────────────────────────────────────────────────────────────
  async function selectRoom(room) {
    if (!room || !room.active) return;
    state.selectedRoom = room;
    renderFloors();
    await refreshTimetableData();
    renderTimetable();
    $('admTtOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeTimetable() {
    $('admTtOverlay').hidden = true;
    if ($('admResOverlay').hidden) document.body.style.overflow = '';
  }

  // Approved always blocks. Pending never blocks (the admin booking wins and the
  // database rejects overlapping pending requests), so it is drawn on top of green.
  function isBlocking(item) { return item.status === 'approved'; }

  function frame(cls, top, height) {
    var c = document.createElement('div');
    c.className = 'adm-card ' + cls;
    c.style.top = top + 'px';
    c.style.height = height + 'px';
    return c;
  }

  function buildReservationCard(item, top, height) {
    var approved = item.status === 'approved';
    var card = frame(approved ? 'occupied' : 'pending', top, height);
    var title, meta, badge;

    if (item.detail) {
      title = item.subject || 'Room Reservation';
      meta = '<div>Faculty: ' + esc(item.faculty) + '</div><div class="text-gray-500 mt-0.5">Reserved by: ' + esc(item.requester) + '</div>';
      badge = approved ? (item.adminBooking ? 'Admin booking • Approved' : 'Approved / Occupied') : 'Pending approval';
    } else {
      title = approved ? 'Occupied' : 'In Process';
      meta = '<div>' + (approved ? 'Reserved' : 'Requested by a student') + '</div>';
      badge = approved ? 'Approved / Occupied' : 'In Process (Pending)';
    }

    var review = (!approved)
      ? '<a href="all-reservations.html" class="inline-block mt-1 text-[10px] font-bold text-[#337ab7] hover:underline">Review in All Reservations &rarr;</a>' : '';

    card.innerHTML =
      '<div class="adm-bar"></div>' +
      '<div class="adm-title">' + esc(title) + '</div>' +
      '<div class="adm-time">' + esc(item.start) + ' – ' + esc(item.end) + '</div>' +
      '<div class="adm-meta">' + meta +
        '<div class="mt-1"><span class="inline-block text-[9.5px] font-bold px-1.5 py-0.5 rounded ' + (approved ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800') + '">' + esc(badge) + '</span></div>' +
        review +
      '</div>';

    card.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      e.stopPropagation();
      toast(title + ' (' + item.start + ' – ' + item.end + ') • ' + badge);
    });
    return card;
  }

  function renderAvailableSlot(col, startMin, endMin, dStr) {
    var now = new Date();
    var cur = now.getHours() * 60 + now.getMinutes();
    if (dStr === getTodayString() && endMin <= cur) return;
    var effStart = startMin;
    if (dStr === getTodayString() && startMin < cur) effStart = Math.ceil(cur / 30) * 30;
    if (endMin - effStart < 30) return;

    var card = frame('available', effStart - START_BOUNDARY, (endMin - effStart) - 4);
    var s = minutesToTime(effStart), e = minutesToTime(endMin);
    card.innerHTML =
      '<div class="adm-bar"></div>' +
      '<div class="adm-title flex items-center justify-between"><span>Available Time</span><span class="text-[10px] font-bold px-1.5 bg-emerald-100 text-emerald-800 rounded">Open</span></div>' +
      '<div class="adm-time">' + s + ' – ' + e + '</div>' +
      '<div class="adm-meta"><div>Click to reserve this slot as Admin</div><div class="text-[10px] font-semibold text-emerald-700 mt-1">+ Reserve Slot</div></div>';
    card.addEventListener('click', function () {
      openBooking({ roomId: state.selectedRoom.id, start: s, end: minutesToTime(Math.min(effStart + 60, endMin)), date: dStr });
    });
    col.appendChild(card);
  }

  function renderTimetable() {
    var r = state.selectedRoom;
    if (!r) return;
    var fm = floorMeta(r.floor);
    var days = getTodayAndTomorrowDates();

    $('admTtHeader').textContent = displayName(r) + ' — Timetable & Reservations';
    $('admTtFloor').textContent = fm.name;
    $('admTtType').textContent = roomTypeLabel(r.roomType);
    $('admTtTitle').textContent = displayName(r);
    $('admTtMeta').textContent = fm.name + ' (' + fm.sub + ') • ' + roomTypeLabel(r.roomType);
    $('admTtRange').textContent = 'Schedule: Today • ' + days[0].dateLabel + ' & Tomorrow • ' + days[1].dateLabel;

    $('admTtDays').innerHTML = days.map(function (d, i) {
      return '<div class="p-3 ' + (i === 0 ? 'border-r border-gray-200 ' : '') + (d.closed ? 'bg-gray-100' : 'bg-red-50/50') + '">' +
        '<div class="font-extrabold text-xs uppercase tracking-wider ' + (d.closed ? 'text-gray-400' : 'text-[#880000]') + '">' + d.labelPrefix + ' (' + d.dayName + ')' + (d.closed ? ' • Closed' : '') + '</div>' +
        '<div class="text-[11px] ' + (d.closed ? 'text-gray-400' : 'text-gray-600') + ' font-bold mt-0.5">' + d.dateLabel + '</div></div>';
    }).join('');

    var axis = '';
    for (var h = 7; h <= 21; h++) axis += '<div class="adm-time-label">' + minutesToTime(h * 60) + '</div>';
    $('admTtAxis').innerHTML = axis;

    var grid = $('admTtGrid');
    grid.innerHTML = '';

    days.forEach(function (d) {
      var col = document.createElement('div');
      col.className = 'adm-day';
      var lines = '';
      for (var h2 = 7; h2 < 21; h2++) lines += '<div class="adm-hour"></div>';
      col.innerHTML = lines;

      // Sunday is closed: gray out the whole column, no slots, nothing clickable
      if (d.closed) {
        col.insertAdjacentHTML('beforeend',
          '<div style="position:absolute;inset:0;z-index:5;pointer-events:none;display:flex;justify-content:center;padding-top:28px;background:repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6 10px,#e5e7eb 10px,#e5e7eb 20px);">' +
          '<span style="height:fit-content;background:#fff;border:1px solid #d1d5db;color:#6b7280;font-weight:800;font-size:11px;letter-spacing:.05em;text-transform:uppercase;padding:6px 12px;border-radius:6px;">Closed – Sunday</span></div>');
        grid.appendChild(col);
        return;
      }

      var events = state.reservations
        .filter(function (b) { return String(b.roomId) === String(r.id) && b.date === d.dateStr; })
        .sort(function (a, b) { return a.startMinutes - b.startMinutes; });

      if (r.active) {
        var pointer = START_BOUNDARY;
        events.filter(isBlocking).forEach(function (it) {
          if (it.startMinutes > pointer) renderAvailableSlot(col, pointer, it.startMinutes, d.dateStr);
          pointer = Math.max(pointer, it.endMinutes);
        });
        if (pointer < END_BOUNDARY) renderAvailableSlot(col, pointer, END_BOUNDARY, d.dateStr);
      }

      events.forEach(function (it) {
        var vs = Math.max(it.startMinutes, START_BOUNDARY), ve = Math.min(it.endMinutes, END_BOUNDARY);
        if (ve <= vs) return;
        col.appendChild(buildReservationCard(it, vs - START_BOUNDARY, Math.max((ve - vs) - 4, 38)));
      });

      grid.appendChild(col);
    });
  }

  // ── Admin booking (auto-approved) ────────────────────────────────────────
  async function openBooking(opts) {
    opts = opts || {};
    ensureOverlays();
    var active = state.rooms.filter(function (r) { return r.active; });
    if (!active.length) { toast('Rooms are still loading or none are active.'); return; }

    var roomSel = $('admResRoom');
    roomSel.innerHTML = active.map(function (r) {
      return '<option value="' + esc(r.id) + '">' + esc(displayName(r)) + ' (' + esc(floorMeta(r.floor).name) + ')</option>';
    }).join('');

    var room = (opts.roomId != null && roomById(opts.roomId) && roomById(opts.roomId).active)
      ? roomById(opts.roomId)
      : (state.selectedRoom && state.selectedRoom.active ? state.selectedRoom : active[0]);
    roomSel.value = String(room.id);

    // Only open days (Mon-Sat) can be picked: on Saturday that is today only,
    // on Sunday it is tomorrow (Monday) only.
    var bookable = getTodayAndTomorrowDates().filter(function (d) { return !d.closed; });
    var dateInput = $('admResDate');
    dateInput.min = bookable[0].dateStr;
    dateInput.max = bookable[bookable.length - 1].dateStr;
    dateInput.value = (opts.date && !isSundayDate(opts.date)) ? opts.date : bookable[0].dateStr;

    var startSel = $('admResStart'), endSel = $('admResEnd');
    startSel.value = (opts.start && Array.prototype.some.call(startSel.options, function (o) { return o.value === opts.start; })) ? opts.start : '08:00 AM';
    endSel.value = (opts.end && Array.prototype.some.call(endSel.options, function (o) { return o.value === opts.end; }))
      ? opts.end : minutesToTime(Math.min(timeToMinutes(startSel.value) + 60, END_BOUNDARY));

    $('admResFaculty').innerHTML = '<option value="" disabled selected>-- Select Faculty Professor --</option>' +
      state.faculty.map(function (u) { return '<option value="' + esc(u.user_id) + '">' + esc(u.full_name) + '</option>'; }).join('');
    if (!state.faculty.length) $('admResFaculty').innerHTML += '<option value="" disabled>No active faculty available yet</option>';

    $('admResSubject').value = '';
    $('admResTitle').textContent = 'Admin Booking - ' + displayName(room);

    $('admResOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
    await loadBookingReservations(String(room.id));
    validateBooking();
    $('admResSubject').focus();
  }

  function closeBooking() {
    $('admResOverlay').hidden = true;
    if ($('admTtOverlay').hidden) document.body.style.overflow = '';
  }

  // Instant feedback only; the database function checks everything again.
  function validateBooking() {
    var box = $('admResAlert'), btn = $('admResSubmit');
    if (!box) return false;

    var room = roomById($('admResRoom').value);
    var dateVal = $('admResDate').value;
    var sMin = timeToMinutes($('admResStart').value);
    var eMin = timeToMinutes($('admResEnd').value);
    var days = getTodayAndTomorrowDates();
    var now = new Date();
    var cur = now.getHours() * 60 + now.getMinutes();

    var type = 'ok', msg = 'Selected slot is clear. It will be approved immediately.', valid = true;

    if (!room || !room.active) { type = 'bad'; msg = 'Please choose an active room.'; valid = false; }
    else if (!dateVal) { type = 'bad'; msg = 'Reservation date is required.'; valid = false; }
    else if (dateVal < days[0].dateStr) { type = 'bad'; msg = 'You cannot reserve a past date.'; valid = false; }
    else if (isSundayDate(dateVal)) { type = 'bad'; msg = 'Sunday is closed. Reservations are only allowed from Monday to Saturday.'; valid = false; }
    else if (dateVal > days[1].dateStr) { type = 'bad'; msg = 'Reservations are only allowed for today and tomorrow.'; valid = false; }
    else if (dateVal === days[0].dateStr && sMin < cur) { type = 'bad'; msg = 'The selected start time has already passed for today.'; valid = false; }
    else if (eMin <= sMin) { type = 'bad'; msg = 'End time must be later than start time.'; valid = false; }
    else {
      var overlap = state.bk.reservations.filter(function (b) {
        return String(b.roomId) === String(room.id) && b.date === dateVal && b.startMinutes < eMin && b.endMinutes > sMin;
      });
      var approved = overlap.filter(function (b) { return b.status === 'approved'; })[0];
      var pend = overlap.filter(function (b) { return b.status === 'pending'; });
      if (approved) { type = 'bad'; msg = 'This time overlaps an approved reservation (' + approved.start + ' – ' + approved.end + ').'; valid = false; }
      else if (pend.length) { type = 'warn'; msg = pend.length + ' pending student request(s) overlap this time. They will be automatically rejected when you reserve it.'; }
    }

    box.className = 'adm-alert ' + type;
    box.textContent = (type === 'ok' ? '✔ ' : type === 'warn' ? '⚠ ' : '✖ ') + msg;
    btn.disabled = !valid || state.submitting;
    btn.classList.toggle('opacity-50', btn.disabled);
    btn.classList.toggle('cursor-not-allowed', btn.disabled);
    return valid;
  }

  async function submitBooking(e) {
    e.preventDefault();
    if (state.submitting) return;

    var room = roomById($('admResRoom').value);
    var p = {
      date: $('admResDate').value,
      start: $('admResStart').value,
      end: $('admResEnd').value,
      faculty: $('admResFaculty').value,
      subject: $('admResSubject').value.trim()
    };
    if (!room || !p.date || !p.start || !p.end || !p.faculty || !p.subject) { toast('Please complete all required fields.'); return; }
    if (!validateBooking()) { toast('Cannot submit: please resolve the highlighted problem.'); return; }

    state.submitting = true;
    validateBooking();

    var outcome = null;
    try {
      outcome = await window.api.admin.createReservation({
        room_id: room.id,
        faculty_id: p.faculty,
        subject: p.subject.slice(0, 150),
        reservation_date: p.date,
        start_time: toSqlTime(p.start),
        end_time: toSqlTime(p.end)
      });
    } catch (err) {
      state.submitting = false;
      console.error('Admin booking failed:', err);
      toast(err.message || 'Could not create the reservation.');
      validateBooking();
      return;
    }

    state.submitting = false;

    closeBooking();
    if (state.selectedRoom && String(state.selectedRoom.id) === String(room.id) && !$('admTtOverlay').hidden) {
      await refreshTimetableData();
      renderTimetable();
    }
    var rejected = outcome && outcome.auto_rejected_competing_count ? outcome.auto_rejected_competing_count : 0;
    toast('Reserved and approved: ' + displayName(room) + ', ' + p.start + ' – ' + p.end + '.' +
      (rejected ? ' ' + rejected + ' overlapping pending request(s) were declined automatically.' : ''));
  }

  // ── Mount into the admin dashboard ───────────────────────────────────────
  async function initBrowser() {
    var box = $('admFloors');
    if (!client || !client.auth) { if (box) box.innerHTML = '<div class="text-xs text-red-600 p-4">Supabase is not available on this page.</div>'; return; }

    try {
      var sess = await client.auth.getSession();
      if (!sess.data || !sess.data.session) return;
      state.user = sess.data.session.user;

      if (!window.api) throw new Error('The API client (api.js) is not loaded.');

      ensureOverlays();
      await Promise.all([loadRooms(), loadFaculty()]);
      state.ready = true;

      fillFloorFilter();
      renderFloors();

      var fl = $('admFloorFilter'), se = $('admRoomSearch'), wrap = $('admFloors');
      if (fl) fl.addEventListener('change', renderFloors);
      if (se) se.addEventListener('input', renderFloors);
      if (wrap) wrap.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-room-id]');
        if (!b || b.disabled) return;
        selectRoom(roomById(b.getAttribute('data-room-id')));
      });
    } catch (err) {
      console.error('Admin room browser failed:', err);
      var b2 = $('admFloors');
      if (b2) b2.innerHTML = '<div class="text-xs text-red-600 p-4">Could not load rooms: ' + esc(err.message || err) + '</div>';
    }
  }

  function mount() {
    var section = $('active-bookings');          // exists only in the ADMIN view
    if (!section || section.dataset.admMounted === '1') return;
    section.dataset.admMounted = '1';
    injectStyles();

    var cell = section.querySelector('.schedule-grid-cell');
    var col = cell ? cell.closest('div[class~="lg:col-span-5"]') : null;

    if (col) {
      var next = col.nextElementSibling;
      col.className = 'lg:col-span-7 min-w-0';
      if (next && /lg:col-span-7/.test(next.className)) next.className = next.className.replace('lg:col-span-7', 'lg:col-span-5');
    } else {
      col = document.createElement('div');
      col.className = 'lg:col-span-12 min-w-0';
      var g = section.querySelector('.grid');
      if (g) g.insertBefore(col, g.firstChild); else section.appendChild(col);
    }
    col.innerHTML = browserSkeleton();

    var sub = section.querySelector('h3 + p');
    if (sub) sub.textContent = 'Browse rooms, view every reservation on the timetable, and book a room as Admin (approved immediately)';

    initBrowser();
  }

  // "+ Admin Booking" (header button) now opens the real booking form for admins.
  // Students and faculty are unaffected: the wrapper falls through to the original.
  var originalOpen = window.openReservationModal;
  window.openReservationModal = function () {
    if (state.ready && $('admRoomBrowser')) { openBooking({}); return; }
    if (typeof originalOpen === 'function') return originalOpen.apply(this, arguments);
  };

  // dashboard.js builds the page after sign-in checks, and rebuilds it on some actions
  function start() {
    var root = $('dashboardRoot');
    if (!root) return;
    new MutationObserver(mount).observe(root, { childList: true, subtree: true });
    mount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();