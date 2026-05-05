# continente-mcp

Turn your AI assistant into a Continente shopping helper.

`continente-mcp` is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [Continente.pt](https://www.continente.pt), Portugal's largest supermarket chain. It connects Claude, Codex, Cursor, Windsurf, and other MCP clients to your real Continente account so they can search the catalogue, prefer the products you already buy, inspect your basket, add items, and correct quantities for you.

Instead of clicking through the website for the same groceries every week, you can ask:

> "Add leite meio-gordo, ovos, bananas, and queijo flamengo to my Continente basket."
>
> "Find the olive oil I usually buy and add two bottles."
>
> "What's already in my cart?"
>
> "Show me the products I order most often."

The useful bit is not just product search. The server can use your favourites and order history as buying context, so an assistant can pick the right brand, size, and variant more often than a plain search result would.

> **⚠️ Stability note:** This server works by automating a real browser session against Continente's website using CSS selectors. If Continente updates their site structure, some tools may need code updates.

---

## What it can do

`continente-mcp` gives your assistant the primitives it needs to handle a real shopping session:

| Tool | Description |
|------|-------------|
| `search_products` | Search the catalogue — results ranked by your favourites |
| `get_favorites` | List your saved favourite products |
| `refresh_favorites` | Re-sync favourites from the website |
| `get_cart` | View your current basket |
| `add_to_cart` | Add a product by ID |
| `update_cart_item` | Set the quantity for a product already in the basket |
| `get_order_history` | Recent orders with product lines |
| `get_most_bought` | Products you order most often (scans all orders — slow) |
| `close_session` | Close the browser and free memory |

---

## Why use it

- **Shop in plain language:** ask for groceries by name and let your assistant resolve the Continente product IDs.
- **Use your actual preferences:** favourites and order history help distinguish "the milk I buy" from every other milk in the catalogue.
- **Build a basket, not just a list:** add products directly to your Continente cart, adjust quantities, then checkout on the official website.
- **No password handling:** authentication comes from your existing browser session cookies.
- **Works with standard MCP clients:** run it locally with `npx continente-mcp` or from a cloned repo.
- **Agent skill included:** the bundled `groceries` skill teaches compatible agents how to match items against favourites and order history before adding them.

## Quick start

```bash
git clone https://github.com/davidmarqu3s/continente-mcp
cd continente-mcp
npm install
npm run setup
python3 -m pip install browser-cookie3 requests
python3 continente-cookie-reader.py
```

Then add the server to your MCP client:

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

Restart your MCP client, then ask your assistant to:

1. Run `refresh_favorites` once, so product search can rank your saved favourites.
2. Search for a product, for example `search_products` with `leite`.
3. Add the chosen `product_id` with `add_to_cart`.
4. Correct quantities with `update_cart_item` if needed.
5. Review the basket with `get_cart`.

The detailed setup below covers local-clone config, Windows paths, keepalive, security, and troubleshooting.

## Copy-paste install prompt

If you use an AI coding agent such as Codex, Claude Code, Cursor, or Windsurf, you can paste this into a new session and let it do the local setup:

```text
Please install and configure continente-mcp on this machine.

Goal:
- I want my MCP client to use Continente.pt tools for product search, favourites, cart review, adding products, and quantity corrections.

Please do the following:
1. Check that Node.js 18+ and Python 3.10+ are installed.
2. Clone https://github.com/davidmarqu3s/continente-mcp if it is not already present.
3. Run npm install in the repo.
4. Install Playwright Chromium with npm run setup, or npx playwright install chromium if that is more appropriate for my OS.
5. Install the Python cookie-reader dependencies: browser-cookie3 and requests.
6. Ask me to log into https://www.continente.pt in my normal browser.
7. Run continente-cookie-reader.py to export Continente cookies to ~/.continente/cookies.json.
8. Add an MCP server named "continente" to my MCP client config.
   Use npx if possible:
   {
     "mcpServers": {
       "continente": {
         "command": "npx",
         "args": ["continente-mcp"]
       }
     }
   }
9. Restart or ask me to restart the MCP client.
10. Verify the server by listing tools and, if possible, calling get_cart.

Important:
- Do not print cookie values, addresses, order details, tokens, or secrets.
- Do not place an order or checkout.
- If get_cart says I am not logged in, help me refresh cookies rather than continuing with cart actions.
```

## How it works

1. You log in to Continente.pt in your normal browser.
2. The cookie reader exports only the Continente cookies to `~/.continente/cookies.json`.
3. Your MCP client starts `continente-mcp`.
4. The server uses a headless Chromium session to read Continente pages and call the cart endpoint.
5. Your assistant receives structured tools for product search, favourites, cart, and order history.

You always complete checkout on Continente.pt. This tool helps prepare the basket; it does not place orders or pay for anything.

---

## Requirements

- [Node.js](https://nodejs.org/) 18 or later
- [Python](https://www.python.org/) 3.10+ (for the cookie export script)
- A Continente.pt account, logged in on one of the [supported browsers](#supported-browsers)

---

## Setup

### 1. Clone and install

The server can run from npm, but the first-time setup still needs this repository because the Python cookie scripts live here.

```bash
git clone https://github.com/davidmarqu3s/continente-mcp
cd continente-mcp
npm install
```

Install the Chromium browser that Playwright uses internally:

```bash
npm run setup
# or: npx playwright install chromium --with-deps
```

> **Linux note:** `--with-deps` installs OS-level dependencies via apt. On macOS and Windows this flag is a no-op — `npx playwright install chromium` is sufficient.

Once set up, you can run the server either through `npx continente-mcp` or via the local clone — both work in your MCP client config (see [step 3](#3-configure-your-mcp-client)).

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

This server works with MCP-compatible clients that can run local stdio MCP servers. That includes Claude Desktop, Codex, Cursor, Windsurf, and similar local agent tools. The config format is the same across most of them — add an entry under `mcpServers` pointing to the server command.

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
| Codex | `~/.codex/config.toml`, or add with the Codex MCP command |
| Cursor (Mac/Linux) | `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` globally |
| Cursor (Windows) | `.cursor\mcp.json` in your project, or `%USERPROFILE%\.cursor\mcp.json` globally |
| Windsurf (Mac/Linux) | `~/.codeium/windsurf/mcp_config.json` |
| Windsurf (Windows) | `%USERPROFILE%\.codeium\windsurf\mcp_config.json` |
| Other clients | See your client's MCP documentation |

**ChatGPT note:** ChatGPT developer mode supports MCP tools, including write actions, through remote MCP servers/connectors. This package is a local stdio server by default, so using it from ChatGPT requires wrapping or deploying it as a remote MCP server first. See OpenAI's [ChatGPT developer mode](https://platform.openai.com/docs/guides/developer-mode) and [MCP server guide](https://platform.openai.com/docs/mcp/) docs.

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
| `CONTINENTE_STATE_DIR` | `~/.continente` | Directory for preferences and backups |
| `CONTINENTE_VAULT_COOKIE_PATH` | — | Optional secondary path to also write cookies to (for multi-machine sync) |

`CONTINENTE_COOKIES_PATH` is used by the Python cookie and keepalive utilities. The MCP server reads cookies from `CONTINENTE_STATE_DIR/cookies.json`, so if you customize one, make sure the server can still find the exported `cookies.json`.

> **Windows:** Replace `~` with `%USERPROFILE%` (cmd) or `$env:USERPROFILE` (PowerShell). Node.js accepts both `/` and `\` as path separators.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `Not logged in` or redirected to login | Re-run `continente-cookie-reader.py` after logging into Continente.pt in your browser. |
| `No favorites loaded` | Ask the assistant to run `refresh_favorites` once. Search still works without favourites, but ranking is less personal. |
| Playwright browser missing | Run `npm run setup` from the repo, or `npx playwright install chromium`. |
| Cookie reader cannot find cookies | Confirm you are logged in, then try `python3 continente-cookie-reader.py --list-browsers` and rerun with `--browser chrome`, `--browser firefox`, etc. |
| Product search or cart parsing breaks | Continente may have changed its website structure. Open an issue with the failing tool, query/product, and what happened. |
| `get_most_bought` is slow | This is expected on accounts with many orders because it scans order detail pages sequentially. |

---

## Skills

The [`skills/`](./skills/) directory contains ready-made agent skills for clients that support them (e.g. Claude Code).

### groceries

Adds items to the basket by name. It matches against your favourites and order history before searching, so "add milk" can become the specific milk you actually tend to buy.

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
