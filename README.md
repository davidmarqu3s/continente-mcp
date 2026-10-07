# Continente MCP

Let your AI assistant search Continente.pt and fill your basket with the products you usually buy.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- **Search that knows your habits** — catalogue results put your saved favourites first.
- **Hands-free basket** — add, change and remove items; every change is checked against the basket afterwards.
- **Order history** — read recent orders and see your most-bought products.
- **Automatic login** — expired sessions sign in again on their own from a private credentials file.
- **You stay in control** — checkout and payment always happen on Continente.pt.

## Install

Requires Node.js 20.18.1 or later. Install the browser the server uses (on Linux, add `--with-deps`):

```bash
npx -y -p continente-mcp playwright install chromium
```

For favourites, basket and order history, create `~/.continente/credentials.env` (owner-only, `chmod 600`) with your Continente login. Search works without it.

```
CONTINENTE_EMAIL=you@example.com
CONTINENTE_PASSWORD=your-password
```

Then add the server to your MCP client and restart it:

```json
{
  "mcpServers": {
    "continente": { "command": "npx", "args": ["-y", "continente-mcp"] }
  }
}
```

To run from source instead, clone the repository, run `npm install && npm run setup`, and use `node /absolute/path/to/continente-mcp/src/index.js` as the command.

## Use

Ask your assistant things like "add milk, eggs and bread to my Continente basket". Run `refresh_favorites` once so searches know what you buy.

| Tool | Purpose |
| --- | --- |
| `search_products` | Search the catalogue, favourites first |
| `get_favorites` / `refresh_favorites` | Read cached favourites / refresh them from your account |
| `get_cart` | Read the basket |
| `add_to_cart` / `update_cart_item` | Add a product / set its quantity (zero removes it) |
| `get_order_history` / `get_most_bought` | Read recent orders / your most-bought products |
| `close_session` | Close the browser session |

## More

- **Agents:** the [groceries skill](skills/groceries/SKILL.md) teaches assistants to pick the products you usually buy.
- **Settings:** custom credential, state and cookie paths are listed in [`.env.example`](.env.example).
- **Troubleshooting:** [docs/troubleshooting.md](docs/troubleshooting.md).
- **Developers:** [docs/development.md](docs/development.md) and [docs/releases.md](docs/releases.md).

## License

[MIT](LICENSE)
