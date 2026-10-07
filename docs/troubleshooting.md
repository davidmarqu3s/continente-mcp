# Troubleshooting

- **"Not logged in"** — check `CONTINENTE_EMAIL` and `CONTINENTE_PASSWORD` in `~/.continente/credentials.env`. To watch the login, set `CONTINENTE_LOGIN_HEADLESS=false` and run `node continente-auto-login.js` from a source checkout.
- **Browser not found** — run `npx -y -p continente-mcp playwright install chromium` (add `--with-deps` on Linux), or `npm run setup` in a source checkout.
- **Search ignores your favourites** — run `refresh_favorites`; catalogue search still works without them.
- **`quantity_semantics_unknown`** — Continente's unit data for that product is unclear, so the server refused to guess the quantity. Change it on Continente.pt.
- **`cart_quantity_not_confirmed`** — the basket did not show the expected quantity afterwards. Run `get_cart` before trying again; the change may have gone through.
- **Windows** — use your user profile directory (`%USERPROFILE%\.continente`) instead of `~/.continente`.

Credentials and `~/.continente/cookies.json` both give access to your account. Keep them owner-only and leave them out of logs, screenshots and issue reports.

When reporting a problem, include the tool name and error message.
