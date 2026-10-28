/**
 * PUP Canlalay Campus CRS - My Reservations Controller
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

  // ── Default Mock Reservations ───────────────────────────────────────────
  const DEFAULT_RESERVATIONS = [
    { id: 'RES-9014', roomId: '301', roomName: 'Lab 301 - Advanced Networking Lab', day: 'Thursday', date: '2026-10-22', start: '10:00 AM', end: '01:00 PM', subject: 'Operating Systems Kernel Practical Exam', faculty: 'Dr. Alicia Reyes', requester: 'Danilo Santos (BSIT 3-1)', status: 'pending', createdAt: '2026-10-18T09:30:00.000Z' },
    { id: 'RES-9008', roomId: '301', roomName: 'Lab 301 - Advanced Networking Lab', day: 'Friday', date: '2026-10-23', start: '08:30 AM', end: '11:30 AM', subject: 'Cisco Routing Switch Mock Certification', faculty: 'Dr. Alicia Reyes', requester: 'Danilo Santos (BSIT 3-1)', status: 'approved', createdAt: '2026-10-15T14:20:00.000Z' },
    { id: 'RES-8702', roomId: '208', roomName: 'Room 208 - Multimedia Room', day: 'Friday', date: '2026-10-16', start: '01:00 PM', end: '04:00 PM', subject: 'Embedded Systems Hardware Defense', faculty: 'Prof. Maria Morales', requester: 'Danilo Santos (BSIT 3-1)', status: 'rejected', rejectionReason: 'Schedule conflict with Department Assembly.', createdAt: '2026-10-10T11:00:00.000Z' }
  ];

  // ── Global State ────────────────────────────────────────────────────────
  const state = {
    user: null,
    profile: null,
    role: 'Student',
    reservations: [],
    activeFilter: 'all',
    searchQuery: '',
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

  // ── Load & Save Data ────────────────────────────────────────────────────
  function loadReservations() {
    try {
      const storedRes = localStorage.getItem('crs_custom_reservations');
      if (storedRes) {
        state.reservations = JSON.parse(storedRes);
      } else {
        state.reservations = [...DEFAULT_RESERVATIONS];
        localStorage.setItem('crs_custom_reservations', JSON.stringify(state.reservations));
      }
    } catch (e) {
      state.reservations = [...DEFAULT_RESERVATIONS];
    }
  }

  function saveReservations() {
    try {
      localStorage.setItem('crs_custom_reservations', JSON.stringify(state.reservations));
    } catch (e) {
      console.warn('Could not persist reservations:', e);
    }
  }

  // ── Auth Guard & Header Nav ─────────────────────────────────────────────
  async function guard() {
    let sessionUser = null;
    let userProfile = null;

    if (client && client.auth) {
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
    }

    if (!userProfile) {
      const storedRole = localStorage.getItem('demoRole') || localStorage.getItem('user_role') || 'student';
      const storedName = localStorage.getItem('user_name') || 'Danilo Santos';
      userProfile = {
        user_id: 'demo-user-id',
        full_name: storedName,
        role: storedRole,
        account_status: 'active'
      };
      sessionUser = { email: 'danilo.santos@pup.edu.ph' };
    }

    state.user = sessionUser;
    state.profile = userProfile;
    state.role = normalizeRole(userProfile.role);

    initProfileUI();
    renderNavbar(state.role);
    document.body.style.visibility = 'visible';
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

    if (menuBtn && dropdown) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', () => dropdown.classList.add('hidden'));
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
        <span class="text-white/50 font-light select-none">|</span>
        <a href="room-management.html" class="pup-nav-item">Room Management</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="schedule-manager.html" class="pup-nav-item">Schedule Manager</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item">Browse Rooms</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="all-reservations.html" class="pup-nav-item">All Reservations</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="user-approvals.html" class="pup-nav-item">User Approvals</a>
      `;
    } else {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-item">Dashboard</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item">Browse Rooms</a>
        <span class="text-white/50 font-light select-none">|</span>
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

      const dateStr = r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (r.day || 'Scheduled');

      tr.innerHTML = `
        <td class="py-4 px-4 sm:px-6 font-extrabold text-[#880000]">${esc(r.id)}</td>
        <td class="py-4 px-4">
          <div class="font-bold text-gray-900">${esc(r.roomName || 'Room ' + r.roomId)}</div>
          <div class="text-[11px] text-gray-500">Room ID: ${esc(r.roomId)}</div>
        </td>
        <td class="py-4 px-4">
          <div class="font-semibold text-gray-900">${esc(dateStr)}</div>
          <div class="text-[11px] text-gray-500 font-medium">${esc(r.start)} – ${esc(r.end)}</div>
        </td>
        <td class="py-4 px-4 max-w-xs">
          <div class="font-bold text-gray-900 truncate">${esc(r.subject || 'N/A')}</div>
          <div class="text-[11px] text-gray-500">Code: ${esc(r.code || 'CRS-REQ')}</div>
        </td>
        <td class="py-4 px-4 font-medium text-gray-800">
          Prof. ${esc(r.faculty || 'Unassigned')}
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

    const dateStr = r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : (r.day || 'Weekly Schedule');

    body.innerHTML = `
      <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200 space-y-1">
        <p class="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Target Room</p>
        <p class="font-extrabold text-sm text-gray-900">${esc(r.roomName || 'Room ' + r.roomId)}</p>
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
          <p class="font-bold text-gray-800 mt-0.5">Prof. ${esc(r.faculty || 'Unassigned')}</p>
        </div>
        <div class="p-3 bg-gray-50 rounded-[8px] border border-gray-200">
          <p class="text-[10px] font-bold uppercase text-gray-500">Current Status</p>
          <p class="font-bold capitalize mt-0.5 ${String(r.status).toLowerCase() === 'approved' ? 'text-emerald-700' : (String(r.status).toLowerCase() === 'pending' ? 'text-amber-700' : 'text-rose-700')}">
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

  // ── Cancel Pending Reservation ──────────────────────────────────────────
  function cancelReservation(id) {
    if (!confirm(`Are you sure you want to cancel reservation request ${id}?`)) return;

    const idx = state.reservations.findIndex(item => String(item.id) === String(id));
    if (idx !== -1) {
      state.reservations[idx].status = 'cancelled';
      saveReservations();
      renderStats();
      renderTable();
      showToast(`Reservation ${id} has been cancelled.`);
    }
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

    // Storage Event Listener (Real-time Sync)
    window.addEventListener('storage', (e) => {
      if (e.key === 'crs_custom_reservations') {
        loadReservations();
        renderStats();
        renderTable();
      }
    });
  }

  // ── Initialization ──────────────────────────────────────────────────────
  async function init() {
    loadReservations();
    await guard();
    renderStats();
    renderTable();
    wireEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();