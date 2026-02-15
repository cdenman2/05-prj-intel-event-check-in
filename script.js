(() => {
  "use strict";

  // --------- DOM ELEMENTS (match your HTML exactly) ----------
  const form = document.getElementById("checkInForm");
  const nameInput = document.getElementById("attendeeName");
  const teamSelect = document.getElementById("teamSelect");
  const checkInBtn = document.getElementById("checkInBtn");

  const greeting = document.getElementById("greeting");
  const attendeeCountEl = document.getElementById("attendeeCount");
  const progressBarEl = document.getElementById("progressBar");

  const waterCountEl = document.getElementById("waterCount");
  const zeroCountEl = document.getElementById("zeroCount");
  const powerCountEl = document.getElementById("powerCount");

  // Team card containers (for highlight on celebration)
  const waterCard = document.querySelector(".team-card.water");
  const zeroCard = document.querySelector(".team-card.zero");
  const powerCard = document.querySelector(".team-card.power");

  // Where we’ll inject the attendee list UI
  const container = document.querySelector(".container");
  const teamStatsSection = document.querySelector(".team-stats");

  // --------- SETTINGS ----------
  const MAX_ATTENDEES = 50;
  const STORAGE_KEY = "intel_summit_checkins_v3"; // bumped to avoid old conflicts

  // Map your select values -> display names + count element + card element
  const TEAM_MAP = {
    water: { label: "Team Water Wise", countEl: waterCountEl, cardEl: waterCard },
    zero: { label: "Team Net Zero", countEl: zeroCountEl, cardEl: zeroCard },
    power: { label: "Team Renewables", countEl: powerCountEl, cardEl: powerCard }
  };

  // Backward compatibility: map labels to keys (fixes any old saved data)
  const LABEL_TO_KEY = {
    "Team Water Wise": "water",
    "Team Net Zero": "zero",
    "Team Renewables": "power"
  };

  // --------- STATE ----------
  // state.checkins: [{ id, nameOriginal, nameKey, teamKey, timeISO }]
  // state.celebrated: boolean
  let state = loadState();

  // Injected UI elements
  let attendeeListEl = null;
  let celebrationBannerEl = null;

  // Confetti state
  let confettiAlreadyFired = false;

  // --------- INIT ----------
  ensureAttendeeListUI();
  ensureCelebrationBannerUI();
  renderAll();
  wireEvents();
  maybeCelebrate(); // if already at goal from saved state, show celebration/confetti

  // ===========================
  // Event Wiring
  // ===========================
  function wireEvents() {
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      handleCheckIn();
    });
  }

  // ===========================
  // Core Logic
  // ===========================
  function handleCheckIn() {
    const nameOriginal = (nameInput?.value || "").trim();
    const rawTeamValue = (teamSelect?.value || "").trim();
    const teamKey = normalizeTeamKey(rawTeamValue);

    // Validation
    if (!nameOriginal) {
      showMessage("⚠️ Please enter a name.", false);
      nameInput?.focus();
      return;
    }
    if (!TEAM_MAP[teamKey]) {
      showMessage("⚠️ Please select a team.", false);
      teamSelect?.focus();
      return;
    }

    // Capacity check
    if (state.checkins.length >= MAX_ATTENDEES) {
      showMessage(`🚫 Event is at capacity (${MAX_ATTENDEES}/${MAX_ATTENDEES}).`, false);
      lockIfFull();
      maybeCelebrate();
      return;
    }

    // Duplicate check: same normalized name + same team
    const nameKey = normalizeName(nameOriginal);
    if (isDuplicate(nameKey, teamKey)) {
      showMessage(`ℹ️ ${nameOriginal} is already checked in for ${TEAM_MAP[teamKey].label}.`, false);
      return;
    }

    // Add check-in
    state.checkins.push({
      id: makeId(),
      nameOriginal,
      nameKey,
      teamKey,
      timeISO: new Date().toISOString()
    });

    saveState(state);

    // Personalized greeting
    showMessage(`🎉 Welcome, ${nameOriginal} from ${TEAM_MAP[teamKey].label}!`, true);

    // Update UI
    renderAll();
    lockIfFull();
    maybeCelebrate();

    // Reset name only (keep team selected)
    if (nameInput) nameInput.value = "";
    nameInput?.focus();
  }

  function deleteCheckInById(id) {
    const idx = state.checkins.findIndex((c) => c.id === id);
    if (idx === -1) return;

    const removed = state.checkins.splice(idx, 1)[0];

    // If we drop below goal, turn off celebration state + UI and allow confetti again later
    if (state.checkins.length < MAX_ATTENDEES) {
      state.celebrated = false;
      if (celebrationBannerEl) celebrationBannerEl.style.display = "none";
      clearAllTeamHighlights();
      resetConfettiFlagIfNeeded();
    }

    saveState(state);
    renderAll();
    lockIfFull();

    const teamLabel = TEAM_MAP[removed.teamKey]?.label || removed.teamKey;
    showMessage(`🗑️ Removed ${removed.nameOriginal} (${teamLabel}).`, true);
  }

  function editCheckInById(id) {
    const idx = state.checkins.findIndex((c) => c.id === id);
    if (idx === -1) return;

    const current = state.checkins[idx];
    const currentName = current.nameOriginal;
    const currentTeamKey = normalizeTeamKey(current.teamKey);

    // Ask for new name
    const newNameRaw = window.prompt("Edit attendee name:", currentName);
    if (newNameRaw === null) return; // Cancel
    const newName = newNameRaw.trim();
    if (!newName) {
      showMessage("⚠️ Edit cancelled: name cannot be blank.", false);
      return;
    }

    // Ask for new team (1/2/3)
    const teamMenu =
      "Edit team (type 1, 2, or 3):\n" +
      "1 = Team Water Wise\n" +
      "2 = Team Net Zero\n" +
      "3 = Team Renewables";

    const defaultChoice =
      currentTeamKey === "water" ? "1" : currentTeamKey === "zero" ? "2" : "3";

    const teamChoice = window.prompt(teamMenu, defaultChoice);
    if (teamChoice === null) return;

    const choice = teamChoice.trim();
    let newTeamKey = "";
    if (choice === "1") newTeamKey = "water";
    else if (choice === "2") newTeamKey = "zero";
    else if (choice === "3") newTeamKey = "power";
    else {
      showMessage("⚠️ Invalid team choice. Edit cancelled.", false);
      return;
    }

    // Duplicate prevention (ignore record being edited)
    const newNameKey = normalizeName(newName);
    const wouldDuplicate = state.checkins.some(
      (c) => c.id !== id && c.nameKey === newNameKey && normalizeTeamKey(c.teamKey) === newTeamKey
    );

    if (wouldDuplicate) {
      showMessage(
        `⚠️ Cannot edit: "${newName}" is already checked in for ${TEAM_MAP[newTeamKey].label}.`,
        false
      );
      return;
    }

    // Apply edit
    state.checkins[idx] = {
      ...current,
      nameOriginal: newName,
      nameKey: newNameKey,
      teamKey: newTeamKey
    };

    saveState(state);
    renderAll();
    lockIfFull();

    // Celebration/confetti logic stays consistent at 50
    if (state.checkins.length === MAX_ATTENDEES) {
      maybeCelebrate();
    }

    showMessage(`✅ Updated: ${newName} is now in ${TEAM_MAP[newTeamKey].label}.`, true);
  }

  // ===========================
  // Helpers
  // ===========================
  function isDuplicate(nameKey, teamKey) {
    return state.checkins.some((c) => c.nameKey === nameKey && normalizeTeamKey(c.teamKey) === teamKey);
  }

  function normalizeName(str) {
    return (str || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function normalizeTeamKey(value) {
    const v = (value || "").trim();
    if (TEAM_MAP[v]) return v;
    if (LABEL_TO_KEY[v]) return LABEL_TO_KEY[v];
    return v;
  }

  function makeId() {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  // ===========================
  // Rendering
  // ===========================
  function renderAll() {
    renderCounts();
    renderProgress();
    renderTeamCounts();
    renderAttendeeList();
    clearTeamHighlightsIfNotCelebrated();
    lockIfFull();
  }

  function renderCounts() {
    if (attendeeCountEl) attendeeCountEl.textContent = String(state.checkins.length);
  }

  function renderProgress() {
    if (!progressBarEl) return;
    const current = state.checkins.length;
    const percent = Math.min(100, Math.round((current / MAX_ATTENDEES) * 100));
    progressBarEl.style.width = `${percent}%`;
  }

  function renderTeamCounts() {
    // reset visible counts
    Object.values(TEAM_MAP).forEach(({ countEl }) => {
      if (countEl) countEl.textContent = "0";
    });

    const counts = getTeamCounts();
    for (const [teamKey, teamData] of Object.entries(TEAM_MAP)) {
      if (teamData.countEl) teamData.countEl.textContent = String(counts[teamKey] || 0);
    }
  }

  function renderAttendeeList() {
    if (!attendeeListEl) return;

    attendeeListEl.innerHTML = "";
    const items = [...state.checkins].reverse();

    if (items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No attendees checked in yet.";
      li.style.listStyle = "none";
      li.style.color = "#64748b";
      attendeeListEl.appendChild(li);
      return;
    }

    for (const c of items) {
      const li = document.createElement("li");
      li.style.listStyle = "none";
      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.alignItems = "center";
      li.style.gap = "10px";
      li.style.padding = "10px 12px";
      li.style.border = "1px solid rgba(0,0,0,0.06)";
      li.style.borderRadius = "10px";
      li.style.background = "#fff";
      li.style.boxShadow = "0 2px 8px rgba(0,0,0,0.03)";

      const left = document.createElement("span");
      left.textContent = c.nameOriginal;
      left.style.fontWeight = "600";
      left.style.color = "#2c3e50";
      left.style.flex = "1";
      left.style.minWidth = "0";
      left.style.overflow = "hidden";
      left.style.textOverflow = "ellipsis";
      left.style.whiteSpace = "nowrap";

      const rightWrap = document.createElement("div");
      rightWrap.style.display = "flex";
      rightWrap.style.alignItems = "center";
      rightWrap.style.gap = "8px";
      rightWrap.style.flexShrink = "0";

      const teamPill = document.createElement("span");
      teamPill.textContent = TEAM_MAP[normalizeTeamKey(c.teamKey)]?.label || c.teamKey;
      teamPill.style.fontSize = "14px";
      teamPill.style.fontWeight = "600";
      teamPill.style.padding = "6px 10px";
      teamPill.style.borderRadius = "999px";
      teamPill.style.color = "#003c71";
      teamPill.style.background = "#e8f4fc";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.dataset.action = "edit";
      editBtn.dataset.id = c.id;
      styleSmallActionButton(editBtn);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "✕";
      delBtn.title = "Delete attendee";
      delBtn.dataset.action = "delete";
      delBtn.dataset.id = c.id;
      styleXButton(delBtn);

      rightWrap.appendChild(teamPill);
      rightWrap.appendChild(editBtn);
      rightWrap.appendChild(delBtn);

      li.appendChild(left);
      li.appendChild(rightWrap);
      attendeeListEl.appendChild(li);
    }
  }

  function lockIfFull() {
    const full = state.checkins.length >= MAX_ATTENDEES;
    if (checkInBtn) checkInBtn.disabled = full;
    if (nameInput) nameInput.disabled = full;
    if (teamSelect) teamSelect.disabled = full;
  }

  // ===========================
  // Celebration + Confetti
  // ===========================
  function maybeCelebrate() {
    if (state.checkins.length !== MAX_ATTENDEES) return;

    if (!state.celebrated) {
      state.celebrated = true;
      saveState(state);
    }

    const winners = getWinningTeams();
    highlightWinners(winners);

    const winnerNames = winners.map((k) => TEAM_MAP[k]?.label || k).join(" & ");
    showCelebrationBanner(
      `🎊 Goal reached! ${MAX_ATTENDEES}/${MAX_ATTENDEES} checked in. Winning team: ${winnerNames}!`
    );

    fireConfetti();
  }

  function getTeamCounts() {
    const counts = { water: 0, zero: 0, power: 0 };
    for (const c of state.checkins) {
      const tk = normalizeTeamKey(c.teamKey);
      if (counts[tk] !== undefined) counts[tk] += 1;
    }
    return counts;
  }

  function getWinningTeams() {
    const counts = getTeamCounts();
    const max = Math.max(counts.water, counts.zero, counts.power);
    return Object.keys(counts).filter((k) => counts[k] === max);
  }

  function highlightWinners(winnerKeys) {
    clearAllTeamHighlights();
    for (const key of winnerKeys) {
      const card = TEAM_MAP[key]?.cardEl;
      if (!card) continue;
      card.style.outline = "3px solid #0071c5";
      card.style.boxShadow = "0 10px 30px rgba(0, 113, 197, 0.25)";
      card.style.transform = "translateY(-2px)";
    }
  }

  function clearAllTeamHighlights() {
    for (const key of Object.keys(TEAM_MAP)) {
      const card = TEAM_MAP[key]?.cardEl;
      if (!card) continue;
      card.style.outline = "";
      card.style.boxShadow = "";
      card.style.transform = "";
    }
  }

  function clearTeamHighlightsIfNotCelebrated() {
    if (!state.celebrated) clearAllTeamHighlights();
  }

  function ensureCelebrationBannerUI() {
    if (!container) return;

    celebrationBannerEl = document.createElement("div");
    celebrationBannerEl.id = "celebrationBanner";
    celebrationBannerEl.style.display = "none";
    celebrationBannerEl.style.margin = "10px 0 20px";
    celebrationBannerEl.style.padding = "14px 16px";
    celebrationBannerEl.style.borderRadius = "12px";
    celebrationBannerEl.style.background = "linear-gradient(90deg, #e8f4fc, #ecfdf3)";
    celebrationBannerEl.style.color = "#003c71";
    celebrationBannerEl.style.fontWeight = "700";
    celebrationBannerEl.style.border = "1px solid rgba(0,0,0,0.06)";

    const greetingEl = document.getElementById("greeting");
    if (greetingEl && greetingEl.parentNode) {
      greetingEl.parentNode.insertBefore(celebrationBannerEl, greetingEl.nextSibling);
    } else {
      container.prepend(celebrationBannerEl);
    }
  }

  function showCelebrationBanner(text) {
    if (!celebrationBannerEl) return;
    celebrationBannerEl.textContent = text;
    celebrationBannerEl.style.display = "block";
  }

  // ===========================
  // Attendee List UI (Injected) + Delegated Buttons
  // ===========================
  function ensureAttendeeListUI() {
    if (!container) return;

    const section = document.createElement("div");
    section.id = "attendeeListSection";
    section.style.marginTop = "22px";
    section.style.paddingTop = "22px";
    section.style.borderTop = "2px solid #f1f5f9";
    section.style.textAlign = "left";

    const title = document.createElement("h3");
    title.textContent = "Attendee List";
    title.style.color = "#64748b";
    title.style.fontSize = "16px";
    title.style.marginBottom = "12px";

    const list = document.createElement("ul");
    list.id = "attendeeList";
    list.style.display = "grid";
    list.style.gap = "10px";
    list.style.padding = "0";
    list.style.margin = "0";

    // ✅ Reliable: one click handler for all Edit/Delete buttons
    list.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!action || !id) return;

      e.preventDefault();
      e.stopPropagation();

      if (action === "delete") {
        const ok = window.confirm("Delete this attendee?");
        if (ok) deleteCheckInById(id);
      } else if (action === "edit") {
        editCheckInById(id);
      }
    });

    section.appendChild(title);
    section.appendChild(list);

    if (teamStatsSection && teamStatsSection.parentNode) {
      teamStatsSection.parentNode.insertBefore(section, teamStatsSection);
    } else {
      container.appendChild(section);
    }

    attendeeListEl = list;
  }

  // ===========================
  // Message UI
  // ===========================
  function showMessage(text, success) {
    if (!greeting) return;

    greeting.textContent = text;
    greeting.style.display = "block";
    greeting.classList.toggle("success-message", !!success);

    window.clearTimeout(showMessage._t);
    showMessage._t = window.setTimeout(() => {
      greeting.style.display = "none";
      greeting.textContent = "";
      greeting.classList.remove("success-message");
    }, success ? 4500 : 3000);
  }

  // ===========================
  // Confetti (no libraries)
  // ===========================
  function fireConfetti() {
    if (confettiAlreadyFired) return;
    confettiAlreadyFired = true;

    const canvas = document.createElement("canvas");
    canvas.id = "confettiCanvas";
    canvas.style.position = "fixed";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "9999";
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const colors = ["#0071c5", "#00aeef", "#00c7fd", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
    const pieces = [];
    const count = 180;

    for (let i = 0; i < count; i++) {
      pieces.push({
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * window.innerHeight * 0.3,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedY: 2 + Math.random() * 4.5,
        speedX: -1.5 + Math.random() * 3,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: -0.2 + Math.random() * 0.4,
        sway: 0.8 + Math.random() * 1.6,
        swayPhase: Math.random() * Math.PI * 2
      });
    }

    const start = performance.now();
    const durationMs = 4200;

    function draw(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (const p of pieces) {
        p.y += p.speedY;
        p.x += p.speedX + Math.sin(p.swayPhase + p.y * 0.02) * p.sway;
        p.rotation += p.rotationSpeed;

        if (p.x < -30) p.x = window.innerWidth + 30;
        if (p.x > window.innerWidth + 30) p.x = -30;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (elapsed < durationMs) {
        requestAnimationFrame(draw);
      } else {
        cleanup();
      }
    }

    function cleanup() {
      window.removeEventListener("resize", onResize);
      canvas.remove();
    }

    function onResize() {
      resize();
    }

    window.addEventListener("resize", onResize);
    requestAnimationFrame(draw);
  }

  function resetConfettiFlagIfNeeded() {
    if (state.checkins.length < MAX_ATTENDEES) {
      confettiAlreadyFired = false;
      const existing = document.getElementById("confettiCanvas");
      if (existing) existing.remove();
    }
  }

  // ===========================
  // Button Styling Helpers (inline so no CSS changes)
  // ===========================
  function styleSmallActionButton(btn) {
    btn.style.height = "34px";
    btn.style.padding = "0 12px";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid rgba(0,0,0,0.10)";
    btn.style.background = "#ffffff";
    btn.style.color = "#1f2937";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "700";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";

    btn.addEventListener("mouseenter", () => (btn.style.background = "#f1f5f9"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "#ffffff"));
  }

  function styleXButton(btn) {
    btn.style.width = "34px";
    btn.style.height = "34px";
    btn.style.minWidth = "34px";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid rgba(0,0,0,0.10)";
    btn.style.background = "#ffffff";
    btn.style.color = "#1f2937";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "800";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";

    btn.addEventListener("mouseenter", () => (btn.style.background = "#f1f5f9"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "#ffffff"));
  }

  // ===========================
  // Persistence
  // ===========================
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { checkins: [], celebrated: false };

      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.checkins)) return { checkins: [], celebrated: false };

      parsed.celebrated = !!parsed.celebrated;

      parsed.checkins = parsed.checkins
        .filter((c) => c && typeof c.nameOriginal === "string" && typeof c.teamKey === "string")
        .map((c) => {
          const teamKey = normalizeTeamKey(c.teamKey);
          return {
            id: typeof c.id === "string" ? c.id : makeId(),
            nameOriginal: c.nameOriginal,
            nameKey: typeof c.nameKey === "string" ? c.nameKey : normalizeName(c.nameOriginal),
            teamKey,
            timeISO: typeof c.timeISO === "string" ? c.timeISO : new Date().toISOString()
          };
        })
        .filter((c) => TEAM_MAP[c.teamKey]);

      if (parsed.checkins.length > MAX_ATTENDEES) {
        parsed.checkins = parsed.checkins.slice(0, MAX_ATTENDEES);
      }

      if (parsed.checkins.length === MAX_ATTENDEES) parsed.celebrated = true;

      return parsed;
    } catch {
      return { checkins: [], celebrated: false };
    }
  }

  function saveState(nextState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }

  // ===========================
  // Optional Admin Helpers (Console)
  // ===========================
  window.IntelCheckIn = {
    reset() {
      state = { checkins: [], celebrated: false };
      saveState(state);
      if (celebrationBannerEl) celebrationBannerEl.style.display = "none";
      clearAllTeamHighlights();
      resetConfettiFlagIfNeeded();
      renderAll();
      showMessage("✅ Reset: all check-ins cleared.", true);
    },
    export() {
      return JSON.stringify(state, null, 2);
    }
  };
})();
