# continente-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [Continente.pt](https://www.continente.pt) — Portugal's largest supermarket chain.

Lets your AI assistant search products, manage your shopping cart, and browse order history using your real Continente account.

> **⚠️ Stability note:** This server works by automating a real browser session against Continente's website using CSS selectors. If Continente updates their site structure, some tools may break. See [Detecting changes](#detecting-changes).

---

## What it can do

| Tool | Description |
|------|-------------|
| `search_products` | Search the catalogue — results ranked by your favourites |
| `get_favorites` | List your saved favourite products |
| `refresh_favorites` | Re-sync favourites from the website |
| `get_cart` | View your current basket |
| `add_to_cart` | Add a product by ID |
| `get_order_history` | Recent orders with product lines |
| `get_most_bought` | Products you order most often (scans all orders — slow) |
| `close_session` | Close the browser and free memory |

---

## Requirements

- [Node.js](https://nodejs.org/) 18 or later
- [Python](https://www.python.org/) 3.10+ (for the cookie export script)
- A Continente.pt account, logged in on one of the [supported browsers](#supported-browsers)

---

## Setup

### 1. Install

```bash
npm install -g continente-mcp
```

Or run without installing via npx (see [Configure your MCP client](#3-configure-your-mcp-client)).

To clone locally instead:

```bash
git clone https://github.com/davidmarqu3s/continente-mcp
cd continente-mcp
npm install
```

Then install the Chromium browser that Playwright uses internally:

```bash
npm run setup
# or: npx playwright install chromium --with-deps
```

> **Linux note:** `--with-deps` installs OS-level dependencies via apt. On macOS and Windows this flag is a no-op — `npx playwright install chromium` is sufficient.

### 2. Export your cookies

The server authenticates using cookies from your existing browser session — no password handling, no OAuth flow. You need to be **logged into Continente.pt** in your browser first.

Install the cookie reader dependencies:

```bash
python3 -m pip install browser-cookie3 requests   # macOS / Linux
python  -m pip install browser-cookie3 requests   # Windows
```

Export your cookies:

```bash
python3 continente-cookie-reader.py   # macOS / Linux
python  continente-cookie-reader.py   # Windows
# Auto-detecting browser with Continente cookies...
# Found 20 cookies in chrome.
# Saved 20 cookies → ~/.continente/cookies.json  (browser: chrome)
# On Windows: %USERPROFILE%\.continente\cookies.json
```

To specify a browser explicitly:

```bash
python3 continente-cookie-reader.py --browser firefox
python3 continente-cookie-reader.py --list-browsers   # see all supported browsers
```

Cookies are saved to `~/.continente/cookies.json` (`%USERPROFILE%\.continente\cookies.json` on Windows) with owner-only read permissions.

### 3. Configure your MCP client

This server works with any [MCP-compatible client](https://modelcontextprotocol.io/clients). The config format is the same across most of them — add an entry under `mcpServers` pointing to the server command.

**Via npx (no local install needed):**

```json
{
  "mcpServers": {
    "continente": {
      "command": "npx",
      "args": ["continente-mcp"]
    }
  }
}
```

**Via local clone:**

```json
{
  "mcpServers": {
    "continente": {
      "command": "node",
      "args": ["/path/to/continente-mcp/src/index.js"]
    }
  }
}
```

Where to put this config:

| Client | Config file |
|--------|-------------|
| Claude Desktop (Mac) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor (Mac/Linux) | `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` globally |
| Cursor (Windows) | `.cursor\mcp.json` in your project, or `%USERPROFILE%\.cursor\mcp.json` globally |
| Windsurf (Mac/Linux) | `~/.codeium/windsurf/mcp_config.json` |
| Windsurf (Windows) | `%USERPROFILE%\.codeium\windsurf\mcp_config.json` |
| Other clients | See your client's MCP documentation |

---

## Keeping the session alive

Continente sessions expire after a period of inactivity. Run the keepalive script on a schedule to prevent this:

**macOS (launchd), every 20 minutes:**

Create `~/Library/LaunchAgents/com.continente.keepalive.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.continente.keepalive</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>/path/to/continente-keepalive.py</string>
  </array>
  <key>StartInterval</key>
  <integer>1200</integer>
  <key>StandardOutPath</key>
  <string>/tmp/continente-keepalive.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/continente-keepalive.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.continente.keepalive.plist
```

**Linux / WSL (cron):**

```bash
crontab -e
# Add:
*/20 * * * * python3 /path/to/continente-keepalive.py >> ~/.continente/keepalive.log 2>&1
```

**Windows (Task Scheduler):**

```powershell
schtasks /create /tn "ContinenteKeepalive" /tr "python C:\path\to\continente-keepalive.py" /sc minute /mo 20 /f
```

Or open Task Scheduler and create a task that runs `python C:\path\to\continente-keepalive.py` every 20 minutes.

If the session expires, the keepalive script will automatically re-read cookies from your browser.

---

## Security

- **Cookies give full account access** — they can view your address, manage your cart, and see your order history. Treat them like a password.
- **macOS / Linux:** Cookies are stored at `~/.continente/cookies.json` with owner-only read permissions (`chmod 600`).
- **Windows:** Cookies are stored at `%USERPROFILE%\.continente\cookies.json`. To restrict access: `icacls "%USERPROFILE%\.continente\cookies.json" /inheritance:r /grant:r "%USERNAME%:R"`
- This path is excluded from git via `.gitignore`. Never commit it.
- Cookies expire roughly every 30 days. Re-run `continente-cookie-reader.py` to refresh them.

---

## Detecting changes

Run `check-change.js` on a schedule to get notified if Continente updates their site structure in a way that might break scraping:

```bash
# First run saves a structural fingerprint
node check-change.js
```

**Linux / WSL (cron):**
```bash
# Daily at 9am
0 9 * * * node /path/to/check-change.js >> ~/.continente/change-detector.log 2>&1
```

**macOS (launchd):** Add a plist similar to the keepalive one above, with `StartInterval` set to `86400`.

**Windows (Task Scheduler):**
```powershell
schtasks /create /tn "ContinenteChangeDetector" /tr "node C:\path\to\check-change.js" /sc daily /st 09:00 /f
```

To receive a webhook notification (Slack, Discord, n8n, etc.) on change, set `CONTINENTE_ALERT_WEBHOOK` in your environment or MCP client config:

```bash
# macOS / Linux
export CONTINENTE_ALERT_WEBHOOK=https://hooks.slack.com/services/...

# Windows cmd
set CONTINENTE_ALERT_WEBHOOK=https://hooks.slack.com/services/...

# Windows PowerShell
$env:CONTINENTE_ALERT_WEBHOOK = "https://hooks.slack.com/services/..."
```

Or add it to your MCP client config under `env` (platform-neutral):

```json
{
  "mcpServers": {
    "continente": {
      "command": "npx",
      "args": ["continente-mcp"],
      "env": {
        "CONTINENTE_ALERT_WEBHOOK": "https://hooks.slack.com/services/..."
      }
    }
  }
}
```

---

## Utilities

**Back up order history** (incremental — only fetches new orders):

```bash
node continente-backup.js
# → ~/.continente/orders-backup.json
# → %USERPROFILE%\.continente\orders-backup.json  (Windows)
```

---

## Supported browsers

`continente-cookie-reader.py` can read cookies from:

| Browser | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Chrome | ✓ | ✓ | ✓ |
| Edge | ✓ | ✓ | ✓ |
| Brave | ✓ | ✓ | ✓ |
| Firefox | ✓ | ✓ | ✓ |
| Arc | ✓ | — | — |
| Chromium | ✓ | ✓ | ✓ |
| Vivaldi | ✓ | ✓ | ✓ |
| Opera | ✓ | ✓ | ✓ |
| Safari | ✓ | — | — |

Powered by [browser-cookie3](https://github.com/borisbabic/browser_cookie3).

---

## Environment variables

See [`.env.example`](./.env.example) for all options. The main ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTINENTE_COOKIES_PATH` | `~/.continente/cookies.json` | Where cookies are read/written |
| `CONTINENTE_STATE_DIR` | `~/.continente` | Directory for preferences, fingerprint, backups |
| `CONTINENTE_ALERT_WEBHOOK` | — | Webhook URL for change detection alerts |
| `CONTINENTE_VAULT_COOKIE_PATH` | — | Optional secondary path to also write cookies to (for multi-machine sync) |

> **Windows:** Replace `~` with `%USERPROFILE%` (cmd) or `$env:USERPROFILE` (PowerShell). Node.js accepts both `/` and `\` as path separators.

---

## Skills

The [`skills/`](./skills/) directory contains ready-made agent skills for clients that support them (e.g. Claude Code).

### groceries

Adds items to the basket by name. Matches against your favourites and order history to pick the right product variant automatically.

Install it in Claude Code:

```bash
# From the repo root
claude skill install skills/groceries
```

Then use it:

```
/groceries queijo flamengo, leite mimosa, ovos
```

Or naturally: *"add some manteiga and pão de forma to my Continente cart"*

See [`skills/groceries/SKILL.md`](./skills/groceries/SKILL.md) for full details.

---

## License

[MIT](./LICENSE)
