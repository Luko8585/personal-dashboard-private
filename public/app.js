// ---------- Clock / World clocks ----------
const WORLD_ZONES = [
  { label: 'UTC', tz: 'UTC' },
  { label: 'Los Angeles', tz: 'America/Los_Angeles' },
  { label: 'London', tz: 'Europe/London' },
  { label: 'Tokyo', tz: 'Asia/Tokyo' },
];

function renderWorldClocks() {
  const el = document.getElementById('worldClocks');
  el.innerHTML = WORLD_ZONES.map(z => `
    <div class="worldclock" data-tz="${z.tz}">
      <div class="worldclock__label">${z.label}</div>
      <div class="worldclock__time">--:--</div>
    </div>
  `).join('');
}

function tickClocks() {
  const now = new Date();
  document.getElementById('mainClock').textContent = now.toLocaleTimeString('en-US', { hour12: false });
  document.getElementById('mainDate').textContent = now.toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });

  document.querySelectorAll('.worldclock').forEach(node => {
    const tz = node.dataset.tz;
    const t = now.toLocaleTimeString('en-US', { hour12: false, timeZone: tz, hour: '2-digit', minute: '2-digit' });
    node.querySelector('.worldclock__time').textContent = t;
  });
}

renderWorldClocks();
tickClocks();
setInterval(tickClocks, 1000);

// ---------- Weather ----------
const WEATHER_CODES = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow',
  73: 'Snow', 75: 'Heavy snow', 80: 'Rain showers', 81: 'Rain showers',
  82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};

async function loadWeather() {
  const body = document.getElementById('weatherBody');
  try {
    const r = await fetch('/api/weather');
    if (!r.ok) throw new Error('weather fetch failed');
    const data = await r.json();
    const cur = data.current;
    const daily = data.daily;
    const desc = WEATHER_CODES[cur.weather_code] || '—';

    const days = daily.time.slice(0, 4).map((d, i) => {
      const label = i === 0 ? 'Today' : new Date(d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short' });
      return `
        <div class="weather-day">
          <div class="weather-day__label">${label}</div>
          <div class="weather-day__temps">${Math.round(daily.temperature_2m_max[i])}° / ${Math.round(daily.temperature_2m_min[i])}°</div>
        </div>`;
    }).join('');

    body.classList.remove('loading');
    body.innerHTML = `
      <div class="weather-now">
        <div class="weather-temp">${Math.round(cur.temperature_2m)}°F</div>
        <div class="weather-feels">feels ${Math.round(cur.apparent_temperature)}° · ${desc} · wind ${Math.round(cur.wind_speed_10m)}mph</div>
      </div>
      <div class="weather-days">${days}</div>
    `;
  } catch (e) {
    body.classList.remove('loading');
    body.innerHTML = `<div class="error-text">Couldn't load weather.</div>`;
  }
}

// ---------- Sports ----------
let currentLeague = 'nhl';

async function loadSports(league) {
  const body = document.getElementById('sportsBody');
  body.classList.add('loading');
  body.textContent = 'Loading…';
  try {
    const r = await fetch(`/api/sports/${league}`);
    if (!r.ok) throw new Error('sports fetch failed');
    const games = await r.json();
    body.classList.remove('loading');
    if (!games.length) {
      body.innerHTML = `<div class="np-empty">No games scheduled right now.</div>`;
      return;
    }
    body.innerHTML = games.map(g => {
      const isLive = g.state === 'in';
      return `
        <div class="game-row">
          <div class="game-row__teams">
            <span class="game-row__team">${g.away?.team || '—'} ${g.away?.score ?? ''}</span>
            <span>@</span>
            <span class="game-row__team">${g.home?.team || '—'} ${g.home?.score ?? ''}</span>
          </div>
          <div class="game-row__status ${isLive ? 'is-live' : ''}">${g.status || ''}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    body.classList.remove('loading');
    body.innerHTML = `<div class="error-text">Couldn't load ${league.toUpperCase()} scores.</div>`;
  }
}

document.getElementById('sportsTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('is-active'));
  btn.classList.add('is-active');
  currentLeague = btn.dataset.league;
  loadSports(currentLeague);
});

// ---------- News ----------
async function loadNews() {
  const body = document.getElementById('newsBody');
  try {
    const r = await fetch('/api/news');
    if (!r.ok) throw new Error('news fetch failed');
    const items = await r.json();
    body.classList.remove('loading');
    body.innerHTML = items.map(i => `
      <div class="list-item">
        <a href="${i.link}" target="_blank" rel="noopener">${i.title}</a>
        <div class="list-item__meta">${i.source}</div>
      </div>
    `).join('');
  } catch (e) {
    body.classList.remove('loading');
    body.innerHTML = `<div class="error-text">Couldn't load news.</div>`;
  }
}

// ---------- Games ----------
async function loadGames() {
  const body = document.getElementById('gamesBody');
  try {
    const r = await fetch('/api/games');
    if (!r.ok) throw new Error('games fetch failed');
    const items = await r.json();
    body.classList.remove('loading');
    body.innerHTML = items.map(i => `
      <div class="list-item">
        <a href="${i.link}" target="_blank" rel="noopener">${i.title}</a>
        <div class="list-item__meta">${i.source}</div>
      </div>
    `).join('');
  } catch (e) {
    body.classList.remove('loading');
    body.innerHTML = `<div class="error-text">Couldn't load game news.</div>`;
  }
}

// ---------- Spotify ----------
async function loadSpotify() {
  const body = document.getElementById('spotifyBody');
  try {
    const r = await fetch('/api/spotify/now-playing');
    const data = await r.json();
    body.classList.remove('loading');

    if (data.notConfigured) {
      body.innerHTML = `<div class="np-empty">Not connected yet. Add LASTFM_API_KEY / LASTFM_USERNAME to enable.</div>`;
      return;
    }
    if (!data.playing) {
      body.innerHTML = `<div class="np-empty">Nothing playing right now.</div>`;
      return;
    }
    body.innerHTML = `
      <div class="np-track">
        ${data.albumArt ? `<img class="np-art" src="${data.albumArt}" alt="">` : ''}
        <div>
          <div class="np-title">${data.track}</div>
          <div class="np-artist">${data.artist}</div>
        </div>
      </div>
    `;
  } catch (e) {
    body.classList.remove('loading');
    body.innerHTML = `<div class="error-text">Couldn't reach Spotify.</div>`;
  }
}

// ---------- Countdown ----------
let countdownState = { date: null, label: 'Next visit' };

function renderCountdown() {
  const body = document.getElementById('countdownBody');
  body.classList.remove('loading');
  if (!countdownState.date) {
    body.innerHTML = `<div class="np-empty">No date set yet — tap ✎ to add one.</div>`;
    return;
  }
  const target = new Date(countdownState.date + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));

  let number, unit;
  if (diffDays > 0) {
    number = diffDays;
    unit = diffDays === 1 ? 'day to go' : 'days to go';
  } else if (diffDays === 0) {
    number = '🎉';
    unit = "it's today";
  } else {
    number = Math.abs(diffDays);
    unit = Math.abs(diffDays) === 1 ? 'day ago' : 'days ago';
  }

  body.innerHTML = `
    <div class="countdown-number">${number}</div>
    <div class="countdown-unit">${unit}</div>
    <div class="countdown-label">${countdownState.label}</div>
    <div class="countdown-date">${target.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
  `;
}

async function loadCountdown() {
  try {
    const r = await fetch('/api/countdown');
    countdownState = await r.json();
    renderCountdown();
  } catch (e) {
    document.getElementById('countdownBody').innerHTML = `<div class="error-text">Couldn't load countdown.</div>`;
  }
}

async function saveCountdown(date, label) {
  const r = await fetch('/api/countdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, label }),
  });
  countdownState = await r.json();
  renderCountdown();
}

document.getElementById('editCountdownBtn').addEventListener('click', () => {
  document.getElementById('countdownLabelInput').value = countdownState.label || '';
  document.getElementById('countdownDateInput').value = countdownState.date || '';
  document.getElementById('countdownEdit').classList.remove('hidden');
});

document.getElementById('cancelCountdownBtn').addEventListener('click', () => {
  document.getElementById('countdownEdit').classList.add('hidden');
});

document.getElementById('saveCountdownBtn').addEventListener('click', async () => {
  const date = document.getElementById('countdownDateInput').value;
  const label = document.getElementById('countdownLabelInput').value || 'Next visit';
  if (!date) return;
  await saveCountdown(date, label);
  document.getElementById('countdownEdit').classList.add('hidden');
});

// ---------- Distance map ----------
async function loadDistance() {
  try {
    const r = await fetch('/api/distance');
    const data = await r.json();
    document.getElementById('distanceMiles').textContent = `${data.miles} mi apart`;

    const map = L.map('distanceMap', {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    const homeLatLng = [data.home.lat, data.home.lon];
    const partnerLatLng = [data.partner.lat, data.partner.lon];

    const amberIcon = L.divIcon({
      className: '',
      html: '<div style="width:12px;height:12px;border-radius:50%;background:#FFB020;border:2px solid #0B0F14;box-shadow:0 0 6px 2px rgba(255,176,32,0.6);"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
    const tealIcon = L.divIcon({
      className: '',
      html: '<div style="width:12px;height:12px;border-radius:50%;background:#2DD4BF;border:2px solid #0B0F14;box-shadow:0 0 6px 2px rgba(45,212,191,0.6);"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    L.marker(homeLatLng, { icon: amberIcon }).addTo(map).bindPopup(data.home.name);
    L.marker(partnerLatLng, { icon: tealIcon }).addTo(map).bindPopup(data.partner.name);
    L.polyline([homeLatLng, partnerLatLng], { color: '#7C8A99', weight: 2, dashArray: '4 6' }).addTo(map);

    map.fitBounds([homeLatLng, partnerLatLng], { padding: [30, 30] });
  } catch (e) {
    document.getElementById('distanceMap').innerHTML = `<div class="error-text" style="padding:16px;">Couldn't load the map.</div>`;
  }
}

// ---------- Certifications ----------
let certsState = [];

function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

function renderCerts() {
  const body = document.getElementById('certsBody');
  body.classList.remove('loading');
  if (!certsState.length) {
    body.innerHTML = `<div class="np-empty">No certifications added yet.</div>`;
    return;
  }
  const sorted = [...certsState].sort((a, b) => {
    if (!a.expiresDate) return 1;
    if (!b.expiresDate) return -1;
    return new Date(a.expiresDate) - new Date(b.expiresDate);
  });
  body.innerHTML = sorted.map(c => {
    let metaClass = '';
    let metaText = '';
    if (c.expiresDate) {
      const d = daysUntil(c.expiresDate);
      if (d < 0) { metaClass = 'is-overdue'; metaText = `Expired ${Math.abs(d)}d ago`; }
      else if (d <= 60) { metaClass = 'is-soon'; metaText = `Expires in ${d}d`; }
      else { metaText = `Expires ${new Date(c.expiresDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`; }
    } else {
      metaText = c.obtainedDate ? `Obtained ${new Date(c.obtainedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No dates set';
    }
    return `
      <div class="data-row">
        <div class="data-row__main">
          <div class="data-row__title">${c.name}</div>
          <div class="data-row__meta ${metaClass}">${metaText}</div>
        </div>
        <div class="data-row__actions">
          <button class="row-btn" data-cert-delete="${c.id}" title="Delete">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

async function loadCerts() {
  try {
    const r = await fetch('/api/certs');
    certsState = await r.json();
    renderCerts();
    renderAlerts();
  } catch (e) {
    document.getElementById('certsBody').innerHTML = `<div class="error-text">Couldn't load certifications.</div>`;
  }
}

document.getElementById('addCertBtn').addEventListener('click', () => {
  document.getElementById('certAdd').classList.remove('hidden');
});
document.getElementById('cancelCertBtn').addEventListener('click', () => {
  document.getElementById('certAdd').classList.add('hidden');
});
document.getElementById('saveCertBtn').addEventListener('click', async () => {
  const name = document.getElementById('certNameInput').value.trim();
  const obtainedDate = document.getElementById('certObtainedInput').value;
  const expiresDate = document.getElementById('certExpiresInput').value;
  if (!name) return;
  await fetch('/api/certs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, obtainedDate, expiresDate }),
  });
  document.getElementById('certNameInput').value = '';
  document.getElementById('certObtainedInput').value = '';
  document.getElementById('certExpiresInput').value = '';
  document.getElementById('certAdd').classList.add('hidden');
  loadCerts();
});

document.getElementById('certsBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cert-delete]');
  if (!btn) return;
  await fetch(`/api/certs/${btn.dataset.certDelete}`, { method: 'DELETE' });
  loadCerts();
});

// ---------- Reminders ----------
let remindersState = [];

function renderReminders() {
  const body = document.getElementById('remindersBody');
  body.classList.remove('loading');
  if (!remindersState.length) {
    body.innerHTML = `<div class="np-empty">No reminders yet.</div>`;
    return;
  }
  const sorted = [...remindersState].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(a.date) - new Date(b.date);
  });
  body.innerHTML = sorted.map(r => {
    let metaClass = '';
    let metaText = '';
    if (r.date && !r.done) {
      const d = daysUntil(r.date);
      if (d < 0) { metaClass = 'is-overdue'; metaText = `Overdue ${Math.abs(d)}d`; }
      else if (d === 0) { metaClass = 'is-soon'; metaText = 'Due today'; }
      else if (d <= 7) { metaClass = 'is-soon'; metaText = `Due in ${d}d`; }
      else { metaText = new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    }
    return `
      <div class="data-row">
        <div class="data-row__main">
          <div class="data-row__title ${r.done ? 'is-done' : ''}">${r.text}</div>
          ${metaText ? `<div class="data-row__meta ${metaClass}">${metaText}</div>` : ''}
        </div>
        <div class="data-row__actions">
          <button class="row-btn check" data-reminder-toggle="${r.id}" title="${r.done ? 'Mark not done' : 'Mark done'}">${r.done ? '↺' : '✓'}</button>
          <button class="row-btn" data-reminder-delete="${r.id}" title="Delete">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

async function loadReminders() {
  try {
    const r = await fetch('/api/reminders');
    remindersState = await r.json();
    renderReminders();
    renderAlerts();
  } catch (e) {
    document.getElementById('remindersBody').innerHTML = `<div class="error-text">Couldn't load reminders.</div>`;
  }
}

document.getElementById('addReminderBtn').addEventListener('click', () => {
  document.getElementById('reminderAdd').classList.remove('hidden');
});
document.getElementById('cancelReminderBtn').addEventListener('click', () => {
  document.getElementById('reminderAdd').classList.add('hidden');
});
document.getElementById('saveReminderBtn').addEventListener('click', async () => {
  const text = document.getElementById('reminderTextInput').value.trim();
  const date = document.getElementById('reminderDateInput').value;
  if (!text) return;
  await fetch('/api/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, date }),
  });
  document.getElementById('reminderTextInput').value = '';
  document.getElementById('reminderDateInput').value = '';
  document.getElementById('reminderAdd').classList.add('hidden');
  loadReminders();
});

document.getElementById('remindersBody').addEventListener('click', async (e) => {
  const toggleBtn = e.target.closest('[data-reminder-toggle]');
  const deleteBtn = e.target.closest('[data-reminder-delete]');
  if (toggleBtn) {
    await fetch(`/api/reminders/${toggleBtn.dataset.reminderToggle}/toggle`, { method: 'POST' });
    loadReminders();
  } else if (deleteBtn) {
    await fetch(`/api/reminders/${deleteBtn.dataset.reminderDelete}`, { method: 'DELETE' });
    loadReminders();
  }
});

// ---------- Combined alerts banner (certs expiring soon + reminders due soon) ----------
function renderAlerts() {
  const banner = document.getElementById('alertsBanner');
  const items = [];

  certsState.forEach(c => {
    if (!c.expiresDate) return;
    const d = daysUntil(c.expiresDate);
    if (d < 0) items.push({ level: 'danger', text: `${c.name} expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago` });
    else if (d <= 60) items.push({ level: d <= 14 ? 'danger' : 'warn', text: `${c.name} expires in ${d} day${d === 1 ? '' : 's'}` });
  });

  remindersState.forEach(r => {
    if (r.done || !r.date) return;
    const d = daysUntil(r.date);
    if (d < 0) items.push({ level: 'danger', text: `${r.text} — overdue ${Math.abs(d)}d` });
    else if (d <= 7) items.push({ level: d <= 1 ? 'danger' : 'warn', text: `${r.text} — due in ${d} day${d === 1 ? '' : 's'}` });
  });

  if (!items.length) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
    return;
  }
  banner.classList.remove('hidden');
  banner.innerHTML = items.map(i => `<div class="alert-row ${i.level}">⚠ ${i.text}</div>`).join('');
}

// ---------- Daily Prayer ----------
async function loadDailyPrayer() {
  const body = document.getElementById('prayerBody');
  try {
    const r = await fetch('/api/daily-prayer');
    if (!r.ok) throw new Error('prayer fetch failed');
    const data = await r.json();
    body.classList.remove('loading');
    body.innerHTML = `<div class="prayer-text">${data.text}</div>`;
    document.getElementById('prayerDate').textContent = new Date(data.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (e) {
    body.classList.remove('loading');
    body.innerHTML = `<div class="error-text">Couldn't load today's prayer.</div>`;
  }
}

// ---------- Init + polling ----------
loadWeather();
loadDailyPrayer();
loadSports(currentLeague);
loadNews();
loadGames();
loadSpotify();
loadCountdown();
loadDistance();
loadCerts();
loadReminders();

setInterval(loadWeather, 10 * 60 * 1000);
setInterval(() => loadSports(currentLeague), 60 * 1000);
setInterval(loadNews, 10 * 60 * 1000);
setInterval(loadGames, 15 * 60 * 1000);
setInterval(loadSpotify, 15 * 1000);
setInterval(loadCountdown, 60 * 60 * 1000);
setInterval(loadDailyPrayer, 60 * 60 * 1000);
