/**
 * PUP Canlalay Campus CRS - My Reservations Controller
 * Connected to Supabase (room_reservations, rooms, users,
 * cancel_reservation(), list_active_faculty()).
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
    role: 'Student',
    reservations: [],
    activeFilter: 'all',
    searchQuery: '',
    toastTimer: null,
    loading: false
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

  // ── Formatting Helpers ──────────────────────────────────────────────────
  // '13:00:00' -> '01:00 PM'
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

  // 12 -> 'RES-0012'
  function formatRefId(num) {
    return 'RES-' + String(num).padStart(4, '0');
  }

  function facultyLabel(name) {
    return name ? 'Prof. ' + name : 'Unassigned';
  }

  // ── Load Data From Supabase ─────────────────────────────────────────────
  async function loadReservations() {
    if (!client || !state.user) return;

    state.loading = true;
    renderTable();

    try {
      // 1) My reservations (RLS also limits this to my own rows)
      const { data: rows, error } = await client
        .from('room_reservations')
        .select('reservation_id, room_id, faculty_id, subject, reservation_date, start_time, end_time, status, created_at, admin_remarks')
        .eq('student_id', state.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 2) Rooms (for room names)
      const roomMap = {};
      const { data: rooms, error: roomsErr } = await client
        .from('rooms')
        .select('room_id, room_number, room_name');
      if (roomsErr) {
        console.warn('Could not load rooms:', roomsErr);
      } else {
        (rooms || []).forEach(rm => { roomMap[rm.room_id] = rm; });
      }

      // 3) Faculty names (only active faculty are returned)
      const facultyMap = {};
      const { data: faculty, error: facErr } = await client.rpc('list_active_faculty');
      if (facErr) {
        console.warn('Could not load faculty list:', facErr);
      } else {
        (faculty || []).forEach(f => { facultyMap[f.user_id] = f.full_name; });
      }

      // 4) Convert DB rows into the shape the table already uses
      state.reservations = (rows || []).map(r => {
        const room = roomMap[r.room_id] || {};
        const status = String(r.status || '').toLowerCase();
        return {
          id: formatRefId(r.reservation_id),
          dbId: r.reservation_id,
          roomId: room.room_number || String(r.room_id),
          roomName: room.room_name || ('Room ' + (room.room_number || r.room_id)),
          date: r.reservation_date,
          start: formatTime(r.start_time),
          end: formatTime(r.end_time),
          subject: r.subject,
          faculty: facultyMap[r.faculty_id] || '',
          status: status,
          rejectionReason: r.admin_remarks || '',
          createdAt: r.created_at
        };
      });
    } catch (err) {
      console.error('Failed to load reservations:', err);
      state.reservations = [];
      showToast('Could not load your reservations. Please refresh the page.');
    } finally {
      state.loading = false;
      renderStats();
      renderTable();
    }
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

    state.user = sessionUser;
    state.profile = userProfile;
    state.role = normalizeRole(userProfile.role);

    initProfileUI();
    renderNavbar(state.role);
    document.body.style.visibility = 'visible';
    return true;
  }

  function initProfileUI() {
    const name = state.profile?.full_name || 'Student';
    const email = state.user?.email || (state.role.toLowerCase() + '@pup.edu.ph');

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
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="user-approvals.html" class="pup-nav-item">User Approvals</a>
      `;
    } else {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-item">Dashboard</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item">Browse Rooms</a>
        <span class="nav-separator text-white/50 font-light select-none">|</span>
        <a href="my-reservations.html" class="pup-nav-item active">My Reservations</a>
      `;
    }
  }

  // ── Render Stats Counters ────────────────────────────────────────────────
  function renderStats() {
    const totalEl = document.getElementById('statTotalCount');
    const apprEl = document.getElementById('statApprovedCount');
    const pendEl = document.getElementById('statPendingCount');
    const rejEl = document.getElementById('statRejectedCount');

    const total = state.reservations.length;
    const approved = state.reservations.filter(r => String(r.status).toLowerCase() === 'approved').length;
    const pending = state.reservations.filter(r => String(r.status).toLowerCase() === 'pending').length;
    const rejected = state.reservations.filter(r => ['rejected', 'cancelled'].includes(String(r.status).toLowerCase())).length;

    if (totalEl) totalEl.textContent = total;
    if (apprEl) apprEl.textContent = approved;
    if (pendEl) pendEl.textContent = pending;
    if (rejEl) rejEl.textContent = rejected;
  }

  // ── Render Reservations Table ───────────────────────────────────────────
  function renderTable() {
    const tbody = document.getElementById('reservationsTableBody');
    const emptyState = document.getElementById('emptyState');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Loading row (first load only, while nothing is shown yet)
    if (state.loading && state.reservations.length === 0) {
      emptyState?.classList.add('hidden');
      tbody.innerHTML = '<tr><td colspan="7" class="py-10 text-center text-gray-500 font-medium">Loading your reservations...</td></tr>';
      return;
    }

    const query = state.searchQuery.toLowerCase().trim();
    const filter = state.activeFilter;

    const filtered = state.reservations.filter(r => {
      const status = String(r.status).toLowerCase();

      // Status Filter
      if (filter === 'pending' && status !== 'pending') return false;
      if (filter === 'approved' && status !== 'approved') return false;
      if (filter === 'rejected' && !['rejected', 'cancelled'].includes(status)) return false;

      // Search Query
      if (query) {
        const matchesRef = String(r.id || '').toLowerCase().includes(query);
        const matchesRoom = String(r.roomName || r.roomId || '').toLowerCase().includes(query);
        const matchesSubj = String(r.subject || '').toLowerCase().includes(query);
        const matchesFac = String(r.faculty || '').toLowerCase().includes(query);
        return matchesRef || matchesRoom || matchesSubj || matchesFac;
      }

      return true;
    });

    if (filtered.length === 0) {
      emptyState?.classList.remove('hidden');
      return;
    } else {
      emptyState?.classList.add('hidden');
    }

    filtered.forEach(r => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50/80 transition';

      const status = String(r.status).toLowerCase();
      let statusBadge = '';

      if (status === 'approved') {
        statusBadge = '<span class="status-badge-approved px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Approved</span>';
      } else if (status === 'pending') {
        statusBadge = '<span class="status-badge-pending px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Pending</span>';
      } else if (status === 'rejected') {
        statusBadge = '<span class="status-badge-rejected px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Rejected</span>';
      } else {
        statusBadge = '<span class="status-badge-cancelled px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Cancelled</span>';
      }

      const dateStr = r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Scheduled';

      tr.innerHTML = `
        <td class="py-4 px-4 sm:px-6 font-extrabold text-[#880000]">${esc(r.id)}</td>
        <td class="py-4 px-4">
          <div class="font-bold text-gray-900">${esc(r.roomName)}</div>
          <div class="text-[11px] text-gray-500">Room No.: ${esc(r.roomId)}</div>
        </td>
        <td class="py-4 px-4">
          <div class="font-semibold text-gray-900">${esc(dateStr)}</div>
          <div class="text-[11px] text-gray-500 font-medium">${esc(r.start)} – ${esc(r.end)}</div>
        </td>
        <td class="py-4 px-4 max-w-xs">
          <div class="font-bold text-gray-900 truncate">${esc(r.subject || 'N/A')}</div>
        </td>
        <td class="py-4 px-4 font-medium text-gray-800">
          ${esc(facultyLabel(r.faculty))}
        </td>
        <td class="py-4 px-4">${statusBadge}</td>
        <td class="py-4 px-4 sm:px-6 text-right space-x-1 whitespace-nowrap">
          <button type="button" class="btn-view-details px-2.5 py-1 text-[11px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-[5px] transition" data-id="${esc(r.id)}">
            Details
          </button>
          ${status === 'pending' ? `
            <button type="button" class="btn-cancel-req px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-[5px] transition" data-id="${esc(r.id)}">
              Cancel
            </button>
          ` : ''}
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Wire Details Buttons
    document.querySelectorAll('.btn-view-details').forEach(btn => {
      btn.addEventListener('click', () => openDetailsModal(btn.dataset.id));
    });

    // Wire Cancel Buttons
    document.querySelectorAll('.btn-cancel-req').forEach(btn => {
      btn.addEventListener('click', () => cancelReservation(btn.dataset.id));
    });
  }

  // ── Open Details Modal ──────────────────────────────────────────────────
  function openDetailsModal(id) {
    const r = state.reservations.find(item => String(item.id) === String(id));
    if (!r) return;

    const overlay = document.getElementById('detailsOverlay');
    const modalRef = document.getElementById('modalRefId');
    const body = document.getElementById('detailsModalBody');

    if (!overlay || !body) return;

    if (modalRef) modalRef.textContent = `Reservation Details — ${r.id}`;

    const dateStr = r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Scheduled';

    const statusLower = String(r.status).toLowerCase();
    const statusColor = statusLower === 'approved' ? 'text-emerald-700' : (statusLower === 'pending' ? 'text-amber-700' : 'text-rose-700');

    body.innerHTML = `
      <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200 space-y-1">
        <p class="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Target Room</p>
        <p class="font-extrabold text-sm text-gray-900">${esc(r.roomName)}</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
          <p class="text-[10px] font-bold uppercase text-gray-500">Date</p>
          <p class="font-bold text-gray-800 mt-0.5">${esc(dateStr)}</p>
        </div>
        <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
          <p class="text-[10px] font-bold uppercase text-gray-500">Time Slot</p>
          <p class="font-bold text-gray-800 mt-0.5">${esc(r.start)} – ${esc(r.end)}</p>
        </div>
      </div>

      <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
        <p class="text-[10px] font-bold uppercase text-gray-500">Subject Code &amp; Purpose</p>
        <p class="font-bold text-gray-900 mt-0.5">${esc(r.subject || 'N/A')}</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
          <p class="text-[10px] font-bold uppercase text-gray-500">Tagged Faculty</p>
          <p class="font-bold text-gray-800 mt-0.5">${esc(facultyLabel(r.faculty))}</p>
        </div>
        <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
          <p class="text-[10px] font-bold uppercase text-gray-500">Current Status</p>
          <p class="font-bold capitalize mt-0.5 ${statusColor}">
            ${esc(r.status)}
          </p>
        </div>
      </div>

      ${r.rejectionReason ? `
        <div class="p-3 bg-rose-50 border border-rose-200 rounded-[8px] text-rose-800">
          <p class="text-[10px] font-bold uppercase">Rejection Reason</p>
          <p class="mt-0.5 font-medium">${esc(r.rejectionReason)}</p>
        </div>
      ` : ''}
    `;

    overlay.classList.remove('hidden');
  }

  function closeDetailsModal() {
    const overlay = document.getElementById('detailsOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ── Cancel Pending Reservation (via database function) ──────────────────
  async function cancelReservation(id) {
    const r = state.reservations.find(item => String(item.id) === String(id));
    if (!r) return;

    if (!confirm(`Are you sure you want to cancel reservation request ${r.id}?`)) return;

    try {
      const { error } = await client.rpc('cancel_reservation', { p_id: r.dbId });
      if (error) throw error;

      showToast(`Reservation ${r.id} has been cancelled.`);
    } catch (err) {
      console.error('Cancel failed:', err);
      showToast(err.message || 'Could not cancel this reservation.');
    }

    // Reload so the list always matches the database
    await loadReservations();
  }

  // ── Wire UI Events ──────────────────────────────────────────────────────
  function wireEvents() {
    // Filter Tabs
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

    // Search Input
    const searchInput = document.getElementById('resSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderTable();
      });
    }

    // Modal Close Triggers
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

    // Toast close button
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

    // Refresh the list when the student returns to this tab,
    // so a new approval/decline shows up without a manual reload.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadReservations();
    });
  }

  // ── Initialization ──────────────────────────────────────────────────────
  async function init() {
    const ok = await guard();
    if (!ok) return;
    wireEvents();
    await loadReservations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();