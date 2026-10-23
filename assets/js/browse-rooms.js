/**
 * PUP Canlalay Campus CRS - Browse Rooms Page (Student & Faculty)
 *
 * Auth guard: requires an active Student or Faculty session.
 * Admins are redirected to all-reservations.html (their equivalent page).
 * No valid session → redirect to login.html.
 */

(function () {
  'use strict';

  // ── Supabase client ──────────────────────────────────────────────────────
  const client = (typeof window !== 'undefined' && window.supabaseClient)
    ? window.supabaseClient
    : ((typeof window !== 'undefined' && window.supabase && window.supabase.createClient)
        ? window.supabase.createClient(
            (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://fyoxzdfxlosxlonxckqv.supabase.co'),
            (typeof SUPABASE_PUBLISHABLE_KEY !== 'undefined' ? SUPABASE_PUBLISHABLE_KEY : 'sb_publishable_hdwDHmIKSBnFijVSlqB4lA_pC4qwI4t')
          )
        : null);

  // ── Sample room data (replace with Supabase query when table is ready) ──
  const ROOMS = [
    { id: 'cite-301', code: 'CITE-301', name: 'Lab 301 - Advanced Networking Lab',   floor: '3rd Floor', capacity: 45, status: 'available',  features: 'Cisco Racks, Dual Projectors, Linux Terminals' },
    { id: 'cite-402', code: 'CITE-402', name: 'Room 402 - Lecture Hall',              floor: '4th Floor', capacity: 60, status: 'available',  features: 'Smart TV, Split AC, Whiteboard' },
    { id: 'cite-305', code: 'CITE-305', name: 'Lab 305 - Software Engineering Lab',   floor: '3rd Floor', capacity: 40, status: 'in-process', features: 'Workstations, Gigabit LAN, Docker Hosts' },
    { id: 'cite-208', code: 'CITE-208', name: 'Room 208 - Multimedia Room',           floor: '2nd Floor', capacity: 50, status: 'reserved',   features: 'Surround Audio, 4K Display, HDMI' },
    { id: 'cite-101', code: 'CITE-101', name: 'Room 101 - General Lecture',           floor: '1st Floor', capacity: 55, status: 'available',  features: 'Projector, Air-conditioned, Whiteboard' },
    { id: 'cite-202', code: 'CITE-202', name: 'Room 202 - Seminar Hall',              floor: '2nd Floor', capacity: 35, status: 'available',  features: 'Round Table Setup, TV Display, WiFi' },
    { id: 'cite-303', code: 'CITE-303', name: 'Lab 303 - Hardware & IoT Lab',         floor: '3rd Floor', capacity: 30, status: 'reserved',   features: 'Arduino Kits, Oscilloscopes, Soldering' },
    { id: 'cite-404', code: 'CITE-404', name: 'Room 404 - Research & Dev Room',       floor: '4th Floor', capacity: 20, status: 'available',  features: 'Dual Monitor Stations, High-speed LAN' },
  ];

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function normalizeRole(raw) {
    if (!raw) return 'Student';
    const r = String(raw).trim().toLowerCase();
    if (r === 'admin' || r === 'super admin' || r === 'superadmin') return 'Admin';
    if (r === 'faculty') return 'Faculty';
    return 'Student';
  }

  function showToast(msg) {
    const toast = document.getElementById('brToast');
    const msgEl = document.getElementById('brToastMsg');
    if (!toast || !msgEl) return;
    msgEl.textContent = msg;
    toast.classList.remove('translate-y-12', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
      toast.classList.add('translate-y-12', 'opacity-0');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3500);
  }

  // ── Auth Guard ────────────────────────────────────────────────────────────
  async function guardStudentFaculty() {
    if (!client || !client.auth) {
      window.location.replace('login.html');
      return;
    }

    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session || !session.user) {
      window.location.replace('login.html');
      return;
    }

    const { data: profile, error: profileError } = await client
      .from('users')
      .select('full_name, role, account_status')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      window.location.replace('login.html');
      return;
    }
    if (String(profile.account_status).toLowerCase() !== 'active') {
      window.location.replace('login.html');
      return;
    }

    const role = normalizeRole(profile.role);

    // Admins should use the All Reservations page instead
    if (role === 'Admin') {
      window.location.replace('all-reservations.html');
      return;
    }

    // Session is valid — bootstrap the page
    initPage(role, profile);
  }

  // ── Page Bootstrap ────────────────────────────────────────────────────────
  function initPage(role, profile) {
    // Avatar initials
    const avatarEl = document.getElementById('brAvatarText');
    if (avatarEl && profile.full_name) {
      const initials = profile.full_name
        .replace(/[^A-Za-z\s,]/g, '')
        .split(/[\s,]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0].toUpperCase())
        .join('') || role.slice(0, 2).toUpperCase();
      avatarEl.textContent = initials;
    }

    // Role-specific navbar
    renderNavbar(role);

    // Room grid
    renderRooms(ROOMS);

    // Filters
    setupFilters();

    // Reveal page
    document.body.style.visibility = 'visible';
  }

  // ── Navbar ────────────────────────────────────────────────────────────────
  function renderNavbar(role) {
    const nav = document.getElementById('brNavLinks');
    if (!nav) return;

    if (role === 'Student') {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-item">Dashboard</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item active">Browse Rooms</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item">My Reservations</a>
      `;
    } else {
      // Faculty
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-item">Dashboard</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item active">Browse Rooms</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item">Schedule</a>
      `;
    }
  }

  // ── Room Grid ─────────────────────────────────────────────────────────────
  function renderRooms(rooms) {
    const grid = document.getElementById('roomGrid');
    const emptyState = document.getElementById('emptyState');
    if (!grid) return;

    if (rooms.length === 0) {
      grid.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    grid.innerHTML = rooms.map(r => {
      const statusConfig = {
        available:  { label: 'Available',  dot: 'bg-emerald-500', badge: 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]' },
        'in-process': { label: 'In-Process', dot: 'bg-amber-400',   badge: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]' },
        reserved:   { label: 'Occupied',   dot: 'bg-rose-500',    badge: 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]' },
      };
      const cfg = statusConfig[r.status] || statusConfig.available;

      return `
        <div class="room-card bg-white border border-gray-200 rounded-[4px] p-5 shadow-sm space-y-3">
          <!-- Header -->
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">${esc(r.code)}</span>
              <h3 class="font-bold text-sm text-[#111111] mt-0.5 leading-snug">${esc(r.name)}</h3>
              <p class="text-[11px] text-gray-500 mt-0.5">${esc(r.floor)} &bull; ${esc(r.capacity)} Seats</p>
            </div>
            <span class="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-[3px] border ${cfg.badge} shrink-0">
              <span class="status-dot ${cfg.dot}"></span>
              ${cfg.label}
            </span>
          </div>

          <!-- Features -->
          <div class="p-2.5 bg-gray-50 rounded-[3px] border border-gray-100">
            <p class="text-[11px] text-gray-600 font-medium">${esc(r.features)}</p>
          </div>

          <!-- Action -->
          <div class="pt-2 border-t border-gray-100 flex items-center justify-end">
            ${r.status === 'available'
              ? `<button type="button" onclick="window._brReserve('${esc(r.id)}', '${esc(r.name)}')" class="btn-primary text-xs py-1.5 px-3">
                   Reserve &rarr;
                 </button>`
              : `<span class="text-xs text-gray-400 font-medium italic">Not available for reservation</span>`
            }
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  function setupFilters() {
    const tabs = document.querySelectorAll('#statusFilterTabs .filter-tab');
    const searchInput = document.getElementById('searchInput');
    let currentStatus = 'all';

    function applyFilters() {
      const query = (searchInput?.value || '').toLowerCase().trim();
      const filtered = ROOMS.filter(r => {
        const matchesStatus = currentStatus === 'all' || r.status === currentStatus;
        const matchesSearch = !query ||
          r.name.toLowerCase().includes(query) ||
          r.code.toLowerCase().includes(query) ||
          r.floor.toLowerCase().includes(query) ||
          r.features.toLowerCase().includes(query);
        return matchesStatus && matchesSearch;
      });
      renderRooms(filtered);
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentStatus = tab.dataset.status;
        applyFilters();
      });
    });

    searchInput?.addEventListener('input', applyFilters);
  }

  // ── Reserve Action ────────────────────────────────────────────────────────
  window._brReserve = function (roomId, roomName) {
    showToast(`Reservation form for "${roomName}" — redirecting to dashboard...`);
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1200);
  };

  // ── Toast close button ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnCloseToast')?.addEventListener('click', () => {
      const toast = document.getElementById('brToast');
      if (toast) {
        toast.classList.add('translate-y-12', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');
      }
    });

    document.getElementById('btnNewReservation')?.addEventListener('click', () => {
      window.location.href = 'dashboard.html';
    });
  });

  // ── Auth state listeners ──────────────────────────────────────────────────
  if (client && client.auth) {
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') window.location.replace('login.html');
    });
  }

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  guardStudentFaculty();
})();
