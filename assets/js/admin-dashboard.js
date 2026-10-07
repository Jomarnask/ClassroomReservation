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

  // Room state, built from the floor lists above. Non-unique labels (e.g. the
  // two "205" rooms on Floor 2) get a letter suffix on their internal id so
  // each has its own state, while still displaying the same label.
  const rooms = {};
  FLOORS.forEach(f => {
    const seen = {};
    f.list.forEach(label => {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      seen[slug] = (seen[slug] || 0) + 1;
      const suffix = seen[slug] > 1 ? String.fromCharCode(96 + seen[slug]) : "";
      const id = `f${f.n}-${slug}${suffix}`;
      const isFacility = !!ICONS[label];
      rooms[id] = {
        id, floor: f.n, label,
        facility: isFacility,
        gma: DEFAULT_UNAVAILABLE.has(id) ? "not available" : "full",
        maint: "none", capacity: 45,
        roomType: FACILITY_TYPE[label] || "lecture",
      };
    });
  });

  const $ = id => document.getElementById(id);
  const floorsEl = $("floors"), overlay = $("overlay"), form = $("roomForm");
  const fields = {
    gma: $("gma"), maint: $("maint"), capacity: $("capacity"), roomType: $("roomType"),
  };
  const roomTypeLabel = v => ({ lecture: "Lecture Room", laboratory: "Laboratory", office: "Office", "stock room": "Stock Room", other: "Other" })[v];
  let editMode = false, currentId = null, lastFocus = null, toastTimer;

  /* ---------- Rendering ---------- */
  function renderFloors() {
    const filter = $("floorFilter").value;
    floorsEl.innerHTML = "";
    const visible = FLOORS.filter(f => filter === "all" || String(f.n) === filter);
    floorsEl.style.gridTemplateColumns = visible.length === 1 ? "minmax(0, 420px)" : "";

    visible.forEach(f => {
      const floorRooms = Object.values(rooms).filter(r => r.floor === f.n);
      const col = document.createElement("div");
      col.className = "floor";
      col.innerHTML = `
        <div class="floor-head">
          <div><strong>${f.name}</strong><small>${f.sub} • ${floorRooms.length} Rooms</small></div>
          <span class="lvl">L${f.n}</span>
        </div>
        <div class="room-grid"></div>`;
      const grid = col.querySelector(".room-grid");
      floorRooms.forEach(r => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "room" + (r.facility ? " facility" : "");
        b.dataset.id = r.id;
        b.dataset.gma = r.gma;
        b.dataset.maint = r.maint;
        b.title = `${r.facility ? r.label : "Room " + r.label} • ${roomTypeLabel(r.roomType)} • ${gmaLabel(r.gma)} • ${maintLabel(r.maint)}`;
        const icon = ICONS[r.label] ? `<span class="fi" aria-hidden="true">${ICONS[r.label]}</span>` : "";
        const text = r.facility ? r.label : `Room ${r.label}`;
        b.innerHTML = `${icon}${text}<span class="badge" aria-hidden="true"></span>`;
        grid.appendChild(b);
      });
      floorsEl.appendChild(col);
    });
    $("totalRooms").textContent = `Total: ${Object.keys(rooms).length} Rooms`;
  }

  const gmaLabel = v => ({ full: "Fully Available", "under maintenance": "Under Maintenance", "not available": "Not Available" })[v];
  const maintLabel = v => ({ none: "Operational", under: "Under Maintenance" })[v];

  /* ---------- Edit mode ---------- */
  function setEditMode(on) {
    editMode = on;
    floorsEl.classList.toggle("editing", on);
    const btn = $("editToggle");
    btn.setAttribute("aria-pressed", on);
    btn.textContent = on ? "✓ Done Editing" : "+ Edit Rooms";
    $("editNotice").hidden = !on;
    showToast(on ? "Room Editing Mode enabled" : "Room Editing Mode disabled");
  }

  /* ---------- Modal ---------- */
  function openModal(id) {
    const r = rooms[id];
    currentId = id;
    lastFocus = document.activeElement;
    const titleText = r.facility ? r.label : `Room ${r.label}`;
    $("modalTitle").textContent = `Edit ${titleText} Configuration`;
    fields.gma.value = r.gma;
    fields.maint.value = r.maint;
    fields.capacity.value = r.capacity;
    fields.roomType.value = r.roomType;
    clearInvalid();
    validate();
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    fields.gma.focus();
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

  /* Live conflict / status check */
  function validate() {
    const box = $("alertBox");
    const gma = fields.gma.value, maint = fields.maint.value;
    const cap = Number(fields.capacity.value);
    const r = rooms[currentId];
    const label = r ? (r.facility ? r.label : `Room ${r.label}`) : "This room";
    let type = "ok", msg = `${label} is clear of course lectures and administrative maintenance.`;

    if (!fields.capacity.value || cap < 1 || cap > 45) {
      type = "bad"; msg = "Capacity must be between 1 and 45 students.";
    } else if (maint === "under" && gma === "full") {
      type = "bad"; msg = "Conflict: a room under maintenance cannot be marked Fully Available. Set GMA Availability to Under Maintenance or Not Available.";
    } else if (maint === "under") {
      type = "warn"; msg = "Room is closed for reservations until maintenance is complete.";
    } else if (gma === "not available") {
      type = "warn"; msg = "Room is marked Not Available and will not accept new reservations.";
    } else if (gma === "under maintenance") {
      type = "warn"; msg = "Room is under maintenance and will not accept new reservations.";
    }
    box.className = `alert ${type}`;
    box.textContent = (type === "ok" ? "✔ Automatic Conflict Check: " : type === "bad" ? "✖ " : "⚠ ") + msg;
    return type !== "bad";
  }

  /* ---------- Events ---------- */
  $("editToggle").addEventListener("click", () => setEditMode(!editMode));
  $("floorFilter").addEventListener("change", renderFloors);

  floorsEl.addEventListener("click", e => {
    const card = e.target.closest(".room");
    if (!card) return;
    const r = rooms[card.dataset.id];
    if (!editMode) {
      showToast("Turn on Edit Rooms to change " + (r.facility ? r.label : "Room " + r.label));
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
    if (!validate()) { fields.capacity.classList.add("invalid"); return; }
    Object.assign(rooms[currentId], {
      gma: fields.gma.value,
      maint: fields.maint.value,
      capacity: Number(fields.capacity.value),
      roomType: fields.roomType.value,
    });
    const saved = rooms[currentId];
    const savedLabel = saved.facility ? saved.label : `Room ${saved.label}`;
    closeModal();
    renderFloors();
    showToast(`${savedLabel} changes saved`);
  });

  $("cancelBtn").addEventListener("click", closeModal);
  $("closeModal").addEventListener("click", closeModal);
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !overlay.hidden) closeModal();
  });

  $("navToggle").addEventListener("click", e => {
    const open = $("nav").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });

  function showToast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  renderFloors();
})();