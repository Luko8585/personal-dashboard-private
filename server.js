require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const Parser = require('rss-parser');

const app = express();
const parser = new Parser({ timeout: 8000 });
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

// simple in-memory cache to avoid hammering upstream APIs
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { v, t: Date.now() });
  return v;
}

// ---------- Weather (Open-Meteo, no API key required) ----------
app.get('/api/weather', async (req, res) => {
  const lat = req.query.lat || '39.0840'; // Pocomoke City, MD default
  const lon = req.query.lon || '-75.5641';
  try {
    const data = await cached(`weather:${lat},${lon}`, 10 * 60 * 1000, async () => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
      return r.json();
    });
    res.json(data);
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

// ---------- Spotify now playing (requires your own API credentials) ----------
let spotifyAccessToken = null;
let spotifyTokenExpiry = 0;

async function getSpotifyAccessToken() {
  if (spotifyAccessToken && Date.now() < spotifyTokenExpiry) return spotifyAccessToken;
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    throw new Error('not_configured');
  }
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }),
  });
  if (!r.ok) throw new Error(`Spotify token ${r.status}`);
  const json = await r.json();
  spotifyAccessToken = json.access_token;
  spotifyTokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  return spotifyAccessToken;
}

app.get('/api/spotify/now-playing', async (req, res) => {
  try {
    const token = await getSpotifyAccessToken();
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 204) return res.json({ playing: false });
    if (!r.ok) throw new Error(`Spotify ${r.status}`);
    const json = await r.json();
    if (!json || !json.item) return res.json({ playing: false });
    res.json({
      playing: json.is_playing,
      track: json.item.name,
      artist: json.item.artists?.map(a => a.name).join(', '),
      album: json.item.album?.name,
      albumArt: json.item.album?.images?.[0]?.url,
      progressMs: json.progress_ms,
      durationMs: json.item.duration_ms,
    });
  } catch (e) {
    if (e.message === 'not_configured') {
      return res.status(200).json({ playing: false, notConfigured: true });
    }
    res.status(502).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});
