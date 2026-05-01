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

### 2. Export your cookies

The server authenticates using cookies from your existing browser session — no password handling, no OAuth flow. You need to be **logged into Continente.pt** in your browser first.

Install the cookie reader dependencies:

```bash
pip install browser-cookie3 requests
```

Export your cookies:

```bash
python3 continente-cookie-reader.py
# Auto-detecting browser with Continente cookies...
# Found 20 cookies in chrome.
# Saved 20 cookies → /Users/you/.continente/cookies.json  (browser: chrome)
```

To specify a browser explicitly:

```bash
python3 continente-cookie-reader.py --browser firefox
python3 continente-cookie-reader.py --list-browsers   # see all supported browsers
```

Cookies are saved to `~/.continente/cookies.json` with owner-only read permissions.

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
| Cursor | `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` globally |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
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

If the session expires, the keepalive script will automatically re-read cookies from your browser.

---

## Security

- **Cookies give full account access** — they can view your address, manage your cart, and see your order history. Treat them like a password.
- Cookies are stored at `~/.continente/cookies.json` with **owner-only read permissions** (chmod 600).
- This path is excluded from git via `.gitignore`. Never commit it.
- Cookies expire roughly every 30 days. Re-run `continente-cookie-reader.py` to refresh them.

---

## Detecting changes

Run `check-change.js` on a schedule to get notified if Continente updates their site structure in a way that might break scraping:

```bash
# First run saves a structural fingerprint
node check-change.js

# Daily cron — warns if selectors change
0 9 * * * node /path/to/check-change.js >> ~/.continente/change-detector.log 2>&1
```

To receive a webhook notification (Slack, Discord, n8n, etc.) on change:

```bash
export CONTINENTE_ALERT_WEBHOOK=https://hooks.slack.com/services/...
```

---

## Utilities

**Back up order history** (incremental — only fetches new orders):

```bash
node continente-backup.js
# → ~/.continente/orders-backup.json
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
