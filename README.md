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

## Setting up the Spotify widget (optional)

The "now playing" card needs your own Spotify API credentials, since it reads from *your* account.

1. Go to https://developer.spotify.com/dashboard and log in with your Spotify account.
2. Click **Create app**. Name it anything (e.g. "My Dashboard"). For **Redirect URI**, enter `http://localhost:8888/callback` (you only need this once, to generate a refresh token).
3. Save, then copy your **Client ID** and **Client Secret**.
4. Run this one-time authorization flow to get a refresh token:
   - Open this URL in your browser (replace `YOUR_CLIENT_ID`):
     ```
     https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost:8888/callback&scope=user-read-currently-playing
     ```
   - Log in and approve. You'll be redirected to `http://localhost:8888/callback?code=...` (the page won't load, that's fine — just copy the `code` value from the URL bar).
   - Exchange that code for a refresh token:
     ```bash
     curl -X POST https://accounts.spotify.com/api/token \
       -H "Authorization: Basic $(echo -n YOUR_CLIENT_ID:YOUR_CLIENT_SECRET | base64)" \
       -d grant_type=authorization_code \
       -d code=THE_CODE_FROM_THE_URL \
       -d redirect_uri=http://localhost:8888/callback
     ```
   - The response includes a `refresh_token` — save it.
5. Set these three variables (locally in `.env`, or in Railway's Variables tab):
   ```
   SPOTIFY_CLIENT_ID=...
   SPOTIFY_CLIENT_SECRET=...
   SPOTIFY_REFRESH_TOKEN=...
   ```

Without these, the dashboard runs fine — the Spotify card just shows "not connected."

## Customizing

- **Location for weather:** edit the default lat/lon in `server.js` (`/api/weather` route), currently set to Pocomoke City, MD.
- **World clock cities:** edit the `WORLD_ZONES` array in `public/app.js`.
- **News sources:** edit `NEWS_FEEDS` / `GAME_FEEDS` in `server.js` — any RSS feed URL works.
- **Calendar/reminders:** not included in v1 — a good next addition once you decide whether you want Google Calendar sync or a simple built-in list.
