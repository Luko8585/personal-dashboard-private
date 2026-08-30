require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const parser = new Parser({ timeout: 8000 });
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

// ---------- Tiny JSON-file store (survives page reloads / multiple devices,
// resets on redeploy since Railway's filesystem isn't persisted across deploys) ----------
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data));
}

const readCountdown = () => readJSON('countdown.json', { date: null, label: 'Next visit' });
const writeCountdown = (data) => writeJSON('countdown.json', data);

const readCerts = () => readJSON('certs.json', []);
const writeCerts = (data) => writeJSON('certs.json', data);

const readReminders = () => readJSON('reminders.json', []);
const writeReminders = (data) => writeJSON('reminders.json', data);

// simple in-memory cache to avoid hammering upstream APIs
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { v, t: Date.now() });
  return v;
}

// ---------- Shared locations (home / partner) ----------
const LOCATIONS = {
  home: { name: 'Baltimore, MD', lat: 39.2904, lon: -76.6122 },
  partner: { name: 'Pocomoke City, MD', lat: 38.0754, lon: -75.5697 },
};

// ---------- Weather (Open-Meteo, no API key required) ----------
app.get('/api/weather', async (req, res) => {
  const place = req.query.place === 'partner' ? 'partner' : 'home';
  const loc = LOCATIONS[place];
  const lat = req.query.lat || loc.lat;
  const lon = req.query.lon || loc.lon;
  try {
    const data = await cached(`weather:${lat},${lon}`, 10 * 60 * 1000, async () => {
      const params = [
        'current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
        'daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset,uv_index_max,precipitation_probability_max',
        'temperature_unit=fahrenheit',
        'wind_speed_unit=mph',
        'precipitation_unit=inch',
        'timezone=auto',
      ].join('&');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&${params}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
      return r.json();
    });
    res.json({ ...data, place: { key: place, name: loc.name } });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- Sports scores (ESPN public scoreboard, no API key required) ----------
const ESPN_LEAGUES = {
  nhl: 'hockey/nhl',
  mlb: 'baseball/mlb',
  nfl: 'football/nfl',
};

app.get('/api/sports/:league', async (req, res) => {
  const league = req.params.league.toLowerCase();
  const path = ESPN_LEAGUES[league];
  if (!path) return res.status(400).json({ error: 'Unsupported league. Use nhl, mlb, or nfl.' });
  try {
    const data = await cached(`sports:${league}`, 2 * 60 * 1000, async () => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`ESPN ${r.status}`);
      const json = await r.json();
      return (json.events || []).map(ev => {
        const comp = ev.competitions?.[0];
        const competitors = comp?.competitors || [];
        const home = competitors.find(c => c.homeAway === 'home');
        const away = competitors.find(c => c.homeAway === 'away');
        return {
          id: ev.id,
          name: ev.name,
          shortName: ev.shortName,
          status: comp?.status?.type?.shortDetail || ev.status?.type?.shortDetail,
          state: comp?.status?.type?.state, // pre, in, post
          home: home && { team: home.team?.abbreviation, score: home.score, logo: home.team?.logo },
          away: away && { team: away.team?.abbreviation, score: away.score, logo: away.team?.logo },
        };
      });
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- News (RSS, no API key required) ----------
const NEWS_FEEDS = [
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://feeds.npr.org/1001/rss.xml',
];

app.get('/api/news', async (req, res) => {
  try {
    const data = await cached('news', 10 * 60 * 1000, async () => {
      const results = await Promise.allSettled(NEWS_FEEDS.map(u => parser.parseURL(u)));
      const items = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          for (const item of r.value.items.slice(0, 6)) {
            items.push({
              title: item.title,
              link: item.link,
              source: r.value.title,
              pubDate: item.pubDate,
            });
          }
        }
      }
      items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      return items.slice(0, 12);
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- Video game news (RSS, no API key required) ----------
const GAME_FEEDS = [
  'https://kotaku.com/rss',
  'https://www.ign.com/rss/articles/feed?tags=games',
];

app.get('/api/games', async (req, res) => {
  try {
    const data = await cached('games', 15 * 60 * 1000, async () => {
      const results = await Promise.allSettled(GAME_FEEDS.map(u => parser.parseURL(u)));
      const items = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          for (const item of r.value.items.slice(0, 6)) {
            items.push({
              title: item.title,
              link: item.link,
              source: r.value.title,
              pubDate: item.pubDate,
            });
          }
        }
      }
      items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      return items.slice(0, 10);
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- Now playing via Last.fm (works with Spotify Free — no OAuth needed) ----------
// Requires: LASTFM_API_KEY and LASTFM_USERNAME env vars.
// Connect Spotify to Last.fm once (Last.fm scrobbles automatically), then this just
// reads your public "recent tracks" feed with a single static API key.
app.get('/api/spotify/now-playing', async (req, res) => {
  const { LASTFM_API_KEY, LASTFM_USERNAME } = process.env;
  if (!LASTFM_API_KEY || !LASTFM_USERNAME) {
    return res.status(200).json({ playing: false, notConfigured: true });
  }
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(LASTFM_USERNAME)}&api_key=${LASTFM_API_KEY}&format=json&limit=5`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Last.fm ${r.status}`);
    const json = await r.json();
    const tracks = json.recenttracks?.track || [];
    if (!tracks.length) return res.json({ playing: false, recent: [] });

    const toTrack = (t) => ({
      track: t.name,
      artist: t.artist?.['#text'],
      album: t.album?.['#text'],
      albumArt: t.image?.find(i => i.size === 'extralarge')?.['#text'] || t.image?.slice(-1)[0]?.['#text'],
    });

    const first = tracks[0];
    const isNowPlaying = first['@attr']?.nowplaying === 'true';

    res.json({
      playing: isNowPlaying,
      ...(isNowPlaying ? toTrack(first) : {}),
      recent: tracks.slice(isNowPlaying ? 1 : 0, isNowPlaying ? 5 : 4).map(toTrack),
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- Daily Prayer (rotates automatically once per day) ----------
// A curated set of short, original, non-denominational Christian prayers.
// Picked deterministically by day-of-year so it's stable all day and changes at midnight.
const DAILY_PRAYERS = [
  "Lord, thank You for this new day. Give me strength for whatever it holds, a clear mind, and a grateful heart. Watch over the people I love, and use me for good today. Amen.",
  "Father, steady my hands and my heart today. Help me serve others well, protect me from harm, and remind me that You are with me in every call and every quiet moment. Amen.",
  "God, give me patience where I'm tested, courage where I'm afraid, and rest where I'm weary. Thank You for another day of life. Keep my family and friends safe. Amen.",
  "Lord, I lay today in Your hands. Guide my decisions, guard my words, and let me be a source of calm for anyone who needs it. Thank You for Your constant care. Amen.",
  "Father, sharpen my focus and soften my heart today. Let me do my work with integrity and treat everyone I meet with kindness. Thank You for watching over me. Amen.",
  "God, thank You for another sunrise. Help me carry today's burdens with faith instead of fear, and let me be quick to help and slow to judge. Amen.",
  "Lord, walk with me through today's tasks and challenges. Protect those I serve and those I love, and help me end the day with a thankful heart. Amen.",
  "Father, give me wisdom for hard decisions and grace for hard moments. Thank You for strength I didn't earn and mercy I don't deserve. Keep me humble today. Amen.",
  "God, quiet my anxious thoughts and remind me I don't carry today alone. Help me be steady for others the way You are steady for me. Amen.",
  "Lord, thank You for breath in my lungs and purpose in my day. Help me be honest, be brave, and be kind — especially when it's hard. Amen.",
  "Father, let today's work matter for something bigger than myself. Protect my crew, my family, and my friends. Thank You for every small mercy along the way. Amen.",
  "God, help me show up fully today — present with the people in front of me, faithful in the small things, and trusting You with the rest. Amen.",
  "Lord, thank You for rest last night and strength for today. Help me lead with a servant's heart and leave people better than I found them. Amen.",
  "Father, when today gets loud, remind me to be still for a moment and remember who's really in control. Thank You for peace that doesn't depend on circumstances. Amen.",
];

app.get('/api/daily-prayer', (req, res) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  const prayer = DAILY_PRAYERS[dayOfYear % DAILY_PRAYERS.length];
  res.json({ text: prayer, date: now.toISOString().slice(0, 10) });
});


app.get('/api/countdown', (req, res) => {
  res.json(readCountdown());
});

app.post('/api/countdown', (req, res) => {
  const { date, label } = req.body || {};
  if (date && isNaN(new Date(date).getTime())) {
    return res.status(400).json({ error: 'Invalid date' });
  }
  const current = readCountdown();
  const updated = {
    date: date || null,
    label: label || current.label || 'Next visit',
  };
  writeCountdown(updated);
  res.json(updated);
});

// ---------- Distance & route (long-distance relationship) ----------
// No live tracking (no public Life360 API exists) — this shows the actual driving
// route between the two home cities, fetched from OSRM's free public routing API.
function haversineMiles(a, b) {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

app.get('/api/distance', (req, res) => {
  const miles = haversineMiles(LOCATIONS.home, LOCATIONS.partner);
  res.json({ ...LOCATIONS, miles: Math.round(miles) });
});

app.get('/api/route', async (req, res) => {
  try {
    const data = await cached('route', 24 * 60 * 60 * 1000, async () => {
      const { home, partner } = LOCATIONS;
      const url = `https://router.project-osrm.org/route/v1/driving/${home.lon},${home.lat};${partner.lon},${partner.lat}?overview=full&geometries=geojson`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`OSRM ${r.status}`);
      const json = await r.json();
      const route = json.routes?.[0];
      if (!route) throw new Error('No route found');
      return {
        coordinates: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
        miles: Math.round(route.distance / 1609.34),
        minutes: Math.round(route.duration / 60),
      };
    });
    res.json({ ...data, home: LOCATIONS.home, partner: LOCATIONS.partner });
  } catch (e) {
    // Fall back to a straight line if the routing service is unreachable
    res.status(200).json({
      coordinates: null,
      miles: Math.round(haversineMiles(LOCATIONS.home, LOCATIONS.partner)),
      minutes: null,
      home: LOCATIONS.home,
      partner: LOCATIONS.partner,
      fallback: true,
    });
  }
});

// ---------- Certifications (with expiration tracking) ----------
app.get('/api/certs', (req, res) => {
  res.json(readCerts());
});

app.post('/api/certs', (req, res) => {
  const { name, obtainedDate, expiresDate } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const certs = readCerts();
  const cert = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    obtainedDate: obtainedDate || null,
    expiresDate: expiresDate || null,
  };
  certs.push(cert);
  writeCerts(certs);
  res.json(cert);
});

app.delete('/api/certs/:id', (req, res) => {
  const certs = readCerts().filter(c => c.id !== req.params.id);
  writeCerts(certs);
  res.json({ ok: true });
});

// ---------- Reminders ----------
app.get('/api/reminders', (req, res) => {
  res.json(readReminders());
});

app.post('/api/reminders', (req, res) => {
  const { text, date, time } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text is required' });
  const reminders = readReminders();
  const reminder = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text,
    date: date || null,
    time: time || null,
    done: false,
  };
  reminders.push(reminder);
  writeReminders(reminders);
  res.json(reminder);
});

app.post('/api/reminders/:id/toggle', (req, res) => {
  const reminders = readReminders();
  const r = reminders.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  r.done = !r.done;
  writeReminders(reminders);
  res.json(r);
});

app.delete('/api/reminders/:id', (req, res) => {
  const reminders = readReminders().filter(r => r.id !== req.params.id);
  writeReminders(reminders);
  res.json({ ok: true });
});

// ---------- Tides (NOAA CO-OPS, no API key required) ----------
const TIDE_STATIONS = {
  home: { id: '8574680', name: 'Baltimore, MD' },
  partner: { id: '8571892', name: 'Crisfield, MD (nearest to Pocomoke)' },
};

app.get('/api/tides', async (req, res) => {
  const place = req.query.place === 'partner' ? 'partner' : 'home';
  const station = TIDE_STATIONS[place];
  try {
    const data = await cached(`tides:${place}`, 30 * 60 * 1000, async () => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=personal_dashboard&begin_date=${today}&range=30&datum=MLLW&station=${station.id}&time_zone=lst_ldt&units=english&interval=hilo&format=json`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`NOAA ${r.status}`);
      const json = await r.json();
      if (json.error) throw new Error(json.error.message || 'NOAA error');
      return (json.predictions || []).map(p => ({
        time: p.t,
        type: p.type, // 'H' or 'L'
        height: parseFloat(p.v),
      }));
    });
    res.json({ station: station.name, predictions: data });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- Today in History (Wikipedia "On this day" API, no key required) ----------
app.get('/api/on-this-day', async (req, res) => {
  try {
    const data = await cached('on-this-day', 24 * 60 * 60 * 1000, async () => {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'personal-dashboard/1.0 (personal use)' } });
      if (!r.ok) throw new Error(`Wikipedia ${r.status}`);
      const json = await r.json();
      const events = (json.events || [])
        .filter(e => e.year && e.text)
        .sort((a, b) => b.year - a.year)
        .slice(0, 8)
        .map(e => ({ year: e.year, text: e.text }));
      return events;
    });
    res.json({ events: data });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- Local scanner (links out — Broadcastify doesn't allow free third-party
// audio embedding without a domain key tied to the feed owner's account) ----------
const SCANNER_FEEDS = {
  home: { name: 'Baltimore City (Police)', url: 'https://www.broadcastify.com/listen/feed/40593' },
  partner: { name: 'Worcester County Fire/EMS & MD State Police', url: 'https://www.broadcastify.com/listen/feed/43251' },
};

app.get('/api/scanner', (req, res) => {
  res.json(SCANNER_FEEDS);
});

// ---------- Severe Weather Alerts (National Weather Service, no API key required) ----------
app.get('/api/alerts', async (req, res) => {
  const place = req.query.place === 'partner' ? 'partner' : 'home';
  const loc = LOCATIONS[place];
  try {
    const data = await cached(`alerts:${place}`, 5 * 60 * 1000, async () => {
      const url = `https://api.weather.gov/alerts/active?point=${loc.lat},${loc.lon}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'personal-dashboard (personal use)', Accept: 'application/geo+json' } });
      if (!r.ok) throw new Error(`NWS ${r.status}`);
      const json = await r.json();
      return (json.features || []).map(f => ({
        event: f.properties.event,
        headline: f.properties.headline,
        severity: f.properties.severity,
        areaDesc: f.properties.areaDesc,
        expires: f.properties.expires,
      }));
    });
    res.json({ place: loc.name, alerts: data });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---------- Air Quality Index (Open-Meteo, no API key required) ----------
app.get('/api/air-quality', async (req, res) => {
  const place = req.query.place === 'partner' ? 'partner' : 'home';
  const loc = LOCATIONS[place];
  try {
    const data = await cached(`aqi:${place}`, 30 * 60 * 1000, async () => {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.lat}&longitude=${loc.lon}&current=us_aqi,pm2_5`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Open-Meteo AQI ${r.status}`);
      const json = await r.json();
      return { aqi: json.current?.us_aqi, pm25: json.current?.pm2_5 };
    });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});


app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});
