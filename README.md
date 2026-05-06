# continente-mcp

MCP tools for Continente.pt shopping workflows.

`continente-mcp` is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [Continente.pt](https://www.continente.pt), Portugal's largest supermarket chain. It gives MCP clients tools to search the catalogue, use your favourites and order history as context, inspect your basket, add items, and correct quantities.

Instead of clicking through the website for the same groceries every week, you can ask:

> "Add leite meio-gordo, ovos, bananas, and queijo flamengo to my Continente basket."
>
> "Find the olive oil I usually buy and add two bottles."
>
> "What's already in my cart?"
>
> "Show me the products I order most often."

The server uses your favourites and order history to rank product matches, so common requests can resolve to the brands, sizes, and variants you already buy.

> **⚠️ Stability note:** This server drives a headless browser against Continente's website using CSS selectors. If Continente updates their site structure, some tools may need code updates.

---

## What it can do

The server exposes these tools:

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

- **Resolve grocery requests by name:** product search is ranked against your favourites and order history.
- **Uses your buying history:** favourites and past orders help distinguish "the milk I buy" from every other milk in the catalogue.
- **Adds straight to your cart:** products go into your Continente basket and you check out on the website as normal.
- **Automatic login from a private env file:** provide your Continente login details once, and the server refreshes its private cookie cache when needed.
- **Works with standard MCP clients:** run it locally with `npx continente-mcp` or from a cloned repo.
- **Bundled groceries skill:** the included skill matches items against favourites and order history before searching.

## Quick start

```bash
git clone https://github.com/davidmarqu3s/continente-mcp
cd continente-mcp
npm install
npm run setup
mkdir -p ~/.continente
cp .env.example ~/.continente/credentials.env
chmod 600 ~/.continente/credentials.env
```

Edit `~/.continente/credentials.env` and set `CONTINENTE_EMAIL` and `CONTINENTE_PASSWORD`. Keep this file outside your repo.

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

Restart your MCP client, then use the tools:

1. Run `refresh_favorites` once, so product search can rank your saved favourites.
2. Search for a product, for example `search_products` with `leite`.
3. Add the chosen `product_id` with `add_to_cart`.
4. Correct quantities with `update_cart_item` if needed.
5. Review the basket with `get_cart`.

The detailed setup below covers local-clone config, Windows paths, optional keepalive, advanced browser-cookie export, security, and troubleshooting.

## Copy-paste install prompt

If you use Codex, Claude Code, Cursor, Windsurf, or another coding tool, you can paste this into a new session for local setup:

```text
Please install and configure continente-mcp on this machine.

Goal:
- I want my MCP client to use Continente.pt tools for product search, favourites, cart review, adding products, and quantity corrections.

Please do the following:
1. Check that Node.js 18+ and Python 3.10+ are installed.
2. Clone https://github.com/davidmarqu3s/continente-mcp if it is not already present.
3. Run npm install in the repo.
4. Install Playwright Chromium with npm run setup, or npx playwright install chromium if that is more appropriate for my OS.
5. Create a private env file at ~/.continente/credentials.env with mode 600.
6. Ask me for my Continente email and password, write them only to that private env file, and never print them.
7. Run node continente-auto-login.js to verify login and create the private cookie cache.
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
- Do not print login details, cookie values, addresses, order details, tokens, or secrets.
- Do not place an order or checkout.
- If get_cart says I am not logged in, check the private env file and automatic login before suggesting browser-cookie export.
```

## How it works

1. You store Continente credentials in a private env file such as `~/.continente/credentials.env`.
2. `continente-auto-login.js` logs in with Playwright and writes an authenticated cookie cache to `~/.continente/cookies.json`.
3. Your MCP client starts `continente-mcp`.
4. The server uses the private cookie cache for normal requests.
5. If protected pages redirect to login, the server runs automatic login again and retries the action.
6. The MCP client receives structured tools for product search, favourites, cart, and order history.

You always complete checkout on Continente.pt. This tool helps prepare the basket; it does not place orders or pay for anything.

---

## Requirements

- [Node.js](https://nodejs.org/) 18 or later
- [Python](https://www.python.org/) 3.10+ (for keepalive and optional browser-cookie export)
- A Continente.pt account

---

## Setup

### 1. Clone and install

The server can run from npm, but the first-time setup is easiest from a local clone because the login utility and env sample live here.

```bash
git clone https://github.com/davidmarqu3s/continente-mcp
cd continente-mcp
npm install
```

Install the Chromium build that Playwright uses:

```bash
npm run setup
# or: npx playwright install chromium --with-deps
```

> **Linux note:** `--with-deps` installs OS-level dependencies via apt. On macOS and Windows this flag is a no-op — `npx playwright install chromium` is sufficient.

Once set up, you can run the server either through `npx continente-mcp` or via the local clone — both work in your MCP client config (see [step 3](#3-configure-your-mcp-client)).

### 2. Create your private env file

```bash
mkdir -p ~/.continente
cp .env.example ~/.continente/credentials.env
chmod 600 ~/.continente/credentials.env
```

Edit `~/.continente/credentials.env` and set:

```bash
CONTINENTE_EMAIL=you@example.com
CONTINENTE_PASSWORD=your-password
```

Do not put real credentials in `.env.example`, MCP config JSON, shell history, README snippets, or any tracked file.

Verify login and create the first private cookie cache:

```bash
node continente-auto-login.js
```

Cookies are saved to `~/.continente/cookies.json` (`%USERPROFILE%\.continente\cookies.json` on Windows) with owner-only read permissions. They are an internal cache; the login env file is the source of recovery.

### 3. Configure your MCP client

Any MCP client that can run a local stdio server works: Claude Desktop, Codex, Cursor, Windsurf, and others. The config format is mostly identical — add an entry under `mcpServers` pointing to the server command.

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

## Optional Keepalive

Keepalive is optional. Normal tool calls can now refresh expired cookies through automatic login. A scheduled keepalive is still useful if you want fewer full logins and a warm session cache.

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

The keepalive script reads the same private env file used by `continente-auto-login.js`. If cookies expire, it tries automatic login first and uses browser-cookie export only as an advanced fallback.

To use a non-default env path:

```bash
CONTINENTE_ENV_PATH=/path/to/private/credentials.env python3 continente-keepalive.py
```

---

## Security

- **Credentials are secrets.** Keep `CONTINENTE_EMAIL` and `CONTINENTE_PASSWORD` in a private env file outside the repo, with owner-only permissions (`chmod 600` on macOS/Linux).
- **Cookies are also secrets.** They can view your address, manage your cart, and see your order history. Treat `~/.continente/cookies.json` like a password.
- Do not put real credentials or cookies in `.env.example`, MCP client config, README examples, logs, screenshots, issues, or commits.
- The tools log generic login steps only. They do not print credential values or cookie values.
- On Windows, restrict the state folder with filesystem permissions, for example: `icacls "%USERPROFILE%\.continente" /inheritance:r /grant:r "%USERNAME%:F"`

---

## Utilities

**Back up order history** (incremental — only fetches new orders):

```bash
node continente-backup.js
# → ~/.continente/orders-backup.json
# → %USERPROFILE%\.continente\orders-backup.json  (Windows)
```

---

## Advanced Browser-Cookie Export

Automatic login is the recommended setup. If you cannot use it, `continente-cookie-reader.py` can export cookies from a browser where you are already logged in:

```bash
python3 -m pip install browser-cookie3 requests   # macOS / Linux
python  -m pip install browser-cookie3 requests   # Windows
python3 continente-cookie-reader.py
```

Supported browser sources:

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

Powered by [browser-cookie3](https://github.com/borisbabic/browser_cookie3). Browser-cookie export is best treated as a recovery or advanced workflow, not the default setup.

---

## Environment variables

See [`.env.example`](./.env.example) for all options. The main ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTINENTE_COOKIES_PATH` | `~/.continente/cookies.json` | Where cookies are read/written |
| `CONTINENTE_STATE_DIR` | `~/.continente` | Directory for preferences and backups |
| `CONTINENTE_VAULT_COOKIE_PATH` | — | Optional secondary path to also write cookies to (for multi-machine sync) |
| `CONTINENTE_ENV_PATH` | `~/.continente/credentials.env` | Private env file containing login settings |
| `CONTINENTE_EMAIL` | — | Continente login email |
| `CONTINENTE_PASSWORD` | — | Continente login password |
| `CONTINENTE_LOGIN_HEADLESS` | `true` | Set to `false` only when debugging the automatic login browser |

`CONTINENTE_COOKIES_PATH` is used by the login, cookie, and keepalive utilities. The MCP server reads cookies from `CONTINENTE_STATE_DIR/cookies.json`, so if you customize one, make sure the server can still find the exported `cookies.json`.

> **Windows:** Replace `~` with `%USERPROFILE%` (cmd) or `$env:USERPROFILE` (PowerShell). Node.js accepts both `/` and `\` as path separators.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| `Not logged in` or redirected to login | Check that `~/.continente/credentials.env` exists, has `CONTINENTE_EMAIL` and `CONTINENTE_PASSWORD`, and is readable by your MCP server process. Then run `node continente-auto-login.js`. |
| `No favorites loaded` | Run `refresh_favorites` once. Search still works without favourites, but results will not be ranked by what you usually buy. |
| Playwright browser missing | Run `npm run setup` from the repo, or `npx playwright install chromium`. |
| Cookie reader cannot find cookies | Browser-cookie export is advanced. Confirm you are logged in, then try `python3 continente-cookie-reader.py --list-browsers` and rerun with `--browser chrome`, `--browser firefox`, etc. |
| Product search or cart parsing breaks | Continente may have changed its website structure. Open an issue with the failing tool, query/product, and what happened. |
| `get_most_bought` is slow | Expected on accounts with many orders — it scans order detail pages sequentially. |

---

## Skills

The [`skills/`](./skills/) directory contains ready-made agent skills for clients that support them (e.g. Claude Code).

### groceries

Adds items to the basket by name. It matches against your favourites and order history before searching, so "add milk" becomes the specific milk you usually buy.

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
