// ===== Room Management (Supabase-connected) =====
// Table used: public.rooms (room_id, room_number, room_name, floor, room_type, is_active)
// Access: signed-in, ACTIVE admins only.

(() => {
  'use strict';

  // Reuse the client created in config.js (avoids a second GoTrue client)
  const client = (typeof supabaseClient !== 'undefined') ? supabaseClient : window.supabaseClient;

  // Facility rooms get a small icon instead of a plain number
  const ICONS = { 'Library': '📚', 'Reading Room': '📖', 'Prayers Room': '🕌', 'Sports Dev Office': '🏅' };

  const getEl = id => document.getElementById(id);
  const floorsEl = getEl('floors'), overlay = getEl('overlay'), form = getEl('roomForm');

  const fields = {
    number: getEl('roomNumber'),
    name: getEl('roomName'),
    roomType: getEl('roomType'),
    availability: getEl('availability'),
  };

  const state = { me: null, email: '', rooms: [], byId: {} };
  let editMode = false, currentId = null, lastFocus = null, toastTimer, saving = false;

  const roomTypeLabel = v => ({ lecture: 'Lecture Room', laboratory: 'Laboratory', office: 'Office', 'stock room': 'Stock Room', other: 'Other' })[v] || v || 'N/A';
  const statusLabel = active => active ? 'Active' : 'Inactive';

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function goTo(page) { window.location.replace(page); }

  function initials(name) {
    return (String(name || '').replace(/[^A-Za-z\s,]/g, '').split(/[\s,]+/).filter(Boolean)
      .slice(0, 2).map(w => w[0].toUpperCase()).join('')) || 'AD';
  }

  /* ---------- Guard: signed in + active + admin ---------- */
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

  /* ---------- Profile display + menu ---------- */
  function fillProfile() {
    const name = state.me.full_name || 'Administrator';
    getEl('adminAvatar').textContent = initials(name);
    getEl('profileDropdownName').textContent = name;
    getEl('profileDropdownEmail').textContent = state.email;
    getEl('bannerName').textContent = 'Welcome back, ' + name + '!';
    getEl('adminEmail').textContent = state.email;
    getEl('tagAvatar').textContent = initials(name);
    getEl('tagName').textContent = name + ' (Admin)';
    getEl('tagMeta').textContent = state.email;
  }

  function setupProfileMenu() {
    const btn = getEl('profileMenuBtn');
    const menu = getEl('profileDropdown');
    const signOutBtn = getEl('btnSignOut');

    btn.addEventListener('click', e => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => menu.classList.add('hidden'));

    signOutBtn.addEventListener('click', async () => {
      signOutBtn.disabled = true;
      try { await client.auth.signOut(); } catch (e) { console.error('Sign out error:', e); }
      localStorage.removeItem('user_role');
      localStorage.removeItem('pup_user');
      goTo('login.html');
    });
  }

  /* ---------- Data ---------- */
  async function loadRooms() {
    const { data, error } = await client
      .from('rooms')
      .select('room_id, room_number, room_name, floor, room_type, is_active')
      .order('floor', { ascending: true })
      .order('room_id', { ascending: true });

    if (error) {
      console.error('Load rooms failed:', error);
      floorsEl.innerHTML = '<div class="muted" style="padding:16px">Could not load rooms: ' + esc(error.message) + '</div>';
      return;
    }

    state.rooms = (data || []).map(r => ({
      id: r.room_id,
      number: r.room_number || '',
      name: r.room_name || '',
      floor: r.floor ?? 0,
      roomType: r.room_type || 'other',
      active: r.is_active !== false, // null counts as active
    }));
    state.byId = {};
    state.rooms.forEach(r => { state.byId[String(r.id)] = r; });
    renderFloors();
  }

  /* ---------- Helpers for display ---------- */
  function iconFor(r) { return ICONS[r.number] || ICONS[r.name] || ''; }
  function isFacility(r) { return !!iconFor(r); }
  function displayName(r) { return r.name || (r.number ? 'Room ' + r.number : 'Unnamed Room'); }

  function floorMeta(n) {
    if (!n) return { name: 'Unassigned', sub: 'No floor set' };
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return { name: n + (s[(v - 20) % 10] || s[v] || s[0]) + ' Floor', sub: n === 1 ? 'Ground Level' : 'Level ' + n };
  }

  /* ---------- Rendering ---------- */
  function renderFloors() {
    const filter = getEl('floorFilter').value;
    floorsEl.innerHTML = '';

    getEl('totalRooms').textContent = 'Total: ' + state.rooms.length + ' Rooms';

    if (state.rooms.length === 0) {
      floorsEl.innerHTML = '<div class="muted" style="padding:16px">No rooms found in the database.</div>';
      return;
    }

    const floorNums = [...new Set(state.rooms.map(r => r.floor))].sort((a, b) => a - b);
    const visible = floorNums.filter(n => filter === 'all' || String(n) === filter);
    floorsEl.style.gridTemplateColumns = visible.length === 1 ? 'minmax(0, 420px)' : '';

    visible.forEach(n => {
      const meta = floorMeta(n);
      const floorRooms = state.rooms.filter(r => r.floor === n);
      const col = document.createElement('div');
      col.className = 'floor';
      col.innerHTML =
        '<div class="floor-head">' +
          '<div><strong>' + esc(meta.name) + '</strong><small>' + esc(meta.sub) + ' • ' + floorRooms.length + ' Rooms</small></div>' +
          '<span class="lvl">L' + n + '</span>' +
        '</div>' +
        '<div class="room-grid"></div>';

      const grid = col.querySelector('.room-grid');
      floorRooms.forEach(r => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'room' + (isFacility(r) ? ' facility' : '');
        b.dataset.id = String(r.id);
        // keeps the existing CSS colour bindings: active = available, inactive = not available
        b.dataset.gma = r.active ? 'full' : 'not available';
        b.title = displayName(r) + '\nType: ' + roomTypeLabel(r.roomType) + '\nStatus: ' + statusLabel(r.active);

        const icon = iconFor(r) ? '<span class="fi" aria-hidden="true">' + iconFor(r) + '</span>' : '';
        const text = displayName(r); // room name if set, otherwise "Room <number>"

        b.innerHTML = icon + esc(text) + '<span class="badge" aria-hidden="true"></span>';
        grid.appendChild(b);
      });
      floorsEl.appendChild(col);
    });
  }

  /* ---------- Edit mode ---------- */
  function setEditMode(on) {
    editMode = on;
    floorsEl.classList.toggle('editing', on);
    const btn = getEl('editToggle');
    btn.setAttribute('aria-pressed', on);
    btn.textContent = on ? '✓ Done Editing' : '+ Edit Rooms';
    getEl('editNotice').hidden = !on;
    showToast(on ? 'Room Editing Mode enabled' : 'Room Editing Mode disabled');
  }

  /* ---------- Modal ---------- */
  function setSelectValue(sel, val) {
    if (val && ![...sel.options].some(o => o.value === val)) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = val;
      sel.appendChild(o);
    }
    sel.value = val || 'other';
  }

  function openModal(id) {
    const r = state.byId[id];
    if (!r) return;
    currentId = id;
    lastFocus = document.activeElement;

    getEl('modalTitle').textContent = 'Edit ' + displayName(r) + ' Configuration';
    fields.number.value = r.number;
    fields.name.value = r.name;
    setSelectValue(fields.roomType, r.roomType);
    fields.availability.value = r.active ? 'active' : 'inactive';

    clearInvalid();
    validate();
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    fields.number.focus();
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    currentId = null;
    if (lastFocus) lastFocus.focus();
  }

  function clearInvalid() {
    Object.values(fields).forEach(f => f.classList.remove('invalid'));
  }

  // Live validation. Returns true when the form can be saved.
  function validate() {
    const box = getEl('alertBox');
    const num = fields.number.value.trim();
    const status = fields.availability.value;

    let type = 'ok', msg = 'Room details and status are properly configured.';

    if (!num) {
      type = 'bad'; msg = 'Room Number is required.';
    } else if (state.rooms.some(r => String(r.id) !== String(currentId) && r.number.toLowerCase() === num.toLowerCase())) {
      type = 'bad'; msg = 'Another room already uses the number "' + num + '".';
    } else if (status === 'inactive') {
      type = 'warn'; msg = 'Room is Inactive and will not accept new reservations.';
    }

    box.className = 'alert ' + type;
    box.textContent = (type === 'ok' ? '✔ ' : type === 'bad' ? '✖ ' : '⚠ ') + msg;
    return type !== 'bad';
  }

  /* ---------- Save to Supabase ---------- */
  async function saveRoom() {
    const r = state.byId[currentId];
    if (!r) return;

    const payload = {
      room_number: fields.number.value.trim(),
      room_name: fields.name.value.trim() || null,
      room_type: fields.roomType.value,
      is_active: fields.availability.value === 'active',
    };

    const { data, error } = await client
      .from('rooms')
      .update(payload)
      .eq('room_id', r.id)
      .select('room_id');

    if (error) {
      console.error('Save room failed:', error);
      showToast('Save failed: ' + error.message);
      return false;
    }
    // RLS can block an update without an error; zero rows back means nothing changed
    if (!data || data.length === 0) {
      showToast('Nothing was saved. You may not have permission (check the rooms policies).');
      return false;
    }

    r.number = payload.room_number;
    r.name = payload.room_name || '';
    r.roomType = payload.room_type;
    r.active = payload.is_active;
    return true;
  }

  /* ---------- Event Listeners ---------- */
  function wireEvents() {
    getEl('editToggle').addEventListener('click', () => setEditMode(!editMode));
    getEl('floorFilter').addEventListener('change', renderFloors);

    floorsEl.addEventListener('click', e => {
      const card = e.target.closest('.room');
      if (!card) return;
      const r = state.byId[card.dataset.id];
      if (!r) return;
      if (!editMode) {
        showToast('Turn on Edit Rooms to change ' + displayName(r));
        return;
      }
      openModal(card.dataset.id);
    });

    Object.values(fields).forEach(f => {
      f.addEventListener('input', validate);
      f.addEventListener('change', validate);
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (saving) return;
      clearInvalid();
      if (!validate()) {
        if (!fields.number.value.trim()) fields.number.classList.add('invalid');
        return;
      }

      saving = true;
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      const ok = await saveRoom();
      submitBtn.disabled = false;
      saving = false;

      if (ok) {
        const r = state.byId[currentId];
        closeModal();
        renderFloors();
        showToast(displayName(r) + ' changes saved');
      }
    });

    getEl('cancelBtn').addEventListener('click', closeModal);
    getEl('closeModal').addEventListener('click', closeModal);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    const navToggle = getEl('navToggle');
    if (navToggle) {
      navToggle.addEventListener('click', e => {
        const open = getEl('nav').classList.toggle('open');
        e.currentTarget.setAttribute('aria-expanded', open);
      });
    }
  }

  function showToast(msg) {
    const t = getEl('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- Init ---------- */
  async function init() {
    try {
      const ok = await guard();
      if (!ok) return;
      fillProfile();
      setupProfileMenu();
      wireEvents();
      document.body.style.visibility = 'visible';
      await loadRooms();
    } catch (err) {
      console.error('Room management init error:', err);
      goTo('login.html'); // fail closed
    }
  }

  if (client && client.auth) {
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') goTo('login.html');
    });
  }
  window.addEventListener('pageshow', e => { if (e.persisted) window.location.reload(); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();