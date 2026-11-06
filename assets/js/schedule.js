/**
 * PUP Canlalay Campus CRS - Faculty Schedule Controller
 * Connected to Supabase (room_schedules, room_reservations, rooms, users,
 * get_my_tagged_reservations()).
 */

(() => {
  'use strict';

  // ── Supabase Client Resolution ──────────────────────────────────────────
  const client = (typeof window !== 'undefined' && window.supabaseClient)
    ? window.supabaseClient
    : ((typeof window !== 'undefined' && window.supabase && window.supabase.createClient)
        ? window.supabase.createClient(
            (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://fyoxzdfxlosxlonxckqv.supabase.co'),
            (typeof SUPABASE_PUBLISHABLE_KEY !== 'undefined' ? SUPABASE_PUBLISHABLE_KEY : 'sb_publishable_hdwDHmIKSBnFijVSlqB4lA_pC4qwI4t')
          )
        : null);

  // ── Global State ────────────────────────────────────────────────────────
  const state = {
    user: null,
    profile: null,
    role: 'Faculty',
    schedules: [],
    activeFilter: 'all',
    searchQuery: '',
    toastTimer: null,
    loading: false
  };

  function normalizeRole(raw) {
    if (!raw) return 'Faculty';
    const r = String(raw).trim().toLowerCase();
    if (r === 'admin' || r === 'super admin' || r === 'superadmin') return 'Admin';
    if (r === 'faculty') return 'Faculty';
    return 'Student';
  }

  function initials(name) {
    return (String(name || '').replace(/[^A-Za-z\s,]/g, '').split(/[\s,]+/).filter(Boolean)
      .slice(0, 2).map(w => w[0].toUpperCase()).join('')) || 'PU';
  }

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
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
    }, 4000);
  }

  // ── Time, Date & Program Formatting Helpers ─────────────────────────────
  function formatTime(t) {
    if (!t) return '';
    const [hh, mm] = String(t).split(':');
    let h = parseInt(hh, 10);
    if (isNaN(h)) return String(t);
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return String(h).padStart(2, '0') + ':' + (mm || '00') + ' ' + suffix;
  }

  function formatRefId(num) {
    return 'RES-' + String(num).padStart(4, '0');
  }

  // Today's date as YYYY-MM-DD in Manila time (not UTC)
  function getTodayYMD() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  }

  // Today's weekday name in Manila time, e.g. "Friday"
  function getTodayDayName() {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Manila' });
  }

  // '2026-10-23' -> 'Fri, Oct 23, 2026'
  function formatDateLabel(ymd) {
    if (!ymd) return 'Scheduled';
    return new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  /**
   * Format Program, Year Level, and Section
   * e.g., "BS of Information Technology (BSIT)", 1, 1 -> "BSIT 1-1"
   */
  function formatStudentSection(user) {
    if (!user) return 'Student Request';

    let programCode = user.program_course || '';
    const match = programCode.match(/\(([^)]+)\)/);
    if (match) {
      programCode = match[1];
    }

    if (user.year_level && user.section) {
      return `${programCode} ${user.year_level}-${user.section}`.trim();
    } else if (programCode) {
      return programCode;
    }

    return 'Student Request';
  }

  // True if the item belongs to "today" (used by the Today tab and the stats card)
  function isToday(s) {
    if (s.itemType === 'class') {
      return String(s.day || '').toLowerCase() === getTodayDayName().toLowerCase();
    }
    return s.itemType === 'reservation' && s.status === 'approved' && s.dateStr === getTodayYMD();
  }

  // ── Auth Guard & Header Nav ─────────────────────────────────────────────
  async function guard() {
    if (!client || !client.auth) {
      window.location.replace('login.html');
      return false;
    }

    let sessionUser = null;
    let userProfile = null;

    try {
      const { data: { session }, error } = await client.auth.getSession();
      if (!error && session && session.user) {
        sessionUser = session.user;

        const { data: profile } = await client
          .from('users')
          .select('user_id, full_name, role, account_status')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (profile && String(profile.account_status).toLowerCase() === 'active') {
          userProfile = profile;
        }
      }
    } catch (err) {
      console.warn('Supabase session check error:', err);
    }

    // No valid session or inactive account -> back to login
    if (!sessionUser || !userProfile) {
      window.location.replace('login.html');
      return false;
    }

    // This page is for faculty only
    if (normalizeRole(userProfile.role) !== 'Faculty') {
      window.location.replace('dashboard.html');
      return false;
    }

    state.user = sessionUser;
    state.profile = userProfile;
    state.role = normalizeRole(userProfile.role);

    initProfileUI();
    renderNavbar(state.role);
    document.body.style.visibility = 'visible';
    return true;
  }

  function initProfileUI() {
    const name = state.profile?.full_name || 'Faculty Member';
    const email = state.user?.email || 'faculty@pup.edu.ph';

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
        if (client && client.auth) {
          try { await client.auth.signOut(); } catch (e) {}
        }
        localStorage.removeItem('user_role');
        localStorage.removeItem('pup_user');
        localStorage.removeItem('demoRole');
        window.location.replace('login.html');
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
        <a href="browse-rooms.html" class="pup-nav-item">Browse Rooms</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="all-reservations.html" class="pup-nav-item">All Reservations</a>
      `;
    } else {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-item">Dashboard</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item">Browse Rooms</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="schedule.html" class="pup-nav-item active">Schedule</a>
      `;
    }
  }

  // ── Load Data From Supabase ─────────────────────────────────────────────
  async function loadSchedule() {
    if (!client || !state.user) return;

    state.loading = true;
    renderTable();

    try {
      // 1) Fetch Rooms map
      const roomMap = {};
      const { data: rooms } = await client.from('rooms').select('room_id, room_number, room_name');
      (rooms || []).forEach(r => { roomMap[r.room_id] = r; });

      // 2) Fetch Regular Class Schedules for this faculty
      //    (if the room_schedules table does not exist yet, this is simply skipped)
      let classItems = [];
      const { data: classes, error: classErr } = await client
        .from('room_schedules')
        .select('schedule_id, room_id, day_of_week, start_time, end_time, subject_code, course_section')
        .eq('faculty_id', state.user.id);

      if (!classErr && classes) {
        classItems = classes.map(c => {
          const room = roomMap[c.room_id] || {};
          return {
            id: 'SCH-' + String(c.schedule_id).padStart(4, '0'),
            dbId: c.schedule_id,
            itemType: 'class',
            roomId: room.room_number || String(c.room_id),
            roomName: room.room_name || ('Room ' + (room.room_number || c.room_id)),
            day: c.day_of_week,
            dateStr: 'Weekly (' + c.day_of_week + ')',
            dateLabel: 'Weekly (' + c.day_of_week + ')',
            start: formatTime(c.start_time),
            end: formatTime(c.end_time),
            subject: c.subject_code,
            section: c.course_section || 'N/A',
            requesterName: 'Administration',
            requesterDetails: 'Regular Class Schedule',
            status: 'active',
            remarks: ''
          };
        });
      }

      // 3) Fetch Student Reservations that tag this faculty.
      //    Done through a database function so student names can be read safely.
      let reservationItems = [];
      const { data: resData, error: resErr } = await client.rpc('get_my_tagged_reservations');

      if (resErr) {
        console.error('Could not load tagged reservations:', resErr);
        showToast('Could not load tagged reservations. Please refresh.');
      } else {
        reservationItems = (resData || []).map(r => {
          const room = roomMap[r.room_id] || {};
          return {
            id: formatRefId(r.reservation_id),
            dbId: r.reservation_id,
            itemType: 'reservation',
            roomId: room.room_number || String(r.room_id),
            roomName: room.room_name || ('Room ' + (room.room_number || r.room_id)),
            day: '',
            dateStr: r.reservation_date,
            dateLabel: formatDateLabel(r.reservation_date),
            start: formatTime(r.start_time),
            end: formatTime(r.end_time),
            subject: r.subject,
            section: 'Student Request',
            requesterName: r.student_name || 'Student',
            requesterDetails: formatStudentSection(r),
            status: String(r.status || '').toLowerCase(),
            remarks: r.admin_remarks || ''
          };
        });
      }

      state.schedules = [...classItems, ...reservationItems];
    } catch (err) {
      console.error('Failed to load faculty schedule:', err);
      state.schedules = [];
      showToast('Could not load schedule data. Please refresh.');
    } finally {
      state.loading = false;
      renderStats();
      renderTable();
    }
  }

  // ── Render Stats Counters ────────────────────────────────────────────────
  function renderStats() {
    const totalEl = document.getElementById('statTotalCount');
    const todayEl = document.getElementById('statTodayCount');
    const taggedEl = document.getElementById('statTaggedCount');
    const apprEl = document.getElementById('statApprovedCount');

    const total = state.schedules.length;
    const todayCount = state.schedules.filter(isToday).length;
    const taggedCount = state.schedules.filter(s => s.itemType === 'reservation').length;
    const approvedCount = state.schedules.filter(s => s.itemType === 'reservation' && s.status === 'approved').length;

    if (totalEl) totalEl.textContent = total;
    if (todayEl) todayEl.textContent = todayCount;
    if (taggedEl) taggedEl.textContent = taggedCount;
    if (apprEl) apprEl.textContent = approvedCount;
  }

  // ── Status Badge ────────────────────────────────────────────────────────
  function buildStatusBadge(s) {
    const base = 'px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1';

    if (s.itemType === 'class') {
      return `<span class="status-badge-class ${base}"><span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Class Schedule</span>`;
    }
    if (s.status === 'approved') {
      return `<span class="status-badge-approved ${base}"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Approved</span>`;
    }
    if (s.status === 'pending') {
      return `<span class="status-badge-pending ${base}"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Pending</span>`;
    }
    if (s.status === 'rejected') {
      return `<span class="status-badge-rejected ${base}"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Rejected</span>`;
    }
    // cancelled (styled inline so no extra CSS is needed in schedule.html)
    return `<span class="bg-slate-100 text-slate-600 border border-slate-200 ${base}"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Cancelled</span>`;
  }

  // ── Render Schedule Table ───────────────────────────────────────────────
  function renderTable() {
    const tbody = document.getElementById('scheduleTableBody');
    const emptyState = document.getElementById('emptyState');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (state.loading && state.schedules.length === 0) {
      emptyState?.classList.add('hidden');
      tbody.innerHTML = '<tr><td colspan="7" class="py-10 text-center text-gray-500 font-medium">Loading your schedule...</td></tr>';
      return;
    }

    const query = state.searchQuery.toLowerCase().trim();
    const filter = state.activeFilter;

    const filtered = state.schedules.filter(s => {
      // Type Filter
      if (filter === 'class' && s.itemType !== 'class') return false;
      if (filter === 'reservation' && s.itemType !== 'reservation') return false;
      if (filter === 'today' && !isToday(s)) return false;

      // Search Filter
      if (query) {
        const matchesRef = String(s.id || '').toLowerCase().includes(query);
        const matchesRoom = String(s.roomName || s.roomId || '').toLowerCase().includes(query);
        const matchesSubj = String(s.subject || '').toLowerCase().includes(query);
        const matchesSec = String(s.section || '').toLowerCase().includes(query);
        const matchesReqName = String(s.requesterName || '').toLowerCase().includes(query);
        const matchesReqDetails = String(s.requesterDetails || '').toLowerCase().includes(query);
        return matchesRef || matchesRoom || matchesSubj || matchesSec || matchesReqName || matchesReqDetails;
      }

      return true;
    });

    if (filtered.length === 0) {
      emptyState?.classList.remove('hidden');
      return;
    } else {
      emptyState?.classList.add('hidden');
    }

    filtered.forEach(s => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50/80 transition';

      tr.innerHTML = `
        <td class="py-4 px-4 sm:px-6 font-extrabold text-[#880000]">${esc(s.id)}</td>
        <td class="py-4 px-4">
          <div class="font-bold text-gray-900">${esc(s.roomName)}</div>
          <div class="text-[11px] text-gray-500">Room: ${esc(s.roomId)}</div>
        </td>
        <td class="py-4 px-4">
          <div class="font-semibold text-gray-900">${esc(s.dateLabel)}</div>
          <div class="text-[11px] text-gray-500 font-medium">${esc(s.start)} – ${esc(s.end)}</div>
        </td>
        <td class="py-4 px-4 max-w-xs">
          <div class="font-bold text-gray-900 truncate">${esc(s.subject || 'N/A')}</div>
          <div class="text-[11px] text-gray-500 font-medium">Section: ${esc(s.section)}</div>
        </td>
        <td class="py-4 px-4 font-medium text-gray-800">
          <div class="font-bold text-gray-900">${esc(s.requesterName)}</div>
          <div class="text-[11px] text-gray-500 font-medium">${esc(s.requesterDetails)}</div>
        </td>
        <td class="py-4 px-4">${buildStatusBadge(s)}</td>
        <td class="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
          <button type="button" class="btn-view-details px-2.5 py-1 text-[11px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-[5px] transition" data-id="${esc(s.id)}">
            Details
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-view-details').forEach(btn => {
      btn.addEventListener('click', () => openDetailsModal(btn.dataset.id));
    });
  }

  // ── Open Details Modal ──────────────────────────────────────────────────
  function openDetailsModal(id) {
    const s = state.schedules.find(item => String(item.id) === String(id));
    if (!s) return;

    const overlay = document.getElementById('detailsOverlay');
    const modalRef = document.getElementById('modalRefId');
    const body = document.getElementById('detailsModalBody');

    if (!overlay || !body) return;

    if (modalRef) modalRef.textContent = `Item Details — ${s.id}`;

    const statusText = s.itemType === 'class' ? 'Class Schedule' : s.status;
    const statusColor = s.itemType === 'class'
      ? 'text-blue-700'
      : (s.status === 'approved' ? 'text-emerald-700'
        : (s.status === 'pending' ? 'text-amber-700'
          : (s.status === 'cancelled' ? 'text-slate-600' : 'text-rose-700')));

    body.innerHTML = `
      <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200 space-y-1">
        <p class="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Assigned Room</p>
        <p class="font-extrabold text-sm text-gray-900">${esc(s.roomName)} (Room ${esc(s.roomId)})</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
          <p class="text-[10px] font-bold uppercase text-gray-500">Schedule / Date</p>
          <p class="font-bold text-gray-800 mt-0.5">${esc(s.dateLabel)}</p>
        </div>
        <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
          <p class="text-[10px] font-bold uppercase text-gray-500">Time Slot</p>
          <p class="font-bold text-gray-800 mt-0.5">${esc(s.start)} – ${esc(s.end)}</p>
        </div>
      </div>

      <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
        <p class="text-[10px] font-bold uppercase text-gray-500">Subject / Purpose</p>
        <p class="font-bold text-gray-900 mt-0.5">${esc(s.subject || 'N/A')}</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
          <p class="text-[10px] font-bold uppercase text-gray-500">Course Section / Type</p>
          <p class="font-bold text-gray-800 mt-0.5">${esc(s.section)}</p>
        </div>
        <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
          <p class="text-[10px] font-bold uppercase text-gray-500">Requester &amp; Program/Section</p>
          <p class="font-bold text-gray-800 mt-0.5">${esc(s.requesterName)}</p>
          <p class="text-[11px] text-gray-500 font-medium">${esc(s.requesterDetails)}</p>
        </div>
      </div>

      <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
        <p class="text-[10px] font-bold uppercase text-gray-500">Status</p>
        <p class="font-bold capitalize mt-0.5 ${statusColor}">${esc(statusText)}</p>
      </div>

      ${s.remarks ? `
        <div class="p-3 bg-rose-50 border border-rose-200 rounded-[8px] text-rose-800">
          <p class="text-[10px] font-bold uppercase">Admin Remarks</p>
          <p class="mt-0.5 font-medium">${esc(s.remarks)}</p>
        </div>
      ` : ''}
    `;

    overlay.classList.remove('hidden');
  }

  function closeDetailsModal() {
    const overlay = document.getElementById('detailsOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ── Wire UI Events ──────────────────────────────────────────────────────
  function wireEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => {
          b.classList.remove('active', 'bg-white', 'text-gray-900', 'shadow-sm');
          b.classList.add('hover:text-gray-900');
        });
        btn.classList.add('active', 'bg-white', 'text-gray-900', 'shadow-sm');
        btn.classList.remove('hover:text-gray-900');

        state.activeFilter = btn.dataset.filter || 'all';
        renderTable();
      });
    });

    const searchInput = document.getElementById('schedSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderTable();
      });
    }

    const btnCloseModal = document.getElementById('btnCloseDetailsModal');
    const btnDismiss = document.getElementById('btnDismissDetails');
    const overlay = document.getElementById('detailsOverlay');

    if (btnCloseModal) btnCloseModal.addEventListener('click', closeDetailsModal);
    if (btnDismiss) btnDismiss.addEventListener('click', closeDetailsModal);

    if (overlay) {
      overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) closeDetailsModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDetailsModal();
    });

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

    // Refresh when the faculty returns to this tab, so new requests/approvals show up
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadSchedule();
    });
  }

  // ── Initialization ──────────────────────────────────────────────────────
  async function init() {
    const ok = await guard();
    if (!ok) return;
    wireEvents();
    await loadSchedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();