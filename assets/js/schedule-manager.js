/**
 * PUP Canlalay Campus CRS - Academic Schedule Manager (Admin Only)
 *
 * Implements:
 * 1. Admin Auth Guard (restricts access to verified active Admin accounts).
 * 2. Visual Weekly Timetable per Room (Monday to Sunday, 7:00 AM to 9:00 PM):
 *    - Blue: Scheduled Class (Admin assigned, blocks student reservations).
 *    - Red: Approved / Occupied student reservations.
 *    - Yellow: Pending student reservation requests.
 *    - Green: Available slots (clickable to quickly schedule a class).
 * 3. Weekly Class Schedule CRUD:
 *    - Add, Edit, and Delete recurring classes (e.g. BSIT 2-2 in Room 202 every Tuesday 8am-1pm).
 *    - Conflict detection and validation against existing classes.
 * 4. Pending Student Reservation Approvals:
 *    - One-click Approve: turns Yellow request into Red (Occupied/Approved).
 *    - One-click Decline: removes pending request, returning the slot to Green (Available).
 * 5. Real-time multi-tab synchronization with browse-rooms.html via localStorage storage events.
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
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const START_MINUTES = 420; // 7:00 AM
  const END_MINUTES = 1260;  // 9:00 PM (14 hours = 840 mins)

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
    { id: 406, number: '406', name: 'Lecture Room 406', floor: 4, roomType: 'lecture', active: true, capacity: 45, features: 'Whiteboard, Air-conditioned' }
  ];

  // Default initial class schedules (Blue)
  const DEFAULT_CLASS_SCHEDULES = [
    // Room 202 (The user's exact specification: BSIT 2-2 to Room 202 every Tuesday 8am-1pm)
    { id: 'CLS-202-TUE', roomId: '202', section: 'BSIT 2-2', subject: 'Object-Oriented Programming', code: 'IT202', day: 'Tuesday', start: '08:00 AM', end: '01:00 PM', startMinutes: 480, endMinutes: 780, faculty: 'Engr. Roberto Cruz' },

    // Lab 301
    { id: 'CLS-301-TUE-1', roomId: '301', section: 'BSIT 3-1', subject: 'Multimedia', code: 'COMP 017', day: 'Tuesday', start: '07:30 AM', end: '10:30 AM', startMinutes: 450, endMinutes: 630, faculty: 'Aaron Atienza' },
    { id: 'CLS-301-TUE-2', roomId: '301', section: 'BSCS 3-1', subject: 'Fundamentals of Research', code: 'COMP 015', day: 'Tuesday', start: '01:00 PM', end: '04:00 PM', startMinutes: 780, endMinutes: 960, faculty: 'McJoben Reyes' },
    { id: 'CLS-301-WED-1', roomId: '301', section: 'BSIT 2-1', subject: 'Web Development', code: 'COMP 016', day: 'Wednesday', start: '09:00 AM', end: '02:00 PM', startMinutes: 540, endMinutes: 840, faculty: 'Noel Antonio' },
    { id: 'CLS-301-WED-2', roomId: '301', section: 'BSIT 2-2', subject: 'Database Administration', code: 'COMP 018', day: 'Wednesday', start: '03:00 PM', end: '08:00 PM', startMinutes: 900, endMinutes: 1200, faculty: 'McJoben Reyes' },
    { id: 'CLS-301-SAT-1', roomId: '301', section: 'BSIT 3-2', subject: 'System Integration and Architecture 1', code: 'INTE 301', day: 'Saturday', start: '01:00 PM', end: '04:00 PM', startMinutes: 780, endMinutes: 960, faculty: 'Indaleen Quinsayas' },
    { id: 'CLS-301-SAT-2', roomId: '301', section: 'BSIT 3-2', subject: 'Project Management', code: 'ELECT IT E-1', day: 'Saturday', start: '05:00 PM', end: '08:00 PM', startMinutes: 1020, endMinutes: 1200, faculty: 'Indaleen Quinsayas' },

    // Room 402
    { id: 'CLS-402-WED', roomId: '402', section: 'BSIT 3-2', subject: 'Web Systems and Technologies', code: 'IT305', day: 'Wednesday', start: '01:30 PM', end: '04:30 PM', startMinutes: 810, endMinutes: 990, faculty: 'Engr. Roberto Cruz' },
    { id: 'CLS-402-FRI', roomId: '402', section: 'BSIT 3-2', subject: 'Web Systems Capstone Defense', code: 'IT305', day: 'Friday', start: '01:30 PM', end: '04:30 PM', startMinutes: 810, endMinutes: 990, faculty: 'Engr. Roberto Cruz' },

    // Lab 305
    { id: 'CLS-305-FRI', roomId: '305', section: 'BSIT 3-1', subject: 'Software Engineering Capstone', code: 'CS301', day: 'Friday', start: '08:00 AM', end: '11:00 AM', startMinutes: 480, endMinutes: 660, faculty: 'Prof. Ferdinand Silva' },

    // Room 101
    { id: 'CLS-101-MON', roomId: '101', section: 'BSIT 1-1', subject: 'Purposive Communication', code: 'GEED 006', day: 'Monday', start: '07:30 AM', end: '09:00 AM', startMinutes: 450, endMinutes: 540, faculty: 'Prof. Dante Santos' },
    { id: 'CLS-101-WED', roomId: '101', section: 'BSIT 1-1', subject: 'Oral Communication in Context', code: 'GEED 006', day: 'Wednesday', start: '07:30 AM', end: '09:00 AM', startMinutes: 450, endMinutes: 540, faculty: 'Prof. Dante Santos' }
  ];

  // Default student reservations (Yellow = Pending, Red = Approved)
  const DEFAULT_RESERVATIONS = [
    { id: 'RES-9014', roomId: '301', day: 'Thursday', date: '', start: '10:00 AM', end: '01:00 PM', startMinutes: 600, endMinutes: 780, subject: 'Operating Systems Kernel Practical Exam', faculty: 'Dr. Alicia Reyes', requester: 'Danilo Santos (BSIT 3-1)', status: 'pending' },
    { id: 'RES-9008', roomId: '301', day: 'Friday', date: '', start: '08:30 AM', end: '11:30 AM', startMinutes: 510, endMinutes: 690, subject: 'Cisco Routing Switch Mock Certification', faculty: 'Dr. Alicia Reyes', requester: 'Bea Alonzo (BSCS 3-2)', status: 'approved' },
    { id: 'RES-9007', roomId: '402', day: 'Monday', date: '', start: '09:00 AM', end: '12:00 PM', startMinutes: 540, endMinutes: 720, subject: 'Database Systems Midterm Exam Make-up', faculty: 'Engr. Roberto Cruz', requester: 'Christian Diaz (BSCPE 4-1)', status: 'approved' },
    { id: 'RES-9012', roomId: '305', day: 'Thursday', date: '', start: '08:00 AM', end: '10:00 AM', startMinutes: 480, endMinutes: 600, subject: 'Agile Software Testing Mock Sprint', faculty: 'Prof. Ferdinand Silva', requester: 'Samantha Ramos (BSIT 3-2)', status: 'pending' },
    { id: 'RES-8702', roomId: '208', day: 'Friday', date: '', start: '01:00 PM', end: '04:00 PM', startMinutes: 780, endMinutes: 960, subject: 'Embedded Systems Hardware Defense', faculty: 'Prof. Maria Morales', requester: 'Christian Diaz', status: 'pending' }
  ];

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

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
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

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function initials(name) {
    return (name || 'Admin')
      .replace(/[^A-Za-z\s,]/g, '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('') || 'AD';
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

  // ── Global State ────────────────────────────────────────────────────────
  const state = {
    user: null,
    profile: null,
    rooms: [],
    selectedRoom: null,
    currentMonday: getMonday(new Date()),
    classSchedules: [],
    reservations: [],
    toastTimer: null
  };

  // ── Data Persistence & Loading ──────────────────────────────────────────
  function loadData() {
    // 1. Weekly Class Schedules (Blue)
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

    // 2. Custom Reservations (Yellow / Red)
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

  function saveClassSchedules() {
    try {
      localStorage.setItem('crs_room_class_schedules', JSON.stringify(state.classSchedules));
    } catch (e) {
      console.warn('Failed to save class schedules:', e);
    }
  }

  function saveReservations() {
    try {
      localStorage.setItem('crs_custom_reservations', JSON.stringify(state.reservations));
    } catch (e) {
      console.warn('Failed to save reservations:', e);
    }
  }

  // ── Toast System ────────────────────────────────────────────────────────
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
      const storedRole = localStorage.getItem('demoRole') || localStorage.getItem('user_role') || 'Admin';
      const storedName = localStorage.getItem('user_name') || 'Admin';
      userProfile = {
        user_id: 'demo-admin-id',
        full_name: storedName,
        role: storedRole,
        account_status: 'active'
      };
      sessionUser = { email: 'admin@pup.edu.ph' };
    }

    // Role verification: Admin only
    const roleNormalized = String(userProfile.role).trim().toLowerCase();
    if (roleNormalized !== 'admin') {
      console.warn('Unauthorized access to Schedule Manager. Redirecting to browse-rooms.html...');
      window.location.replace('browse-rooms.html');
      return false;
    }

    state.user = sessionUser;
    state.profile = userProfile;

    initProfileUI();
    document.body.style.visibility = 'visible';
    return true;
  }

  function initProfileUI() {
    const name = state.profile?.full_name || 'Admin';
    const email = state.user?.email || 'admin@pup.edu.ph';

    const avatarEl = document.getElementById('adminAvatar');
    if (avatarEl) avatarEl.textContent = initials(name);

    const nameEl = document.getElementById('profileDropdownName');
    if (nameEl) nameEl.textContent = name;

    const emailEl = document.getElementById('profileDropdownEmail');
    if (emailEl) emailEl.textContent = email;

    const menuBtn = document.getElementById('profileMenuBtn');
    const dropdown = document.getElementById('profileDropdown');
    const signOutBtn = document.getElementById('btnSignOut');

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
            features: 'Air-conditioned, Whiteboard'
          }));
        }
      } catch (err) {
        console.warn('Error fetching rooms from Supabase:', err);
      }
    }

    if (!loaded.length) {
      loaded = DEFAULT_ROOMS.map(r => ({ ...r }));
    }

    state.rooms = loaded;
    populateFloorAndRoomSelectors();
  }

  function populateFloorAndRoomSelectors() {
    const floorFilter = document.getElementById('floorFilter');
    const roomSelector = document.getElementById('roomSelector');
    const schedRoom = document.getElementById('schedRoom');

    if (!roomSelector) return;

    const selectedFloorVal = floorFilter ? floorFilter.value : '2';

    // Filter rooms for active roomSelector
    const filteredRooms = selectedFloorVal === 'all'
      ? state.rooms
      : state.rooms.filter(r => String(r.floor) === String(selectedFloorVal));

    roomSelector.innerHTML = '';
    filteredRooms.forEach(r => {
      const opt = document.createElement('option');
      opt.value = String(r.number || r.id);
      opt.textContent = `${r.number ? 'Room ' + r.number : ''} - ${r.name || 'Lecture Room'} (Flr ${r.floor})`;
      roomSelector.appendChild(opt);
    });

    // Populate modal schedRoom with all available rooms
    if (schedRoom) {
      schedRoom.innerHTML = '';
      state.rooms.forEach(r => {
        const opt = document.createElement('option');
        opt.value = String(r.number || r.id);
        opt.textContent = `${r.number ? 'Room ' + r.number : ''} - ${r.name || 'Room'} (Floor ${r.floor})`;
        schedRoom.appendChild(opt);
      });
    }

    // Default select Room 202 if available
    const room202 = filteredRooms.find(r => String(r.number) === '202') || filteredRooms[0] || state.rooms[0];
    if (room202) {
      roomSelector.value = String(room202.number || room202.id);
      selectRoom(room202);
    }
  }

  function selectRoom(room) {
    if (!room) return;
    state.selectedRoom = room;

    // Update Room Header & Badges
    const flr = floorMeta(room.floor);
    const flrBadge = document.getElementById('ttFloorBadge');
    if (flrBadge) flrBadge.textContent = flr.name;

    const typeBadge = document.getElementById('ttTypeBadge');
    if (typeBadge) typeBadge.textContent = roomTypeLabel(room.roomType);

    const titleEl = document.getElementById('ttRoomTitle');
    if (titleEl) {
      const roomNum = room.number ? `Room ${room.number}` : `Room ${room.id}`;
      titleEl.textContent = room.name ? `${roomNum} - ${room.name}` : roomNum;
    }

    const metaEl = document.getElementById('ttRoomMeta');
    if (metaEl) {
      metaEl.textContent = `${flr.sub} • Capacity: ${room.capacity || 40} Students • ${room.features || 'Standard Classroom Facilities'}`;
    }

    const statRoomInfo = document.getElementById('statRoomInfo');
    if (statRoomInfo) {
      statRoomInfo.textContent = room.number ? `Room ${room.number}` : room.name;
    }

    // Pre-select in modal room selector
    const schedRoom = document.getElementById('schedRoom');
    if (schedRoom) {
      schedRoom.value = String(room.number || room.id);
    }

    // Re-render Timetable, Blue Class Table, Pending Table, and Stats
    renderWeeklyTimetable();
    renderClassSchedulesTable();
    renderPendingReservationsTable();
    updateStats();
  }

  // ── Populate Start/End Time Options (30-min intervals) ──────────────────
  function populateTimeDropdowns() {
    const startSelect = document.getElementById('schedStart');
    const endSelect = document.getElementById('schedEnd');
    if (!startSelect || !endSelect) return;

    startSelect.innerHTML = '';
    endSelect.innerHTML = '';

    // Start times: 7:00 AM to 8:30 PM (every 30 mins)
    for (let m = 420; m <= 1230; m += 30) {
      const t = minutesToTime(m);
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === '08:00 AM') opt.selected = true;
      startSelect.appendChild(opt);
    }

    // End times: 7:30 AM to 9:00 PM (every 30 mins)
    for (let m = 450; m <= 1260; m += 30) {
      const t = minutesToTime(m);
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === '01:00 PM') opt.selected = true; // Default 8am to 1pm for BSIT 2-2 demo
      endSelect.appendChild(opt);
    }
  }

  // ── Stats Summary Counter ───────────────────────────────────────────────
  function updateStats() {
    const roomIdStr = String(state.selectedRoom?.number || state.selectedRoom?.id || '');

    // 1. Blue Classes Count for selected room
    const classCount = state.classSchedules.filter(c => String(c.roomId) === roomIdStr).length;
    const statClassCount = document.getElementById('statClassCount');
    if (statClassCount) {
      statClassCount.textContent = `${classCount} ${classCount === 1 ? 'Class' : 'Classes'}`;
    }

    // 2. Pending Requests across all rooms
    const pendingCount = state.reservations.filter(r => r.status === 'pending').length;
    const statPendingCount = document.getElementById('statPendingCount');
    if (statPendingCount) {
      statPendingCount.textContent = `${pendingCount} ${pendingCount === 1 ? 'Request' : 'Requests'}`;
    }
    const pendingTableCount = document.getElementById('pendingTableCount');
    if (pendingTableCount) {
      pendingTableCount.textContent = `${pendingCount} Pending`;
    }

    // 3. Approved Bookings Count for selected room
    const approvedCount = state.reservations.filter(r => r.status === 'approved' && String(r.roomId) === roomIdStr).length;
    const statApprovedCount = document.getElementById('statApprovedCount');
    if (statApprovedCount) {
      statApprovedCount.textContent = `${approvedCount} ${approvedCount === 1 ? 'Booking' : 'Bookings'}`;
    }
  }

  // ── Render Weekly Timetable Grid ────────────────────────────────────────
  function renderWeeklyTimetable() {
    if (!state.selectedRoom) return;

    const roomIdStr = String(state.selectedRoom.number || state.selectedRoom.id);
    const weekDates = getWeekDates(state.currentMonday);

    // Update Week Range Label (e.g. Oct 19 – Oct 25, 2026)
    const rangeLabel = document.getElementById('ttWeekRangeLabel');
    if (rangeLabel) {
      const startStr = weekDates[0].shortDate;
      const endStr = weekDates[6].shortDate;
      const yr = state.currentMonday.getFullYear();
      rangeLabel.textContent = `${startStr} – ${endStr}, ${yr}`;
    }

    // 1. Render Days Header Row (Mon - Sun)
    const daysHeader = document.getElementById('timetableDaysHeader');
    if (daysHeader) {
      const today = new Date();
      const todayY = today.getFullYear();
      const todayM = String(today.getMonth() + 1).padStart(2, '0');
      const todayD = String(today.getDate()).padStart(2, '0');
      const todayStr = `${todayY}-${todayM}-${todayD}`;

      daysHeader.innerHTML = weekDates.map(w => {
        const isToday = w.dateStr === todayStr;
        return `
          <div class="py-2.5 px-2 border-r border-gray-200 last:border-r-0 ${isToday ? 'bg-amber-50/70 text-[#880000] font-bold' : 'text-gray-700 font-semibold'} text-xs">
            <span class="block">${w.dayName}</span>
            <span class="text-[11px] font-normal text-gray-500">${w.shortDate}</span>
          </div>
        `;
      }).join('');
    }

    // 2. Render Left Time Axis (7:00 AM to 9:00 PM)
    const axisLabels = document.getElementById('timeAxisLabels');
    if (axisLabels) {
      axisLabels.innerHTML = '';
      for (let h = 7; h <= 21; h++) {
        const d = new Date();
        d.setHours(h, 0, 0, 0);
        const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const slotEl = document.createElement('div');
        slotEl.className = 'time-slot-label';
        slotEl.textContent = timeStr;
        axisLabels.appendChild(slotEl);
      }
    }

    // 3. Render 7 Day Columns in Main Grid
    const gridBody = document.getElementById('timetableGridBody');
    if (!gridBody) return;
    gridBody.innerHTML = '';

    weekDates.forEach(dayInfo => {
      const dayCol = document.createElement('div');
      dayCol.className = 'day-column';

      // 14 horizontal hour lines
      for (let i = 0; i < 14; i++) {
        const line = document.createElement('div');
        line.className = 'grid-hour-line';
        dayCol.appendChild(line);
      }

      // Collect events for this day in this room:
      // A. Blue Scheduled Classes
      const dayClasses = state.classSchedules.filter(c =>
        String(c.roomId) === roomIdStr &&
        String(c.day).toLowerCase() === dayInfo.dayName.toLowerCase()
      );

      // B. Custom Reservations (Yellow / Red)
      const dayReservations = state.reservations.filter(r => {
        const matchRoom = String(r.roomId) === roomIdStr;
        if (!matchRoom) return false;
        if (r.date) return r.date === dayInfo.dateStr;
        return String(r.day).toLowerCase() === dayInfo.dayName.toLowerCase();
      });

      // Merge busy intervals to compute Green available slots
      const busyIntervals = [];

      dayClasses.forEach(c => {
        busyIntervals.push({
          type: 'class',
          data: c,
          start: c.startMinutes,
          end: c.endMinutes
        });
      });

      dayReservations.forEach(r => {
        busyIntervals.push({
          type: r.status === 'approved' ? 'occupied' : 'pending',
          data: r,
          start: r.startMinutes,
          end: r.endMinutes
        });
      });

      busyIntervals.sort((a, b) => a.start - b.start);

      // Render Green Available slots in gaps between 7:00 AM (420m) and 9:00 PM (1260m)
      let cur = START_MINUTES;
      busyIntervals.forEach(interval => {
        if (interval.start > cur) {
          const availCard = createAvailableSlotCard(dayInfo.dayName, cur, interval.start);
          dayCol.appendChild(availCard);
        }
        cur = Math.max(cur, interval.end);
      });
      if (cur < END_MINUTES) {
        const availCard = createAvailableSlotCard(dayInfo.dayName, cur, END_MINUTES);
        dayCol.appendChild(availCard);
      }

      // Render Scheduled Class Cards (Blue)
      dayClasses.forEach(cls => {
        const card = createClassScheduleCard(cls);
        dayCol.appendChild(card);
      });

      // Render Custom Reservation Cards (Yellow / Red)
      dayReservations.forEach(res => {
        const card = createReservationCard(res);
        dayCol.appendChild(card);
      });

      gridBody.appendChild(dayCol);
    });
  }

  // ── Card Builders ────────────────────────────────────────────────────────
  function createClassScheduleCard(cls) {
    const card = document.createElement('div');
    card.className = 'schedule-card class-schedule';

    const topOffset = cls.startMinutes - START_MINUTES;
    const height = Math.max(cls.endMinutes - cls.startMinutes - 4, 34);

    card.style.top = `${topOffset}px`;
    card.style.height = `${height}px`;
    card.title = `Click to Edit Class: ${cls.section} - ${cls.subject} (${cls.start} - ${cls.end})`;

    card.innerHTML = `
      <div class="card-top-bar"></div>
      <div class="card-title">${esc(cls.section)}: ${esc(cls.subject)}</div>
      <div class="card-time">${esc(cls.start)} – ${esc(cls.end)}</div>
      ${height > 75 ? `<div class="card-meta">Prof. ${esc(cls.faculty || 'Unassigned')}</div>` : ''}
      ${height > 110 && cls.code ? `<div class="card-meta text-[9px] font-semibold text-blue-900">${esc(cls.code)}</div>` : ''}
    `;

    // Click to edit
    card.addEventListener('click', () => {
      openScheduleModalForEdit(cls);
    });

    return card;
  }

  function createReservationCard(res) {
    const card = document.createElement('div');
    const isApproved = res.status === 'approved';
    card.className = `schedule-card ${isApproved ? 'occupied' : 'pending'}`;

    const topOffset = res.startMinutes - START_MINUTES;
    const height = Math.max(res.endMinutes - res.startMinutes - 4, 34);

    card.style.top = `${topOffset}px`;
    card.style.height = `${height}px`;

    const statusLabel = isApproved ? 'Approved / Occupied' : 'Pending Request (Yellow)';
    card.title = `${statusLabel}: ${res.subject} (${res.start} - ${res.end})`;

    card.innerHTML = `
      <div class="card-top-bar"></div>
      <div class="card-title">${isApproved ? '🟥 Approved Reservation' : '🟨 Pending Approval'}</div>
      <div class="card-time">${esc(res.start)} – ${esc(res.end)}</div>
      ${height > 65 ? `<div class="card-meta font-semibold">${esc(res.subject || 'Student Reservation')}</div>` : ''}
      ${height > 95 ? `<div class="card-meta">By: ${esc(res.requester || 'Student')}</div>` : ''}
      ${height > 120 && res.faculty ? `<div class="card-meta">Faculty: ${esc(res.faculty)}</div>` : ''}
    `;

    // Click handler: if pending, scroll and highlight in the pending table
    card.addEventListener('click', () => {
      if (!isApproved) {
        highlightPendingRow(res.id);
      } else {
        showToast(`Occupied Reservation ${res.id}: ${res.subject} (${res.requester})`);
      }
    });

    return card;
  }

  function createAvailableSlotCard(dayName, startMin, endMin) {
    const card = document.createElement('div');
    card.className = 'schedule-card available';

    const topOffset = startMin - START_MINUTES;
    const height = Math.max(endMin - startMin - 4, 26);

    card.style.top = `${topOffset}px`;
    card.style.height = `${height}px`;

    const startStr = minutesToTime(startMin);
    const endStr = minutesToTime(endMin);
    card.title = `Available Slot: ${startStr} – ${endStr}. Click to quickly schedule a class here!`;

    card.innerHTML = `
      <div class="card-top-bar"></div>
      <div class="card-title text-emerald-800">Available</div>
      <div class="card-time text-emerald-700 font-semibold">${startStr} – ${endStr}</div>
      ${height > 70 ? `<div class="card-meta text-emerald-700 text-[10px]">+ Click to Schedule</div>` : ''}
    `;

    // Click to add new schedule prefilled with this day and time
    card.addEventListener('click', () => {
      openScheduleModalForAdd(dayName, startStr, endStr);
    });

    return card;
  }

  // ── Render Assigned Weekly Class Schedules Table (Blue) ─────────────────
  function renderClassSchedulesTable() {
    const tableBody = document.getElementById('classSchedulesTable');
    if (!tableBody || !state.selectedRoom) return;

    const roomIdStr = String(state.selectedRoom.number || state.selectedRoom.id);
    const roomClasses = state.classSchedules.filter(c => String(c.roomId) === roomIdStr);

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
        </tr>
      `;
      const btn = document.getElementById('btnEmptyAddSchedule');
      if (btn) btn.addEventListener('click', () => openScheduleModalForAdd());
      return;
    }

    // Sort by day of week then start time
    const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
    roomClasses.sort((a, b) => (dayOrder[a.day] || 99) - (dayOrder[b.day] || 99) || a.startMinutes - b.startMinutes);

    tableBody.innerHTML = roomClasses.map(cls => `
      <tr class="hover:bg-blue-50/50 transition">
        <td class="py-3 px-3">
          <span class="inline-flex items-center gap-1.5 font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            <span class="w-2 h-2 rounded-full bg-blue-600"></span>
            ${esc(cls.section)}
          </span>
        </td>
        <td class="py-3 px-3">
          <div class="font-bold text-gray-900">${esc(cls.subject)}</div>
          ${cls.code ? `<div class="text-[10px] text-gray-500 font-mono">${esc(cls.code)}</div>` : ''}
        </td>
        <td class="py-3 px-3 font-semibold text-gray-800">
          ${esc(cls.day)}
        </td>
        <td class="py-3 px-3 font-medium text-gray-700 whitespace-nowrap">
          ${esc(cls.start)} – ${esc(cls.end)}
        </td>
        <td class="py-3 px-3 text-gray-800">
          ${esc(cls.faculty || 'Unassigned')}
        </td>
        <td class="py-3 px-3 text-right whitespace-nowrap">
          <button type="button" class="btn-edit-sched text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1 rounded font-bold text-xs mr-1 transition" data-id="${cls.id}">
            Edit
          </button>
          <button type="button" class="btn-del-sched text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1 rounded font-bold text-xs transition" data-id="${cls.id}">
            Delete
          </button>
        </td>
      </tr>
    `).join('');

    // Wire Edit & Delete Buttons
    tableBody.querySelectorAll('.btn-edit-sched').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const item = state.classSchedules.find(c => String(c.id) === String(id));
        if (item) openScheduleModalForEdit(item);
      });
    });

    tableBody.querySelectorAll('.btn-del-sched').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        confirmDeleteSchedule(id);
      });
    });
  }

  // ── Render Pending Student Reservations (Yellow -> Red Approval) ─────────
  function renderPendingReservationsTable() {
    const tableBody = document.getElementById('pendingReservationsTable');
    if (!tableBody) return;

    const pendingList = state.reservations.filter(r => r.status === 'pending');

    if (pendingList.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-emerald-600">
            <span class="text-2xl block mb-1">🎉</span>
            All student reservation requests have been reviewed! No pending approvals.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = pendingList.map(res => {
      const roomObj = state.rooms.find(r => String(r.id) === String(res.roomId) || String(r.number) === String(res.roomId));
      const roomLabel = roomObj ? (roomObj.number ? `Room ${roomObj.number}` : roomObj.name) : `Room ${res.roomId}`;

      return `
        <tr id="row-pending-${res.id}" class="hover:bg-amber-50/60 transition">
          <td class="py-3 px-3 font-mono font-bold text-amber-900">
            ${esc(res.id)}
          </td>
          <td class="py-3 px-3">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-gray-100 text-gray-800 border border-gray-200">
              ${esc(roomLabel)}
            </span>
          </td>
          <td class="py-3 px-3 font-semibold text-gray-900">
            ${esc(res.requester || 'Student')}
          </td>
          <td class="py-3 px-3 whitespace-nowrap">
            <div class="font-bold text-gray-800">${esc(res.day || res.date)}</div>
            <div class="text-[11px] text-gray-600">${esc(res.start)} – ${esc(res.end)}</div>
          </td>
          <td class="py-3 px-3 max-w-[200px]">
            <p class="font-medium text-gray-900 truncate" title="${esc(res.subject)}">${esc(res.subject || 'Room Reservation')}</p>
          </td>
          <td class="py-3 px-3 text-gray-700 whitespace-nowrap">
            ${esc(res.faculty || 'Unassigned')}
          </td>
          <td class="py-3 px-3 text-right whitespace-nowrap">
            <button type="button" class="btn-approve-res px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-[6px] text-xs shadow-sm transition mr-1.5" data-id="${res.id}">
              ✔ Approve (Red)
            </button>
            <button type="button" class="btn-decline-res px-2.5 py-1.5 text-red-600 hover:bg-red-50 border border-red-300 font-bold rounded-[6px] text-xs transition" data-id="${res.id}">
              ✕ Decline
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Wire Approve & Decline buttons
    tableBody.querySelectorAll('.btn-approve-res').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        handleApproveReservation(id);
      });
    });

    tableBody.querySelectorAll('.btn-decline-res').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        handleDeclineReservation(id);
      });
    });
  }

  function highlightPendingRow(resId) {
    const row = document.getElementById(`row-pending-${resId}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('bg-amber-200/80');
      setTimeout(() => row.classList.remove('bg-amber-200/80'), 2500);
    } else {
      showToast(`Reservation ${resId} is pending admin review in the table below.`);
    }
  }

  // ── Admin Actions: Approve or Decline Student Requests ───────────────────
  function handleApproveReservation(id) {
    const res = state.reservations.find(r => String(r.id) === String(id));
    if (!res) return;

    res.status = 'approved';
    saveReservations();

    // Broadcast across tabs (browse-rooms.html will update live)
    window.dispatchEvent(new Event('storage'));

    renderWeeklyTimetable();
    renderPendingReservationsTable();
    updateStats();

    showToast(`✔ Reservation ${res.id} Approved! Time slot is now officially Occupied (Red).`, true);
  }

  function handleDeclineReservation(id) {
    const res = state.reservations.find(r => String(r.id) === String(id));
    if (!res) return;

    if (!confirm(`Are you sure you want to decline reservation request ${res.id} (${res.subject})? The slot will return to Green (Available).`)) {
      return;
    }

    state.reservations = state.reservations.filter(r => String(r.id) !== String(id));
    saveReservations();

    window.dispatchEvent(new Event('storage'));

    renderWeeklyTimetable();
    renderPendingReservationsTable();
    updateStats();

    showToast(`Reservation ${id} declined. Time slot released back to Green (Available).`, true);
  }

  // ── Add / Edit Class Schedule Modal ──────────────────────────────────────
  function openScheduleModalForAdd(prefillDay = 'Tuesday', prefillStart = '08:00 AM', prefillEnd = '01:00 PM') {
    const modal = document.getElementById('scheduleModalOverlay');
    const title = document.getElementById('scheduleModalTitle');
    const editIdInput = document.getElementById('editScheduleId');
    const deleteBtn = document.getElementById('btnDeleteSchedule');
    const form = document.getElementById('scheduleForm');

    if (!modal || !form) return;

    title.textContent = 'Add Class Schedule (Blue)';
    editIdInput.value = '';
    deleteBtn.classList.add('hidden');

    form.reset();

    // Default target room
    const schedRoom = document.getElementById('schedRoom');
    if (schedRoom && state.selectedRoom) {
      schedRoom.value = String(state.selectedRoom.number || state.selectedRoom.id);
    }

    const schedDay = document.getElementById('schedDay');
    if (schedDay && prefillDay) {
      schedDay.value = prefillDay;
    }

    const schedStart = document.getElementById('schedStart');
    if (schedStart && prefillStart) {
      schedStart.value = prefillStart;
    }

    const schedEnd = document.getElementById('schedEnd');
    if (schedEnd && prefillEnd) {
      schedEnd.value = prefillEnd;
    }

    validateScheduleTime();
    modal.hidden = false;
  }

  function openScheduleModalForEdit(cls) {
    const modal = document.getElementById('scheduleModalOverlay');
    const title = document.getElementById('scheduleModalTitle');
    const editIdInput = document.getElementById('editScheduleId');
    const deleteBtn = document.getElementById('btnDeleteSchedule');

    if (!modal || !cls) return;

    title.textContent = `Edit Class Schedule: ${cls.section}`;
    editIdInput.value = cls.id;
    deleteBtn.classList.remove('hidden');

    const schedRoom = document.getElementById('schedRoom');
    if (schedRoom) schedRoom.value = String(cls.roomId);

    const schedSection = document.getElementById('schedSection');
    if (schedSection) schedSection.value = cls.section || '';

    const schedDay = document.getElementById('schedDay');
    if (schedDay) schedDay.value = cls.day;

    const schedStart = document.getElementById('schedStart');
    if (schedStart) schedStart.value = cls.start;

    const schedEnd = document.getElementById('schedEnd');
    if (schedEnd) schedEnd.value = cls.end;

    const schedSubject = document.getElementById('schedSubject');
    if (schedSubject) schedSubject.value = cls.subject || '';

    const schedFaculty = document.getElementById('schedFaculty');
    if (schedFaculty && cls.faculty) schedFaculty.value = cls.faculty;

    validateScheduleTime();
    modal.hidden = false;
  }

  function closeScheduleModal() {
    const modal = document.getElementById('scheduleModalOverlay');
    if (modal) modal.hidden = true;
  }

  function validateScheduleTime() {
    const alertBox = document.getElementById('schedAlertBox');
    const startSelect = document.getElementById('schedStart');
    const endSelect = document.getElementById('schedEnd');
    const daySelect = document.getElementById('schedDay');
    const roomSelect = document.getElementById('schedRoom');
    const editIdInput = document.getElementById('editScheduleId');

    if (!alertBox || !startSelect || !endSelect) return true;

    const startM = timeToMinutes(startSelect.value);
    const endM = timeToMinutes(endSelect.value);

    if (endM <= startM) {
      alertBox.className = 'alert error p-2.5 rounded-[6px] text-xs border border-red-300 bg-red-50 text-red-700 font-medium';
      alertBox.textContent = '⚠️ Invalid Time: Class End Time must be later than Start Time.';
      return false;
    }

    const roomId = roomSelect ? roomSelect.value : (state.selectedRoom?.number || '');
    const day = daySelect ? daySelect.value : 'Monday';
    const currentId = editIdInput ? editIdInput.value : '';

    // Check conflict with other BLUE class schedules in this room
    const conflict = state.classSchedules.find(c => {
      if (currentId && String(c.id) === String(currentId)) return false;
      if (String(c.roomId) !== String(roomId)) return false;
      if (String(c.day).toLowerCase() !== String(day).toLowerCase()) return false;
      return Math.max(startM, c.startMinutes) < Math.min(endM, c.endMinutes);
    });

    if (conflict) {
      alertBox.className = 'alert error p-2.5 rounded-[6px] text-xs border border-amber-300 bg-amber-50 text-amber-800 font-medium';
      alertBox.textContent = `⚠️ Schedule Conflict: ${conflict.section} (${conflict.subject}) already occupies this room on ${conflict.day} from ${conflict.start} to ${conflict.end}.`;
      return false;
    }

    alertBox.className = 'alert ok p-2.5 rounded-[6px] text-xs border border-emerald-300 bg-emerald-50 text-emerald-800 font-medium';
    alertBox.textContent = '✔ Selected schedule time is clear and non-conflicting.';
    return true;
  }

  function handleSaveSchedule(e) {
    e.preventDefault();

    if (!validateScheduleTime()) {
      showToast('Please resolve the schedule conflict or invalid time interval.', false);
      return;
    }

    const editId = document.getElementById('editScheduleId')?.value;
    const roomId = document.getElementById('schedRoom')?.value;
    const section = document.getElementById('schedSection')?.value.trim();
    const day = document.getElementById('schedDay')?.value;
    const start = document.getElementById('schedStart')?.value;
    const end = document.getElementById('schedEnd')?.value;
    const subject = document.getElementById('schedSubject')?.value.trim();
    const faculty = document.getElementById('schedFaculty')?.value;

    if (!section || !subject) {
      showToast('Section / Block and Subject Title are required.', false);
      return;
    }

    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);

    if (editId) {
      // Update existing
      const idx = state.classSchedules.findIndex(c => String(c.id) === String(editId));
      if (idx !== -1) {
        state.classSchedules[idx] = {
          ...state.classSchedules[idx],
          roomId,
          section,
          day,
          start,
          end,
          startMinutes,
          endMinutes,
          subject,
          faculty
        };
        showToast(`✔ Class schedule ${section} updated successfully!`);
      }
    } else {
      // Create new
      const newId = `CLS-${roomId}-${day.slice(0, 3).toUpperCase()}-${Date.now().toString(36).slice(-4)}`;
      state.classSchedules.push({
        id: newId,
        roomId,
        section,
        subject,
        code: '',
        day,
        start,
        end,
        startMinutes,
        endMinutes,
        faculty
      });
      showToast(`✔ Class schedule ${section} assigned to Room ${roomId} successfully!`);
    }

    saveClassSchedules();
    window.dispatchEvent(new Event('storage'));

    closeScheduleModal();

    // If the room in the modal is different from the currently selected room, switch to it
    if (String(state.selectedRoom?.number || state.selectedRoom?.id) !== String(roomId)) {
      const matchRoom = state.rooms.find(r => String(r.number || r.id) === String(roomId));
      if (matchRoom) {
        const selector = document.getElementById('roomSelector');
        if (selector) selector.value = String(roomId);
        selectRoom(matchRoom);
        return;
      }
    }

    renderWeeklyTimetable();
    renderClassSchedulesTable();
    updateStats();
  }

  function confirmDeleteSchedule(id) {
    const item = state.classSchedules.find(c => String(c.id) === String(id));
    if (!item) return;

    if (!confirm(`Are you sure you want to remove weekly class schedule "${item.section} - ${item.subject}" on ${item.day}?`)) {
      return;
    }

    state.classSchedules = state.classSchedules.filter(c => String(c.id) !== String(id));
    saveClassSchedules();
    window.dispatchEvent(new Event('storage'));

    closeScheduleModal();
    renderWeeklyTimetable();
    renderClassSchedulesTable();
    updateStats();

    showToast(`Class schedule ${item.section} removed. Slot returned to Available.`);
  }

  // ── Event Listeners ─────────────────────────────────────────────────────
  function wireEvents() {
    // Floor filter dropdown
    const floorFilter = document.getElementById('floorFilter');
    if (floorFilter) {
      floorFilter.addEventListener('change', () => {
        populateFloorAndRoomSelectors();
      });
    }

    // Room selector dropdown
    const roomSelector = document.getElementById('roomSelector');
    if (roomSelector) {
      roomSelector.addEventListener('change', () => {
        const selectedVal = roomSelector.value;
        const room = state.rooms.find(r => String(r.number || r.id) === selectedVal);
        if (room) selectRoom(room);
      });
    }

    // Week Switchers
    const prevBtn = document.getElementById('ttBtnPrevWeek');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        state.currentMonday.setDate(state.currentMonday.getDate() - 7);
        renderWeeklyTimetable();
      });
    }

    const nextBtn = document.getElementById('ttBtnNextWeek');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        state.currentMonday.setDate(state.currentMonday.getDate() + 7);
        renderWeeklyTimetable();
      });
    }

    const thisWeekBtn = document.getElementById('ttBtnThisWeek');
    if (thisWeekBtn) {
      thisWeekBtn.addEventListener('click', () => {
        state.currentMonday = getMonday(new Date());
        renderWeeklyTimetable();
      });
    }

    // Open Add Schedule Modal Buttons
    const btnOpenAdd = document.getElementById('btnOpenAddSchedule');
    if (btnOpenAdd) btnOpenAdd.addEventListener('click', () => openScheduleModalForAdd());

    const btnTableAdd = document.getElementById('btnTableAddSchedule');
    if (btnTableAdd) btnTableAdd.addEventListener('click', () => openScheduleModalForAdd());

    // Modal close & cancel
    const btnCloseModal = document.getElementById('btnCloseScheduleModal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeScheduleModal);

    const btnCancel = document.getElementById('btnCancelSchedule');
    if (btnCancel) btnCancel.addEventListener('click', closeScheduleModal);

    // Modal delete button
    const btnDelete = document.getElementById('btnDeleteSchedule');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        const editId = document.getElementById('editScheduleId')?.value;
        if (editId) confirmDeleteSchedule(editId);
      });
    }

    // Schedule form validation on inputs
    const schedStart = document.getElementById('schedStart');
    const schedEnd = document.getElementById('schedEnd');
    const schedDay = document.getElementById('schedDay');
    const schedRoom = document.getElementById('schedRoom');

    [schedStart, schedEnd, schedDay, schedRoom].forEach(el => {
      if (el) el.addEventListener('change', validateScheduleTime);
    });

    // Schedule form submit
    const schedForm = document.getElementById('scheduleForm');
    if (schedForm) schedForm.addEventListener('submit', handleSaveSchedule);

    // Toast Close
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

    // Real-time synchronization across browser tabs
    window.addEventListener('storage', (e) => {
      if (!e.key || e.key === 'crs_room_class_schedules' || e.key === 'crs_custom_reservations') {
        loadData();
        renderWeeklyTimetable();
        renderClassSchedulesTable();
        renderPendingReservationsTable();
        updateStats();
      }
    });
  }

  // ── Global Boot ─────────────────────────────────────────────────────────
  async function init() {
    try {
      loadData();
      populateTimeDropdowns();
      const isAllowed = await guard();
      if (!isAllowed) return;

      await loadRooms();
      wireEvents();
    } catch (err) {
      console.error('Schedule manager initialization error:', err);
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
