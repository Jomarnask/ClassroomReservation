/**
 * PUP Canlalay Campus CRS - Browse Rooms & Today/Tomorrow Timetable Controller
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

  // ── Constants & Helpers ─────────────────────────────────────────────────
  const ICONS = {
    'Library': '📚',
    'Campus Library': '📚',
    'Reading Room': '📖',
    'Prayers Room': '🕌',
    'Sports Dev Office': '🏅'
  };

  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

  // ── Default Campus Rooms (Floors 1 - 4) ──────────────────────────────────
  const DEFAULT_ROOMS = [
    // 1st Floor
    { id: 101, number: '101', name: 'General Lecture Hall', floor: 1, roomType: 'lecture', active: true, capacity: 55, features: 'Air-conditioned, Projector, Whiteboard' },
    { id: 102, number: '102', name: 'Lecture Room 102', floor: 1, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Ceiling Fans' },
    { id: 103, number: '103', name: 'Lecture Room 103', floor: 1, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Air-conditioned' },
    { id: 104, number: '104', name: 'Lecture Room 104', floor: 1, roomType: 'lecture', active: false, capacity: 40, features: 'Whiteboard, Ceiling Fans (Under Maintenance)' },
    { id: 105, number: '105', name: 'Lecture Room 105', floor: 1, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Air-conditioned' },
    { id: 106, number: '106', name: 'Lecture Room 106', floor: 1, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
    { id: 107, number: '107', name: 'Lecture Room 107', floor: 1, roomType: 'lecture', active: true, capacity: 50, features: 'Projector, Whiteboard' },
    { id: 113, number: '113', name: 'Lecture Room 113', floor: 1, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Air-conditioned' },
    { id: 114, number: '114', name: 'Lecture Room 114', floor: 1, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
    { id: 115, number: '115', name: 'Lecture Room 115', floor: 1, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Air-conditioned' },
    { id: 117, number: '117', name: 'Lecture Room 117', floor: 1, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
    { id: 121, number: '121', name: 'Lecture Room 121', floor: 1, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
    { id: 198, number: 'Sports Dev Office', name: 'Sports Dev Office', floor: 1, roomType: 'office', active: true, capacity: 20, features: 'Athletics Equipment, Admin Desk' },
    { id: 199, number: 'Prayers Room', name: 'Prayers Room', floor: 1, roomType: 'other', active: true, capacity: 25, features: 'Quiet Multi-Faith Prayer Area' },

    // 2nd Floor
    { id: 201, number: '201', name: 'Lecture Room 201', floor: 2, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Air-conditioned' },
    { id: 202, number: '202', name: 'Room 202 - Seminar Hall', floor: 2, roomType: 'lecture', active: true, capacity: 35, features: 'Round Table Setup, TV Display, WiFi' },
    { id: 203, number: '203', name: 'Lecture Room 203', floor: 2, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
    { id: 205, number: '205', name: 'Lecture Room 205', floor: 2, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Air-conditioned' },
    { id: 207, number: '207', name: 'Lecture Room 207', floor: 2, roomType: 'lecture', active: false, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
    { id: 208, number: '208', name: 'Room 208 - Multimedia Room', floor: 2, roomType: 'laboratory', active: true, capacity: 50, features: 'Surround Audio, 4K Display, HDMI' },
    { id: 209, number: '209', name: 'Lecture Room 209', floor: 2, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
    { id: 211, number: '211', name: 'Lecture Room 211', floor: 2, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Air-conditioned' },
    { id: 221, number: '221', name: 'Lecture Room 221', floor: 2, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
    { id: 299, number: 'Reading Room', name: 'Reading Room', floor: 2, roomType: 'other', active: true, capacity: 30, features: 'Study Carrels, Individual Lighting' },

    // 3rd Floor
    { id: 301, number: '301', name: 'Lab 301 - Advanced Networking Lab', floor: 3, roomType: 'laboratory', active: true, capacity: 45, features: 'Cisco Racks, Dual Projectors, Linux Terminals' },
    { id: 302, number: '302', name: 'Lecture Room 302', floor: 3, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Air-conditioned' },
    { id: 303, number: '303', name: 'Lab 303 - Hardware & IoT Lab', floor: 3, roomType: 'laboratory', active: true, capacity: 30, features: 'Arduino Kits, Oscilloscopes, Soldering' },
    { id: 304, number: '304', name: 'Lecture Room 304', floor: 3, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Ceiling Fans' },
    { id: 305, number: '305', name: 'Lab 305 - Software Engineering Lab', floor: 3, roomType: 'laboratory', active: true, capacity: 40, features: 'Workstations, Gigabit LAN, Docker Hosts' },
    { id: 306, number: '306', name: 'Lecture Room 306', floor: 3, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Air-conditioned' },
    { id: 307, number: '307', name: 'Lecture Room 307', floor: 3, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Ceiling Fans' },
    { id: 399, number: 'Library', name: 'Campus Library', floor: 3, roomType: 'other', active: true, capacity: 80, features: 'Reference Section, Digital Catalogs, Quiet Zone' },

    // 4th Floor
    { id: 401, number: '401', name: 'Lecture Room 401', floor: 4, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Air-conditioned' },
    { id: 402, number: '402', name: 'Room 402 - Lecture Hall', floor: 4, roomType: 'lecture', active: true, capacity: 60, features: 'Smart TV, Split AC, Whiteboard' },
    { id: 403, number: '403', name: 'Lecture Room 403', floor: 4, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Ceiling Fans' },
    { id: 404, number: '404', name: 'Room 404 - Research & Dev Room', floor: 4, roomType: 'laboratory', active: false, capacity: 20, features: 'Dual Monitor Stations, High-speed LAN' },
    { id: 405, number: '405', name: 'Lecture Room 405', floor: 4, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
    { id: 406, number: '406', name: 'Lecture Room 406', floor: 4, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Air-conditioned' },
  ];

  // ── Default Scheduled Classes (BLUE) ──
  const DEFAULT_CLASS_SCHEDULES = [
    { id: 'CLS-202-TUE', roomId: '202', section: 'BSIT 2-2', subject: 'Object-Oriented Programming', code: 'IT202', day: 'Tuesday', start: '08:00 AM', end: '01:00 PM', startMinutes: 480, endMinutes: 780, faculty: 'Engr. Roberto Cruz' },
    { id: 'CLS-301-TUE-1', roomId: '301', section: 'BSIT 3-1', subject: 'Multimedia', code: 'COMP 017', day: 'Tuesday', start: '07:30 AM', end: '10:30 AM', startMinutes: 450, endMinutes: 630, faculty: 'Aaron Atienza' },
    { id: 'CLS-301-TUE-2', roomId: '301', section: 'BSCS 3-1', subject: 'Fundamentals of Research', code: 'COMP 015', day: 'Tuesday', start: '01:00 PM', end: '04:00 PM', startMinutes: 780, endMinutes: 960, faculty: 'McJoben Reyes' },
    { id: 'CLS-301-WED-1', roomId: '301', section: 'BSIT 2-1', subject: 'Web Development', code: 'COMP 016', day: 'Wednesday', start: '09:00 AM', end: '02:00 PM', startMinutes: 540, endMinutes: 840, faculty: 'Noel Antonio' },
    { id: 'CLS-301-WED-2', roomId: '301', section: 'BSIT 2-2', subject: 'Database Administration', code: 'COMP 018', day: 'Wednesday', start: '03:00 PM', end: '08:00 PM', startMinutes: 900, endMinutes: 1200, faculty: 'McJoben Reyes' },
    { id: 'CLS-301-SAT-1', roomId: '301', section: 'BSIT 3-2', subject: 'System Integration and Architecture 1', code: 'INTE 301', day: 'Saturday', start: '01:00 PM', end: '04:00 PM', startMinutes: 780, endMinutes: 960, faculty: 'Indaleen Quinsayas' },
    { id: 'CLS-301-SAT-2', roomId: '301', section: 'BSIT 3-2', subject: 'Project Management', code: 'ELECT IT E-1', day: 'Saturday', start: '05:00 PM', end: '08:00 PM', startMinutes: 1020, endMinutes: 1200, faculty: 'Indaleen Quinsayas' },
    { id: 'CLS-402-WED', roomId: '402', section: 'BSIT 3-2', subject: 'Web Systems and Technologies', code: 'IT305', day: 'Wednesday', start: '01:30 PM', end: '04:30 PM', startMinutes: 810, endMinutes: 990, faculty: 'Engr. Roberto Cruz' },
    { id: 'CLS-402-FRI', roomId: '402', section: 'BSIT 3-2', subject: 'Web Systems Capstone Defense', code: 'IT305', day: 'Friday', start: '01:30 PM', end: '04:30 PM', startMinutes: 810, endMinutes: 990, faculty: 'Engr. Roberto Cruz' },
    { id: 'CLS-305-FRI', roomId: '305', section: 'BSIT 3-1', subject: 'Software Engineering Capstone', code: 'CS301', day: 'Friday', start: '08:00 AM', end: '11:00 AM', startMinutes: 480, endMinutes: 660, faculty: 'Prof. Ferdinand Silva' },
    { id: 'CLS-101-MON', roomId: '101', section: 'BSIT 1-1', subject: 'Purposive Communication', code: 'GEED 006', day: 'Monday', start: '07:30 AM', end: '09:00 AM', startMinutes: 450, endMinutes: 540, faculty: 'Prof. Dante Santos' },
    { id: 'CLS-101-WED', roomId: '101', section: 'BSIT 1-1', subject: 'Oral Communication in Context', code: 'GEED 006', day: 'Wednesday', start: '07:30 AM', end: '09:00 AM', startMinutes: 450, endMinutes: 540, faculty: 'Prof. Dante Santos' }
  ];

  // ── Default Student/User Reservations (YELLOW = Pending, RED = Approved) ──
  const DEFAULT_RESERVATIONS = [
    { id: 'RES-9014', roomId: '301', day: 'Thursday', date: '', start: '10:00 AM', end: '01:00 PM', startMinutes: 600, endMinutes: 780, subject: 'Operating Systems Kernel Practical Exam', faculty: 'Dr. Alicia Reyes', requester: 'Danilo Santos (BSIT 3-1)', status: 'pending' },
    { id: 'RES-9008', roomId: '301', day: 'Friday', date: '', start: '08:30 AM', end: '11:30 AM', startMinutes: 510, endMinutes: 690, subject: 'Cisco Routing Switch Mock Certification', faculty: 'Dr. Alicia Reyes', requester: 'Bea Alonzo (BSCS 3-2)', status: 'approved' },
    { id: 'RES-9007', roomId: '402', day: 'Monday', date: '', start: '09:00 AM', end: '12:00 PM', startMinutes: 540, endMinutes: 720, subject: 'Database Systems Midterm Exam Make-up', faculty: 'Engr. Roberto Cruz', requester: 'Christian Diaz (BSCPE 4-1)', status: 'approved' },
    { id: 'RES-9012', roomId: '305', day: 'Thursday', date: '', start: '08:00 AM', end: '10:00 AM', startMinutes: 480, endMinutes: 600, subject: 'Agile Software Testing Mock Sprint', faculty: 'Prof. Ferdinand Silva', requester: 'Samantha Ramos (BSIT 3-2)', status: 'pending' },
    { id: 'RES-8702', roomId: '208', day: 'Friday', date: '', start: '01:00 PM', end: '04:00 PM', startMinutes: 780, endMinutes: 960, subject: 'Embedded Systems Hardware Defense', faculty: 'Prof. Maria Morales', requester: 'Christian Diaz', status: 'pending' }
  ];

  // ── Time Conversion Utilities ───────────────────────────────────────────
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

  function getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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
    rooms: [],
    byId: {},
    selectedRoom: null,
    classSchedules: [],
    reservations: [],
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
    }, 4000);
  }

  // ── Persistence: Class Schedules & Reservations ─────────────────────────
  function loadData() {
    try {
      const storedClasses = localStorage.getItem('crs_room_class_schedules');
      if (storedClasses) {
        state.classSchedules = JSON.parse(storedClasses);
      } else {
        state.classSchedules = [...DEFAULT_CLASS_SCHEDULES];
        localStorage.setItem('crs_room_class_schedules', JSON.stringify(state.classSchedules));
      }
    } catch (e) {
      state.classSchedules = [...DEFAULT_CLASS_SCHEDULES];
    }

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

  function saveReservation(newRes) {
    state.reservations.push(newRes);
    try {
      localStorage.setItem('crs_custom_reservations', JSON.stringify(state.reservations));
    } catch (e) {
      console.warn('Could not persist reservation:', e);
    }
  }

  // ── Auth Guard & Profile ────────────────────────────────────────────────
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
        <a href="browse-rooms.html" class="pup-nav-item active">Browse Rooms</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="all-reservations.html" class="pup-nav-item">All Reservations</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="user-approvals.html" class="pup-nav-item">User Approvals</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="logs.html" class="pup-nav-item">Logs</a>
      `;
    } else if (role === 'Faculty') {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-item">Dashboard</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item active">Browse Rooms</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="schedule.html" class="pup-nav-item">Schedule</a>
      `;
    } else {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-item">Dashboard</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item active">Browse Rooms</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="my-reservations.html" class="pup-nav-item">My Reservations</a>
      `;
    }
  }

  // ── Load Rooms ──────────────────────────────────────────────────────────
  async function loadRooms() {
    let loaded = [];

    if (client) {
      try {
        const { data, error } = await client
          .from('rooms')
          .select('room_id, room_number, room_name, floor, room_type, is_active')
          .order('floor', { ascending: true })
          .order('room_id', { ascending: true });

        if (!error && data && data.length > 0) {
          loaded = data.map(r => ({
            id: r.room_id,
            number: r.room_number || '',
            name: r.room_name || '',
            floor: r.floor ?? 1,
            roomType: r.room_type || 'other',
            active: r.is_active !== false,
            capacity: 45,
            features: r.room_name || 'Standard Instructional Classroom'
          }));
        }
      } catch (e) {
        console.warn('Notice loading Supabase rooms:', e);
      }
    }

    if (loaded.length === 0) {
      loaded = DEFAULT_ROOMS;
    }

    state.rooms = loaded;
    state.byId = {};
    state.rooms.forEach(r => {
      state.byId[String(r.id)] = r;
      if (r.number) state.byId[String(r.number)] = r;
    });

    renderFloors();
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
  function selectRoom(r) {
    if (!r || !r.active) return;
    state.selectedRoom = r;

    document.querySelectorAll('.room').forEach(btn => {
      const matches = btn.dataset.id === String(r.id) || btn.dataset.number === String(r.number);
      btn.classList.toggle('selected', matches);
    });

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

  // ── Render Today & Tomorrow Room Timetable Overlay ────────────────────────────
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

    const titleEl = document.getElementById('ttRoomTitle');
    if (titleEl) titleEl.textContent = displayName(r);

    const metaEl = document.getElementById('ttRoomMeta');
    if (metaEl) {
      metaEl.textContent = `${floorData.name} (${floorData.sub}) • Capacity: ${r.capacity || 45} Students • ${r.features || 'Instructional Room'}`;
    }

    const activeDays = getTodayAndTomorrowDates();

    const weekLabel = document.getElementById('ttWeekRangeLabel');
    if (weekLabel) {
      weekLabel.textContent = `Schedule: ${activeDays[0].shortDate} & ${activeDays[1].shortDate}`;
    }

    const headersContainer = document.getElementById('timetableDaysHeader');
    if (headersContainer) {
      headersContainer.innerHTML = activeDays.map((wd, idx) => `
        <div class="p-3 border-r border-gray-200 ${idx === 1 ? 'border-r-0' : ''} bg-red-50/50">
          <div class="font-extrabold text-xs uppercase tracking-wider text-[#880000]">${wd.labelPrefix} (${wd.dayName})</div>
          <div class="text-[11px] text-gray-600 font-bold mt-0.5">${wd.shortDate.split('• ')[1]}</div>
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

      const dayClasses = state.classSchedules.filter(c => {
        const matchRoom = String(c.roomId) === String(r.id) || String(c.roomId) === String(r.number);
        const matchDay = c.day && c.day.toLowerCase() === wd.dayName.toLowerCase();
        return matchRoom && matchDay;
      }).map(c => ({
        ...c,
        isClassSchedule: true,
        type: 'blue'
      }));

      const dayReservations = state.reservations.filter(b => {
        const matchRoom = String(b.roomId) === String(r.id) || String(b.roomId) === String(r.number);
        const matchDate = b.date === wd.dateStr;
        const matchDay = (!b.date || b.date === '') && b.day && b.day.toLowerCase() === wd.dayName.toLowerCase();
        return matchRoom && (matchDate || matchDay) && b.status !== 'rejected';
      }).map(b => ({
        ...b,
        isClassSchedule: false,
        type: String(b.status).toLowerCase() === 'approved' ? 'red' : 'yellow'
      }));

      const allEvents = [...dayClasses, ...dayReservations];
      allEvents.sort((a, b) => {
        const aStart = a.startMinutes ?? timeToMinutes(a.start);
        const bStart = b.startMinutes ?? timeToMinutes(b.start);
        return aStart - bStart;
      });

      allEvents.forEach(item => {
        const iStart = item.startMinutes ?? timeToMinutes(item.start);
        const iEnd = item.endMinutes ?? timeToMinutes(item.end);

        const visualStart = Math.max(iStart, startBoundary);
        const visualEnd = Math.min(iEnd, endBoundary);

        if (visualEnd <= visualStart) return;

        const top = visualStart - startBoundary;
        const height = Math.max((visualEnd - visualStart) - 4, 38);

        const card = document.createElement('div');

        if (item.isClassSchedule) {
          card.className = 'schedule-card class-schedule';
          card.style.top = `${top}px`;
          card.style.height = `${height}px`;

          card.innerHTML = `
            <div class="card-top-bar"></div>
            <div class="card-title text-[#1d4ed8]">${esc(item.subject)}</div>
            <div class="card-time text-[#2563eb]">${item.start} – ${item.end}</div>
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
            showToast(`[Scheduled Class] ${item.section}: ${item.subject} (${item.start} – ${item.end}) by Prof. ${item.faculty || 'Unassigned'}`);
          });

        } else if (item.type === 'red') {
          card.className = 'schedule-card occupied';
          card.style.top = `${top}px`;
          card.style.height = `${height}px`;

          card.innerHTML = `
            <div class="card-top-bar"></div>
            <div class="card-title text-[#880000]">${esc(item.subject || 'Room Reservation')}</div>
            <div class="card-time text-[#b91c1c]">${item.start} – ${item.end}</div>
            <div class="card-meta">
              <div>Faculty: ${esc(item.faculty || 'Unassigned')}</div>
              <div class="text-gray-500 mt-0.5">Applicant: ${esc(item.requester || 'Student')}</div>
              <div class="mt-1">
                <span class="inline-block text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                  Approved / Occupied
                </span>
              </div>
            </div>
          `;

          card.addEventListener('click', (e) => {
            e.stopPropagation();
            showToast(`[Approved Reservation] ${item.subject} (${item.start} – ${item.end}) • Tagged: ${item.faculty}`);
          });

        } else {
          card.className = 'schedule-card pending';
          card.style.top = `${top}px`;
          card.style.height = `${height}px`;

          card.innerHTML = `
            <div class="card-top-bar"></div>
            <div class="card-title text-[#b45309]">${esc(item.subject || 'Reservation Request')}</div>
            <div class="card-time text-[#d97706]">${item.start} – ${item.end}</div>
            <div class="card-meta">
              <div>Faculty: ${esc(item.faculty || 'Unassigned')}</div>
              <div class="text-gray-500 mt-0.5">Applicant: ${esc(item.requester || 'Student')}</div>
              <div class="mt-1">
                <span class="inline-block text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                  Pending Approval
                </span>
              </div>
            </div>
          `;

          card.addEventListener('click', (e) => {
            e.stopPropagation();
            showToast(`[Pending Request] ${item.subject} (${item.start} – ${item.end}) • Awaiting Admin Confirmation`);
          });
        }

        colEl.appendChild(card);
      });

      let currentPointer = startBoundary;
      allEvents.forEach(item => {
        const iStart = item.startMinutes ?? timeToMinutes(item.start);
        const iEnd = item.endMinutes ?? timeToMinutes(item.end);

        if (iStart > currentPointer) {
          renderAvailableSlot(colEl, currentPointer, iStart, wd.dateStr, wd.dayName, r);
        }
        currentPointer = Math.max(currentPointer, iEnd);
      });

      if (currentPointer < endBoundary) {
        renderAvailableSlot(colEl, currentPointer, endBoundary, wd.dateStr, wd.dayName, r);
      }

      gridBody.appendChild(colEl);
    });
  }

  // ── Render Green Available Slot Block (Blocks Past Hours) ───────────────────
  function renderAvailableSlot(container, startMin, endMin, dateStr, dayName, room) {
    const todayStr = getTodayString();
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    // Do not show slots that are completely in the past for today
    if (dateStr === todayStr && endMin <= currentMins) {
      return;
    }

    // Clip slot start to current time if starting in the past today
    let effectiveStartMin = startMin;
    if (dateStr === todayStr && startMin < currentMins) {
      effectiveStartMin = Math.ceil(currentMins / 30) * 30;
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
        <div>Click to Reserve this time slot</div>
        <div class="text-[10px] font-semibold text-emerald-700 mt-1 flex items-center gap-1">
          <span>+ Reserve Slot</span>
        </div>
      </div>
    `;

    slotCard.addEventListener('click', () => {
      const preferredEndMin = Math.min(effectiveStartMin + 60, endMin);
      openReservationModal(startStr, minutesToTime(preferredEndMin), dateStr);
    });

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

  // ── Open Reservation Modal Panel (Restricted to Today & Tomorrow) ───────────
  function openReservationModal(preferredStart, preferredEnd, preferredDate) {
    const r = state.selectedRoom;
    if (!r) return;

    const overlay = document.getElementById('reservationOverlay');
    if (!overlay) return;

    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = `Reserve a Time - ${displayName(r)}`;

    const roomNameEl = document.getElementById('modalRoomName');
    if (roomNameEl) roomNameEl.textContent = displayName(r);

    const roomFloorEl = document.getElementById('modalRoomFloor');
    if (roomFloorEl) roomFloorEl.textContent = `${floorMeta(r.floor).name} • ${roomTypeLabel(r.roomType)}`;

    const dates = getTodayAndTomorrowDates();
    const dateInput = document.getElementById('resDate');
    if (dateInput) {
      dateInput.min = dates[0].dateStr; // Today
      dateInput.max = dates[1].dateStr; // Tomorrow
      dateInput.value = preferredDate || dates[0].dateStr;
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

  // ── Live Conflict Validation (Rejects Past Dates / Past Hours) ──────────────
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
    const todayStr = getTodayString();
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    let type = 'ok';
    let msg = 'Selected slot is clear of schedule conflicts. Request will be submitted for Admin approval.';
    let isValid = true;

    if (!dateVal) {
      type = 'bad';
      msg = 'Reservation date is required.';
      isValid = false;
    } else if (dateVal < todayStr) {
      type = 'bad';
      msg = 'Invalid Date: You cannot view or reserve room slots for past dates.';
      isValid = false;
    } else if (dateVal === todayStr && sMins < currentMins) {
      type = 'bad';
      msg = 'Invalid Time: Selected start time has already passed for today.';
      isValid = false;
    } else if (eMins <= sMins) {
      type = 'bad';
      msg = 'Invalid Time: Reservation End must be later than Reservation Start.';
      isValid = false;
    } else {
      const dObj = new Date(dateVal + 'T00:00:00');
      const dayIndex = dObj.getDay();
      const dayName = DAY_NAMES[dayIndex === 0 ? 6 : dayIndex - 1];

      const classConflict = state.classSchedules.find(c => {
        const matchRoom = String(c.roomId) === String(r.id) || String(c.roomId) === String(r.number);
        const matchDay = c.day && c.day.toLowerCase() === dayName.toLowerCase();
        if (!matchRoom || !matchDay) return false;
        const cStart = c.startMinutes ?? timeToMinutes(c.start);
        const cEnd = c.endMinutes ?? timeToMinutes(c.end);
        return cStart < eMins && cEnd > sMins;
      });

      if (classConflict) {
        type = 'bad';
        msg = `Class Schedule Conflict: Room is reserved for scheduled class "${classConflict.subject}" (${classConflict.section}) from ${classConflict.start} to ${classConflict.end}.`;
        isValid = false;
      } else {
        const resConflict = state.reservations.find(b => {
          const matchRoom = String(b.roomId) === String(r.id) || String(b.roomId) === String(r.number);
          const matchDate = b.date === dateVal;
          const matchDay = (!b.date || b.date === '') && b.day && b.day.toLowerCase() === dayName.toLowerCase();
          if (!matchRoom || (!matchDate && !matchDay) || b.status === 'rejected') return false;
          const bStart = b.startMinutes ?? timeToMinutes(b.start);
          const bEnd = b.endMinutes ?? timeToMinutes(b.end);
          return bStart < eMins && bEnd > sMins;
        });

        if (resConflict) {
          type = 'bad';
          const isAppr = String(resConflict.status).toLowerCase() === 'approved';
          msg = `Reservation Conflict: Slot overlaps with an ${isAppr ? 'approved' : 'existing pending'} reservation "${resConflict.subject}" (${resConflict.start} – ${resConflict.end}).`;
          isValid = false;
        }
      }
    }

    alertBox.className = `alert ${type} p-2.5 rounded-[6px] text-xs border font-medium`;
    alertBox.textContent = (type === 'ok' ? '✔ ' : '✖ ') + msg;

    if (submitBtn) {
      submitBtn.disabled = !isValid;
      submitBtn.classList.toggle('opacity-50', !isValid);
      submitBtn.classList.toggle('cursor-not-allowed', !isValid);
    }

    return isValid;
  }

  // ── Handle Reservation Submit ───────────────────────────────────────────
  function handleReservationSubmit(e) {
    e.preventDefault();
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
      showToast('Cannot submit: Please resolve schedule conflicts.');
      return;
    }

    const dObj = new Date(dateVal + 'T00:00:00');
    const dayIndex = dObj.getDay();
    const dayName = DAY_NAMES[dayIndex === 0 ? 6 : dayIndex - 1];

    const refId = `RES-${Math.floor(1000 + Math.random() * 9000)}`;
    const newReservation = {
      id: refId,
      roomId: String(r.id),
      roomNumber: String(r.number),
      roomName: displayName(r),
      date: dateVal,
      day: dayName,
      start: startVal,
      end: endVal,
      startMinutes: timeToMinutes(startVal),
      endMinutes: timeToMinutes(endVal),
      faculty: facultyVal,
      subject: subjectVal,
      code: 'CRS-REQ',
      requester: state.profile?.full_name || 'Danilo Santos (Student)',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    saveReservation(newReservation);
    renderWeeklyTimetable();

    closeReservationModal();

    showToast(`Reservation request ${refId} submitted (Yellow)! Awaiting Admin review and approval.`);
  }

  // ── Fetch Faculty List ──────────────────────────────────────────────────
  async function fetchFacultyList() {
    if (!client) return;
    try {
      const { data, error } = await client
        .from('users')
        .select('full_name, role')
        .ilike('role', 'faculty');

      if (!error && data && data.length > 0) {
        const facultySel = document.getElementById('resFaculty');
        if (!facultySel) return;

        const existingNames = new Set([...facultySel.options].map(o => o.value));
        data.forEach(u => {
          if (u.full_name && !existingNames.has(u.full_name)) {
            const opt = document.createElement('option');
            opt.value = u.full_name;
            opt.textContent = `${u.full_name} (Faculty)`;
            facultySel.appendChild(opt);
          }
        });
      }
    } catch (e) {
      console.warn('Faculty list notice:', e);
    }
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

    window.addEventListener('storage', (e) => {
      if (e.key === 'crs_room_class_schedules' || e.key === 'crs_custom_reservations') {
        loadData();
        if (state.selectedRoom) renderWeeklyTimetable();
      }
    });
  }

  // ── Global Boot ─────────────────────────────────────────────────────────
  async function init() {
    try {
      loadData();
      populateTimeDropdowns();
      await guard();
      await loadRooms();
      await fetchFacultyList();
      wireEvents();
    } catch (err) {
      console.error('Browse rooms initialization error:', err);
      document.body.style.visibility = 'visible';
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