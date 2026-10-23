/**
 * PUP Canlalay Campus CRS - Browse Rooms & Weekly Timetable Controller
 *
 * Implements:
 * 1. Admin Room Management Floor Directory (identical layout and visual style).
 * 2. Visual Weekly Schedule Timetable (Monday to Sunday, 7:00 AM to 9:00 PM) matching the user's uploaded reference:
 *    - Red: Reserved / Occupied schedule blocks
 *    - Yellow: Pending reservation requests
 *    - Green: Available time slots (clickable to book)
 * 3. "Reserve a Time" modal panel getting:
 *    - "reservation date" calendar
 *    - "reservation start" dropdown (30-min interval, 7:00 AM to 8:30 PM)
 *    - "reservation end" dropdown (7:30 AM to 9:00 PM)
 *    - "faculty" dropdown
 *    - "subject/purpose" textfield
 *    - Status type: Reserved (Red) vs Pending (Yellow)
 * 4. Conflict detection, local persistence, week navigation, and Supabase auth guard.
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
    { id: 104, number: '104', name: 'Lecture Room 104', floor: 1, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
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
    { id: 207, number: '207', name: 'Lecture Room 207', floor: 2, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
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
    { id: 404, number: '404', name: 'Room 404 - Research & Dev Room', floor: 4, roomType: 'laboratory', active: true, capacity: 20, features: 'Dual Monitor Stations, High-speed LAN' },
    { id: 405, number: '405', name: 'Lecture Room 405', floor: 4, roomType: 'lecture', active: true, capacity: 40, features: 'Whiteboard, Ceiling Fans' },
    { id: 406, number: '406', name: 'Lecture Room 406', floor: 4, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Air-conditioned' },
  ];

  // ── Initial Mock Campus Schedules (Matching User's Screenshot & CITE Courses) ──
  const INITIAL_SCHEDULES = [
    // Lab 301
    { id: 'SCH-101', roomId: '301', day: 'Tuesday', start: '07:30 AM', end: '10:30 AM', startMinutes: 450, endMinutes: 630, subject: 'Multimedia Systems', code: 'COMP 017', faculty: 'Aaron Atienza', status: 'occupied' },
    { id: 'SCH-102', roomId: '301', day: 'Tuesday', start: '01:00 PM', end: '04:00 PM', startMinutes: 780, endMinutes: 960, subject: 'Fundamentals of Research', code: 'COMP 015', faculty: 'McJoben Reyes', status: 'occupied' },
    { id: 'SCH-103', roomId: '301', day: 'Tuesday', start: '05:00 PM', end: '08:00 PM', startMinutes: 1020, endMinutes: 1200, subject: 'Art Appreciation Lab', code: 'GEED 006', faculty: 'Mar Martinez', status: 'occupied' },

    { id: 'SCH-104', roomId: '301', day: 'Wednesday', start: '09:00 AM', end: '02:00 PM', startMinutes: 540, endMinutes: 840, subject: 'Web Development', code: 'COMP 016', faculty: 'Noel Antonio', status: 'occupied' },
    { id: 'SCH-105', roomId: '301', day: 'Wednesday', start: '03:00 PM', end: '08:00 PM', startMinutes: 900, endMinutes: 1200, subject: 'Database Administration', code: 'COMP 018', faculty: 'McJoben Reyes', status: 'occupied' },

    { id: 'SCH-106', roomId: '301', day: 'Thursday', start: '10:00 AM', end: '01:00 PM', startMinutes: 600, endMinutes: 780, subject: 'Operating Systems Kernel Defense', code: 'CS314', faculty: 'Alicia Reyes', status: 'pending' },

    { id: 'SCH-107', roomId: '301', day: 'Friday', start: '08:30 AM', end: '11:30 AM', startMinutes: 510, endMinutes: 690, subject: 'Advanced Packet Inspection', code: 'CS314', faculty: 'Alicia Reyes', status: 'occupied' },
    { id: 'SCH-108', roomId: '301', day: 'Friday', start: '01:30 PM', end: '04:30 PM', startMinutes: 810, endMinutes: 990, subject: 'Cisco Routing Switch Mock Exam', code: 'NET301', faculty: 'Alicia Reyes', status: 'pending' },

    { id: 'SCH-109', roomId: '301', day: 'Saturday', start: '01:00 PM', end: '04:00 PM', startMinutes: 780, endMinutes: 960, subject: 'System Integration and Architecture 1', code: 'INTE 301', faculty: 'Indaleen Quinsayas', status: 'occupied' },
    { id: 'SCH-110', roomId: '301', day: 'Saturday', start: '05:00 PM', end: '08:00 PM', startMinutes: 1020, endMinutes: 1200, subject: 'Project Management', code: 'ELECT IT E-1', faculty: 'Indaleen Quinsayas', status: 'occupied' },

    // Room 402
    { id: 'SCH-201', roomId: '402', day: 'Monday', start: '09:00 AM', end: '12:00 PM', startMinutes: 540, endMinutes: 720, subject: 'Database Systems Midterm Exam Make-up', code: 'IT201', faculty: 'Roberto Cruz', status: 'occupied' },
    { id: 'SCH-202', roomId: '402', day: 'Tuesday', start: '10:00 AM', end: '12:00 PM', startMinutes: 600, endMinutes: 720, subject: 'ACM Programming Review Session', code: 'CS301', faculty: 'Roberto Cruz', status: 'pending' },
    { id: 'SCH-203', roomId: '402', day: 'Wednesday', start: '01:30 PM', end: '04:30 PM', startMinutes: 810, endMinutes: 990, subject: 'IT305 - Web Systems & Technologies', code: 'IT305', faculty: 'Roberto Cruz', status: 'occupied' },
    { id: 'SCH-204', roomId: '402', day: 'Friday', start: '01:30 PM', end: '04:30 PM', startMinutes: 810, endMinutes: 990, subject: 'IT305 - Web Systems Capstone Defense', code: 'IT305', faculty: 'Roberto Cruz', status: 'occupied' },

    // Lab 305
    { id: 'SCH-301', roomId: '305', day: 'Thursday', start: '08:00 AM', end: '10:00 AM', startMinutes: 480, endMinutes: 600, subject: 'Agile Software Testing Mock Sprint', code: 'CS301', faculty: 'Ferdinand Silva', status: 'pending' },
    { id: 'SCH-302', roomId: '305', day: 'Friday', start: '08:00 AM', end: '11:00 AM', startMinutes: 480, endMinutes: 660, subject: 'CS301 - Software Engineering Capstone', code: 'CS301', faculty: 'Ferdinand Silva', status: 'occupied' },

    // Room 208
    { id: 'SCH-401', roomId: '208', day: 'Monday', start: '07:30 AM', end: '10:30 AM', startMinutes: 450, endMinutes: 630, subject: 'Data Structures Consultation', code: 'CS201', faculty: 'Maria Morales', status: 'occupied' },
    { id: 'SCH-402', roomId: '208', day: 'Wednesday', start: '03:00 PM', end: '08:00 PM', startMinutes: 900, endMinutes: 1200, subject: 'Database Administration Laboratory', code: 'COMP 018', faculty: 'Maria Morales', status: 'occupied' },
    { id: 'SCH-403', roomId: '208', day: 'Friday', start: '01:00 PM', end: '04:00 PM', startMinutes: 780, endMinutes: 960, subject: 'Embedded Systems Hardware Defense', code: 'BSCPE 4', faculty: 'Maria Morales', status: 'pending' },

    // Room 101
    { id: 'SCH-501', roomId: '101', day: 'Monday', start: '07:30 AM', end: '09:00 AM', startMinutes: 450, endMinutes: 540, subject: 'GEED 006 - Purposive Communication', code: 'GEED 006', faculty: 'Dante Santos', status: 'occupied' },
    { id: 'SCH-502', roomId: '101', day: 'Wednesday', start: '07:30 AM', end: '09:00 AM', startMinutes: 450, endMinutes: 540, subject: 'Oral Communication in Context', code: 'GEED 006', faculty: 'Dante Santos', status: 'occupied' },
    { id: 'SCH-503', roomId: '101', day: 'Thursday', start: '01:00 PM', end: '03:30 PM', startMinutes: 780, endMinutes: 930, subject: 'Student Council General Assembly', code: 'ORGS', faculty: 'Dante Santos', status: 'pending' },
    { id: 'SCH-504', roomId: '101', day: 'Saturday', start: '01:00 PM', end: '04:00 PM', startMinutes: 780, endMinutes: 960, subject: 'System Integration and Architecture 1', code: 'INTE 301', faculty: 'Indaleen Quinsayas', status: 'occupied' }
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

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay(); // 0 = Sunday, 1 = Monday ...
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  }

  function getWeekDates(baseMonday) {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseMonday);
      d.setDate(baseMonday.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push({
        dateStr: `${y}-${m}-${day}`,
        dayName: DAY_NAMES[i],
        shortDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
    currentMonday: getMonday(new Date()),
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

  // ── Persistence ─────────────────────────────────────────────────────────
  function loadReservations() {
    let custom = [];
    try {
      const stored = localStorage.getItem('crs_custom_reservations');
      if (stored) custom = JSON.parse(stored);
    } catch (e) {
      console.warn('Could not read custom reservations from localStorage:', e);
    }
    state.reservations = [...INITIAL_SCHEDULES, ...custom];
  }

  function saveReservation(newRes) {
    state.reservations.push(newRes);
    try {
      const stored = localStorage.getItem('crs_custom_reservations');
      const list = stored ? JSON.parse(stored) : [];
      list.push(newRes);
      localStorage.setItem('crs_custom_reservations', JSON.stringify(list));
    } catch (e) {
      console.warn('Could not persist reservation to localStorage:', e);
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
        <a href="dashboard.html" class="pup-nav-item">Schedule</a>
      `;
    } else {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-item">Dashboard</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="browse-rooms.html" class="pup-nav-item active">Browse Rooms</a>
        <span class="text-white/50 font-light select-none">|</span>
        <a href="dashboard.html" class="pup-nav-item">My Reservations</a>
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

    state.selectedRoom = state.byId['301'] || state.byId['101'] || state.rooms[0];

    renderFloors();
    renderWeeklyTimetable();
  }

  // ── Render Floor Manager Directory (Identical to Admin Room Management) ──
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
            <small>${esc(meta.sub)} • ${floorRooms.length} Rooms</small>
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
        b.title = displayName(r) + '\nFloor: ' + meta.name + '\nType: ' + roomTypeLabel(r.roomType) + '\nStatus: ' + (r.active ? 'Available' : 'Inactive');

        const icon = iconFor(r) ? `<span class="fi" aria-hidden="true">${iconFor(r)}</span>` : '';
        const text = displayName(r);

        b.innerHTML = `${icon}<span>${esc(text)}</span><span class="badge" aria-hidden="true"></span>`;
        b.addEventListener('click', () => selectRoom(r));
        grid.appendChild(b);
      });

      floorsEl.appendChild(col);
    });
  }

  function selectRoom(r) {
    if (!r) return;
    state.selectedRoom = r;

    document.querySelectorAll('.room').forEach(btn => {
      const matches = btn.dataset.id === String(r.id) || btn.dataset.number === String(r.number);
      btn.classList.toggle('selected', matches);
    });

    renderWeeklyTimetable();

    const ttSection = document.getElementById('timetableSection');
    if (ttSection) {
      ttSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ── Render Weekly Schedule Timetable (7:00 AM – 9:00 PM) ────────────────
  function renderWeeklyTimetable() {
    const r = state.selectedRoom;
    if (!r) return;

    const floorData = floorMeta(r.floor);

    // Update Room Header
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

    // Week Dates Calculation
    const weekDays = getWeekDates(state.currentMonday);

    const weekLabel = document.getElementById('ttWeekRangeLabel');
    if (weekLabel) {
      weekLabel.textContent = `${weekDays[0].shortDate} – ${weekDays[6].shortDate}, ${state.currentMonday.getFullYear()}`;
    }

    // Render 7 Day Headers (Monday to Sunday)
    const headersContainer = document.getElementById('timetableDaysHeader');
    if (headersContainer) {
      headersContainer.innerHTML = weekDays.map((wd, idx) => `
        <div class="p-3 border-r border-gray-200 ${idx === 6 ? 'border-r-0' : ''}">
          <div class="font-extrabold text-xs uppercase tracking-wider text-gray-800">${wd.dayName}</div>
          <div class="text-[11px] text-gray-500 font-semibold mt-0.5">${wd.shortDate}</div>
        </div>
      `).join('');
    }

    // Render Left Time Axis Labels (7:00 AM to 9:00 PM at 60px/hr)
    const timeAxis = document.getElementById('timeAxisLabels');
    if (timeAxis) {
      let labelsHtml = '';
      for (let h = 7; h <= 21; h++) {
        const mins = h * 60;
        labelsHtml += `<div class="time-slot-label">${minutesToTime(mins)}</div>`;
      }
      timeAxis.innerHTML = labelsHtml;
    }

    // Render 7 Day Columns
    const gridBody = document.getElementById('timetableGridBody');
    if (!gridBody) return;

    gridBody.innerHTML = '';

    const startBoundary = 7 * 60;   // 420 mins (07:00 AM)
    const endBoundary = 21 * 60;    // 1260 mins (09:00 PM)

    weekDays.forEach((wd, colIndex) => {
      const colEl = document.createElement('div');
      colEl.className = 'day-column';

      // 14 Hour background horizontal lines
      let linesHtml = '';
      for (let h = 7; h < 21; h++) {
        linesHtml += `<div class="grid-hour-line" data-hour="${h}"></div>`;
      }
      colEl.innerHTML = linesHtml;

      // Find bookings belonging to this room and this day
      const dayBookings = state.reservations.filter(b => {
        const matchRoom = String(b.roomId) === String(r.id) || String(b.roomId) === String(r.number);
        const matchDate = b.date === wd.dateStr;
        const matchDay = (!b.date || b.date === '') && b.day && b.day.toLowerCase() === wd.dayName.toLowerCase();
        return matchRoom && (matchDate || matchDay);
      });

      // Sort bookings chronologically
      dayBookings.sort((a, b) => {
        const aStart = a.startMinutes ?? timeToMinutes(a.start);
        const bStart = b.startMinutes ?? timeToMinutes(b.start);
        return aStart - bStart;
      });

      // Render Scheduled Cards (RED = Occupied, YELLOW = Pending)
      dayBookings.forEach(b => {
        const bStart = b.startMinutes ?? timeToMinutes(b.start);
        const bEnd = b.endMinutes ?? timeToMinutes(b.end);

        // Clamp to 7:00 AM - 9:00 PM
        const visualStart = Math.max(bStart, startBoundary);
        const visualEnd = Math.min(bEnd, endBoundary);

        if (visualEnd <= visualStart) return;

        const top = visualStart - startBoundary;
        const height = Math.max((visualEnd - visualStart) - 4, 38);

        // Red for occupied/reserved, Yellow for pending
        const isPending = String(b.status).toLowerCase() === 'pending';
        const cardClass = isPending ? 'pending' : 'occupied';
        const statusText = isPending ? 'Pending Approval' : 'Reserved / Occupied';

        const card = document.createElement('div');
        card.className = `schedule-card ${cardClass}`;
        card.style.top = `${top}px`;
        card.style.height = `${height}px`;

        card.innerHTML = `
          <div class="card-top-bar"></div>
          <div class="card-title">${esc(b.subject || 'Class Lecture')}</div>
          <div class="card-time">${b.start} – ${b.end}</div>
          <div class="card-meta">
            <div>${esc(b.code ? b.code + ' | ' : '')}Prof. ${esc(b.faculty || 'Unassigned')}</div>
            <div class="text-gray-500 mt-0.5">${esc(b.requester ? b.requester : 'CITE Campus | ' + displayName(r))}</div>
            <div class="mt-1">
              <span class="inline-block text-[9.5px] font-bold px-1.5 py-0.5 rounded ${isPending ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}">
                ${statusText}
              </span>
            </div>
          </div>
        `;

        card.addEventListener('click', (e) => {
          e.stopPropagation();
          showToast(`[${statusText}] ${b.subject} (${b.start} – ${b.end}) by Prof. ${b.faculty || 'Unassigned'}`);
        });

        colEl.appendChild(card);
      });

      // Calculate and Render Available Time Gaps (GREEN)
      let currentPointer = startBoundary;
      dayBookings.forEach(b => {
        const bStart = b.startMinutes ?? timeToMinutes(b.start);
        const bEnd = b.endMinutes ?? timeToMinutes(b.end);

        if (bStart > currentPointer) {
          renderAvailableSlot(colEl, currentPointer, bStart, wd.dateStr, wd.dayName, r);
        }
        currentPointer = Math.max(currentPointer, bEnd);
      });

      if (currentPointer < endBoundary) {
        renderAvailableSlot(colEl, currentPointer, endBoundary, wd.dateStr, wd.dayName, r);
      }

      gridBody.appendChild(colEl);
    });
  }

  // ── Render Green Available Slot Block ───────────────────────────────────
  function renderAvailableSlot(container, startMin, endMin, dateStr, dayName, room) {
    if (endMin - startMin < 30) return;

    const startBoundary = 7 * 60;
    const top = startMin - startBoundary;
    const height = (endMin - startMin) - 4;

    const slotCard = document.createElement('div');
    slotCard.className = 'schedule-card available';
    slotCard.style.top = `${top}px`;
    slotCard.style.height = `${height}px`;

    const startStr = minutesToTime(startMin);
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
      const preferredEndMin = Math.min(startMin + 60, endMin);
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

    const startM = 7 * 60;   // 07:00 AM
    const endM = 21 * 60;    // 09:00 PM
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

  // ── Open Reservation Modal Panel ────────────────────────────────────────
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

    // Set Date input (min = today)
    const dateInput = document.getElementById('resDate');
    if (dateInput) {
      dateInput.min = getTodayString();
      dateInput.value = preferredDate || getTodayString();
    }

    // Set Start & End dropdowns
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
    document.body.style.overflow = '';
  }

  // ── Live Conflict Validation ────────────────────────────────────────────
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

    let type = 'ok';
    let msg = 'Selected slot is clear of schedule conflicts.';
    let isValid = true;

    if (!dateVal) {
      type = 'bad';
      msg = 'Reservation date is required.';
      isValid = false;
    } else if (eMins <= sMins) {
      type = 'bad';
      msg = 'Invalid Time: Reservation End must be later than Reservation Start.';
      isValid = false;
    } else {
      // Find day of week for that date
      const dObj = new Date(dateVal + 'T00:00:00');
      const dayIndex = dObj.getDay(); // 0 is Sunday, 1 is Monday ...
      const dayName = DAY_NAMES[dayIndex === 0 ? 6 : dayIndex - 1];

      // Check collision against existing reservations
      const roomBookings = state.reservations.filter(b => {
        const matchRoom = String(b.roomId) === String(r.id) || String(b.roomId) === String(r.number);
        const matchDate = b.date === dateVal;
        const matchDay = (!b.date || b.date === '') && b.day && b.day.toLowerCase() === dayName.toLowerCase();
        return matchRoom && (matchDate || matchDay);
      });

      const conflict = roomBookings.find(b => {
        const bStart = b.startMinutes ?? timeToMinutes(b.start);
        const bEnd = b.endMinutes ?? timeToMinutes(b.end);
        return bStart < eMins && bEnd > sMins;
      });

      if (conflict) {
        type = 'bad';
        msg = `Schedule Conflict: Overlaps with "${conflict.subject}" (${conflict.start} – ${conflict.end}).`;
        isValid = false;
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
    const statusRadio = document.querySelector('input[name="resStatusType"]:checked');
    const chosenStatus = statusRadio ? statusRadio.value : 'occupied';

    if (!dateVal || !startVal || !endVal || !facultyVal || !subjectVal) {
      showToast('Please complete all required fields.');
      return;
    }

    if (!validateReservationForm()) {
      showToast('Cannot submit: Please resolve schedule conflicts.');
      return;
    }

    // Determine Day Name
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
      code: 'CRS-RES',
      requester: state.profile?.full_name || 'Danilo Santos (Student)',
      status: chosenStatus, // 'occupied' (Red) or 'pending' (Yellow)
      createdAt: new Date().toISOString()
    };

    saveReservation(newReservation);

    // If reservation date falls in the current view week, update view
    const resDateObj = new Date(dateVal + 'T00:00:00');
    state.currentMonday = getMonday(resDateObj);
    renderWeeklyTimetable();

    closeReservationModal();

    const colorLabel = chosenStatus === 'occupied' ? 'Reserved (Red)' : 'Pending (Yellow)';
    showToast(`Reservation ${refId} (${colorLabel}) successfully submitted for ${displayName(r)} on ${dayName}, ${dateVal} (${startVal} – ${endVal})!`);
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
    // Floor Filter
    const floorFilter = document.getElementById('floorFilter');
    if (floorFilter) {
      floorFilter.addEventListener('change', renderFloors);
    }

    // Room Search
    const searchInput = document.getElementById('roomSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', renderFloors);
    }

    // Week Navigation Buttons
    const btnPrevWeek = document.getElementById('ttBtnPrevWeek');
    if (btnPrevWeek) {
      btnPrevWeek.addEventListener('click', () => {
        const prev = new Date(state.currentMonday);
        prev.setDate(prev.getDate() - 7);
        state.currentMonday = prev;
        renderWeeklyTimetable();
      });
    }

    const btnNextWeek = document.getElementById('ttBtnNextWeek');
    if (btnNextWeek) {
      btnNextWeek.addEventListener('click', () => {
        const next = new Date(state.currentMonday);
        next.setDate(next.getDate() + 7);
        state.currentMonday = next;
        renderWeeklyTimetable();
      });
    }

    const btnThisWeek = document.getElementById('ttBtnThisWeek');
    if (btnThisWeek) {
      btnThisWeek.addEventListener('click', () => {
        state.currentMonday = getMonday(new Date());
        renderWeeklyTimetable();
      });
    }

    // "Reserve a Time" Button
    const btnReserve = document.getElementById('btnReserveTime');
    if (btnReserve) {
      btnReserve.addEventListener('click', () => {
        openReservationModal('08:00 AM', '10:00 AM', getTodayString());
      });
    }

    // Modal Close
    const btnCloseModal = document.getElementById('btnCloseReserveModal');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', closeReservationModal);
    }

    const btnCancel = document.getElementById('btnCancelReservation');
    if (btnCancel) {
      btnCancel.addEventListener('click', closeReservationModal);
    }

    const overlay = document.getElementById('reservationOverlay');
    if (overlay) {
      overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) closeReservationModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay && !overlay.hidden) {
        closeReservationModal();
      }
    });

    // Form inputs live validation
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

    // Form Submit
    const form = document.getElementById('reservationForm');
    if (form) {
      form.addEventListener('submit', handleReservationSubmit);
    }

    // Toast Close
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
      loadReservations();
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
