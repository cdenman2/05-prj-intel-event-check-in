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
  const STORAGE_KEY = "intel_summit_checkins_v2";

  // Map your select values -> display names + count element + card element
  const TEAM_MAP = {
    water: { label: "Team Water Wise", countEl: waterCountEl, cardEl: waterCard },
    zero: { label: "Team Net Zero", countEl: zeroCountEl, cardEl: zeroCard },
    power: { label: "Team Renewables", countEl: powerCountEl, cardEl: powerCard }
  };

  // Backward compatibility: map labels to keys (fixes old saved data)
  const LABEL_TO_KEY = {
    "Team Water Wise": "water",
    "Team Net Zero": "zero",
    "Team Renewables": "power"
  };

  // --------- STATE ----------
  let state = loadState();

  // Injected UI elements
  let attendeeListEl = null;
  let celebrationBannerEl = null;

  // --------- INIT ----------
  ensureAttendeeListUI();
  ensureCelebrationBannerUI();
  renderAll();
  wireEvents();
  maybeCelebrate(); // if already at goal from saved state, show celebration/highlight

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
      nameOriginal,
      nameKey,
      teamKey,
      timeISO: new Date().toISOString()
    });

    saveState(state);

    // Personalized greeting (rubric: every check-in)
    showMessage(`🎉 Welcome, ${nameOriginal} from ${TEAM_MAP[teamKey].label}!`, true);

    // UI updates
    renderAll();
    lockIfFull();

    // Celebration at goal + highlight winning team(s)
    maybeCelebrate();

    // Reset name only (keep team selected)
    if (nameInput) nameInput.value = "";
    nameInput?.focus();
  }

  function isDuplicate(nameKey, teamKey) {
    return state.checkins.some((c) => c.nameKey === nameKey && c.teamKey === teamKey);
  }

  function normalizeName(str) {
    return (str || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function normalizeTeamKey(value) {
    const v = (value || "").trim();
    // if already a key
    if (TEAM_MAP[v]) return v;
    // if it's a label
    if (LABEL_TO_KEY[v]) return LABEL_TO_KEY[v];
    return v;
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
    // Reset visible counts
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
      li.style.padding = "10px 12px";
      li.style.border = "1px solid rgba(0,0,0,0.06)";
      li.style.borderRadius = "10px";
      li.style.background = "#fff";
      li.style.boxShadow = "0 2px 8px rgba(0,0,0,0.03)";

      const left = document.createElement("span");
      left.textContent = c.nameOriginal;
      left.style.fontWeight = "600";
      left.style.color = "#2c3e50";

      const right = document.createElement("span");
      right.textContent = TEAM_MAP[c.teamKey]?.label || c.teamKey;
      right.style.fontSize = "14px";
      right.style.fontWeight = "600";
      right.style.padding = "6px 10px";
      right.style.borderRadius = "999px";
      right.style.color = "#003c71";
      right.style.background = "#e8f4fc";

      li.appendChild(left);
      li.appendChild(right);
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
  // Celebration (Rubric LevelUp)
  // ===========================
  function maybeCelebrate() {
    if (state.checkins.length !== MAX_ATTENDEES) return;

    if (!state.celebrated) {
      state.celebrated = true;
      saveState(state);
    }

    const winners = getWinningTeams(); // handle ties
    highlightWinners(winners);

    const winnerNames = winners.map((k) => TEAM_MAP[k]?.label || k).join(" & ");
    showCelebrationBanner(
      `🎊 Goal reached! ${MAX_ATTENDEES}/${MAX_ATTENDEES} checked in. Winning team: ${winnerNames}!`
    );
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
    const winners = [];
    for (const k of Object.keys(counts)) {
      if (counts[k] === max) winners.push(k);
    }
    return winners;
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
  // Attendee List (Rubric LevelUp)
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
            nameOriginal: c.nameOriginal,
            nameKey: typeof c.nameKey === "string" ? c.nameKey : normalizeName(c.nameOriginal),
            teamKey,
            timeISO: typeof c.timeISO === "string" ? c.timeISO : new Date().toISOString()
          };
        })
        .filter((c) => TEAM_MAP[c.teamKey]); // keep only valid teams

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
      renderAll();
      showMessage("✅ Reset: all check-ins cleared.", true);
    },
    export() {
      return JSON.stringify(state, null, 2);
    },
    removeLast() {
      if (state.checkins.length === 0) return;
      const removed = state.checkins.pop();

      if (state.checkins.length < MAX_ATTENDEES) {
        state.celebrated = false;
        if (celebrationBannerEl) celebrationBannerEl.style.display = "none";
        clearAllTeamHighlights();
      }

      saveState(state);
      renderAll();
      showMessage(
        `🗑️ Removed: ${removed.nameOriginal} (${TEAM_MAP[removed.teamKey]?.label || removed.teamKey})`,
        true
      );
    }
  };
})();
