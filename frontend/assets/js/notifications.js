/**
 * PUP-CRS notification bell (shared by every page that has a navbar).
 *
 * Loaded automatically by api.js. It
 *   1. replaces whatever bell the page had with one working bell,
 *   2. shows a badge with the number of unread notifications,
 *   3. lists the signed-in user's notifications in a dropdown,
 *   4. opens the related page (my-reservations.html, schedule.html,
 *      user-approvals.html or all-reservations.html) when one is clicked.
 *
 * The notifications themselves are created by database triggers
 * (backend/database/notifications.sql); this file only reads and marks them.
 */

(() => {
  'use strict';

  const POLL_MS = 30000;   // look for new notifications every 30 seconds
  const LIST_LIMIT = 30;

  // Text shown under each notification for the page it opens
  const LINK_TEXT = {
    'my-reservations.html': 'View my reservations',
    'schedule.html': 'View my schedule',
    'user-approvals.html': 'Go to User Approvals',
    'all-reservations.html': 'Go to All Reservations'
  };

  const state = {
    items: [],
    unread: 0,
    open: false,
    loaded: false,
    failed: false,
    timer: null
  };

  let els = {};

  // ── Helpers ─────────────────────────────────────────────────────────────
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function timeAgo(iso) {
    const then = new Date(iso);
    if (isNaN(then)) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));

    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Only ever follow our own pages (no absolute URLs, no scripts)
  function safeLink(url) {
    return /^[A-Za-z0-9_-]+\.html(#[\w-]*)?$/.test(String(url || '')) ? url : '';
  }

  // ── Styles (self-contained, so it looks the same on every page) ─────────
  function injectStyles() {
    if (document.getElementById('crsNotifStyles')) return;
    const style = document.createElement('style');
    style.id = 'crsNotifStyles';
    style.textContent = `
      .crs-notif { position: relative; display: flex; align-items: center; }
      .crs-notif-btn {
        position: relative; display: flex; align-items: center; justify-content: center;
        padding: 6px; border: 0; background: transparent; color: #fff; cursor: pointer;
        border-radius: 6px; transition: color .15s, background .15s;
      }
      .crs-notif-btn:hover, .crs-notif-btn[aria-expanded="true"] { color: #ffd658; background: rgba(255,255,255,.1); }
      .crs-notif-btn:focus-visible { outline: 2px solid #ffd658; outline-offset: 2px; }
      .crs-notif-btn svg { width: 24px; height: 24px; fill: currentColor; }
      .crs-notif-badge {
        position: absolute; top: -2px; right: -3px; min-width: 18px; height: 18px; padding: 0 4px;
        border-radius: 9px; background: #ffd658; color: #5c0000; border: 2px solid #880000;
        font: 700 10px/14px 'Noto Sans', 'Inter', system-ui, sans-serif; text-align: center; box-sizing: border-box;
      }
      .crs-notif-badge[hidden] { display: none; }
      .crs-notif-panel {
        position: absolute; right: 0; top: calc(100% + 10px); z-index: 70;
        width: 380px; max-width: calc(100vw - 24px);
        background: #fff; color: #111; border: 1px solid #e5e7eb; border-radius: 6px;
        box-shadow: 0 20px 40px rgba(0,0,0,.25); overflow: hidden;
        font: 400 12px/1.4 'Noto Sans', 'Inter', system-ui, sans-serif;
      }
      .crs-notif-panel[hidden] { display: none; }
      .crs-notif-head {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 10px 14px; background: #f9fafb; border-bottom: 1px solid #e5e7eb;
      }
      .crs-notif-head strong { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #374151; }
      .crs-notif-markall { border: 0; background: none; padding: 0; cursor: pointer; font-size: 11px; font-weight: 600; color: #337ab7; }
      .crs-notif-markall:hover { text-decoration: underline; }
      .crs-notif-markall[disabled] { color: #9ca3af; cursor: default; text-decoration: none; }
      .crs-notif-list { max-height: 420px; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
      .crs-notif-item {
        display: flex; gap: 10px; padding: 12px 14px; border-bottom: 1px solid #f3f4f6;
        color: inherit; text-decoration: none; cursor: pointer; transition: background .12s;
      }
      .crs-notif-item:last-child { border-bottom: 0; }
      .crs-notif-item:hover { background: #f9fafb; }
      .crs-notif-item.unread { background: #fff7ed; }
      .crs-notif-item.unread:hover { background: #ffedd5; }
      .crs-notif-dot { flex: 0 0 8px; width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: transparent; }
      .crs-notif-item.unread .crs-notif-dot { background: #880000; }
      .crs-notif-body { flex: 1; min-width: 0; }
      .crs-notif-title { display: block; font-weight: 700; color: #1f2937; }
      .crs-notif-msg { display: block; margin-top: 2px; color: #4b5563; word-wrap: break-word; }
      .crs-notif-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; font-size: 10.5px; }
      .crs-notif-time { color: #9ca3af; }
      .crs-notif-link { color: #337ab7; font-weight: 600; }
      .crs-notif-item:hover .crs-notif-link { text-decoration: underline; }
      .crs-notif-empty { padding: 28px 14px; text-align: center; color: #9ca3af; }
    `;
    document.head.appendChild(style);
  }

  // ── Mounting: replace the page's old bell with ours ─────────────────────
  function removeOldBells(container) {
    // dashboard.html: the button, its dropdown and the wrapper around them
    const dashboardBell = document.getElementById('notifBellBtn');
    if (dashboardBell) {
      (dashboardBell.closest('.relative') || dashboardBell).remove();
    }

    // Admin pages: a plain bell icon wrapped in a link or a button
    container.querySelectorAll('a, button').forEach(el => {
      if (el.closest('#crsNotif')) return;
      const path = el.querySelector('svg path');
      if (path && String(path.getAttribute('d') || '').startsWith('M12 22c1.1')) el.remove();
    });
  }

  function mount() {
    const container = document.querySelector('.navbar-actions');
    if (!container || document.getElementById('crsNotif')) return false;

    injectStyles();
    removeOldBells(container);

    const wrap = document.createElement('div');
    wrap.id = 'crsNotif';
    wrap.className = 'crs-notif';
    wrap.innerHTML = `
      <button type="button" class="crs-notif-btn" id="crsNotifBtn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
        <span class="crs-notif-badge" id="crsNotifBadge" hidden>0</span>
      </button>
      <div class="crs-notif-panel" id="crsNotifPanel" role="region" aria-label="Notifications" hidden>
        <div class="crs-notif-head">
          <strong>Notifications</strong>
          <button type="button" class="crs-notif-markall" id="crsNotifMarkAll" disabled>Mark all read</button>
        </div>
        <ul class="crs-notif-list" id="crsNotifList"></ul>
      </div>
    `;
    container.insertBefore(wrap, container.firstChild);

    els = {
      wrap,
      btn: wrap.querySelector('#crsNotifBtn'),
      badge: wrap.querySelector('#crsNotifBadge'),
      panel: wrap.querySelector('#crsNotifPanel'),
      list: wrap.querySelector('#crsNotifList'),
      markAll: wrap.querySelector('#crsNotifMarkAll')
    };
    return true;
  }

  // ── Rendering ───────────────────────────────────────────────────────────
  function renderBadge() {
    if (!els.badge) return;
    els.badge.hidden = state.unread < 1;
    els.badge.textContent = state.unread > 9 ? '9+' : String(state.unread);
    els.btn.setAttribute('aria-label',
      state.unread > 0 ? `Notifications, ${state.unread} unread` : 'Notifications');
    els.markAll.disabled = state.unread < 1;
  }

  function renderList() {
    if (!els.list) return;

    if (!state.loaded && !state.failed) {
      els.list.innerHTML = '<li class="crs-notif-empty">Loading…</li>';
      return;
    }
    if (state.failed && state.items.length === 0) {
      els.list.innerHTML = '<li class="crs-notif-empty">Could not load notifications.<br>Check that the API is running.</li>';
      return;
    }
    if (state.items.length === 0) {
      els.list.innerHTML = '<li class="crs-notif-empty">You have no notifications yet.</li>';
      return;
    }

    els.list.innerHTML = state.items.map(n => {
      const link = safeLink(n.link_url);
      const linkText = LINK_TEXT[link] || 'Open';
      return `
        <li>
          <a class="crs-notif-item ${n.is_read ? '' : 'unread'}" data-id="${esc(n.notification_id)}"
             href="${esc(link || '#')}">
            <span class="crs-notif-dot"></span>
            <span class="crs-notif-body">
              <span class="crs-notif-title">${esc(n.title)}</span>
              <span class="crs-notif-msg">${esc(n.message)}</span>
              <span class="crs-notif-meta">
                <span class="crs-notif-time">${esc(timeAgo(n.created_at))}</span>
                ${link ? `<span class="crs-notif-link">${esc(linkText)} →</span>` : ''}
              </span>
            </span>
          </a>
        </li>`;
    }).join('');
  }

  function render() {
    renderBadge();
    renderList();
  }

  // ── Data ────────────────────────────────────────────────────────────────
  async function hasSession() {
    const client = window.supabaseClient;
    if (!client || !client.auth) return false;
    try {
      const { data: { session } } = await client.auth.getSession();
      return !!session;
    } catch (_) {
      return false;
    }
  }

  async function refresh() {
    if (!window.api || !window.api.notifications) return;
    try {
      const data = await api.notifications.list(LIST_LIMIT);
      state.items = (data && data.items) || [];
      state.unread = (data && data.unread_count) || 0;
      state.failed = false;
    } catch (err) {
      console.warn('Notifications could not be loaded:', err.message || err);
      state.failed = true;
    }
    state.loaded = true;
    render();
  }

  async function markOneRead(id) {
    const item = state.items.find(n => String(n.notification_id) === String(id));
    if (!item || item.is_read) return;

    item.is_read = true;                       // update the screen first
    state.unread = Math.max(0, state.unread - 1);
    render();

    try {
      const result = await api.notifications.markRead(id);
      if (result && typeof result.unread_count === 'number') {
        state.unread = result.unread_count;
        renderBadge();
      }
    } catch (err) {
      console.warn('Could not mark the notification as read:', err.message || err);
      refresh();                               // show what the server really has
    }
  }

  async function markAllRead() {
    if (state.unread < 1) return;

    state.items.forEach(n => { n.is_read = true; });
    state.unread = 0;
    render();

    try {
      await api.notifications.markAllRead();
    } catch (err) {
      console.warn('Could not mark all as read:', err.message || err);
      refresh();
    }
  }

  // ── Open / close ────────────────────────────────────────────────────────
  function setOpen(open) {
    state.open = open;
    els.panel.hidden = !open;
    els.btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      // Other page dropdowns (profile menu) should not stay open under ours
      const profile = document.getElementById('profileDropdown');
      if (profile) profile.classList.add('hidden');
      render();
      refresh();
    }
  }

  function wireEvents() {
    els.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!state.open);
    });

    els.markAll.addEventListener('click', (e) => {
      e.stopPropagation();
      markAllRead();
    });

    // A notification: mark it read, then open the page it points to
    els.list.addEventListener('click', async (e) => {
      const row = e.target.closest('.crs-notif-item');
      if (!row) return;
      e.preventDefault();

      const href = row.getAttribute('href');
      await markOneRead(row.getAttribute('data-id'));

      if (href && href !== '#') window.location.href = href;
    });

    // Close on any outside click (capture phase, because pages stop propagation on their own menus)
    document.addEventListener('click', (e) => {
      if (state.open && !els.wrap.contains(e.target)) setOpen(false);
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.open) {
        setOpen(false);
        els.btn.focus();
      }
    });

    // Keep it fresh: poll, and refresh when the tab or window comes back
    state.timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
    window.addEventListener('focus', refresh);

    // The page was restored from the back/forward cache
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) refresh();
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  async function init() {
    if (!(await hasSession())) return;        // signed out: no bell
    if (!mount()) return;

    render();
    wireEvents();
    refresh();

    // Sign-out from any page removes the bell and stops polling
    if (window.supabaseClient && window.supabaseClient.auth) {
      window.supabaseClient.auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') {
          clearInterval(state.timer);
          if (els.wrap) els.wrap.remove();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();