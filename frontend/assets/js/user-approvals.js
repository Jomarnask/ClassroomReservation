/**
 * PUP Canlalay Campus CRS - User Approvals (Admin Only)
 */

(function () {
  'use strict';

  // Reuse the client created in config.js (avoids a second GoTrue client)
  const client = (typeof supabaseClient !== 'undefined') ? supabaseClient : window.supabaseClient;

  const state = { me: null, users: [], tab: 'pending' };

  const queueEl = document.getElementById('approvalsQueue');

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function goTo(page) { window.location.replace(page); }

  // ---------- Guard: signed in + active + admin ----------
  async function guard() {
    if (!client) return goTo('login.html');

    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) return goTo('login.html');

    const { data: me, error: meErr } = await client
      .from('users')
      .select('user_id, full_name, role, account_status')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (meErr || !me || String(me.account_status).toLowerCase() !== 'active') {
      try { await client.auth.signOut(); } catch (e) {}
      return goTo('login.html');
    }

    // Signed in but not an admin: send to the normal dashboard
    if (String(me.role).toLowerCase() !== 'admin') return goTo('dashboard.html');

    state.me = me;
    state.email = session.user.email || '';
    return true;
  }

  // ---------- Data ----------
  async function loadUsers() {
    try {
      state.users = (await api.users.list({ limit: 1000 })) || [];
    } catch (error) {
      console.error('Load users failed:', error);
      const msg = error && error.message ? error.message : 'Please check your connection.';
      if (window.api && window.api.showError) {
        window.api.showError('Could not load user registrations: ' + msg);
      }
      if (queueEl) {
        queueEl.innerHTML = `<div class="bg-white p-6 rounded-[4px] border border-red-200 text-xs text-red-700">Could not load users: ${esc(msg)}</div>`;
      }
      return;
    }
    render();
  }

  async function setStatus(userId, newStatus) {
    try {
      await api.users.setStatus(userId, newStatus);
      return true;
    } catch (error) {
      console.error('Update failed:', error);
      const msg = error && error.message ? error.message : 'Unknown error';
      if (window.api && window.api.showError) {
        window.api.showError(`Failed to update user status: ${msg}`);
      } else {
        alert(`Update failed: ${msg}`);
      }
      return false;
    }
  }

  // ---------- Rendering ----------
  function yearLabel(n) {
    if (!n) return 'N/A';
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]} Year`;
  }

  function fmtDate(iso) {
    if (!iso) return 'N/A';
    return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function roleBadge(role) {
    const r = String(role || 'student').toLowerCase();
    if (r === 'admin') return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-red-100 text-[#880000] border border-red-300">ADMIN REQUEST</span>';
    if (r === 'faculty') return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-purple-50 text-purple-700 border border-purple-200">Faculty</span>';
    return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-blue-50 text-blue-700 border border-blue-200">Student</span>';
  }

  function statusBadge(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'active') return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-emerald-50 text-emerald-700 border border-emerald-200">Active</span>';
    if (s === 'rejected') return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-red-50 text-red-700 border border-red-200">Rejected</span>';
    if (s === 'inactive') return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-gray-100 text-gray-600 border border-gray-300">Inactive</span>';
    return '<span class="text-[10px] font-bold px-2 py-0.5 rounded-[3px] bg-amber-50 text-amber-700 border border-amber-200">Pending</span>';
  }

  function actionButtons(u) {
    const id = esc(u.user_id);
    const s = String(u.account_status).toLowerCase();
    const isMe = state.me && u.user_id === state.me.user_id;

    if (s === 'pending') {
      return `
        <button type="button" data-action="approve" data-id="${id}" class="btn-approve w-full sm:w-auto justify-center">&check; Approve</button>
        <button type="button" data-action="reject" data-id="${id}" class="btn-reject w-full sm:w-auto justify-center">Reject</button>`;
    }
    if (s === 'active') {
      return isMe
        ? '<span class="text-[11px] text-gray-400">This is your account</span>'
        : `<button type="button" data-action="deactivate" data-id="${id}" class="btn-reject w-full sm:w-auto justify-center">Deactivate</button>`;
    }
    // rejected or inactive
    return `<button type="button" data-action="reactivate" data-id="${id}" class="btn-approve w-full sm:w-auto justify-center">Reactivate</button>`;
  }

  function visibleUsers() {
    const list = state.users.filter(u => {
      const s = String(u.account_status).toLowerCase();
      if (state.tab === 'pending') return s === 'pending';
      if (state.tab === 'active') return s === 'active';
      return s === 'rejected' || s === 'inactive';
    });
    // pending admin requests first
    if (state.tab === 'pending') {
      list.sort((a, b) => (b.role === 'admin') - (a.role === 'admin'));
    }
    return list;
  }

  function updateKpis() {
    const pending = state.users.filter(u => u.account_status === 'pending');
    const kpiPending = document.getElementById('kpiPending');
    const kpiAdmins = document.getElementById('kpiAdmins');
    const kpiActive = document.getElementById('kpiActive');
    if (kpiPending) kpiPending.textContent = pending.length;
    if (kpiAdmins) kpiAdmins.textContent = pending.filter(u => u.role === 'admin').length;
    if (kpiActive) kpiActive.textContent = state.users.filter(u => u.account_status === 'active').length;
  }

  function updateTabs() {
    document.querySelectorAll('.tab-btn').forEach(b => {
      const on = b.dataset.tab === state.tab;
      b.className = 'tab-btn px-4 py-2 text-xs font-semibold rounded-[3px] border ' +
        (on ? 'bg-[#880000] text-white border-[#880000]' : 'bg-white text-gray-700 border-gray-300 hover:border-[#880000] hover:text-[#880000]');
    });
  }

  function render() {
    updateKpis();
    updateTabs();

    if (!queueEl) return;
    const list = visibleUsers();
    if (list.length === 0) {
      const msg = {
        pending: 'No pending registrations. New requests will appear here.',
        active: 'No active accounts found.',
        closed: 'No rejected or inactive accounts.'
      }[state.tab];
      queueEl.innerHTML = `
        <div class="bg-white p-12 rounded-[4px] border border-gray-200 text-center space-y-2">
          <p class="text-sm font-bold text-gray-700">${msg}</p>
        </div>`;
      return;
    }

    queueEl.innerHTML = list.map(u => {
      const isStudent = String(u.role).toLowerCase() === 'student';
      return `
      <div class="approval-card ${u.role === 'admin' && u.account_status === 'pending' ? 'urgent' : ''}">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div class="space-y-1.5 flex-grow">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-base font-bold text-[#111111]">${esc(u.full_name || '(no name)')}</h3>
              ${roleBadge(u.role)}
              ${statusBadge(u.account_status)}
            </div>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
              <span>Email: <strong class="text-gray-900">${esc(u.pup_webmail)}</strong></span>
              ${isStudent ? `
                <span>Student No: <strong class="text-gray-900">${esc(u.student_number)}</strong></span>
                <span>Program: <strong class="text-gray-900">${esc(u.program_course || 'N/A')}</strong></span>
                <span>Year: <strong class="text-gray-900">${esc(yearLabel(u.year_level))}</strong></span>
                <span>Section: <strong class="text-gray-900">${esc(u.section ?? 'N/A')}</strong></span>
              ` : ''}
              <span>Registered: <strong class="text-gray-900">${esc(fmtDate(u.created_at))}</strong></span>
            </div>

            ${u.role === 'admin' && u.account_status === 'pending' ? `
              <p class="text-xs text-[#880000] bg-red-50 p-2.5 rounded-[3px] border border-red-200 mt-2">
                <strong>Admin access request.</strong> Approving gives this person full control of the system. Confirm their identity first.
              </p>` : ''}
          </div>

          <div class="flex sm:flex-col lg:flex-row items-center gap-2 shrink-0">
            ${actionButtons(u)}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ---------- Actions ----------
  if (queueEl) {
    queueEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      const id = btn.dataset.id;
      const user = state.users.find(u => u.user_id === id);
      if (!user) return;

      const name = user.full_name || user.pup_webmail;
      const isAdminReq = String(user.role).toLowerCase() === 'admin';
      const action = btn.dataset.action;

      let newStatus = null;

      if (action === 'approve') {
        const msg = isAdminReq
          ? `ADMIN ACCESS: approve ${name} as an administrator? They will get full control of the system.`
          : `Approve ${name} (${user.role})?`;
        if (!confirm(msg)) return;
        newStatus = 'active';
      } else if (action === 'reject') {
        if (!confirm(`Reject the registration of ${name}?`)) return;
        newStatus = 'rejected';
      } else if (action === 'deactivate') {
        if (!confirm(`Deactivate ${name}? They will lose access immediately.`)) return;
        newStatus = 'inactive';
      } else if (action === 'reactivate') {
        const msg = isAdminReq
          ? `ADMIN ACCESS: reactivate ${name} as an administrator?`
          : `Reactivate ${name}?`;
        if (!confirm(msg)) return;
        newStatus = 'active';
      }

      if (!newStatus) return;

      btn.disabled = true;
      const ok = await setStatus(id, newStatus);
      btn.disabled = false;
      if (ok) {
        if (window.api && window.api.showBanner) {
          window.api.showBanner(`Successfully updated status for ${name}.`, 'info');
        }
        await loadUsers();
      }
    });
  }

  const tabBar = document.getElementById('tabBar');
  if (tabBar) {
    tabBar.addEventListener('click', (e) => {
      const t = e.target.closest('.tab-btn');
      if (!t) return;
      state.tab = t.dataset.tab;
      render();
    });
  }

  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) btnRefresh.addEventListener('click', loadUsers);

  // ---------- Init ----------
  function initials(name) {
    return (String(name || '').replace(/[^A-Za-z\s,]/g, '').split(/[\s,]+/).filter(Boolean)
      .slice(0, 2).map(w => w[0].toUpperCase()).join('')) || 'AD';
  }

  function setupProfileMenu() {
    const btn = document.getElementById('profileMenuBtn');
    const menu = document.getElementById('profileDropdown');
    const signOutBtn = document.getElementById('btnSignOut');
    const mobileToggle = document.getElementById('mobileNavToggle');

    if (btn && menu) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mobileToggle) mobileToggle.checked = false;
        menu.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        menu.classList.add('hidden');
        if (mobileToggle && !e.target.closest('#nav') && !e.target.closest('.mobile-menu-button') && !e.target.closest('#mobileNavToggle')) {
          mobileToggle.checked = false;
        }
      });
    }

    if (mobileToggle) {
      mobileToggle.addEventListener('change', () => {
        if (mobileToggle.checked && menu) {
          menu.classList.add('hidden');
        }
      });
    }

    // System Administration sub-menu toggle on mobile
    document.querySelectorAll('nav .group > button').forEach(subBtn => {
      subBtn.addEventListener('click', (e) => {
        if (window.innerWidth < 640) {
          e.preventDefault();
          const sub = subBtn.nextElementSibling;
          if (sub) sub.classList.toggle('hidden');
        }
      });
    });

    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        signOutBtn.disabled = true;
        try { await client.auth.signOut(); } catch (e) { console.error('Sign out error:', e); }
        localStorage.removeItem('user_role');
        localStorage.removeItem('pup_user');
        goTo('login.html');
      });
    }
  }

  async function init() {
    try {
      const ok = await guard();
      if (!ok) return;
      const avatarEl = document.getElementById('adminAvatar');
      const nameEl = document.getElementById('profileDropdownName');
      const emailEl = document.getElementById('profileDropdownEmail');
      if (avatarEl) avatarEl.textContent = initials(state.me.full_name);
      if (nameEl) nameEl.textContent = state.me.full_name || 'Admin';
      if (emailEl) emailEl.textContent = state.email;
      setupProfileMenu();
      document.body.style.visibility = 'visible';
      await loadUsers();
    } catch (err) {
      console.error('Approvals init error:', err);
      if (window.api && window.api.showError) {
        window.api.showError('Approvals initialization failed: ' + (err.message || ''));
      }
      goTo('login.html'); // fail closed
    }
  }

  if (client && client.auth) {
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') goTo('login.html');
    });
  }
  window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });

  init();
})();
