/**
 * PUP Canlalay Campus CRS - System Audit Logs (Admin Only)
 *
 * Reads the audit trail from the API (GET /api/audit-logs). The trail is written
 * by database triggers (backend/database/audit_logs.sql), so it records every
 * reservation decision, user approval, room change and schedule change no matter
 * which page or person caused it. This page can only read it.
 *
 * Table: Timestamp | Event Type | Initiated By | Facility / Resource |
 *        Action Summary | Name (who it is about + program, year-section) | Result
 */

(() => {
  'use strict';

  const PAGE_SIZE = 100;
  const client = (typeof window !== 'undefined' && window.supabaseClient) ? window.supabaseClient : null;

  // ── Labels and colours ──────────────────────────────────────────────────
  const EVENT_LABELS = {
    RESERVATION_APPROVED: 'Reservation Approved',
    RESERVATION_AUTO_APPROVED: 'Auto-Approved Reservation',
    RESERVATION_DECLINED: 'Reservation Declined',
    RESERVATION_CANCELLED: 'Reservation Cancelled',
    USER_APPROVED: 'User Approved',
    USER_REJECTED: 'User Rejected',
    USER_DEACTIVATED: 'User Deactivated',
    ROOM_CREATED: 'Room Created',
    ROOM_UPDATED: 'Room Updated',
    ROOM_DELETED: 'Room Deleted',
    SCHEDULE_ADDED: 'Schedule Added',
    SCHEDULE_UPDATED: 'Schedule Updated',
    SCHEDULE_DELETED: 'Schedule Deleted'
  };

  const CATEGORY_CHIP = {
    RESERVATION: 'bg-blue-50 text-blue-700 border-blue-200',
    USER_APPROVAL: 'bg-purple-50 text-purple-700 border-purple-200',
    ROOM: 'bg-gray-100 text-gray-700 border-gray-300',
    SCHEDULE: 'bg-amber-50 text-amber-800 border-amber-200'
  };

  const RESULT_COLOR = {
    APPROVED: 'text-emerald-700',
    SUCCESS: 'text-emerald-700',
    DECLINED: 'text-rose-600',
    REJECTED: 'text-rose-600',
    CANCELLED: 'text-amber-600',
    'AUTO-CANCELLED': 'text-amber-600',
    'AUTO-DECLINED': 'text-rose-600',
    DEACTIVATED: 'text-amber-600',
    ERROR: 'text-rose-600'   // the log line could not be written normally (see its summary)
  };

  // ── State ───────────────────────────────────────────────────────────────
  const state = {
    items: [],
    matched: 0,
    total: 0,
    category: 'all',
    search: '',
    loading: false,
    requestId: 0,      // ignores answers that arrive after a newer request
    searchTimer: null
  };

  const els = {};

  // ── Helpers ─────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function initials(name) {
    return (String(name || '').replace(/[^A-Za-z\s,]/g, '').split(/[\s,]+/).filter(Boolean)
      .slice(0, 2).map(w => w[0].toUpperCase()).join('')) || 'AD';
  }

  function eventLabel(type) {
    if (EVENT_LABELS[type]) return EVENT_LABELS[type];
    return String(type || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function relTime(date) {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return days < 7 ? `${days}d ago` : '';
  }

  // Always show Philippine time, whatever timezone this computer is set to
  const TZ = 'Asia/Manila';

  function dateText(date) {
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ });
  }

  function timeText(date) {
    return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  }

  function nameText(l) {
    const name = l.subject_name || '';
    const cls = l.subject_class || '';
    if (name && cls) return `${name} (${cls})`;
    return name || cls || '';
  }

  // ── Profile menu + admin guard ──────────────────────────────────────────
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
        if (mobileToggle.checked && menu) menu.classList.add('hidden');
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
        if (client && client.auth) {
          try { await client.auth.signOut(); } catch (e) { console.error('Sign out error:', e); }
        }
        window.location.replace('login.html');
      });
    }
  }

  function showProfile(name, role, email) {
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('adminAvatar', initials(name));
    set('profileDropdownName', name || 'Admin');
    set('profileDropdownRole', `Role: ${role || 'Admin'}`);
    if (email) set('profileDropdownEmail', email);
  }

  // Only an active admin may see the audit trail (the API checks this too)
  async function guard() {
    if (!client || !window.api) {
      window.location.replace('login.html');
      return false;
    }

    try {
      const admin = await api.request('/api/admin/check');

      let email = '';
      try {
        const { data: { session } } = await client.auth.getSession();
        email = session?.user?.email || '';
      } catch (_) { /* email is only cosmetic */ }

      showProfile(admin.full_name, admin.role, email);
      document.body.style.visibility = 'visible';
      return true;
    } catch (err) {
      if (err.status === 401) { window.location.replace('login.html'); return false; }
      if (err.status === 403) { window.location.replace('dashboard.html'); return false; }

      // The API is unreachable: show the page so the error is visible
      console.error('Admin check failed:', err);
      document.body.style.visibility = 'visible';
      return true;
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────
  function render() {
    const body = els.body;

    if (!state.items.length) {
      body.innerHTML = `<tr><td colspan="7" class="text-center text-gray-500 py-10">${
        state.loading ? 'Loading events…' : 'No log entries match your filters.'
      }</td></tr>`;
    } else {
      body.innerHTML = state.items.map(l => {
        const d = new Date(l.created_at);
        const rel = relTime(d);
        const chip = CATEGORY_CHIP[l.event_category] || 'bg-gray-100 text-gray-700 border-gray-300';
        const name = l.subject_name || '';
        const cls = l.subject_class || '';

        return `
          <tr class="hover:bg-gray-50 transition align-top">
            <td class="py-3 px-4 font-mono whitespace-nowrap">
              <span class="font-bold text-gray-900">${esc(dateText(d))}</span>
              <span class="block text-[11px] text-gray-700">${esc(timeText(d))}</span>
              ${rel ? `<span class="block text-[10px] text-gray-400">${esc(rel)}</span>` : ''}
            </td>
            <td class="py-3 px-4">
              <span class="inline-block px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${chip}">${esc(eventLabel(l.action_type))}</span>
            </td>
            <td class="py-3 px-4">
              <span class="font-semibold text-gray-800">${esc(l.user_name || 'System')}</span>
              <span class="block text-[10px] text-gray-400 capitalize">${esc(l.user_role || 'system')}</span>
            </td>
            <td class="py-3 px-4 font-bold text-[#880000]">${l.room_name ? esc(l.room_name) : '<span class="text-gray-400 font-normal">—</span>'}</td>
            <td class="py-3 px-4 text-gray-600 max-w-sm">${esc(l.details)}</td>
            <td class="py-3 px-4">${
              !name && !cls
                ? '<span class="text-gray-400">—</span>'
                : `${name ? `<span class="font-semibold text-gray-800">${esc(name)}</span>` : ''}${
                    cls ? `<span class="block text-[10px] ${name ? 'text-gray-500' : 'font-semibold text-gray-800'}">${esc(cls)}</span>` : ''}`
            }</td>
            <td class="py-3 px-4 text-right">
              <span class="font-bold text-[10px] ${RESULT_COLOR[l.status] || 'text-gray-600'}">${esc(l.status)}</span>
            </td>
          </tr>`;
      }).join('');
    }

    if (state.loading && !state.items.length) {
      els.count.textContent = 'Loading events…';
    } else {
      const shown = state.items.length;
      els.count.textContent = state.matched > shown
        ? `Showing ${shown} of ${state.matched} matching events (${state.total} total)`
        : `Showing ${shown} of ${state.total} total events`;
    }

    els.loadMoreWrap.classList.toggle('hidden', state.items.length >= state.matched);
    els.loadMore.disabled = state.loading;
  }

  function renderError(err) {
    state.items = [];
    els.body.innerHTML = `<tr><td colspan="7" class="text-center text-rose-600 py-10">Could not load the audit logs: ${
      esc(err && err.message ? err.message : 'Unknown error')}</td></tr>`;
    els.count.textContent = 'Could not load events';
    els.loadMoreWrap.classList.add('hidden');
  }

  // ── Loading (all through GET /api/audit-logs) ───────────────────────────
  async function load(reset) {
    const myRequest = ++state.requestId;
    state.loading = true;
    if (reset) { state.items = []; }
    render();

    try {
      const data = await api.auditLogs.list({
        category: state.category === 'all' ? undefined : state.category,
        search: state.search || undefined,
        limit: PAGE_SIZE,
        offset: reset ? 0 : state.items.length
      });

      if (myRequest !== state.requestId) return; // a newer request replaced this one

      if (reset) {
        state.items = data.items;
      } else {
        // New events can arrive while paging, which shifts the pages: skip repeats
        const seen = new Set(state.items.map(x => x.log_id));
        state.items = state.items.concat(data.items.filter(x => !seen.has(x.log_id)));
      }
      state.matched = data.matched;
      state.total = data.total;
    } catch (err) {
      if (myRequest !== state.requestId) return;
      console.error('Audit logs error:', err);
      state.loading = false;
      renderError(err);
      return;
    }

    state.loading = false;
    render();
  }

  // ── CSV export (the rows loaded on screen) ──────────────────────────────
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // avoid spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  }

  function exportCSV() {
    if (!state.items.length) { alert('There are no log entries to export.'); return; }

    const header = ['Timestamp', 'Event Type', 'Initiated By', 'Facility / Resource', 'Action Summary', 'Name (Program, Year Level-Section)', 'Result'];
    const rows = state.items.map(l => {
      const d = new Date(l.created_at);
      return [
        d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }),
        eventLabel(l.action_type),
        `${l.user_name || 'System'} (${l.user_role || 'system'})`,
        l.room_name || '',
        l.details,
        nameText(l),
        l.status
      ];
    });

    const csv = [header].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  function wireEvents() {
    els.category.addEventListener('change', () => {
      state.category = els.category.value;
      load(true);
    });

    // Wait for a short pause in typing before asking the server
    els.search.addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => {
        state.search = els.search.value.trim();
        load(true);
      }, 300);
    });

    els.loadMore.addEventListener('click', () => load(false));
    els.export.addEventListener('click', exportCSV);

    // Coming back to the tab: show events that happened meanwhile
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !state.loading && state.items.length <= PAGE_SIZE) load(true);
    });
  }

  async function init() {
    els.body = document.getElementById('logsTableBody');
    els.count = document.getElementById('logCount');
    els.category = document.getElementById('categoryFilter');
    els.search = document.getElementById('logSearch');
    els.export = document.getElementById('btnExportLogs');
    els.loadMoreWrap = document.getElementById('loadMoreWrap');
    els.loadMore = document.getElementById('btnLoadMore');

    setupProfileMenu();

    if (!(await guard())) return;

    wireEvents();
    load(true);
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