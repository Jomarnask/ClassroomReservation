// ===== Admin Dashboard Session Guard & Dynamic Profile =====
async function checkAdminSession() {
  let session = null;
  if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth) {
    try {
      const res = await supabaseClient.auth.getSession();
      session = res.data?.session;
    } catch (e) {
      console.warn('Session check warning:', e);
    }
  }

  const storedRole = localStorage.getItem('user_role') || localStorage.getItem('demoRole');
  const user = session?.user;
  const userMeta = user?.user_metadata || {};
  const effectiveRole = userMeta.role || storedRole || 'admin';

  // 1. If non-admin tries to access, redirect to dashboard
  if (effectiveRole && effectiveRole !== 'admin' && effectiveRole !== 'Admin') {
    alert('Unauthorized access. Admin privileges required.');
    window.location.href = 'dashboard.html';
    return;
  }

  // 2. Populate Admin Dashboard Banner elements dynamically
  const bannerHeading = document.querySelector('.banner h1');
  const fullName = userMeta.full_name || localStorage.getItem('user_name') || 'Engr. Roberto Cruz';
  if (bannerHeading && fullName) {
    bannerHeading.textContent = 'Welcome back, ' + fullName + '!';
  }
}

// Execute session check immediately when the document is ready
document.addEventListener('DOMContentLoaded', checkAdminSession);


(() => {
  "use strict";

  // Facility rooms get a small icon instead of a plain number
  const ICONS = { "Library": "📚", "Reading Room": "📖", "Prayers Room": "🕌", "Sports Dev Office": "🏅" };

  const FLOORS = [
    {
      n: 1, name: "1st Floor", sub: "Ground Level",
      list: ["107", "106", "105", "103", "101", "104", "102", "121", "117",
             "Sports Dev Office", "114", "115", "113", "Prayers Room"],
    },
    {
      n: 2, name: "2nd Floor", sub: "Level 2",
      list: ["211", "209", "207", "205", "203", "201", "221",
             "212", "210", "208", "222", "206", "204", "202"],
    },
    {
      n: 3, name: "3rd Floor", sub: "Level 3",
      list: ["Library", "Reading Room", "309", "307", "305", "303", "301",
             "310", "308", "317", "306", "304", "302"],
    },
    {
      n: 4, name: "4th Floor", sub: "Level 4",
      list: ["406", "404", "418", "402", "405", "403", "401"],
    },
  ];

  // Default status: rooms drawn dark on the campus map start out Not Available
  const DEFAULT_UNAVAILABLE = new Set(["f1-113", "f1-sports-dev-office"]);

  // Facility rooms default to a sensible Room Type; everything else defaults to Lecture Room
  const FACILITY_TYPE = { "Library": "other", "Reading Room": "other", "Prayers Room": "other", "Sports Dev Office": "office" };

  // Build room state map
  const rooms = {};
  FLOORS.forEach(f => {
    const seen = {};
    f.list.forEach(label => {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      seen[slug] = (seen[slug] || 0) + 1;
      const suffix = seen[slug] > 1 ? String.fromCharCode(96 + seen[slug]) : "";
      const id = "f" + f.n + "-" + slug + suffix;
      const isFacility = !!ICONS[label];

      rooms[id] = {
        id: id,
        floor: f.n,
        number: isFacility ? "" : label,
        name: isFacility ? label : "Room " + label,
        label: label,
        facility: isFacility,
        availability: DEFAULT_UNAVAILABLE.has(id) ? "not available" : "full",
        roomType: FACILITY_TYPE[label] || "lecture",
      };
    });
  });

  // Standard DOM selector helper without $ token
  const getEl = id => document.getElementById(id);
  const floorsEl = getEl("floors"), overlay = getEl("overlay"), form = getEl("roomForm");

  const fields = {
    number: getEl("roomNumber"),
    name: getEl("roomName"),
    roomType: getEl("roomType"),
    availability: getEl("availability"),
  };

  const roomTypeLabel = v => ({ lecture: "Lecture Room", laboratory: "Laboratory", office: "Office", "stock room": "Stock Room", other: "Other" })[v];
  const availabilityLabel = v => ({ full: "Fully Available", "under maintenance": "Under Maintenance", "not available": "Not Available" })[v];

  let editMode = false, currentId = null, lastFocus = null, toastTimer;

  /* ---------- Rendering ---------- */
  function renderFloors() {
    const filter = getEl("floorFilter").value;
    floorsEl.innerHTML = "";
    const visible = FLOORS.filter(f => filter === "all" || String(f.n) === filter);
    floorsEl.style.gridTemplateColumns = visible.length === 1 ? "minmax(0, 420px)" : "";

    visible.forEach(f => {
      const floorRooms = Object.values(rooms).filter(r => r.floor === f.n);
      const col = document.createElement("div");
      col.className = "floor";
      col.innerHTML = 
        '<div class="floor-head">' +
          '<div><strong>' + f.name + '</strong><small>' + f.sub + ' • ' + floorRooms.length + ' Rooms</small></div>' +
          '<span class="lvl">L' + f.n + '</span>' +
        '</div>' +
        '<div class="room-grid"></div>';

      const grid = col.querySelector(".room-grid");
      floorRooms.forEach(r => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "room" + (r.facility ? " facility" : "");
        b.dataset.id = r.id;
        b.dataset.gma = r.availability; // Preserves CSS dataset bindings for status colors
        b.title = r.name + "\nType: " + roomTypeLabel(r.roomType) + "\nStatus: " + availabilityLabel(r.availability);

        const icon = ICONS[r.label] ? '<span class="fi" aria-hidden="true">' + ICONS[r.label] + '</span>' : "";
        const displayText = r.number ? "Room " + r.number : r.name;

        b.innerHTML = icon + displayText + '<span class="badge" aria-hidden="true"></span>';
        grid.appendChild(b);
      });
      floorsEl.appendChild(col);
    });
    getEl("totalRooms").textContent = "Total: " + Object.keys(rooms).length + " Rooms";
  }

  /* ---------- Edit mode ---------- */
  function setEditMode(on) {
    editMode = on;
    floorsEl.classList.toggle("editing", on);
    const btn = getEl("editToggle");
    btn.setAttribute("aria-pressed", on);
    btn.textContent = on ? "✓ Done Editing" : "+ Edit Rooms";
    getEl("editNotice").hidden = !on;
    showToast(on ? "Room Editing Mode enabled" : "Room Editing Mode disabled");
  }

  /* ---------- Modal ---------- */
  function openModal(id) {
    const r = rooms[id];
    currentId = id;
    lastFocus = document.activeElement;

    getEl("modalTitle").textContent = "Edit " + r.name + " Configuration";
    fields.number.value = r.number;
    fields.name.value = r.name;
    fields.roomType.value = r.roomType;
    fields.availability.value = r.availability;

    clearInvalid();
    validate();
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    fields.number.focus();
  }

  function closeModal() {
    overlay.hidden = true;
    document.body.style.overflow = "";
    currentId = null;
    if (lastFocus) lastFocus.focus();
  }

  function clearInvalid() {
    Object.values(fields).forEach(f => f.classList.remove("invalid"));
  }

  /* Live Validation */
  function validate() {
    const box = getEl("alertBox");
    const num = fields.number.value.trim();
    const name = fields.name.value.trim();
    const avail = fields.availability.value;

    let type = "ok", msg = "Room details and availability are properly configured.";

    if (!num && !name) {
      type = "bad"; msg = "Please enter at least a Room Number or a Room Name.";
    } else if (avail === "under maintenance") {
      type = "warn"; msg = "Room is set to Under Maintenance and will not accept new reservations.";
    } else if (avail === "not available") {
      type = "warn"; msg = "Room is marked Not Available for reservations.";
    }

    box.className = "alert " + type;
    box.textContent = (type === "ok" ? "✔ " : type === "bad" ? "✖ " : "⚠ ") + msg;
    return type !== "bad";
  }

  /* ---------- Event Listeners ---------- */
  getEl("editToggle").addEventListener("click", () => setEditMode(!editMode));
  getEl("floorFilter").addEventListener("change", renderFloors);

  floorsEl.addEventListener("click", e => {
    const card = e.target.closest(".room");
    if (!card) return;
    const r = rooms[card.dataset.id];
    if (!editMode) {
      showToast("Turn on Edit Rooms to change " + r.name);
      return;
    }
    openModal(card.dataset.id);
  });

  Object.values(fields).forEach(f => {
    f.addEventListener("input", validate);
    f.addEventListener("change", validate);
  });

  form.addEventListener("submit", e => {
    e.preventDefault();
    clearInvalid();
    if (!validate()) {
      if (!fields.number.value.trim() && !fields.name.value.trim()) {
        fields.number.classList.add("invalid");
      }
      return;
    }

    const r = rooms[currentId];
    r.number = fields.number.value.trim();
    r.name = fields.name.value.trim() || (r.number ? "Room " + r.number : "Unnamed Room");
    r.label = r.number || r.name;
    r.roomType = fields.roomType.value;
    r.availability = fields.availability.value;

    closeModal();
    renderFloors();
    showToast(r.name + " changes saved");
  });

  getEl("cancelBtn").addEventListener("click", closeModal);
  getEl("closeModal").addEventListener("click", closeModal);
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !overlay.hidden) closeModal();
  });

  getEl("navToggle").addEventListener("click", e => {
    const open = getEl("nav").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });

  function showToast(msg) {
    const t = getEl("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  renderFloors();
})();