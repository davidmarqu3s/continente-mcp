# Continente MCP

A local MCP server for [Continente.pt](https://www.continente.pt): search products, rank favourites, manage your basket and read order history. Checkout and payment stay on Continente.pt.

## Install

Requires Node.js 20.18.1 or later. Product search works without an account; favourites, basket and order history need a Continente login.

```bash
git clone https://github.com/davidmarqu3s/continente-mcp
cd continente-mcp
npm install
npm run setup
mkdir -p ~/.continente
cp .env.example ~/.continente/credentials.env
chmod 600 ~/.continente/credentials.env
```

Set `CONTINENTE_EMAIL` and `CONTINENTE_PASSWORD` in `~/.continente/credentials.env`, then check the login:

```bash
node continente-auto-login.js
```

The server logs in again automatically when the session expires. On Windows, use your user profile directory instead of `~`.

## Use

Add the server to your MCP client and restart it:

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

You can also run the published package with `npx continente-mcp`.

| Tool | Purpose |
| --- | --- |
| `search_products` | Search the catalogue, with favourites ranked first |
| `get_favorites` / `refresh_favorites` | Read cached favourites / refresh them from your account |
| `get_cart` | Read the basket |
| `add_to_cart` | Add a product by ID |
| `update_cart_item` | Set a basket quantity; zero removes the item |
| `get_order_history` / `get_most_bought` | Read recent orders / your most-bought products |
| `close_session` | Close the browser session |

Run `refresh_favorites` once to personalise search. The [groceries skill](skills/groceries/SKILL.md) helps agents pick the products you usually buy.

Optional settings, such as custom state and cookie paths, are listed in [`.env.example`](.env.example). Keep credentials and `~/.continente/cookies.json` private: both give access to your account.

## License

[MIT](LICENSE)
