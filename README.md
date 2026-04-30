# Continente MCP — Cookie Sync Setup

## Overview

Automatically syncs your Continente.pt browser session to Hermes running on the Optiplex.

```
MacBook Chrome  →  cookie reader script  →  Obsidian vault (synced)
                                                        ↓
Optiplex  ←  cookie watcher (cron)  ←  vault file synced via git
                                                        ↓
                                              Hermes MCP server reloads
```

---

## MacBook Setup (one-time)

### 1. Copy the project
```bash
# On MacBook — wherever you keep projects
cp -r /path/to/continente-mcp ~/projects/continente-mcp
```

### 2. Install the Chrome extension
```bash
# Open Chrome → chrome://extensions/
# Enable "Developer mode" (top right)
# Click "Load unpacked" → select the chrome-extension/ folder
```
The extension icon appears in your toolbar. Click it to see cookie status and manually refresh.

### 3. Install the LaunchAgent (auto-runs every 30 min)
```bash
cp ~/projects/continente-mcp/chrome-extension/com.david.continente-cookie-sync.plist \
   ~/Library/LaunchAgents/

# Edit the script path inside if your project is elsewhere:
# nano ~/Library/LaunchAgents/com.david.continente-cookie-sync.plist
# Change /Users/david/projects/... to your actual path

launchctl load ~/Library/LaunchAgents/com.david.continente-cookie-sync.plist
```

### 4. Initial cookie export
```bash
python3 ~/projects/continente-mcp/continente-cookie-reader.py
# → Saves cookies to ~/vault/_claude/continente/cookies.json
```

### 5. Verify vault sync
Open Obsidian on MacBook — you should see `_claude/continente/cookies.json`.

---

## Optiplex Setup (already done — for reference)

- **Cookie watcher cron**: every 30 min → `python3 ~/projects/continente-mcp/cookie-watcher.py`
- **Change detection cron**: daily at 9am → `node ~/projects/continente-mcp/check-change.js`
- **Cookies go to**: `~/.continente/cookies.json`

---

## How it works

| Step | What happens |
|------|-------------|
| 1 | Chrome Extension caches cookies in browser storage every 5 min |
| 2 | LaunchAgent runs cookie reader every 30 min |
| 3 | Reader reads Chrome's SQLite cookie jar, saves to vault |
| 4 | Git sync pushes vault changes to GitHub (private repo) |
| 5 | Optiplex pulls vault changes |
| 6 | Cookie watcher detects new file, copies to `~/.continente/` |
| 7 | MCP server sees updated cookies, uses them for next request |

---

## Manual commands

**MacBook — manually sync cookies:**
```bash
python3 ~/projects/continente-mcp/continente-cookie-reader.py
```

**Optiplex — check cookie sync status:**
```bash
python3 ~/projects/continente-mcp/cookie-watcher.py
cat ~/.continente/cookie-sync.log | tail -5
```

**Optiplex — force MCP server to reload cookies:**
```bash
touch ~/.continente/cookies.json
# Then restart the MCP server or start a new session
```

---

## Troubleshooting

**"No cookies found" on MacBook:**
- Are you logged into continente.pt in Chrome?
- Try logging in fresh at https://www.continente.pt

**Cookies not appearing on Optiplex:**
```bash
# Check vault has the file
ls ~/vault/_claude/continente/
# Check git has pulled
cd ~/vault && git pull
# Manually run watcher
python3 ~/projects/continente-mcp/cookie-watcher.py
```

**MCP server using stale cookies:**
```bash
# Force refresh
python3 ~/projects/continente-mcp/cookie-watcher.py
# Then start a new Hermes session
```

---

## Security

- Cookies are sensitive (give full account access) — **never share them**
- `cookies.json` is in `.gitignore` — won't be committed to git
- Cookies expire ~30 days; you'll need to re-authenticate in Chrome when that happens
- LaunchAgent runs as your user — cookies are only accessible by your user
