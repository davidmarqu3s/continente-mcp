# Continente MCP

A local MCP server for Continente.pt: search products, rank favourites, manage your basket, and read order history. Checkout and payment stay on Continente.pt.

## Setup

Requires **Node.js 20.18.1 or later** and a Continente account for favourites, basket and order history. Public product search works without login.

```bash
git clone https://github.com/davidmarqu3s/continente-mcp
cd continente-mcp
npm install
npm run setup
mkdir -p ~/.continente
cp .env.example ~/.continente/credentials.env
chmod 600 ~/.continente/credentials.env
```

Edit the private credentials file and set `CONTINENTE_EMAIL` and `CONTINENTE_PASSWORD`, then verify login:

```bash
node continente-auto-login.js
```

Login uses Playwright Chromium and saves a private session cache in `~/.continente/cookies.json`. Protected tool calls automatically log in again when the session expires. Python and scheduled keepalive jobs are not required to use the MCP server.

Add the server to your MCP client using its local-server configuration. Clients using JSON `mcpServers` configuration can use:

```json
{
  "mcpServers": {
    "continente": {
      "command": "node",
      "args": ["/absolute/path/to/continente-mcp/src/index.js"]
    }
  }
}
```

Restart the client after configuration or server changes. The published package can also run with `npx continente-mcp`; the local clone configuration above runs the code you just installed and tested. This is a local stdio server, not a hosted MCP endpoint.

For Windows, use your user profile directory instead of `~` and restrict the credentials/state directory through Windows filesystem permissions. On Linux, `npm run setup` may need administrator permission to install Chromium system dependencies; if already installed, `npx playwright install chromium` installs only the browser.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_products` | Search the catalogue, with saved favourites ranked first |
| `get_favorites` | Read cached favourites |
| `refresh_favorites` | Refresh favourites from your account |
| `get_cart` | Read the account basket |
| `add_to_cart` | Add a product by ID |
| `update_cart_item` | Set a basket quantity; zero removes the item |
| `get_order_history` | Read recent orders |
| `get_most_bought` | Aggregate products from order history |
| `close_session` | Close the browser session |

Run `refresh_favorites` once to personalise searches. Read the basket before changing it and verify quantities afterwards. An unrecognised basket page is an error, never proof that the basket is empty. Order aggregation can be slow because it visits order detail pages.

The bundled [groceries skill](skills/groceries/SKILL.md) guides agents through matching names to favourites and previous purchases. Add that skill directory through your client's supported skill installation mechanism.

## Configuration and security

Keep real credentials and cookie values out of the repository, client configuration, logs and screenshots. Both credentials and session cookies grant access to private account data. On macOS/Linux, use owner-only permissions (`chmod 600`) for secret files.

See [`.env.example`](.env.example). Process environment settings override the private credentials file.

| Variable | Purpose |
| --- | --- |
| `CONTINENTE_ENV_PATH` | Private credentials file; defaults to `~/.continente/credentials.env` |
| `CONTINENTE_EMAIL`, `CONTINENTE_PASSWORD` | Account credentials for automatic login |
| `CONTINENTE_STATE_DIR` | Local state directory; defaults to `~/.continente` |
| `CONTINENTE_COOKIES_PATH` | Custom cookie cache path |
| `CONTINENTE_LOGIN_HEADLESS` | Set `false` to inspect login in a visible browser |
| `CONTINENTE_VAULT_COOKIE_PATH` | Optional secondary cookie file for private multi-machine sync |

Prefer absolute paths for custom settings.

## Troubleshooting and development

- **Login required:** check the private credentials file and run `node continente-auto-login.js`.
- **Browser missing:** run `npm run setup`.
- **No favourites:** run `refresh_favorites`; catalogue search still works without them.
- **Unexpected cart or product page:** report the tool and error, excluding account details and secrets.

```bash
npm test
npm audit --omit=dev
npm pack --dry-run
```

Unit tests do not establish that Continente's live website still matches every selector. Verify the affected tool against the live site after parser changes; do not place orders during testing.

Personal backup, keepalive, browser-cookie export and monitoring scripts are maintained separately in the private operations repository. They are not part of the npm package or the normal login workflow. Existing operators must migrate scheduled script paths before switching to this checkout.

## License

[MIT](LICENSE)

## Releases

See the [changelog](CHANGELOG.md) and [release instructions](docs/releases.md). Version tags run the platform checks and publish matching npm/GitHub releases. Release candidates use npm's `next` channel; `latest` stays on the last stable release.
