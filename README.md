# Personal Dashboard

A self-hosted dashboard: weather, NHL/MLB/NFL scores, news, video game news, world clocks, and a Spotify "now playing" widget.

## Run locally

```bash
npm install
npm start
```

Then open http://localhost:3000

## Deploy to Railway

1. Push this folder to a GitHub repo (or use the Railway CLI to deploy the folder directly).
2. In Railway: **New Project → Deploy from GitHub repo** (or `railway up` from the CLI in this folder).
3. Railway auto-detects Node via Nixpacks and runs `npm start`. No extra config needed.
4. (Optional) Add the Spotify env vars below in the Railway project's **Variables** tab.
5. Railway gives you a public URL — bookmark it on your phone/PC home screen.

No other API keys are required — weather (Open-Meteo), sports (ESPN's public scoreboard), and news/game news (RSS feeds) are all free and keyless.

## Setting up the "Now Playing" widget (via Last.fm)

Spotify's own API restricts the "currently playing" endpoint to Premium accounts for the app owner. Last.fm works with Spotify Free, since it just scrobbles what you play — much simpler setup, no OAuth.

1. Connect Spotify to Last.fm (one-time): in the Spotify app, go to Settings → Social → and connect/link Last.fm, or do it from last.fm's own site under Settings → Applications. Once connected, Last.fm will automatically log ("scrobble") whatever you play.
2. Get a free Last.fm API key: go to https://www.last.fm/api/account/create, fill in any app name/description, and submit. You'll get an **API key** immediately — no approval wait, no secret needed for this.
3. Set these two variables (locally in `.env`, or in Railway's Variables tab):
   ```
   LASTFM_API_KEY=...
   LASTFM_USERNAME=your_lastfm_username
   ```

Without these, the dashboard runs fine — the Now Playing card just shows "not connected." Note: Last.fm scrobbles a track a few seconds into playback, so there's a small delay compared to true real-time.

## Daily Prayer

A short prayer that automatically rotates once per day — no setup, no external API. It cycles through a set of original short prayers based on the date, so everyone viewing the dashboard sees the same one all day, and it changes at midnight.

## Certifications & Reminders

Two more cards, no setup required:

- **Certifications** — track certs (name, date obtained, expiration date). Sorted by soonest-expiring first. Shows amber when a cert expires within 60 days, red once it's expired.
- **Reminders** — a simple to-do list with optional due dates. Amber within 7 days of the date, red once overdue. Check ✓ to mark done, ✕ to delete.
- Anything expiring/due soon (or overdue) from either card surfaces in a banner at the very top of the dashboard, so you don't have to scroll to notice it.

Both are stored the same way as the countdown date — a small JSON file on Railway's disk, which resets on redeploy (see the note below).

## Customizing

- **Location for weather:** edit the default lat/lon in `server.js` (`/api/weather` route), currently set to Pocomoke City, MD.
- **World clock cities:** edit the `WORLD_ZONES` array in `public/app.js`.
- **News sources:** edit `NEWS_FEEDS` / `GAME_FEEDS` in `server.js` — any RSS feed URL works.
- **Calendar/reminders:** not included in v1 — a good next addition once you decide whether you want Google Calendar sync or a simple built-in list.
