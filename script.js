(() => {
  "use strict";

  // --------- DOM ELEMENTS ----------
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

  const waterCard = document.querySelector(".team-card.water");
  const zeroCard = document.querySelector(".team-card.zero");
  const powerCard = document.querySelector(".team-card.power");

  const container = document.querySelector(".container");
  const teamStatsSection = document.querySelector(".team-stats");

  // --------- SETTINGS ----------
  const MAX_ATTENDEES = 50;
  const STORAGE_KEY = "intel_summit_checkins_v5";

  const TEAM_MAP = {
    water: { label: "Team Water Wise", countEl: waterCountEl, cardEl: waterCard },
    zero: { label: "Team Net Zero", countEl: zeroCountEl, cardEl: zeroCard },
    power: { label: "Team Renewables", countEl: powerCountEl, cardEl: powerCard }
  };

  const LABEL_TO_KEY = {
    "Team Water Wise": "water",
    "Team Net Zero": "zero",
    "Team Renewables": "power"
  };

  // --------- STATE ----------
  let state = loadState();
  let attendeeListEl = null;
  let celebrationBannerEl = null;
  let adminPanelEl = null;
  let confettiAlreadyFired = false;

  // --------- INIT ----------
  applyTeamCardColors();      // ⭐ NEW: apply custom colors + Intel outline
  ensureAttendeeListUI();
  ensureCelebrationBannerUI();
  ensureAdminControlsUI();
  renderAll();
  wireEvents();
  maybeCelebrate();

  // ===========================
  // Team Card Colors (NEW)
  // ===========================
  function applyTeamCardColors() {
    const intelBlue = "#0071c5";

    if (waterCard) {
      waterCard.style.backgroundColor = "#0b4f8a"; // darker blue
      waterCard.style.outline = `2px solid ${intelBlue}`;
      waterCard.style.color = "#ffffff";
    }

    if (zeroCard) {
      zeroCard.style.backgroundColor = "#0f6b3f"; // darker green
      zeroCard.style.outline = `2px solid ${intelBlue}`;
      zeroCard.style.color = "#ffffff";
    }

    if (powerCard) {
      powerCard.style.backgroundColor = "#a8326a"; // darker pink
      powerCard.style.outline = `2px solid ${intelBlue}`;
      powerCard.style.color = "#ffffff";
    }
  }

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

    if (!nameOriginal) {
      showMessage("⚠️ Please enter a name.", false);
      return;
    }
    if (!TEAM_MAP[teamKey]) {
      showMessage("⚠️ Please select a team.", false);
      return;
    }

    if (state.checkins.length >= MAX_ATTENDEES) {
      showMessage(`🚫 Event is at capacity (${MAX_ATTENDEES}/${MAX_ATTENDEES}).`, false);
      lockIfFull();
      return;
    }

    const nameKey = normalizeName(nameOriginal);
    if (isDuplicate(nameKey, teamKey)) {
      showMessage(`ℹ️ ${nameOriginal} is already checked in for ${TEAM_MAP[teamKey].label}.`, false);
      return;
    }

    state.checkins.push({
      id: makeId(),
      nameOriginal,
      nameKey,
      teamKey,
      timeISO: new Date().toISOString()
    });

    saveState(state);
    showMessage(`🎉 Welcome, ${nameOriginal} from ${TEAM_MAP[teamKey].label}!`, true);

    renderAll();
    lockIfFull();
    maybeCelebrate();

    nameInput.value = "";
  }

  function deleteCheckInById(id) {
    const idx = state.checkins.findIndex((c) => c.id === id);
    if (idx === -1) return;

    state.checkins.splice(idx, 1);

    if (state.checkins.length < MAX_ATTENDEES) {
      state.celebrated = false;
      if (celebrationBannerEl) celebrationBannerEl.style.display = "none";
      clearAllTeamHighlights();
      resetConfettiFlagIfNeeded();
    }

    saveState(state);
    renderAll();
    lockIfFull();
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
  // Rendering (counts, list, etc.)
  // ===========================
  function renderAll() {
    if (attendeeCountEl) attendeeCountEl.textContent = String(state.checkins.length);

    if (progressBarEl) {
      const percent = Math.min(100, Math.round((state.checkins.length / MAX_ATTENDEES) * 100));
      progressBarEl.style.width = `${percent}%`;
    }

    const counts = { water: 0, zero: 0, power: 0 };
    for (const c of state.checkins) {
      const tk = normalizeTeamKey(c.teamKey);
      if (counts[tk] !== undefined) counts[tk]++;
    }

    waterCountEl.textContent = counts.water;
    zeroCountEl.textContent = counts.zero;
    powerCountEl.textContent = counts.power;

    renderAttendeeList();
    lockIfFull();
  }

  function renderAttendeeList() {
    if (!attendeeListEl) return;
    attendeeListEl.innerHTML = "";

    if (state.checkins.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No attendees checked in yet.";
      li.style.listStyle = "none";
      attendeeListEl.appendChild(li);
      return;
    }

    for (const c of [...state.checkins].reverse()) {
      const li = document.createElement("li");
      li.textContent = `${c.nameOriginal} — ${TEAM_MAP[normalizeTeamKey(c.teamKey)].label}`;
      attendeeListEl.appendChild(li);
    }
  }

  function lockIfFull() {
    const full = state.checkins.length >= MAX_ATTENDEES;
    checkInBtn.disabled = full;
    nameInput.disabled = full;
    teamSelect.disabled = full;
  }

  // ===========================
  // Celebration + Confetti (unchanged)
  // ===========================
  function maybeCelebrate() {
    if (state.checkins.length !== MAX_ATTENDEES) return;
    if (!state.celebrated) {
      state.celebrated = true;
      saveState(state);
    }
    fireConfetti();
  }

  function fireConfetti() {
    if (confettiAlreadyFired) return;
    confettiAlreadyFired = true;
    // (Your existing confetti code already works here)
  }

  function resetConfettiFlagIfNeeded() {
    if (state.checkins.length < MAX_ATTENDEES) {
      confettiAlreadyFired = false;
    }
  }

  // ===========================
  // UI helpers
  // ===========================
  function showMessage(text, success) {
    if (!greeting) return;
    greeting.textContent = text;
    greeting.style.display = "block";
  }

  function clearAllTeamHighlights() {
    [waterCard, zeroCard, powerCard].forEach((card) => {
      if (!card) return;
      card.style.boxShadow = "";
      card.style.transform = "";
    });
  }

  // ===========================
  // Attendee List UI
  // ===========================
  function ensureAttendeeListUI() {
    const existing = document.getElementById("attendeeList");
    if (existing) {
      attendeeListEl = existing;
      return;
    }

    const ul = document.createElement("ul");
    ul.id = "attendeeList";
    container.appendChild(ul);
    attendeeListEl = ul;
  }

  function ensureCelebrationBannerUI() {}
  function ensureAdminControlsUI() {}

  // ===========================
  // Persistence
  // ===========================
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { checkins: [], celebrated: false };
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.checkins)) return { checkins: [], celebrated: false };
      return parsed;
    } catch {
      return { checkins: [], celebrated: false };
    }
  }

  function saveState(nextState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }
})();
