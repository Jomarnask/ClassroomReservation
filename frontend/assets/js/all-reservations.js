/**
 * PUP Canlalay Campus CRS - All Reservations (Admin Only)
 */

(function () {
  'use strict';

  const _client = (typeof supabaseClient !== 'undefined') ? supabaseClient : window.supabaseClient;

  window.__crsClient = _client;
  window.__crsAdminId = null;
  window.__crsAdminName = 'Admin';

  function normalizeRole(raw) {
    if (!raw) return 'Student';
    const r = String(raw).trim().toLowerCase();
    if (r === 'admin' || r === 'super admin' || r === 'superadmin') return 'Admin';
    if (r === 'faculty') return 'Faculty';
    return 'Student';
  }

  async function guardAdminOnly() {
    if (!_client || !_client.auth) {
      window.location.replace('login.html');
      return false;
    }

    const { data: { session }, error } = await _client.auth.getSession();
    if (error || !session || !session.user) {
      window.location.replace('login.html');
      return false;
    }

    const { data: profile, error: profileError } = await _client
      .from('users')
      .select('full_name, role, account_status')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (profileError || !profile || String(profile.account_status).toLowerCase() !== 'active') {
      try { await _client.auth.signOut(); } catch (e) { /* ignore */ }
      window.location.replace('login.html');
      return false;
    }

    const role = normalizeRole(profile.role);

    if (role !== 'Admin') {
      window.location.replace('dashboard.html');
      return false;
    }

    window.__crsAdminId = session.user.id;
    window.__crsAdminName = profile.full_name || 'Admin';

    const avatarEl = document.getElementById('arAvatarText');
    if (avatarEl && profile.full_name) {
      const initials = profile.full_name
        .replace(/[^A-Za-z\s,]/g, '')
        .split(/[\s,]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0].toUpperCase())
        .join('') || 'AD';
      avatarEl.textContent = initials;
    }

    const nameEl = document.getElementById('arProfileName');
    const emailEl = document.getElementById('arProfileEmail');
    const roleEl = document.getElementById('arProfileRole');
    if (nameEl) nameEl.textContent = profile.full_name || 'PUP Admin';
    if (emailEl) emailEl.textContent = session.user.email || '';
    if (roleEl) roleEl.textContent = `Role: ${role}`;

    const profileMenuBtn = document.getElementById('arProfileMenuBtn');
    const profileDropdown = document.getElementById('arProfileDropdown');
    const mobileToggle = document.getElementById('mobileNavToggle');
    if (profileMenuBtn && profileDropdown) {
      profileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mobileToggle) mobileToggle.checked = false;
        profileDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        profileDropdown.classList.add('hidden');
        if (mobileToggle && !e.target.closest('#adminNavLinks') && !e.target.closest('.mobile-menu-button') && !e.target.closest('#mobileNavToggle')) {
          mobileToggle.checked = false;
        }
      });
    }

    if (mobileToggle) {
      mobileToggle.addEventListener('change', () => {
        if (mobileToggle.checked && profileDropdown) {
          profileDropdown.classList.add('hidden');
        }
      });
    }

    document.querySelectorAll('nav .group > button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (window.innerWidth < 640) {
          e.preventDefault();
          const sub = btn.nextElementSibling;
          if (sub) sub.classList.toggle('hidden');
        }
      });
    });

    const btnSignOut = document.getElementById('arBtnSignOut');
    if (btnSignOut) {
      btnSignOut.addEventListener('click', async () => {
        btnSignOut.disabled = true;
        if (_client && _client.auth) {
          try { await _client.auth.signOut(); } catch (e) { console.error('Sign out error:', e); }
        }
        window.location.replace('login.html');
      });
    }

    document.body.style.visibility = 'visible';
    return true;
  }

  if (_client && _client.auth) {
    _client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') window.location.replace('login.html');
    });
  }

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
  });

  const state = {
    tab: 'pending',
    pendingAll: [],   // every pending request (used to find competing requests)
    rows: [],         // rows of the active tab
    users: {},        // user_id -> { full_name, student_number, program_course, year_level, section }
    rooms: {},        // room_id -> { room_number, room_name, floor }
    search: ''
  };

  const tbody = document.getElementById('reservationsTableBody');
  const searchInput = document.getElementById('searchInput');
  const recordInfo = document.getElementById('recordCountInfo');
  const pendingLabel = document.getElementById('pendingCountLabel');

  // Modal elements
  const modal = document.getElementById('reviewModal');
  const rmTitle = document.getElementById('reviewModalTitle');
  const rmRef = document.getElementById('rmRef');
  const rmRoom = document.getElementById('rmRoom');
  const rmTime = document.getElementById('rmTime');
  const rmApplicant = document.getElementById('rmApplicant');
  const rmPurpose = document.getElementById('rmPurpose');
  const rmReasonWrap = document.getElementById('rmReasonWrap');
  const rmReason = document.getElementById('rmReason');
  const rmApproveNote = document.getElementById('rmApproveNote');
  const rmConflict = document.getElementById('rmConflictWarning');
  const rmConfirm = document.getElementById('rmConfirm');
  let pending = null; // { row, action: 'approve' | 'decline' }

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

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

  function showToast(msg, type) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'fixed bottom-6 right-6 z-[70] px-4 py-2.5 rounded-[4px] shadow-xl text-xs font-semibold text-white max-w-sm '
      + (type === 'error' ? 'bg-red-600' : type === 'decline' ? 'bg-gray-800' : 'bg-green-600');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.add('hidden'), 4500);
  }

  function toMin(t) {
    const [h, m] = String(t || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function fmt12(t) {
    const mins = toMin(t);
    let h = Math.floor(mins / 60);
    const m = mins % 60;
    const ap = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
  }

  function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dayLabel(dateStr) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (dateStr === localDateStr(now)) return 'Today';
    if (dateStr === localDateStr(tomorrow)) return 'Tomorrow';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function floorName(n) {
    if (!n) return 'No floor';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]) + ' Floor';
  }

  function refOf(r) { return '#RES-' + String(r.reservation_id).padStart(4, '0'); }

  function isExpired(r) {
    const now = new Date();
    const today = localDateStr(now);
    if (r.reservation_date < today) return true;
    return r.reservation_date === today && toMin(r.end_time) <= now.getHours() * 60 + now.getMinutes();
  }

  function competingOf(r) {
    return state.pendingAll.filter(o =>
      o.reservation_id !== r.reservation_id &&
      o.room_id === r.room_id &&
      o.reservation_date === r.reservation_date &&
      toMin(o.start_time) < toMin(r.end_time) &&
      toMin(o.end_time) > toMin(r.start_time));
  }

  function userName(id) { return (state.users[id] && state.users[id].full_name) || 'Unknown'; }

  function roomLabel(id) {
    const rm = state.rooms[id];
    if (!rm) return 'Unknown room';
    return rm.room_name || ('Room ' + rm.room_number);
  }

  function whenLabel(r) {
    return `${dayLabel(r.reservation_date)} • ${fmt12(r.start_time)} - ${fmt12(r.end_time)}`;
  }

  function statusBadge(r) {
    if (r.status === 'pending') {
      if (isExpired(r)) return '<span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-gray-100 text-gray-600 border border-gray-300">Time passed</span>';
      return '<span class="status-badge pending">Pending</span>';
    }
    if (r.status === 'approved') return '<span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-emerald-50 text-emerald-700 border border-emerald-200">Approved</span>';
    if (r.status === 'rejected') return '<span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-red-50 text-red-700 border border-red-200">Declined</span>';
    return '<span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-gray-100 text-gray-600 border border-gray-300">Cancelled</span>';
  }

  function hydrateLookups(rows) {
    rows.forEach(r => {
      if (r.room_id && !state.rooms[r.room_id]) {
        state.rooms[r.room_id] = { room_number: r.room_number, room_name: r.room_name, floor: r.floor };
      }
      if (r.student_id) {
        state.users[r.student_id] = {
          full_name: r.student_name,
          student_number: r.student_number,
          program_course: r.program_course,
          year_level: r.year_level,
          section: r.section
        };
      }
      if (r.faculty_id && !state.users[r.faculty_id]) state.users[r.faculty_id] = { full_name: r.faculty_name };
      if (r.admin_id && !state.users[r.admin_id]) state.users[r.admin_id] = { full_name: r.admin_name };
    });
  }

  const byRequestedTime = (a, b) =>
    (a.reservation_date + a.start_time).localeCompare(b.reservation_date + b.start_time);
  const byRespondedDesc = (a, b) => String(b.responded_at || '').localeCompare(String(a.responded_at || ''));
  const byCreatedDesc = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));

  async function refresh() {
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-500 py-10">Loading reservations...</td></tr>';
    try {
      const pend = await api.reservations.list({ status: 'pending', limit: 500 });
      state.pendingAll = pend.slice().sort(byRequestedTime);

      if (state.tab === 'pending') {
        state.rows = state.pendingAll;
      } else if (state.tab === 'approved') {
        const approved = await api.reservations.list({ status: 'approved', limit: 500 });
        state.rows = approved.sort(byRespondedDesc).slice(0, 100);
      } else {
        const [rejected, cancelled] = await Promise.all([
          api.reservations.list({ status: 'rejected', limit: 500 }),
          api.reservations.list({ status: 'cancelled', limit: 500 })
        ]);
        state.rows = rejected.concat(cancelled).sort(byCreatedDesc).slice(0, 100);
      }

      hydrateLookups([...state.pendingAll, ...state.rows]);
      renderAll();
    } catch (err) {
      console.error('Load reservations failed:', err);
      const msg = err && err.message ? err.message : 'Please check your connection.';
      if (window.api && window.api.showError) {
        window.api.showError('Could not load reservations: ' + msg);
      }
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red-600 py-10">Could not load reservations: ${esc(msg)}</td></tr>`;
    }
  }

  function updateTabs() {
    document.querySelectorAll('.tab-btn').forEach(b => {
      const on = b.dataset.tab === state.tab;
      b.className = 'tab-btn px-3.5 py-1.5 text-xs font-semibold rounded-[3px] border ' +
        (on ? 'bg-[#880000] text-white border-[#880000]' : 'bg-white text-gray-700 border-gray-300 hover:border-[#880000] hover:text-[#880000]');
    });
  }

  function matchesSearch(r) {
    const q = state.search;
    if (!q) return true;
    const stu = state.users[r.student_id];
    return [refOf(r), roomLabel(r.room_id), userName(r.student_id), formatStudentSection(stu), userName(r.faculty_id), r.subject]
      .some(v => String(v).toLowerCase().includes(q));
  }

  function actionsCell(r) {
    if (r.status === 'pending') {
      const expired = isExpired(r);
      return `
        <button type="button" data-action="approve" data-id="${r.reservation_id}" ${expired ? 'disabled title="This time has already passed"' : ''}
          class="px-2.5 py-1 rounded-[3px] bg-green-600 hover:bg-green-700 text-white text-[11px] font-bold transition ${expired ? 'opacity-40 cursor-not-allowed' : ''}">Approve</button>
        <button type="button" data-action="decline" data-id="${r.reservation_id}"
          class="px-2.5 py-1 rounded-[3px] bg-white border border-red-300 hover:bg-red-50 text-red-600 text-[11px] font-bold transition">Decline</button>`;
    }
    const when = r.responded_at ? new Date(r.responded_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    const who = r.admin_id ? userName(r.admin_id) : '';
    return `
      <div class="text-[11px] text-gray-500 font-normal whitespace-normal text-right">
        ${who ? 'By ' + esc(who) : ''}${when ? '<br>' + esc(when) : ''}
        ${r.admin_remarks ? '<br><span class="text-gray-600 italic">' + esc(r.admin_remarks) + '</span>' : ''}
      </div>`;
  }

  function renderAll() {
    updateTabs();
    if (pendingLabel) pendingLabel.textContent = state.pendingAll.length;

    const items = state.rows.filter(matchesSearch);

    if (!items.length) {
      const empty = {
        pending: 'No pending reservation requests.',
        approved: 'No approved reservations yet.',
        closed: 'No declined or cancelled reservations.'
      }[state.tab];
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-gray-500 py-10">${state.rows.length ? 'Nothing matches your search.' : empty}</td></tr>`;
    } else {
      tbody.innerHTML = items.map(r => {
        const rm = state.rooms[r.room_id] || {};
        const stu = state.users[r.student_id] || {};
        const competing = r.status === 'pending' ? competingOf(r).length : 0;
        return `
        <tr>
          <td class="font-bold text-[#880000] font-mono whitespace-nowrap">${esc(refOf(r))}</td>
          <td>
            <div class="font-semibold text-gray-900">${esc(roomLabel(r.room_id))}</div>
            <span class="floor-tag">${esc(floorName(rm.floor))}</span>
          </td>
          <td>
            <div class="font-bold text-gray-800">${esc(userName(r.student_id))}</div>
            <span class="text-[10px] text-gray-500 font-semibold">${esc(formatStudentSection(stu))}</span>
          </td>
          <td class="text-gray-700 font-medium">${esc(whenLabel(r))}</td>
          <td class="text-gray-600">${esc(r.subject)}</td>
          <td class="text-gray-500 font-medium">${esc(userName(r.faculty_id))}</td>
          <td>
            ${statusBadge(r)}
            ${competing ? `<div class="mt-1 text-[10px] font-bold text-amber-700">${competing} competing request${competing === 1 ? '' : 's'}</div>` : ''}
          </td>
          <td class="text-right font-semibold whitespace-nowrap space-x-1">${actionsCell(r)}</td>
        </tr>`;
      }).join('');
    }

    if (recordInfo) recordInfo.textContent = `Showing ${items.length} of ${state.rows.length} record${state.rows.length === 1 ? '' : 's'}`;
  }

  function openReview(row, action) {
    pending = { row, action };
    const stu = state.users[row.student_id];
    rmRef.textContent = refOf(row);
    rmRoom.textContent = roomLabel(row.room_id);
    rmTime.textContent = whenLabel(row);
    rmApplicant.textContent = `${userName(row.student_id)} (${formatStudentSection(stu)})`;
    rmPurpose.textContent = row.subject;
    rmReason.value = '';
    rmConflict.classList.add('hidden');

    if (action === 'approve') {
      rmTitle.textContent = 'Approve Reservation';
      rmReasonWrap.classList.add('hidden');
      rmApproveNote.classList.remove('hidden');
      rmConfirm.textContent = 'Approve';
      rmConfirm.className = 'px-3.5 py-1.5 rounded-[3px] text-xs font-bold text-white transition disabled:opacity-60 bg-green-600 hover:bg-green-700';

      const others = competingOf(row);
      if (others.length) {
        const list = others.map(o => `${userName(o.student_id)} (${fmt12(o.start_time)} - ${fmt12(o.end_time)})`).join(', ');
        rmConflict.textContent = `Approving this will automatically decline ${others.length} other pending request${others.length === 1 ? '' : 's'} for an overlapping time: ${list}.`;
        rmConflict.classList.remove('hidden');
      }
    } else {
      rmTitle.textContent = 'Decline Reservation';
      rmReasonWrap.classList.remove('hidden');
      rmApproveNote.classList.add('hidden');
      rmConfirm.textContent = 'Decline';
      rmConfirm.className = 'px-3.5 py-1.5 rounded-[3px] text-xs font-bold text-white transition disabled:opacity-60 bg-red-600 hover:bg-red-700';
    }

    rmConfirm.disabled = false;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (action === 'decline') setTimeout(() => rmReason.focus(), 0);
  }

  function closeReview() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    pending = null;
  }

  function mirrorToAuditLog(row, action, reason, autoDeclined) {
    try {
      const logs = JSON.parse(localStorage.getItem('crs_audit_logs')) || [];
      const adminName = window.__crsAdminName || 'Admin';
      logs.unshift({
        id: Date.now() + '-' + row.reservation_id,
        ts: new Date().toISOString(),
        type: 'APPROVAL',
        chipClass: 'approval',
        user: `${adminName} (Admin)`,
        room: roomLabel(row.room_id),
        slot: whenLabel(row),
        ref: refOf(row),
        action: action === 'approve'
          ? `Approved reservation ${refOf(row)} for ${userName(row.student_id)} (${whenLabel(row)}). Purpose: ${row.subject}.` +
            (autoDeclined ? ` ${autoDeclined} overlapping request(s) were declined automatically.` : '')
          : `Declined reservation ${refOf(row)} for ${userName(row.student_id)} (${whenLabel(row)}). Reason: ${reason || 'none given'}`,
        ip: 'Web Client',
        status: action === 'approve' ? 'APPROVED' : 'DECLINED'
      });
      localStorage.setItem('crs_audit_logs', JSON.stringify(logs));
    } catch (e) { /* optional mirror */ }
  }

  async function confirmReview() {
    if (!pending) return;
    const { row, action } = pending;
    const reason = rmReason.value.trim();

    rmConfirm.disabled = true;
    const autoDeclined = action === 'approve' ? competingOf(row).length : 0;

    try {
      await api.reservations.decide(
        row.reservation_id,
        action === 'approve',
        action === 'decline' && reason ? reason : null
      );
    } catch (error) {
      console.error('Decision failed:', error);
      const msg = error.message || 'Could not save the decision.';
      showToast(msg, 'error');
      if (window.api && window.api.showError) {
        window.api.showError('Decision failed: ' + msg);
      }
      rmConfirm.disabled = false;
      return;
    }

    mirrorToAuditLog(row, action, reason, autoDeclined);
    closeReview();
    await refresh();

    if (action === 'approve') {
      showToast(`${refOf(row)} approved.` + (autoDeclined ? ` ${autoDeclined} overlapping request(s) declined automatically.` : ''), 'approve');
    } else {
      showToast(`${refOf(row)} declined.`, 'decline');
    }
  }

  // ---------- events ----------
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn || btn.disabled) return;
      const row = state.rows.find(r => String(r.reservation_id) === btn.dataset.id);
      if (row) openReview(row, btn.dataset.action);
    });
  }

  const tabBar = document.getElementById('tabBar');
  if (tabBar) {
    tabBar.addEventListener('click', (e) => {
      const t = e.target.closest('.tab-btn');
      if (!t) return;
      state.tab = t.dataset.tab;
      refresh();
    });
  }

  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) btnRefresh.addEventListener('click', refresh);

  if (rmConfirm) rmConfirm.addEventListener('click', confirmReview);
  const rmCancel = document.getElementById('rmCancel');
  if (rmCancel) rmCancel.addEventListener('click', closeReview);
  const modalClose = document.getElementById('reviewModalClose');
  if (modalClose) modalClose.addEventListener('click', closeReview);
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeReview(); });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pending) closeReview(); });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.search = searchInput.value.toLowerCase().trim();
      renderAll();
    });
  }

  guardAdminOnly().then(ok => {
    if (ok) refresh();
  }).catch(err => {
    console.error('Admin guard error:', err);
    if (window.api && window.api.showError) {
      window.api.showError('Admin authorization check failed.');
    }
    window.location.replace('login.html');
  });
})();
