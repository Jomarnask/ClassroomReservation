// frontend/assets/js/api.js
// Small client for the PUP-CRS PHP backend.
// Load it AFTER config.js (needs window.supabaseClient and window.API_BASE_URL).

(function () {
  const BASE_URL = String(window.API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

  async function request(path, options) {
    const opts = options || {};
    const client = window.supabaseClient;
    if (!client) throw new Error('Supabase client is not initialised.');

    // getSession() refreshes the access token automatically when it has expired.
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      window.location.replace('login.html');
      throw new Error('You are not signed in.');
    }

    const headers = { Authorization: 'Bearer ' + session.access_token };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch(BASE_URL + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (networkErr) {
      // Server down, wrong URL, or blocked by CORS.
      throw new Error('Cannot reach the server at ' + BASE_URL + '. Is the API running?');
    }

    let json = null;
    try { json = await res.json(); } catch (_) { /* non-JSON response */ }

    if (!res.ok || !json || json.success === false) {
      const err = new Error((json && json.message) || 'Request failed (' + res.status + ').');
      err.status = res.status;
      err.errors = (json && json.errors) || {};
      throw err;
    }
    return json.data;
  }

  function toQuery(filters) {
    const params = new URLSearchParams();
    Object.keys(filters || {}).forEach(function (key) {
      const value = filters[key];
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });
    const qs = params.toString();
    return qs ? '?' + qs : '';
  }

  window.api = {
    request: request,
    rooms: {
      // filters: { active_only: true, search: '', room_type: '', floor: 1 }
      list: function (filters) { return request('/api/rooms' + toQuery(filters)); },
      get: function (id) { return request('/api/rooms/' + encodeURIComponent(id)); },
      create: function (data) { return request('/api/rooms', { method: 'POST', body: data }); },
      update: function (id, data) {
        return request('/api/rooms/' + encodeURIComponent(id), { method: 'PATCH', body: data });
      },
      // Pending + approved slots of a room between two dates (YYYY-MM-DD)
      takenSlots: function (roomId, from, to) {
        return request('/api/rooms/' + encodeURIComponent(roomId) + '/taken-slots' + toQuery({ from: from, to: to }));
      },
    },
    users: {
      // Admin only. filters: { status: 'pending', role: 'student', limit: 500 }
      list: function (filters) { return request('/api/users' + toQuery(filters)); },
      // Admin only. status: 'active' | 'rejected' | 'inactive'
      setStatus: function (userId, status) {
        return request('/api/users/' + encodeURIComponent(userId) + '/status', {
          method: 'PATCH',
          body: { status: status },
        });
      },
    },
    schedule: {
      // Faculty only. Returns { classes: [...], reservations: [...] }
      mine: function () { return request('/api/faculty/schedule'); },
    },
    // Schedule Manager (master timetable of recurring weekly classes).
    // Read: admin / student (all rooms), faculty (own classes only). Write: admin only.
    schedules: {
      // filters: { room_id, day, faculty_id, program_course, year_level, section }
      list: function (filters) { return request('/api/schedules' + toQuery(filters)); },
      get: function (id) { return request('/api/schedules/' + encodeURIComponent(id)); },
      // data: { room_id, day_of_week (Monday-Saturday), start_time, end_time, subject_title,
      //         subject_code?, program_course, year_level, section, faculty_id? }
      create: function (data) { return request('/api/schedules', { method: 'POST', body: data }); },
      update: function (id, data) {
        return request('/api/schedules/' + encodeURIComponent(id), { method: 'PATCH', body: data });
      },
      remove: function (id) {
        return request('/api/schedules/' + encodeURIComponent(id), { method: 'DELETE' });
      },
    },
    // Admin only. Everything the admin dashboard shows, in one call:
    // { today, rooms, pending_users, pending_reservations, today_bookings, room_status, activity }
    admin: {
      dashboard: function () { return request('/api/admin/dashboard'); },
    },
    // Which of today / tomorrow can be booked (Monday-Saturday only)
    bookingWindow: function () { return request('/api/booking-window'); },
    // Admin only, read-only. filters: { category: 'RESERVATION' | 'USER_APPROVAL' | 'ROOM' | 'SCHEDULE',
    // search, limit, offset } -> { items: [...], matched: n, total: n }
    auditLogs: {
      list: function (filters) { return request('/api/audit-logs' + toQuery(filters)); },
    },
    // Notification bell. The database creates the notifications; each user only sees their own.
    notifications: {
      // -> { items: [...], unread_count: n }
      list: function (limit) { return request('/api/notifications' + toQuery({ limit: limit })); },
      markRead: function (id) {
        return request('/api/notifications/' + encodeURIComponent(id) + '/read', { method: 'PATCH' });
      },
      markAllRead: function () { return request('/api/notifications/read-all', { method: 'PATCH' }); },
    },
    reservations: {
      // filters: { status, room_id, date_from, date_to, mine: true, limit }
      list: function (filters) { return request('/api/reservations' + toQuery(filters)); },
      get: function (id) { return request('/api/reservations/' + encodeURIComponent(id)); },
      // data: { room_id, faculty_id, subject, reservation_date, start_time, end_time }
      create: function (data) { return request('/api/reservations', { method: 'POST', body: data }); },
      // Admin only: approve = true | false, reason optional
      decide: function (id, approve, reason) {
        return request('/api/reservations/' + encodeURIComponent(id) + '/decision', {
          method: 'PATCH',
          body: { approve: approve, reason: reason || undefined },
        });
      },
      cancel: function (id) {
        return request('/api/reservations/' + encodeURIComponent(id) + '/cancel', { method: 'PATCH' });
      },
    },
  };

  // The bell lives in assets/js/notifications.js. It is loaded from here so every
  // page that already includes api.js gets a working bell without another script tag.
  const thisScript = document.currentScript;

  function loadNotificationBell() {
    if (window.__crsNotificationsLoaded || !document.querySelector('.navbar-actions')) return;
    if (!thisScript || !thisScript.src) return;

    window.__crsNotificationsLoaded = true;

    const bell = document.createElement('script');
    bell.src = thisScript.src.replace(/api\.js(\?.*)?$/, 'notifications.js');
    bell.defer = true;
    document.head.appendChild(bell);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNotificationBell);
  } else {
    loadNotificationBell();
  }
})();