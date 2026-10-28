/**
 * PUP Canlalay Campus CRS - Role-Based Dashboard Engine
 *
 * SECURITY CHANGES in this version:
 * - Requires a valid Supabase session. No session -> redirect to login.html.
 * - Role is read from public.users (by user_id), NOT from user_metadata or localStorage.
 * - Account must be 'active'.
 * - Removed the ?role= URL override, localStorage fallback and the 'Admin' default.
 * - Any error fails closed (redirects to login) instead of showing a dashboard.
 * - Signing out in another tab redirects this tab to login.
 */

(function () {
  'use strict';

  // ==========================================
  // 1. SUPABASE CLIENT RESOLUTION
  // ==========================================
  const client = (typeof window !== 'undefined' && window.supabaseClient)
    ? window.supabaseClient
    : ((typeof window !== 'undefined' && window.supabase && window.supabase.createClient)
        ? window.supabase.createClient(
            (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://fyoxzdfxlosxlonxckqv.supabase.co'),
            (typeof SUPABASE_PUBLISHABLE_KEY !== 'undefined' ? SUPABASE_PUBLISHABLE_KEY : 'sb_publishable_hdwDHmIKSBnFijVSlqB4lA_pC4qwI4t')
          )
        : null);

  // ==========================================
  // 2. REPOSITORY & DATA STATE
  // ==========================================
  const State = {
    detectedRole: null, // 'Admin' | 'Faculty' | 'Student' (set only after verification)
    user: null,
    profile: null,      // row from public.users
    isAuthenticated: false,
    notifications: [
      { id: 1, title: 'Room 402 Approved', message: 'Admin granted your reservation for Oct 27.', time: '10m ago', unread: true },
      { id: 2, title: 'Maintenance Notice', message: 'Lab 305 AC servicing scheduled at 4:00 PM.', time: '1h ago', unread: true },
      { id: 3, title: 'Faculty Endorsement', message: 'Dr. Alicia Reyes tagged you in reservation #RES-8921.', time: '3h ago', unread: false },
    ],
    rooms: [
      { id: 'cite-301', code: 'CITE-301', name: 'Lab 301 - Advanced Networking Lab', floor: '3rd Floor', capacity: 45, status: 'available', features: 'Cisco Racks, Dual Projectors', course: 'CS314 - OS Lab', time: '10:00 AM - 1:00 PM', instructor: 'Dr. Alicia Reyes' },
      { id: 'cite-402', code: 'CITE-402', name: 'Room 402 - Lecture Hall', floor: '4th Floor', capacity: 60, status: 'available', features: 'Smart TV, Split AC', course: 'IT305 - Web Dev Capstone', time: '1:30 PM - 4:30 PM', instructor: 'Engr. Roberto Cruz' },
      { id: 'cite-305', code: 'CITE-305', name: 'Lab 305 - Software Engineering Lab', floor: '3rd Floor', capacity: 40, status: 'in-process', features: 'Workstations, Gigabit LAN', course: 'CS301 - Software Eng', time: '8:00 AM - 11:00 AM', instructor: 'Prof. Ferdinand Silva' },
      { id: 'cite-208', code: 'CITE-208', name: 'Room 208 - Multimedia Room', floor: '2nd Floor', capacity: 50, status: 'reserved', features: 'Surround Audio, 4K Display', course: 'IT Elective - Multimedia', time: '1:00 PM - 4:00 PM', instructor: 'Prof. Maria Morales' },
    ],
    studentReservations: [
      { id: 'RES-8921', room: 'Lab 301 - Advanced Networking Lab', subject: 'CS314 - Operating Systems Laboratory', faculty: 'Dr. Alicia Reyes', date: 'Tomorrow, Oct 24', time: '10:00 AM - 1:00 PM', status: 'Pending Admin Confirmation', statusType: 'pending' },
      { id: 'RES-8840', room: 'Room 402 - Lecture Hall', subject: 'IT305 - Web Development Capstone', faculty: 'Engr. Roberto Cruz', date: 'Friday, Oct 27', time: '1:30 PM - 4:30 PM', status: 'Confirmed & Key Released', statusType: 'approved' },
      { id: 'RES-8702', room: 'Room 208 - Multimedia Room', subject: 'CS201 - Data Structures Consultation', faculty: 'Prof. Maria Morales', date: 'Oct 15', time: '8:00 AM - 10:00 AM', status: 'Rejected - Schedule Overlap', statusType: 'rejected' },
      { id: 'RES-8650', room: 'Room 101 - General Lecture', subject: 'GEED - Purposive Communication Group', faculty: 'Prof. Dante Santos', date: 'Oct 10', time: '7:30 AM - 9:00 AM', status: 'Completed', statusType: 'completed' },
    ],
    facultyTaggedClasses: [
      { id: 'CLS-101', code: 'CS314 (Sec 3-1)', title: 'Operating Systems Laboratory', room: 'Lab 301 - Advanced Networking Lab', schedule: 'Tue & Thu • 10:00 AM - 1:00 PM', students: 42, equipment: 'Cisco Racks, Linux Terminals', status: 'In-Session' },
      { id: 'CLS-102', code: 'IT305 (Sec 3-2)', title: 'Web Systems and Technologies', room: 'Room 402 - Lecture Hall', schedule: 'Wed & Fri • 1:30 PM - 4:30 PM', students: 54, equipment: 'Projector, Split AC', status: 'Upcoming Today' },
      { id: 'CLS-103', code: 'CS201 (Sec 2-1)', title: 'Data Structures and Algorithms', room: 'Room 208 - Multimedia Room', schedule: 'Mon & Thu • 7:30 AM - 10:30 AM', students: 48, equipment: 'Smart TV, Whiteboard', status: 'Scheduled' },
      { id: 'CLS-104', code: 'CS301 (Sec 3-1)', title: 'Software Engineering Capstone', room: 'Lab 305 - Software Engineering Lab', schedule: 'Friday • 8:00 AM - 11:00 AM', students: 38, equipment: 'Gigabit LAN, Workstations', status: 'Scheduled' },
    ],
    facultyPendingApprovals: [
      { id: 'REQ-4091', requester: 'Danilo Santos', studentNo: '2022-04912-MN-0', course: 'BS Information Technology', subject: 'CS314 Capstone Sensor Experiment', room: 'Lab 301', date: 'Oct 26, 2026', time: '2:00 PM - 5:00 PM', reason: 'High-speed networking packet inspection and lab demonstration.' },
      { id: 'REQ-4092', requester: 'Bea Alonzo', studentNo: '2022-01934-MN-0', course: 'BS Computer Science', subject: 'CS301 Algorithm Review Session', room: 'Room 402', date: 'Oct 28, 2026', time: '10:00 AM - 12:00 PM', reason: 'Preparation for regional ACM programming competition.' },
      { id: 'REQ-4093', requester: 'Samantha Ramos', studentNo: '2022-03102-MN-0', course: 'BS Information Technology', subject: 'Agile Software Testing Mock Sprint', room: 'Lab 305', date: 'Tomorrow', time: '8:00 AM - 10:00 AM', reason: 'Needs local Docker instances pre-configured.' },
      { id: 'REQ-4094', requester: 'Christian Diaz', studentNo: '2021-08192-MN-0', course: 'BS Computer Engineering', subject: 'Embedded Systems Hardware Defense', room: 'Room 208', date: 'Friday', time: '1:00 PM - 4:00 PM', reason: 'Final prototype demonstration.' },
    ],
    adminActiveBookings: [
      { room: 'Lab 301', occupant: 'Dr. Alicia Reyes (CS314)', floor: '3rd Floor', start: '10:00 AM', end: '1:00 PM', capacity: '42/45' },
      { room: 'Room 402', occupant: 'Engr. Roberto Cruz (IT305)', floor: '4th Floor', start: '1:30 PM', end: '4:30 PM', capacity: '54/60' },
      { room: 'Room 208', occupant: 'Prof. Maria Morales (IT Elec)', floor: '2nd Floor', start: '8:00 AM', end: '11:00 AM', capacity: '48/50' },
      { room: 'Room 101', occupant: 'Prof. Dante Santos (GEED)', floor: '1st Floor', start: '7:30 AM', end: '9:00 AM', capacity: '35/55' },
    ],
    adminHistoryToday: [
      { ref: '#RES-9014', room: 'Lab 301', requester: 'Danilo Santos', role: 'Student', time: '10:00 AM - 1:00 PM', purpose: 'OS Lab Practical Session', endorsedBy: 'Dr. A. Reyes', status: 'Approved' },
      { ref: '#RES-9013', room: 'Room 402', requester: 'Engr. Roberto Cruz', role: 'Faculty', time: '1:30 PM - 4:30 PM', purpose: 'Web Dev Lecture & Presentation', endorsedBy: 'Self', status: 'Approved' },
      { ref: '#RES-9012', room: 'Lab 305', requester: 'Samantha Ramos', role: 'Student', time: '8:00 AM - 10:00 AM', purpose: 'Software Testing Workshop', endorsedBy: 'Prof. F. Silva', status: 'Pending' },
      { ref: '#RES-9011', room: 'Room 202', requester: 'John Paul Perez', role: 'Student', time: '11:00 AM - 1:00 PM', purpose: 'Math Org General Assembly', endorsedBy: 'Dr. G. Mendoza', status: 'Rejected' },
      { ref: '#RES-9010', room: 'Room 101', requester: 'Prof. Dante Santos', role: 'Faculty', time: '7:30 AM - 9:00 AM', purpose: 'Purposive Comm Discussion', endorsedBy: 'Dept Chair', status: 'Completed' },
    ]
  };

  // Escape text coming from the database before putting it in innerHTML
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  // Role normalization. Unknown values map to the LEAST privileged role.
  function normalizeRole(raw) {
    if (!raw) return 'Student';
    const r = String(raw).trim().toLowerCase();
    if (r === 'admin' || r === 'super admin' || r === 'superadmin') return 'Admin';
    if (r === 'faculty') return 'Faculty';
    return 'Student';
  }

  // ==========================================
  // 3. SESSION & ROLE VERIFICATION
  // Returns null when the visitor is NOT a valid, active, signed-in user.
  // ==========================================
  async function detectUserRole() {
    if (!client || !client.auth) return null;

    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session || !session.user) return null;

    const user = session.user;

    // Role comes from the database, never from the browser.
    const { data: profile, error: profileError } = await client
      .from('users')
      .select('full_name, role, account_status, student_number, program_course, pup_webmail')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Profile lookup failed:', profileError);
      return null;
    }
    if (!profile) return null;
    if (String(profile.account_status).toLowerCase() !== 'active') return null;

    return {
      role: normalizeRole(profile.role),
      user,
      profile,
    };
  }

  function goToLogin() {
    window.location.replace('login.html');
  }

  // ==========================================
  // 4. MAIN CONTROLLER
  // ==========================================
  async function initDashboard() {
    try {
      const result = await detectUserRole();

      if (!result) {
        // Not signed in / no profile / inactive: clear any stale session and leave.
        if (client && client.auth) {
          try { await client.auth.signOut(); } catch (e) { /* ignore */ }
        }
        return goToLogin();
      }

      const { role, user, profile } = result;
      State.detectedRole = role;
      State.user = user;
      State.profile = profile;
      State.isAuthenticated = true;

      updateHeaderUserMeta(role, user);
      renderNavbarForRole(role);
      renderViewForRole(role, user);
      renderNotifications();
      setupEventHandlers();

      // Reveal the page only after the check passed (body is hidden by CSS until now)
      document.body.style.visibility = 'visible';

    } catch (err) {
      console.error('Fatal dashboard initialization error:', err);
      goToLogin(); // fail closed
    }
  }

  // If the user signs out in another tab, kick this tab to login too.
  if (client && client.auth) {
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') goToLogin();
    });
  }

  // Back/forward cache can show a stale dashboard after logout; force a re-check.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
  });

  // ==========================================
  // 5. HEADER & PROFILE DISPLAY
  // ==========================================
  function updateHeaderUserMeta(role, user) {
    const avatarEl = document.getElementById('userAvatarText');
    const nameEl = document.getElementById('profileDropdownName');
    const emailEl = document.getElementById('profileDropdownEmail');
    const roleEl = document.getElementById('profileDropdownRole');
    const statusText = document.getElementById('sessionStatusText');
    const roleBadge = document.getElementById('currentRoleBadge');
    const roomMgmtLink = document.getElementById('linkRoomManagement');

    const fullName = State.profile?.full_name || user?.user_metadata?.full_name || 'PUP User';
    const email = user?.email || State.profile?.pup_webmail || '';

    // Initials from the real name (e.g. "Casalla, James Ivan S." -> "CJ")
    const initials = fullName
      .replace(/[^A-Za-z\s,]/g, '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('') || role.slice(0, 2).toUpperCase();

    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl) nameEl.textContent = fullName;
    if (emailEl) emailEl.textContent = email;
    if (roleEl) roleEl.textContent = `Role: ${role}`;
    if (roleBadge) roleBadge.textContent = `Role: ${role}`;

    // Room Management is admin-only
    if (roomMgmtLink) roomMgmtLink.classList.toggle('hidden', role !== 'Admin');

    if (statusText) {
      statusText.innerHTML = `Connected via Supabase Auth &bull; Logged in as <strong>${esc(email)}</strong> &bull; Role: <strong>${esc(role)}</strong>`;
    }
  }

  // ==========================================
  // 6. NAVBAR RENDERING
  // ==========================================
  function renderNavbarForRole(role) {
    const nav = document.getElementById('roleNavLinks');
    if (!nav) return;

    if (role === 'Student') {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-link active">Dashboard</a>
        <span class="nav-separator text-white/60 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-link">Browse Rooms</a>
        <span class="nav-separator text-white/60 font-light select-none">|</span>
        <a href="my-reservations.html" class="pup-nav-link">My Reservations</a>
      `;
    } else if (role === 'Faculty') {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-link active">Dashboard</a>
        <span class="nav-separator text-white/60 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-link">Browse Rooms</a>
        <span class="nav-separator text-white/60 font-light select-none">|</span>
        <a href="schedule.html" class="pup-nav-link">Schedule</a>
      `;
    } else {
  nav.innerHTML = `
    <a href="dashboard.html" class="pup-nav-link active font-bold text-[#ffd658]">Dashboard</a>
    <a href="all-reservations.html" class="pup-nav-link">All Reservations</a>

    <!-- Consolidated System Administration Dropdown -->
    <div class="relative group inline-block">
      <button type="button" class="pup-nav-link flex items-center gap-1.5 focus:outline-none">
        <span>System Administration</span>
        <svg class="w-3.5 h-3.5 fill-current opacity-80 transition-transform group-hover:rotate-180" viewBox="0 0 20 20">
          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/>
        </svg>
      </button>

      <!-- Dropdown Sub-menu -->
      <div class="hidden group-hover:block group-focus-within:block absolute left-0 mt-1 w-52 bg-white text-[#111111] rounded-[4px] shadow-2xl border border-gray-200 py-1.5 z-50">
        <a href="room-management.html" class="flex items-center gap-2 px-4 py-2 hover:bg-red-50 text-gray-700 hover:text-[#880000] font-semibold text-xs transition">Room Management</a>
        <a href="schedule-manager.html" class="flex items-center gap-2 px-4 py-2 hover:bg-red-50 text-gray-700 hover:text-[#880000] font-semibold text-xs transition">Schedule Manager</a>
        <a href="user-approvals.html" class="flex items-center gap-2 px-4 py-2 hover:bg-red-50 text-gray-700 hover:text-[#880000] font-semibold text-xs transition">User Approvals</a>
        <a href="logs.html" class="flex items-center gap-2 px-4 py-2 hover:bg-red-50 text-gray-700 hover:text-[#880000] font-semibold text-xs transition">Audit Logs</a>
      </div>
    </div>
  `;
}
  }

  // ==========================================
  // 7. VIEW RENDERING BASED ON ROLE
  // ==========================================
  function renderViewForRole(role, user) {
    const root = document.getElementById('dashboardRoot');
    if (!root) return;

    if (role === 'Student') {
      renderStudentView(root, user);
    } else if (role === 'Faculty') {
      renderFacultyView(root, user);
    } else if (role === 'Admin') {
      renderAdminView(root, user);
      loadPendingApprovalsCount(); // real number from the database
      loadRoomCounts();            // real room totals from the database
    }

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  // Real count of accounts waiting for approval (admins only; RLS allows admins to read all users)
  async function loadPendingApprovalsCount() {
    const countEl = document.getElementById('pendingApprovalsCount');
    const labelEl = document.getElementById('pendingApprovalsLabel');
    if (!countEl || !client) return;

    const { count, error } = await client
      .from('users')
      .select('user_id', { count: 'exact', head: true })
      .eq('account_status', 'pending');

    if (error) {
      console.error('Pending count failed:', error);
      countEl.textContent = '-';
      if (labelEl) labelEl.textContent = 'Unavailable';
      return;
    }

    countEl.textContent = count ?? 0;
    if (labelEl) labelEl.textContent = count > 0 ? 'Requires Review' : 'All clear';
  }

  // Real room totals: all rooms, and how many are Active (is_active = true)
  async function loadRoomCounts() {
    const totalEl = document.getElementById('totalRoomsCount');
    const activeEl = document.getElementById('activeRoomsLabel');
    if (!totalEl || !client) return;

    const [totalRes, activeRes] = await Promise.all([
      client.from('rooms').select('room_id', { count: 'exact', head: true }),
      client.from('rooms').select('room_id', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    if (totalRes.error || activeRes.error) {
      console.error('Room counts failed:', totalRes.error || activeRes.error);
      totalEl.textContent = '-';
      if (activeEl) activeEl.textContent = 'Unavailable';
      return;
    }

    totalEl.textContent = totalRes.count ?? 0;
    if (activeEl) activeEl.textContent = (activeRes.count ?? 0) + ' Active';
  }

  // ==========================================
  // 8. STUDENT VIEW
  // ==========================================
  function renderStudentView(container, user) {
    const studentName = esc(State.profile?.full_name || 'Student');
    const studentNo = esc(State.profile?.student_number || 'N/A');
    const program = esc(State.profile?.program_course || 'PUP Student');

    container.innerHTML = `
      <!-- Welcome Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-[4px] border border-gray-200 shadow-sm">
        <div>
          <p class="text-xs font-bold text-[#880000] uppercase tracking-wider">CITE ACADEMIC PORTAL &bull; FIRST SEMESTER</p>
          <h2 class="text-xl sm:text-2xl font-bold text-[#111111] mt-0.5">Welcome back, ${studentName}!</h2>
          <p class="text-xs text-gray-500 font-medium mt-0.5">${program} &bull; Student ID: ${studentNo}</p>
        </div>
        <div>
          <button type="button" onclick="window.openReservationModal()" class="btn-pup-primary text-xs shadow-sm">
            <span>+</span>
            <span>New Room Reservation</span>
          </button>
        </div>
      </div>

      <!-- SECTION 1: ASSIGNED ROOMS -->
      <div id="assigned-rooms" class="bg-white p-5 rounded-[4px] border border-gray-200 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 class="text-lg font-bold text-[#111111]">Assigned Rooms</h3>
            <p class="text-xs text-gray-500">Official lecture rooms and specialized laboratories tagged to your enrolled courses</p>
          </div>
          <a href="all-reservations.html" class="inline-flex items-center gap-1.5 text-xs font-bold text-[#880000] hover:text-[#5c0000] hover:underline transition">
            <span>Browse All Rooms</span>
            <span class="text-sm font-extrabold">&rarr;</span>
          </a>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${State.rooms.slice(0, 3).map(r => `
            <div class="border border-gray-200 rounded-[3px] p-4 bg-white hover:border-[#880000] transition space-y-3 shadow-2xs">
              <div class="flex justify-between items-start">
                <div>
                  <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">${r.code}</span>
                  <h4 class="font-bold text-sm text-[#111111]">${r.name}</h4>
                  <p class="text-[11px] text-gray-500">${r.capacity} Seats &bull; ${r.floor}</p>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-[3px] border ${
                  r.status === 'available' ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]' :
                  r.status === 'in-process' ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]' :
                  'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]'
                }">
                  ${r.status === 'available' ? 'Available' : r.status === 'in-process' ? 'In-Process' : 'Occupied'}
                </span>
              </div>
              <div class="p-2.5 bg-gray-50 rounded-[3px] text-xs text-gray-700 border border-gray-100 space-y-0.5">
                <p class="font-semibold text-gray-900 truncate">${r.course}</p>
                <p class="text-[11px] text-gray-500">${r.instructor} &bull; ${r.time}</p>
              </div>
              <div class="flex justify-between items-center pt-2 border-t border-gray-100 text-xs">
                <span class="text-[11px] text-gray-400 font-medium truncate">${r.features}</span>
                <button type="button" onclick="window.openReservationModal('${r.name}')" class="text-[#880000] hover:text-[#5c0000] font-bold text-xs inline-flex items-center gap-1 hover:underline shrink-0">
                  Reserve &rarr;
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- SECTION 2: ONGOING RESERVATION -->
      <div id="ongoing-reservation" class="bg-white p-5 rounded-[4px] border border-gray-200 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 class="text-lg font-bold text-[#111111]">Ongoing Reservation</h3>
            <p class="text-xs text-gray-500">Track real-time workflow status of active and submitted reservation tickets</p>
          </div>
          <a href="all-reservations.html" class="inline-flex items-center gap-1.5 text-xs font-bold text-[#337ab7] hover:text-[#23527c] hover:underline transition">
            <span>View All My Tickets</span>
            <span class="text-sm font-extrabold">&rarr;</span>
          </a>
        </div>

        <div class="space-y-3">
          ${State.studentReservations.slice(0, 3).map(res => `
            <div class="p-3.5 border rounded-[3px] ${
              res.statusType === 'approved' ? 'bg-[#ECFDF5]/30 border-[#A7F3D0]' :
              res.statusType === 'pending' ? 'bg-[#FEF3C7]/30 border-[#FDE68A]' :
              'bg-[#FEF2F2]/30 border-[#FECACA]'
            } space-y-2">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-[#880000] tracking-wide font-mono">${esc(res.id)}</span>
                    <span class="font-bold text-sm text-[#111111]">${esc(res.subject)}</span>
                  </div>
                  <p class="text-xs text-gray-600 mt-0.5">${esc(res.room)}</p>
                  <p class="text-[11px] text-gray-500">Faculty: ${esc(res.faculty)} &bull; ${esc(res.date)} &bull; ${esc(res.time)}</p>
                </div>
                <div>
                  <span class="inline-flex text-[11px] font-bold px-2.5 py-1 rounded-[3px] border ${
                    res.statusType === 'approved' ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]' :
                    res.statusType === 'pending' ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]' :
                    'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]'
                  }">
                    ${esc(res.status)}
                  </span>
                </div>
              </div>

              <div class="pt-2 border-t border-gray-200/60 flex items-center justify-between text-xs">
                <span class="text-[11px] text-gray-500">Claim physical keys at Room 300</span>
                <div class="flex items-center gap-3">
                  <button type="button" onclick="window.viewDigitalPass('${res.id}')" class="text-[#337ab7] hover:underline font-semibold flex items-center gap-1">
                    <span>View Digital Pass</span> &nearr;
                  </button>
                  ${res.statusType === 'pending' ? `
                    <button type="button" onclick="window.cancelReservation('${res.id}')" class="text-red-600 hover:underline font-semibold">
                      Cancel
                    </button>
                  ` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ==========================================
  // 9. FACULTY VIEW
  // ==========================================
  function renderFacultyView(container, user) {
    const facultyName = esc(State.profile?.full_name || 'Faculty');

    container.innerHTML = `
      <!-- Welcome Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-[4px] border border-gray-200 shadow-sm">
        <div>
          <p class="text-xs font-bold text-[#880000] uppercase tracking-wider">FACULTY CONSOLE &bull; FIRST SEMESTER</p>
          <h2 class="text-xl sm:text-2xl font-bold text-[#111111] mt-0.5">Welcome, ${facultyName}!</h2>
          <p class="text-xs text-gray-500 font-medium mt-0.5">PUP Canlalay Campus &bull; Faculty Account</p>
        </div>
        <div>
          <button type="button" onclick="window.openReservationModal()" class="btn-pup-primary text-xs shadow-sm">
            <span>+</span>
            <span>Schedule Special Session</span>
          </button>
        </div>
      </div>

      <!-- SECTION 1: UPCOMING TAGGED CLASSES -->
      <div id="upcoming-tagged-classes" class="bg-white p-5 rounded-[4px] border border-gray-200 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 class="text-lg font-bold text-[#111111]">Upcoming Tagged Classes</h3>
            <p class="text-xs text-gray-500">Regular lecture periods and laboratory classes tagged with your faculty assignment</p>
          </div>
          <a href="all-reservations.html" class="inline-flex items-center gap-1.5 text-xs font-bold text-[#880000] hover:text-[#5c0000] hover:underline transition">
            <span>Full Schedule Details</span>
            <span class="text-sm font-extrabold">&rarr;</span>
          </a>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border border-gray-200 rounded-[3px]">
            <thead class="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th class="py-3 px-4">Subject &amp; Section</th>
                <th class="py-3 px-4">Assigned Facility</th>
                <th class="py-3 px-4">Schedule Time</th>
                <th class="py-3 px-4">Enrolled</th>
                <th class="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-gray-700">
              ${State.facultyTaggedClasses.slice(0, 3).map(cls => `
                <tr class="hover:bg-gray-50 transition">
                  <td class="py-3 px-4">
                    <p class="font-bold text-gray-900">${cls.title}</p>
                    <p class="text-[11px] text-gray-500">${cls.code}</p>
                  </td>
                  <td class="py-3 px-4 font-semibold text-[#880000]">${cls.room}</td>
                  <td class="py-3 px-4">${cls.schedule}</td>
                  <td class="py-3 px-4 font-medium">${cls.students} Students</td>
                  <td class="py-3 px-4">
                    <span class="px-2 py-0.5 rounded-[3px] text-[10px] font-bold border ${
                      cls.status.includes('In-Session') ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]' : 'bg-[#EFF6FF] text-[#1E40AF] border-[#DBEAFE]'
                    }">
                      ${cls.status}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- SECTION 2: PENDING TAGGED CLASSES -->
      <div id="pending-tagged-classes" class="bg-white p-5 rounded-[4px] border border-gray-200 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 class="text-lg font-bold text-[#111111]">Pending Tagged Classes</h3>
            <p class="text-xs text-gray-500">Student reservation requests requiring your professor endorsement prior to admin release</p>
          </div>
          <a href="user-approvals.html" class="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-900 hover:underline transition">
            <span>Open Approvals Queue</span>
            <span class="text-sm font-extrabold">&rarr;</span>
          </a>
        </div>

        <div class="space-y-3">
          ${State.facultyPendingApprovals.slice(0, 3).map(req => `
            <div id="card-${req.id}" class="p-3.5 border border-amber-200 rounded-[3px] bg-amber-50/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-bold text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded-[3px]">${req.id}</span>
                  <span class="font-bold text-sm text-[#111111]">${req.subject}</span>
                </div>
                <p class="text-xs text-gray-700">
                  Requested by: <strong>${req.requester}</strong> (${req.studentNo}) &bull; ${req.course}
                </p>
                <p class="text-[11px] text-gray-600">
                  Facility: <strong class="text-[#880000]">${req.room}</strong> &bull; Schedule: <strong>${req.date} (${req.time})</strong>
                </p>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <button type="button" onclick="window.endorseStudentRequest('${req.id}', '${req.requester}')" class="btn-pup-primary text-xs">
                  Endorse Request
                </button>
                <button type="button" onclick="window.declineStudentRequest('${req.id}', '${req.requester}')" class="btn-pup-secondary text-xs">
                  Decline
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ==========================================
  // 10. ADMIN VIEW
  // ==========================================
  function renderAdminView(container, user) {
    const adminName = esc(State.profile?.full_name || 'Administrator');

    container.innerHTML = `
      <!-- Welcome Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-[4px] border border-gray-200 shadow-sm">
        <div>
          <p class="text-xs font-bold text-[#880000] uppercase tracking-wider">ADMINISTRATIVE MASTER CONSOLE &bull; CCIS</p>
          <h2 class="text-xl sm:text-2xl font-bold text-[#111111] mt-0.5">Welcome back, ${adminName}!</h2>
          <p class="text-xs text-gray-500 font-medium mt-0.5">CCIS Facilities Administrator &bull; Super Admin Console</p>
        </div>
        <div class="flex items-center gap-2">
          <a href="room-management.html" class="btn-pup-secondary text-xs flex items-center gap-1.5">
            <span>Manage Rooms</span>
            <span class="text-sm font-bold">&rarr;</span>
          </a>
          <button type="button" onclick="window.openReservationModal()" class="btn-pup-primary text-xs">
            + Admin Booking
          </button>
        </div>
      </div>

      <!-- TOP METRICS -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

        <div class="bg-white p-5 rounded-[4px] border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Rooms,</p>
            <div class="flex items-baseline gap-2 mt-1">
              <span id="totalRoomsCount" class="text-3xl font-extrabold text-[#111111]">&hellip;</span>
              <span id="activeRoomsLabel" class="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-[3px] border border-emerald-200">Loading</span>
            </div>
            <a href="room-management.html" class="inline-flex items-center gap-1 text-xs font-semibold text-[#880000] hover:underline mt-2">
              <span>View Inventory Directory</span>
              <span class="text-sm font-bold">&rarr;</span>
            </a>
          </div>
          <div class="w-12 h-12 bg-red-50 text-[#880000] rounded-[3px] flex items-center justify-center font-bold text-lg">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>
          </div>
        </div>

        <div id="pending-approvals" class="bg-white p-5 rounded-[4px] border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">Pending Approvals</p>
            <div class="flex items-baseline gap-2 mt-1">
              <span id="pendingApprovalsCount" class="text-3xl font-extrabold text-amber-600">&hellip;</span>
              <span id="pendingApprovalsLabel" class="text-xs font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-[3px] border border-amber-200">Loading</span>
            </div>
            <a href="user-approvals.html" class="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-900 hover:underline mt-2">
              <span>Review User Approvals</span>
              <span class="text-sm font-extrabold">&rarr;</span>
            </a>
          </div>
          <div class="w-12 h-12 bg-amber-50 text-amber-600 rounded-[3px] flex items-center justify-center font-bold text-lg">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>
          </div>
        </div>

      </div>

      <!-- SECTION: ACTIVE BOOKINGS -->
      <div id="active-bookings" class="bg-white p-5 rounded-[4px] border border-gray-200 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
          <div>
            <h3 class="text-lg font-bold text-[#111111]">Active Bookings</h3>
            <p class="text-xs text-gray-500">Live high-density room occupancy matrix and scheduled lab blocks</p>
          </div>

          <div class="flex items-center gap-3">
            <a href="all-reservations.html" class="inline-flex items-center gap-1.5 text-xs font-bold text-[#880000] hover:text-[#5c0000] hover:underline transition">
              <span>View All Reservations</span>
              <span class="text-sm font-extrabold">&rarr;</span>
            </a>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          <div class="lg:col-span-5 bg-slate-50 border border-emerald-300 rounded-[4px] p-4 flex flex-col items-center">
            <div class="text-xs font-bold text-gray-700 w-full mb-2 flex justify-between">
              <span>Campus Slot Matrix</span>
              <span class="text-emerald-700 font-bold">Live Synchronized</span>
            </div>

            <div class="grid grid-cols-10 gap-1.5 p-2 bg-white border border-emerald-200 rounded-[3px] shadow-xs w-full max-w-xs">
              ${Array.from({ length: 100 }).map((_, idx) => {
                const isOccupied = (idx % 7 === 0);
                const isPending = (idx % 11 === 0 && !isOccupied);
                const isMaint = (idx === 14 || idx === 83);
                const color = isOccupied ? 'bg-rose-500' : isPending ? 'bg-amber-400' : isMaint ? 'bg-gray-300' : 'bg-emerald-400';
                return `<div class="schedule-grid-cell ${color} cursor-pointer" title="Slot #${idx + 1}" onclick="window.showToast('Matrix Slot #${idx + 1} Selected', 'info')"></div>`;
              }).join('')}
            </div>
            <p class="text-[10px] text-gray-400 mt-2 text-center">Interactive 10x10 visual grid matrix across 4 campus floors</p>
          </div>

          <div class="lg:col-span-7 space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-gray-700 uppercase tracking-wider block">Live Sessions (Showing Top 3)</span>
              <a href="all-reservations.html" class="text-[11px] font-semibold text-[#337ab7] hover:underline flex items-center gap-1">
                <span>View Full List</span> &rarr;
              </a>
            </div>
            ${State.adminActiveBookings.slice(0, 3).map(b => `
              <div class="p-3 bg-white border border-gray-200 rounded-[3px] flex items-center justify-between hover:border-[#880000] transition shadow-2xs">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-[#880000] font-mono">${b.room}</span>
                    <span class="text-xs font-semibold text-gray-800">${b.occupant}</span>
                  </div>
                  <p class="text-[11px] text-gray-500">${b.floor} &bull; ${b.start} - ${b.end}</p>
                </div>
                <div class="text-right">
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ${b.capacity} Students
                  </span>
                </div>
              </div>
            `).join('')}
          </div>

        </div>
      </div>

      <!-- SECTION: RESERVATION HISTORY (TODAY) -->
      <div id="reservation-history" class="bg-white p-5 rounded-[4px] border border-gray-200 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div>
            <h3 class="text-lg font-bold text-[#111111]">Reservation History (Today)</h3>
            <p class="text-xs text-gray-500">Recent reservation events and clearance transactions (Showing 3 most recent)</p>
          </div>
          <div class="flex items-center gap-2">
            <a href="logs.html" class="inline-flex items-center gap-1.5 text-xs font-bold text-[#880000] hover:text-[#5c0000] hover:underline transition">
              <span>View Complete Logs</span>
              <span class="text-sm font-extrabold">&rarr;</span>
            </a>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border border-gray-200 rounded-[3px]">
            <thead class="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th class="py-3 px-4">Ref Number</th>
                <th class="py-3 px-4">Room</th>
                <th class="py-3 px-4">Requester &amp; Role</th>
                <th class="py-3 px-4">Time Slot</th>
                <th class="py-3 px-4">Purpose / Course</th>
                <th class="py-3 px-4">Endorsed By</th>
                <th class="py-3 px-4">Status</th>
                <th class="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="historyTableBody" class="divide-y divide-gray-100 text-gray-700">
              ${State.adminHistoryToday.slice(0, 3).map(row => `
                <tr class="hover:bg-gray-50 transition">
                  <td class="py-3 px-4 font-bold text-[#880000] font-mono">${row.ref}</td>
                  <td class="py-3 px-4 font-semibold text-gray-900">${row.room}</td>
                  <td class="py-3 px-4">
                    <p class="font-bold text-gray-800">${row.requester}</p>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-[3px] ${row.role === 'Faculty' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}">${row.role}</span>
                  </td>
                  <td class="py-3 px-4">${row.time}</td>
                  <td class="py-3 px-4 text-gray-600">${row.purpose}</td>
                  <td class="py-3 px-4 text-gray-500 font-medium">${row.endorsedBy}</td>
                  <td class="py-3 px-4">
                    <span class="px-2 py-0.5 rounded-[3px] text-[10px] font-bold border ${
                      row.status === 'Approved' ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]' :
                      row.status === 'Pending' ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]' :
                      row.status === 'Completed' ? 'bg-[#EFF6FF] text-[#1E40AF] border-[#DBEAFE]' :
                      'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]'
                    }">
                      ${row.status}
                    </span>
                  </td>
                  <td class="py-3 px-4 text-right space-x-1">
                    <button type="button" onclick="window.viewDigitalPass('${row.ref}')" class="text-[#337ab7] hover:underline font-semibold">Slip</button>
                    <span class="text-gray-300">&bull;</span>
                    <a href="logs.html" class="text-gray-600 hover:text-[#880000] hover:underline font-semibold">Log &rarr;</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 11. NOTIFICATIONS LIST
  // ==========================================
  function renderNotifications() {
    const notifList = document.getElementById('notifList');
    if (!notifList) return;

    notifList.innerHTML = State.notifications.map(n => `
      <div class="p-3 hover:bg-gray-50 flex items-start gap-2.5 transition">
        <span class="mt-1 w-2 h-2 rounded-full shrink-0 ${n.unread ? 'bg-[#880000]' : 'bg-transparent'}"></span>
        <div class="space-y-0.5 flex-grow">
          <p class="font-bold text-gray-800">${n.title}</p>
          <p class="text-gray-600 leading-tight">${n.message}</p>
          <span class="text-[10px] text-gray-400">${n.time}</span>
        </div>
      </div>
    `).join('');
  }

  // ==========================================
  // 12. EVENT HANDLERS & MODAL CONTROLS
  // ==========================================
  function setupEventHandlers() {
    // 1. Notification dropdown toggle
    const notifBtn = document.getElementById('notifBellBtn');
    const notifDropdown = document.getElementById('notifDropdown');
    if (notifBtn && notifDropdown) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('hidden');
        const profileDropdown = document.getElementById('profileDropdown');
        if (profileDropdown) profileDropdown.classList.add('hidden');
      });
    }

    // 2. Profile dropdown toggle
    const profileBtn = document.getElementById('profileMenuBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileBtn && profileDropdown) {
      profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('hidden');
        if (notifDropdown) notifDropdown.classList.add('hidden');
      });
    }

    // 3. Close on outside click
    document.addEventListener('click', () => {
      if (notifDropdown) notifDropdown.classList.add('hidden');
      if (profileDropdown) profileDropdown.classList.add('hidden');
    });

    // 4. Mark all read
    const btnMarkAllRead = document.getElementById('btnMarkAllRead');
    if (btnMarkAllRead) {
      btnMarkAllRead.addEventListener('click', () => {
        State.notifications.forEach(n => n.unread = false);
        const badge = document.getElementById('notifBadge');
        if (badge) badge.classList.add('hidden');
        renderNotifications();
        window.showToast('All notifications marked as read', 'info');
      });
    }

    // 5. Sign Out (real sign out, then replace history entry so Back can't return)
    const btnSignOut = document.getElementById('btnSignOut');
    if (btnSignOut) {
      btnSignOut.addEventListener('click', async () => {
        btnSignOut.disabled = true;
        if (client && client.auth) {
          try { await client.auth.signOut(); } catch (e) { console.error('Sign out error:', e); }
        }
        localStorage.removeItem('user_role');
        localStorage.removeItem('demoRole');
        localStorage.removeItem('pup_user');
        goToLogin();
      });
    }

    // 6. Reservation Modal Controls
    const resModal = document.getElementById('reservationModal');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnCancelModal = document.getElementById('btnCancelModal');
    const resForm = document.getElementById('reservationForm');

    if (btnCloseModal) btnCloseModal.addEventListener('click', () => resModal.classList.add('hidden'));
    if (btnCancelModal) btnCancelModal.addEventListener('click', () => resModal.classList.add('hidden'));

    if (resForm) {
      resForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const room = document.getElementById('resRoomSelect').value;
        const date = document.getElementById('resDate').value;
        const subject = document.getElementById('resSubject').value;
        const faculty = document.getElementById('resFaculty').value;

        const newId = `RES-${Math.floor(1000 + Math.random() * 9000)}`;
        State.studentReservations.unshift({
          id: newId,
          room,
          subject,
          faculty,
          date: date || 'Upcoming',
          time: 'Scheduled',
          status: 'Pending Admin Confirmation',
          statusType: 'pending'
        });

        resModal.classList.add('hidden');
        resForm.reset();
        window.showToast(`Reservation ${newId} submitted successfully!`, 'success');
        renderViewForRole(State.detectedRole, State.user);
      });
    }

    // 7. Slip Modal dismiss
    const slipModal = document.getElementById('slipModal');
    const btnCloseSlipModal = document.getElementById('btnCloseSlipModal');
    const btnDismissSlip = document.getElementById('btnDismissSlip');
    if (btnCloseSlipModal) btnCloseSlipModal.addEventListener('click', () => slipModal.classList.add('hidden'));
    if (btnDismissSlip) btnDismissSlip.addEventListener('click', () => slipModal.classList.add('hidden'));

    // 8. Toast Close
    const btnCloseToast = document.getElementById('btnCloseToast');
    if (btnCloseToast) {
      btnCloseToast.addEventListener('click', () => {
        const toast = document.getElementById('dashboardToast');
        if (toast) toast.classList.add('translate-y-12', 'opacity-0');
      });
    }
  }

  // ==========================================
  // 13. GLOBAL WINDOW ACTIONS
  // ==========================================
  window.openReservationModal = function (defaultRoom) {
    const modal = document.getElementById('reservationModal');
    const roomSelect = document.getElementById('resRoomSelect');
    if (roomSelect && defaultRoom) {
      for (let opt of roomSelect.options) {
        if (opt.text.includes(defaultRoom) || opt.value.includes(defaultRoom)) {
          opt.selected = true;
          break;
        }
      }
    }
    if (modal) modal.classList.remove('hidden');
  };

  window.viewDigitalPass = function (resId) {
    const modal = document.getElementById('slipModal');
    const content = document.getElementById('slipContent');
    if (!modal || !content) return;

    const res = State.studentReservations.find(r => r.id === resId) ||
                State.adminHistoryToday.find(r => r.ref === resId) ||
                { id: resId, room: 'Lab 301', subject: 'Classroom Activity', faculty: 'Dr. Alicia Reyes', time: '10:00 AM - 1:00 PM' };

    content.innerHTML = `
      <div class="text-center pb-2 border-b border-gray-200">
        <p class="font-bold text-xs text-[#880000]">POLYTECHNIC UNIVERSITY OF THE PHILIPPINES</p>
        <p class="text-[10px] text-gray-500 uppercase">Canlalay Campus &bull; Room Reservation Slip</p>
      </div>
      <div class="bg-gray-50 p-3 rounded-[3px] border border-gray-200 space-y-2 text-xs">
        <div class="flex justify-between"><span class="text-gray-500">Pass Reference:</span><strong class="text-[#880000] font-mono">${esc(res.id || res.ref || resId)}</strong></div>
        <div class="flex justify-between"><span class="text-gray-500">Facility:</span><strong class="text-gray-800">${esc(res.room)}</strong></div>
        <div class="flex justify-between"><span class="text-gray-500">Subject:</span><strong class="text-gray-800">${esc(res.subject || res.purpose)}</strong></div>
        <div class="flex justify-between"><span class="text-gray-500">Schedule:</span><span>${esc(res.time || '10:00 AM - 1:00 PM')}</span></div>
      </div>
      <div class="border-2 border-dashed border-gray-300 p-2 text-center rounded text-xs font-mono">
        ||| | ||||| || |||||| | ||||| ||| |||| |
        <p class="text-[10px] text-emerald-600 font-bold mt-1">STATUS: VERIFIED PASS</p>
      </div>
    `;

    modal.classList.remove('hidden');
  };

  window.cancelReservation = function (id) {
    if (confirm(`Cancel reservation ${id}?`)) {
      State.studentReservations = State.studentReservations.filter(r => r.id !== id);
      window.showToast(`Reservation ${id} cancelled`, 'info');
      renderViewForRole(State.detectedRole, State.user);
    }
  };

  window.endorseStudentRequest = function (id, name) {
    State.facultyPendingApprovals = State.facultyPendingApprovals.filter(r => r.id !== id);
    window.showToast(`Endorsed request for ${name} (${id})`, 'success');
    renderViewForRole(State.detectedRole, State.user);
  };

  window.declineStudentRequest = function (id, name) {
    if (confirm(`Decline request ${id} from ${name}?`)) {
      State.facultyPendingApprovals = State.facultyPendingApprovals.filter(r => r.id !== id);
      window.showToast(`Declined request ${id}`, 'warning');
      renderViewForRole(State.detectedRole, State.user);
    }
  };

  // Toast System
  let toastTimer = null;
  window.showToast = function (message, type = 'info') {
    const toast = document.getElementById('dashboardToast');
    const msgEl = document.getElementById('toastMessage');
    const iconContainer = document.getElementById('toastIconContainer');
    if (!toast || !msgEl) return;

    msgEl.textContent = message;

    if (iconContainer) {
      if (type === 'success') iconContainer.className = 'p-1 rounded bg-emerald-600 text-white shrink-0';
      else if (type === 'warning') iconContainer.className = 'p-1 rounded bg-amber-600 text-white shrink-0';
      else iconContainer.className = 'p-1 rounded bg-[#880000] text-white shrink-0';
    }

    toast.classList.remove('translate-y-12', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('translate-y-12', 'opacity-0');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 3200);
  };

  // ==========================================
  // 14. INITIALIZE ON DOM READY
  // ==========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }

})();