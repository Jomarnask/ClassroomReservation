/**
 * PUP Canlalay Campus CRS - User Profile Controller
 * Synchronized with dashboard.js session verification and Supabase user state.
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

  // Application State
  const State = {
    user: null,
    profile: null,
  };

  // Redirect to login if unauthenticated or error occurs
  function goToLogin() {
    window.location.replace('login.html');
  }

  // Safe HTML escaping
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  // Role normalization matching dashboard.js
  function normalizeRole(raw) {
    if (!raw) return 'Student';
    const r = String(raw).trim().toLowerCase();
    if (r === 'admin' || r === 'super admin' || r === 'superadmin') return 'Admin';
    if (r === 'faculty') return 'Faculty';
    return 'Student';
  }

  // Format Year Level Ordinals
  function formatYearLevel(year) {
    if (!year) return 'N/A';
    const num = parseInt(year, 10);
    if (isNaN(num)) return esc(year);
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = num % 100;
    const suffix = suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0];
    return `${num}${suffix} Year`;
  }

  // Extract initials from user name
  function getInitials(name) {
    if (!name) return 'US';
    return name
      .replace(/[^A-Za-z\s,]/g, '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('') || 'US';
  }

  // ==========================================
  // 2. SESSION & USER VERIFICATION
  // ==========================================
  async function loadUserProfile() {
    try {
      if (!client || !client.auth) {
        console.error('PROFILE GUARD: Supabase client not initialized.');
        return goToLogin();
      }

      // Verify active session
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError || !session || !session.user) {
        console.error('PROFILE GUARD: No active session found.', sessionError);
        return goToLogin();
      }

      State.user = session.user;

      // Query user record by authenticated user_id matching dashboard.js column names
      const { data: profile, error: profileError } = await client
        .from('users')
        .select('full_name, student_number, pup_webmail, role, program_course, year_level, section, account_status')
        .eq('user_id', State.user.id)
        .maybeSingle();

      if (profileError) {
        console.error('PROFILE GUARD: Database error fetching profile:', profileError);
        return goToLogin();
      }

      if (!profile) {
        console.error('PROFILE GUARD: No row found in users table for user_id:', State.user.id);
        return goToLogin();
      }

      if (String(profile.account_status || '').toLowerCase() !== 'active') {
        console.error('PROFILE GUARD: Account is not active. Status:', profile.account_status);
        return goToLogin();
      }

      State.profile = profile;
      const normalizedRole = normalizeRole(profile.role);

      renderNavbarForRole(normalizedRole);
      renderProfileData();
      setupFormHandlers();

      // REVEAL PAGE ONLY AFTER VERIFICATION SUCCEEDS
      document.body.style.visibility = 'visible';
    } catch (err) {
      console.error('PROFILE GUARD: Unexpected initialization error:', err);
      goToLogin();
    }
  }

  // ==========================================
  // 3. NAVBAR RENDERING BY ROLE
  // ==========================================
  function renderNavbarForRole(role) {
    const nav = document.getElementById('roleNavLinks');
    if (!nav) return;

    if (role === 'Student') {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-link">Dashboard</a>
        <span class="text-white/60 font-light select-none">|</span>
        <a href="all-reservations.html" class="pup-nav-link">Browse Rooms</a>
        <span class="text-white/60 font-light select-none">|</span>
        <a href="profile.html" class="pup-nav-link active">Profile</a>
      `;
    } else if (role === 'Faculty') {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-link">Dashboard</a>
        <span class="text-white/60 font-light select-none">|</span>
        <a href="all-reservations.html" class="pup-nav-link">Browse Rooms</a>
        <span class="text-white/60 font-light select-none">|</span>
        <a href="profile.html" class="pup-nav-link active">Profile</a>
      `;
    } else {
      nav.innerHTML = `
        <a href="dashboard.html" class="pup-nav-link">Dashboard</a>
        <span class="text-white/60 font-light select-none">|</span>
        <a href="room-management.html" class="pup-nav-link">Room Management</a>
        <span class="text-white/60 font-light select-none">|</span>
        <a href="all-reservations.html" class="pup-nav-link">All Reservations</a>
        <span class="text-white/60 font-light select-none">|</span>
        <a href="profile.html" class="pup-nav-link active">Profile</a>
      `;
    }
  }

  // ==========================================
  // 4. RENDER PROFILE DATA
  // ==========================================
  function renderProfileData() {
    const p = State.profile;
    const u = State.user;

    const rawRole = p.role || 'Student';
    const role = normalizeRole(rawRole);

    const fullName = p.full_name || u.user_metadata?.full_name || 'User';
    const webmail = p.pup_webmail || u.email || 'N/A';
    const studentNo = p.student_number || 'N/A';
    const program = p.program_course || 'N/A';
    const yearLevel = p.year_level ? formatYearLevel(p.year_level) : 'N/A';
    const section = p.section || 'N/A';

    // Header Elements
    const avatarEl = document.getElementById('avatarInitials');
    const headerNameEl = document.getElementById('headerName');
    const headerEmailEl = document.getElementById('headerWebmail');
    const headerRecordLabel = document.getElementById('headerRecordLabel');

    if (avatarEl) avatarEl.textContent = getInitials(fullName);
    if (headerNameEl) headerNameEl.textContent = fullName;
    if (headerEmailEl) headerEmailEl.textContent = webmail;

    if (headerRecordLabel) {
      headerRecordLabel.textContent = `OFFICIAL CRS ${role.toUpperCase()} RECORD`;
    }

    // Section Titles
    const sectionTitle = document.getElementById('sectionTitle');
    const sectionSubtitle = document.getElementById('sectionSubtitle');
    if (sectionTitle) sectionTitle.textContent = `${role} Information`;
    if (sectionSubtitle) {
      sectionSubtitle.textContent = (role === 'Student')
        ? 'Your registered academic details at PUP Canlalay Campus'
        : 'Your registered account details at PUP Canlalay Campus';
    }

    // Profile Details Grid
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('name', fullName);
    setText('studentNumber', studentNo);
    setText('email', webmail);
    setText('role', role); 
    setText('program', program);
    setText('year', yearLevel);
    setText('section', section);

    // Conditional visibility: Show student-specific fields & Edit button ONLY for Students
    const isStudent = (role === 'Student');

    const editBtn = document.getElementById('editBtn');
    if (editBtn) {
      if (isStudent) editBtn.classList.remove('hidden');
      else editBtn.classList.add('hidden');
    }

    const studentFieldIds = ['fieldStudentNumber', 'fieldProgram', 'fieldYear', 'fieldSection'];
    studentFieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (isStudent) el.classList.remove('hidden');
        else el.classList.add('hidden');
      }
    });
  }

  // ==========================================
  // 5. EDIT FORM & EVENT HANDLERS (STUDENTS ONLY)
  // ==========================================
  function setupFormHandlers() {
    const profileView = document.getElementById('profileView');
    const profileEdit = document.getElementById('profileEdit');
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    const enterEditMode = () => {
      if (!profileView || !profileEdit) return;
      profileView.classList.add('hidden');
      profileEdit.classList.remove('hidden');

      const editProgram = document.getElementById('editProgram');
      const editYear = document.getElementById('editYear');
      const editSection = document.getElementById('editSection');

      if (editProgram) editProgram.value = State.profile.program_course || '';
      if (editYear) editYear.value = State.profile.year_level ?? '';
      if (editSection) editSection.value = State.profile.section || '';
    };

    const exitEditMode = () => {
      if (!profileView || !profileEdit) return;
      profileEdit.classList.add('hidden');
      profileView.classList.remove('hidden');
    };

    editBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      enterEditMode();
    });

    cancelBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      exitEditMode();
    });

    saveBtn?.addEventListener('click', async (e) => {
      e.preventDefault();

      const editProgramVal = document.getElementById('editProgram')?.value;
      const editYearVal = document.getElementById('editYear')?.value;
      const editSectionVal = document.getElementById('editSection')?.value;

      const yearInt = editYearVal ? parseInt(editYearVal, 10) : null;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving Changes...';

      // Update Supabase row filtered strictly by the logged-in user_id
      const { data: updatedRows, error: updateError } = await client
        .from('users')
        .update({
          program_course: editProgramVal || null,
          year_level: yearInt,
          section: editSectionVal || null,
        })
        .eq('user_id', State.user.id)
        .select();

      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';

      if (updateError) {
        console.error('PROFILE: Database update error.', updateError);
        alert(`Failed to update profile: ${updateError.message}`);
        return;
      }

      // Check if RLS blocked the update (0 rows modified)
      if (!updatedRows || updatedRows.length === 0) {
        console.error('PROFILE: 0 rows updated. Check Supabase RLS UPDATE policy.');
        alert('Update failed: No database rows were modified. Ensure RLS UPDATE policies allow modifying user_id = ' + State.user.id);
        return;
      }

      // Update local state with actual database response
      State.profile = { ...State.profile, ...updatedRows[0] };

      renderProfileData();
      exitEditMode();
      alert('Profile updated successfully!');
    });
  }

  // ==========================================
  // 6. SESSION & TAB LISTENERS
  // ==========================================
  if (client && client.auth) {
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') goToLogin();
    });
  }

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
  });

  // Execute on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadUserProfile);
  } else {
    loadUserProfile();
  }
})();