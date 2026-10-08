# Changelog

## 4.1.0

### Changelog

1. **Weighted products add the right amount**: Asking for 4 bananas now adds 4, the same way the website does; before, products sold by weight were added in the wrong unit and reported an error. Search shows minimums such as "600 gr (3 un)", and asking for less is refused with the minimum instead of being silently ignored by the site.
2. **`npx continente-mcp` starts**: The server now runs through npx or a global install; before, it exited straight away and only a source checkout worked.
3. **Favourites found further down**: Search checks the first 105 results for your favourites instead of 20, so they still rank first in broad searches like "queijo".
4. **Order history keeps weights**: Items bought by weight show "1.2 kg" instead of 1, most-bought keeps units and weights apart ("32 un + 1.2 kg") and ranks by how many orders include a product, and orders that could not be read are flagged instead of silently skipped.
5. **Safer basket changes**: If the session expires mid-change, the server logs in again and retries only when nothing was written, and when Continente's unit data is unclear it stops with an error instead of guessing.
6. **Structured results for assistants**: Search and basket tools return IDs, names, prices, quantities and minimums as data alongside the text, and invalid product IDs, quantities, search text over 250 characters or limits outside 1–50 are rejected before the browser opens.
7. **Recovers after a browser crash**: The next call starts a fresh browser instead of failing until `close_session`.
8. **Account files kept private**: The cookie cache and favourites are created readable only by you, and your session is only ever sent to continente.pt.

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
