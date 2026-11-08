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
    },
  };
})();