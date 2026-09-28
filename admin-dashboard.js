(() => {
    "use strict";

    const FLOORS = [
        { n: 1, name: "1st Floor", sub: "Ground Level" },
        { n: 2, name: "2nd Floor", sub: "Level 2" },
        { n: 3, name: "3rd Floor", sub: "Level 3" },
        { n: 4, name: "4th Floor", sub: "Level 4" },
    ];

    // Room state: 16 rooms, defaults
    const rooms = {};
    FLOORS.forEach(f => {
        for (let i = 1; i <= 4; i++) {
            const id = `${f.n}0${i}`;
            rooms[id] = { id, floor: f.n, gma: "full", maint: "none", capacity: 45, subject: "", faculty: "" };
        }
    });

    const $ = id => document.getElementById(id);
    const floorsEl = $("floors"), overlay = $("overlay"), form = $("roomForm");
    const fields = {
        gma: $("gma"), maint: $("maint"), capacity: $("capacity"),
        subject: $("subject"), faculty: $("faculty"),
    };
    let editMode = false, currentId = null, lastFocus = null, toastTimer;

    /* ---------- Rendering ---------- */
    function renderFloors() {
        const filter = $("floorFilter").value;
        floorsEl.innerHTML = "";
        const visible = FLOORS.filter(f => filter === "all" || String(f.n) === filter);
        floorsEl.style.gridTemplateColumns = visible.length === 1 ? "minmax(0, 420px)" : "";

        visible.forEach(f => {
            const col = document.createElement("div");
            col.className = "floor";
            col.innerHTML = `
        <div class="floor-head">
          <div><strong>${f.name}</strong><small>${f.sub} • 4 Classrooms</small></div>
          <span class="lvl">L${f.n}</span>
        </div>`;
            Object.values(rooms).filter(r => r.floor === f.n).forEach(r => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "room";
                b.dataset.id = r.id;
                b.dataset.gma = r.gma;
                b.dataset.maint = r.maint;
                b.title = `${gmaLabel(r.gma)} • ${maintLabel(r.maint)}`;
                b.innerHTML = `Room ${r.id}<span class="badge" aria-hidden="true"></span>`;
                col.appendChild(b);
            });
            floorsEl.appendChild(col);
        });
        $("totalRooms").textContent = `Total: ${Object.keys(rooms).length} Rooms`;
    }

    const gmaLabel = v => ({ full: "Fully Available", limited: "Limited Availability", occupied: "Occupied" })[v];
    const maintLabel = v => ({ none: "Operational", under: "Under Maintenance", scheduled: "Scheduled Servicing" })[v];

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
        $("modalTitle").textContent = `Edit Room ${id} Configuration`;
        fields.gma.value = r.gma;
        fields.maint.value = r.maint;
        fields.capacity.value = r.capacity;
        fields.subject.value = r.subject;
        fields.faculty.value = r.faculty;
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
        let type = "ok", msg = `Room ${currentId} is clear of course lectures and administrative maintenance.`;

        if (!fields.capacity.value || cap < 1 || cap > 45) {
            type = "bad"; msg = "Capacity must be between 1 and 45 students.";
        } else if (maint === "under" && gma !== "occupied") {
            type = "bad"; msg = "Conflict: a room under maintenance cannot be marked available. Set it to Occupied.";
        } else if (maint === "under") {
            type = "warn"; msg = "Room is closed for reservations until maintenance is complete.";
        } else if (maint === "scheduled") {
            type = "warn"; msg = "Servicing is scheduled. Reservations in the servicing window will be blocked.";
        } else if (gma === "occupied") {
            type = "warn"; msg = "Room is marked Occupied and will not accept new reservations.";
        } else if (gma === "limited") {
            type = "warn"; msg = "Limited availability. Only some time slots will be open for booking.";
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
        if (!editMode) {
            showToast("Turn on Edit Rooms to change Room " + card.dataset.id);
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
        let ok = true;
        if (!fields.faculty.value) { fields.faculty.classList.add("invalid"); ok = false; }
        if (!validate()) { fields.capacity.classList.add("invalid"); ok = false; }
        if (!ok) {
            if (!fields.faculty.value) showToast("Select a supervising faculty");
            return;
        }
        Object.assign(rooms[currentId], {
            gma: fields.gma.value,
            maint: fields.maint.value,
            capacity: Number(fields.capacity.value),
            subject: fields.subject.value.trim(),
            faculty: fields.faculty.value,
        });
        const id = currentId;
        closeModal();
        renderFloors();
        showToast(`Room ${id} changes saved`);
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