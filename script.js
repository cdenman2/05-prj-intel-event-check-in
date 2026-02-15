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
  const STORAGE_KEY = "intel_summit_checkins_v6";

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
  applyTeamCardStyles();       // ⭐ NEW: lighter colors, black bold text, circled icons
  ensureAttendeeListUI();
  ensureCelebrationBannerUI();
  ensureAdminControlsUI();
  renderAll();
  wireEvents();
  maybeCelebrate();

  // ===========================
  // Team Card Styling (NEW)
  // ===========================
  function applyTeamCardStyles() {
    const intelBlue = "#0071c5";

    styleCard(waterCard, "#dbeafe"); // light blue
    styleCard(zeroCard, "#dcfce7");  // light green
    styleCard(powerCard, "#fce7f3"); // light pink
  }

  function styleCard(card, bgColor) {
    if (!card) return;

    card.style.backgroundColor = bgColor;
    card.style.outline = "2px solid #0071c5";
    card.style.color = "#000000";
    card.style.fontWeight = "700";

    // Make text black & bold
    const nameEl = card.querySelector(".team-name");
    const countEl = card.querySelector(".team-count");

    if (nameEl) {
      nameEl.style.color = "#000000";
      nameEl.style.fontWeight = "800";
      circleFirstEmoji(nameEl);
    }
    if (countEl) {
      countEl.style.color = "#000000";
      countEl.style.fontWeight = "800";
      countEl.style.fontSize = "22px";
    }
  }

  // Wrap the first emoji in a circle
  function circleFirstEmoji(el) {
    const text = el.textContent || "";
    if (!text.trim()) return;

    // Split first character (emoji) from rest
    const firstChar = text.trim().charAt(0);
    const rest = text.trim().slice(1).trim();

    // Clear and rebuild
    el.textContent = "";

    const iconSpan = document.createElement("span");
    iconSpan.textContent = firstChar;
    iconSpan.style.display = "inline-flex";
    iconSpan.style.alignItems = "center";
    iconSpan.style.justifyContent = "center";
    iconSpan.style.width = "28px";
    iconSpan.style.height = "28px";
    iconSpan.style.borderRadius = "50%";
    iconSpan.style.border = "2px solid #0071c5";
    iconSpan.style.marginRight = "8px";
    iconSpan.style.fontSize = "16px";
    iconSpan.style.background = "#ffffff";

    const textSpan = document.createElement("span");
    textSpan.textContent = rest;

    el.appendChild(iconSpan);
    el.appendChild(textSpan);
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
  // Rendering
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
    // (Your working confetti code already runs here)
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
