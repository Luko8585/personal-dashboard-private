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
      body.innerHTML = `<div class="np-empty">Spotify not connected yet. Add SPOTIFY_CLIENT_ID / SECRET / REFRESH_TOKEN to enable.</div>`;
      return;
    }
    if (!data.playing) {
      body.innerHTML = `<div class="np-empty">Nothing playing right now.</div>`;
      return;
    }
    const pct = data.durationMs ? Math.min(100, (data.progressMs / data.durationMs) * 100) : 0;
    body.innerHTML = `
      <div class="np-track">
        ${data.albumArt ? `<img class="np-art" src="${data.albumArt}" alt="">` : ''}
        <div>
          <div class="np-title">${data.track}</div>
          <div class="np-artist">${data.artist}</div>
        </div>
      </div>
      <div class="np-bar"><div class="np-bar__fill" style="width:${pct}%"></div></div>
    `;
  } catch (e) {
    body.classList.remove('loading');
    body.innerHTML = `<div class="error-text">Couldn't reach Spotify.</div>`;
  }
}

// ---------- Init + polling ----------
loadWeather();
loadSports(currentLeague);
loadNews();
loadGames();
loadSpotify();

setInterval(loadWeather, 10 * 60 * 1000);
setInterval(() => loadSports(currentLeague), 60 * 1000);
setInterval(loadNews, 10 * 60 * 1000);
setInterval(loadGames, 15 * 60 * 1000);
setInterval(loadSpotify, 15 * 1000);
