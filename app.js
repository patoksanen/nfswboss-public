if (!window.luxon) {
  throw new Error("Luxon failed to load");
}
const { DateTime } = luxon;
const APP_TIMEZONE = "Europe/Stockholm";
const API_BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "";
async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}
async function loadSchedule() {
  try {
    const data = await apiRequest("/api/schedule");
    state.layers = data.layers;
    render();
  } catch (error) {
    console.error(error);
    alert("Could not load schedule from database.");
  }
}
const discordLoginButton = document.getElementById('discordLoginButton');

if (discordLoginButton) {
  discordLoginButton.href = `${API_BASE_URL}/auth/discord`;
}

const BOSSES = ['Kazzak', 'Azuregos'];
const HOURS_IN_WEEK = 168;

const state = {
  layers: []
};



const timeline = document.getElementById('timeline');

const rangeLabel = document.getElementById('rangeLabel');
const nowLabel = document.getElementById('nowLabel');
const addLayerForm = document.getElementById('addLayerForm');
const killForm = document.getElementById('killForm');
const killLayerSelect = document.getElementById('killLayerSelect');

const alertDialog = document.getElementById('alertDialog');
const alertMeta = document.getElementById('alertMeta');
const alertScoutName = document.getElementById('alertScoutName');
const alertPreview = document.getElementById('alertPreview');
const sendAlertBtn = document.getElementById('sendAlert');
const cancelAlertBtn = document.getElementById('cancelAlert');
const deleteLayerForm = document.getElementById('deleteLayerForm');
const deleteLayerSelect = document.getElementById('deleteLayerSelect');
const killBossSelect = document.getElementById('killBossSelect');
const loginGate = document.getElementById('loginGate');
const appLayout = document.getElementById('appLayout');
const loginStatus = document.getElementById('loginStatus');
const killTimeNowButton = document.getElementById('killTimeNowButton');
let pendingAlert = null;


render();
checkLogin();
updateClock();
setInterval(updateClock, 30000);

alertScoutName.addEventListener('input', () => {
  if (!pendingAlert) return;

  const scoutName = alertScoutName.value.trim() || 'ScoutName';

  alertPreview.textContent = buildAlertPreview(
    pendingAlert.item,
    pendingAlert.phase,
    scoutName,
    pendingAlert.boss
  );
});
killTimeNowButton.addEventListener('click', () => {
  document.getElementById('killTime').value = toDateTimeLocal(new Date());
});
addLayerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const layerIdValue = document.getElementById('layerId').value.trim();
  const firstSeen = document.getElementById('firstSeen').value;
  const firstSeenIso = parseLocalInputAsStockholm(firstSeen);
  
  const scoutName = 'Unknown';

  if (!layerIdValue || !firstSeen) return;
  const selectedDate = new Date(firstSeen);
const week = getCurrentWeekWindow();

if (selectedDate < week.start || selectedDate > week.end) {
const confirmed = confirm(
  `The first seen time is outside the current reset week.\n\n` +
  `Selected: ${formatDateTime(selectedDate)}\n` +
  `Current week: ${formatDateTime(week.start)} → ${formatDateTime(week.end)}\n\n` +
  `Do you still want to add this layer?`
);

  if (!confirmed) return;
}
  const layerId = Number(layerIdValue);
  
const existing = state.layers.find((x) => x.layerId === layerId);
  if (existing) {
    alert('That Layer ID already exists for this boss.');
    return;
  }


try {
  await apiRequest("/api/layers", {
  method: "POST",
  body: JSON.stringify({
    layerId,
    firstSeen: firstSeenIso
  })
});

  addLayerForm.reset();
  await loadSchedule();
} catch (error) {
  alert(error.message);
}
});
async function checkLogin() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/me`, {
      credentials: "include"
    });

    if (!res.ok) {
      showLoginScreen();
      return;
    }

    const data = await res.json();

    if (!data.loggedIn) {
      showLoginScreen();
      return;
    }

    const name = data.user.globalName || data.user.username;

    loginStatus.textContent = `Logged in as ${name}`;

    loginGate.classList.add('hidden');
    appLayout.classList.remove('hidden');
    await loadSchedule();
  } catch {
    showLoginScreen();
  }
}

function showLoginScreen() {
  loginGate.classList.remove('hidden');
  appLayout.classList.add('hidden');

  if (loginStatus) {
    loginStatus.textContent = "";
  }
}
deleteLayerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const internalId = deleteLayerSelect.value;
  const item = state.layers.find((x) => x.id === internalId);

  if (!item) return;

  const confirmed = confirm(`Delete Layer ID ${item.layerId}? This cannot be undone.`);

  if (!confirmed) return;

try {
  await apiRequest(`/api/layers/${item.layerId}`, {
    method: "DELETE"
  });

  await loadSchedule();
} catch (error) {
  alert(error.message);
}
});
killForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const selectedBoss = killBossSelect.value;
  const internalId = killLayerSelect.value;
  const killTime = document.getElementById('killTime').value;
  const killTimeIso = parseLocalInputAsStockholm(killTime);

  const killScoutName = document.getElementById('killScoutName').value.trim();
  const item = state.layers.find((x) => x.id === internalId);

  if (!item || !selectedBoss || !killTime || !killScoutName) return;



try {
  await apiRequest("/api/kills", {
  method: "POST",
  body: JSON.stringify({
    layerId: item.layerId,
    boss: selectedBoss,
    killTime: killTimeIso,
    scoutName: killScoutName
  })
});

  killForm.reset();
  killBossSelect.value = selectedBoss;
  await loadSchedule();
} catch (error) {
  alert(error.message);
}
});
function toDateTimeLocal(dateLike) {
  return DateTime.fromJSDate(new Date(dateLike), { zone: APP_TIMEZONE })
    .toFormat("yyyy-LL-dd'T'HH:mm");
}


timeline.addEventListener('click', (e) => {
  const target = e.target.closest('.event-click');
  if (!target) return;

  const internalId = target.dataset.id;
  const phase = target.dataset.phase;
  const boss = target.dataset.boss;
  const item = state.layers.find((x) => x.id === internalId);

  if (!item) return;

pendingAlert = { item, phase, boss };

alertMeta.textContent = `Layer ID ${item.layerId} • ${boss} spawn window`;
alertScoutName.value = '';
alertPreview.textContent = buildAlertPreview(item, phase, 'ScoutName', boss);
alertDialog.showModal();
alertScoutName.focus();
});

sendAlertBtn.addEventListener('click', async () => {
  if (!pendingAlert) return;

  const scoutName = alertScoutName.value.trim();

if (!scoutName) {
  alert('Enter scout name first.');
  return;
}

const message = buildAlertMessage(pendingAlert.item, pendingAlert.phase, scoutName, pendingAlert.boss);
 

  if (!message) return;



try {
  const res = await fetch(`${API_BASE_URL}/api/discord-alert`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message
    })
  });

  if (!res.ok) throw new Error("Backend alert request failed");

  alert("Alert sent.");
  pendingAlert = null;
  alertDialog.close();
} catch (err) {
  alert("Could not send alert through backend.");
  console.error(err);
}
});

cancelAlertBtn.addEventListener('click', () => alertDialog.close());

function render() {
  renderKillOptions();
  renderDeleteOptions();
  renderTimeline();

  setTimeout(scrollTimelineToNow, 0);
  setTimeout(scrollTimelineToNow, 100);
}


function renderDeleteOptions() {
  const rows = sortedVisibleLayers();

  if (!rows.length) {
    deleteLayerSelect.innerHTML = '<option value="">No layers</option>';
    return;
  }

  deleteLayerSelect.innerHTML = rows.map((row) => {
    return `<option value="${row.id}">Layer ${row.position} • ID ${row.layerId}</option>`;
  }).join('');
}
function renderKillOptions() {
  const rows = sortedVisibleLayers();

  if (!rows.length) {
    killLayerSelect.innerHTML = '<option value="">No layers</option>';
    return;
  }

  killLayerSelect.innerHTML = rows.map((row) => {
    return `<option value="${row.id}">Layer ${row.position} • ID ${row.layerId}</option>`;
  }).join('');
}
function formatTimelineMarker(dateLike) {
  return DateTime.fromJSDate(new Date(dateLike), { zone: APP_TIMEZONE })
    .setLocale("en")
    .toFormat("HH:mm");
}
function renderTimeline() {
  const week = getCurrentWeekWindow();

  rangeLabel.textContent = `${formatDateTime(week.start)} → ${formatDateTime(week.end)} CET`;

  const rows = sortedVisibleLayers();

  if (!rows.length) {
    timeline.innerHTML = '<div class="empty">No layers yet. Add a layer ID and the timeline will stay sorted by ID automatically.</div>';
    return;
  }

  let html = '';

  html += `
    <div class="header-row">
      <div class="left-head">
        <strong>Layer order</strong>
        <div class="muted small">Sorted by Layer ID</div>
      </div>
      <div class="time-head">
  `;

  for (let d = 0; d < 7; d++) {
    const start = new Date(week.start.getTime() + d * 24 * 60 * 60 * 1000);
    const left = d * (100 / 7);

    html += `
      <div class="day-marker" style="left:${left}%">
        <span>
          <strong>${dayName(start)}</strong><br>
          ${formatDay(start)} 03:00
        </span>
      </div>
    `;
  }

  for (let hour = 12; hour <= HOURS_IN_WEEK; hour += 12) {
    const markerTime = addHours(week.start, hour);
    const left = (hour / HOURS_IN_WEEK) * 100;

    html += `
      <div class="hour-label" style="left:${left}%">
        ${formatTimelineMarker(markerTime)}
      </div>
    `;
  }

  html += renderNowLine(week, true);

  html += `
      </div>
    </div>
  `;

  rows.forEach((row) => {
    html += `
      <div class="layer-row">
        <div class="left-cell">
          <div class="layer-name">Layer ${row.position}</div>
          <div class="layer-meta">
            ID ${row.layerId}<br>
            First seen: ${formatDateTime(row.firstSeen)} CET<br>
            Kazzak kill: ${row.kills?.Kazzak?.killTime ? formatDateTime(row.kills.Kazzak.killTime) + ' CET' : 'none'}<br>
            Azuregos kill: ${row.kills?.Azuregos?.killTime ? formatDateTime(row.kills.Azuregos.killTime) + ' CET' : 'none'}
          </div>
        </div>

        <div class="track">
    `;

    html += renderNowLine(week, false);

    BOSSES.forEach((boss, bossIndex) => {
      const events = buildEvents(row, week, boss);
      html += events.map((evt) => renderEvent(row, evt, week, bossIndex)).join('');
    });

    html += `
        </div>
      </div>
    `;
  });

  timeline.innerHTML = html;
}
function renderNowLine(week, withLabel = false) {
  const now = new Date();

  if (now < week.start || now > week.end) {
    return '';
  }

  const total = week.end.getTime() - week.start.getTime();
  const left = ((now.getTime() - week.start.getTime()) / total) * 100;

  if (withLabel) {
    return `
      <div class="now-line" style="left:${left}%"></div>
      <div class="now-line-label" style="left:${left}%">now</div>
    `;
  }

  return `<div class="now-line" style="left:${left}%"></div>`;
}
function renderEvent(row, evt, week, bossIndex = 0) {
  const total = week.end.getTime() - week.start.getTime();
  const start = Math.max(evt.start.getTime(), week.start.getTime());
  const end = Math.min(evt.end.getTime(), week.end.getTime());
  const left = ((start - week.start.getTime()) / total) * 100;
  const width = ((end - start) / total) * 100;
  const top = bossIndex === 0 ? 0 : 70;
  const height = 70;
  if (width <= 0) return '';

  const cls = {
    blocked: 'event-red',
    spawn: 'event-green',
    lockout: 'event-purple'
  }[evt.type];

  const clickable = evt.clickable ? 'event-click' : '';
  const title = evt.clickable ? 'Click to send alert' : '';

  const startLabel = evt.type === 'spawn'
  ? `<span class="event-start">starts ${formatDayTime(evt.start)}</span>`
  : '';

const endLabel = evt.type === 'spawn'
  ? `<span class="event-end">ends ${formatDayTime(evt.end)}</span>`
  : '';

return `<div class="event-bar ${cls} ${clickable}" style="left:${left}%; width:${width}%; top:${top}px; height:${height}px;" ${evt.clickable ? `data-id="${row.id}" data-phase="${evt.phase}" data-boss="${evt.boss}"` : ''} title="${title}">
  ${startLabel}
  <span class="event-label">${evt.label}</span>
  ${endLabel}
</div>`;
}
function formatTime(dateLike) {
  return DateTime.fromJSDate(new Date(dateLike), { zone: APP_TIMEZONE })
    .setLocale("en")
    .toFormat("HH:mm");
}
function formatDayTime(dateLike) {
  return DateTime.fromJSDate(new Date(dateLike), { zone: APP_TIMEZONE })
    .setLocale("en")
    .toFormat("ccc HH:mm");
}
function buildEvents(row, week, boss) {
  const list = [];
  const bossKill = row.kills?.[boss];

  if (bossKill?.killTime) {
    const kill = new Date(bossKill.killTime);
    const killBlockedEnd = addHours(kill, 72);
    const killSpawnEnd = addHours(kill, 120);

    list.push({
      type: 'lockout',
      label: `${boss} lockout`,
      start: kill,
      end: killBlockedEnd,
      clickable: false,
      boss
    });

    list.push({
      type: 'spawn',
      label: `${boss}`,
      start: killBlockedEnd,
      end: killSpawnEnd,
      clickable: true,
      phase: 'kill',
      boss
    });

    return list.filter((evt) => overlap(evt.start, evt.end, week.start, week.end));
  }

  const firstSeen = new Date(row.firstSeen);
  const blockedEnd = addHours(firstSeen, 12);
  const spawnEnd = addHours(firstSeen, 36);

  list.push({
    type: 'spawn',
    label: `${boss}`,
    start: blockedEnd,
    end: spawnEnd,
    clickable: true,
    phase: 'seen',
    boss
  });

  return list.filter((evt) => overlap(evt.start, evt.end, week.start, week.end));
}

function buildAlertMessage(item, phase, scoutName, boss) {
  const currentRow = sortedVisibleLayers().find((x) => x.id === item.id);
  const layerNumber = currentRow?.position ?? '-';

  return [
    `<@&1472818958624096440> ${boss} UP!`,
    `\`/w ${scoutName} inv \`for autoinvite`,
    `Layer: ${layerNumber}`
  ].join('\n');
}
function buildAlertPreview(item, phase, scoutName, boss) {
  const currentRow = sortedVisibleLayers().find((x) => x.id === item.id);
  const layerNumber = currentRow?.position ?? '-';

  return [
    `@world boss ${boss} UP!`,
    `/w ${scoutName} inv for autoinvite`,
    `Layer: ${layerNumber}`
  ].join('\n');
}
function sortedVisibleLayers() {
  return state.layers
    .sort((a, b) => a.layerId - b.layerId)
    .map((item, index) => ({
      ...item,
      position: index + 1
    }));
}
function scrollTimelineToNow() {
  const scrollBox = document.querySelector('.timeline-scroll');
  const week = getCurrentWeekWindow();
  const now = new Date();

  if (!scrollBox || now < week.start || now > week.end) return;

  const total = week.end.getTime() - week.start.getTime();
  const progress = (now.getTime() - week.start.getTime()) / total;

  const maxScroll = scrollBox.scrollWidth - scrollBox.clientWidth;

  if (maxScroll <= 0) return;

  const nowX = progress * scrollBox.scrollWidth;

  // Put "now" around 40% from the left of the visible area.
  const targetScroll = nowX - scrollBox.clientWidth * 0.20;

  scrollBox.scrollLeft = Math.max(0, Math.min(targetScroll, maxScroll));
}

function updateClock() {
  nowLabel.textContent = `Now: ${formatDateTime(new Date())} CET`;

  const week = getCurrentWeekWindow();
  rangeLabel.textContent = `${formatDateTime(week.start)} → ${formatDateTime(week.end)} CET`;
}

function getCurrentWeekWindow() {
  const now = DateTime.now().setZone(APP_TIMEZONE);

  // Luxon weekday: Monday=1 ... Sunday=7, Wednesday=3
  let start = now
    .startOf("day")
    .minus({ days: (now.weekday - 3 + 7) % 7 })
    .set({ hour: 3, minute: 0, second: 0, millisecond: 0 });

  if (now < start) {
    start = start.minus({ days: 7 });
  }

  const end = start.plus({ days: 7 });

  return {
    start: start.toJSDate(),
    end: end.toJSDate()
  };
}

function addHours(dateLike, hours) {
  return new Date(new Date(dateLike).getTime() + hours * 3600000);
} 

function overlap(a1, a2, b1, b2) {
  return new Date(a1) < new Date(b2) && new Date(a2) > new Date(b1);
}

function dayName(dateLike) {
  return DateTime.fromJSDate(new Date(dateLike), { zone: APP_TIMEZONE })
    .setLocale("en")
    .toFormat("ccc");
}

function formatDay(dateLike) {
  return DateTime.fromJSDate(new Date(dateLike), { zone: APP_TIMEZONE })
    .setLocale("en")
    .toFormat("dd LLL");
}

function formatDateTime(dateLike) {
  return DateTime.fromJSDate(new Date(dateLike), { zone: APP_TIMEZONE })
    .setLocale("en")
    .toFormat("dd LLL yyyy, HH:mm");
}

function parseLocalInputAsStockholm(value) {
  return DateTime.fromFormat(value, "yyyy-LL-dd'T'HH:mm", {
    zone: APP_TIMEZONE
  }).toISO();
}


