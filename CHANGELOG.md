# Changelog

## 4.0.0

Continente MCP: search Continente.pt, rank favourites, manage your basket and read order history from any MCP client.

### Breaking changes

1. **Node.js 20.18.1 or newer required** — matches the minimum needed by dependencies; upgrade Node before updating.
2. **Personal maintenance scripts removed from the package** — backup, keepalive and browser-cookie export utilities are no longer shipped; the MCP tools log in automatically and do not need them. If you scheduled these scripts, point those jobs elsewhere before updating.

### Login and setup

3. **Automatic login from a private credentials file** — set your email and password once in `~/.continente/credentials.env`; expired sessions log in again on their own.
4. **Consistent paths on every platform** — cookie and state paths resolve the same way everywhere, including Windows profiles and paths containing spaces.

### Safer basket changes

5. **Basket reads never guess** — an unrecognised basket page is reported as an error instead of an empty basket.
6. **Changes are confirmed** — adds and quantity updates require a signed-in basket and check the final quantity; invalid quantities are rejected before anything changes.
7. **No overlapping browser actions** — tools called at the same time run one after another instead of navigating the same page together.

### Favourites and products

8. **Favourites match more reliably** — numeric IDs, slugs and `.html` links all match; a failed refresh keeps the cached list.
9. **Missing prices stay unknown** — products without a price are no longer shown as free.

## 3.1.0

First public release, published on 1 May 2026. This historical version and tag are retained. The intervening source version 3.2.0 was never published to npm or released on GitHub.
