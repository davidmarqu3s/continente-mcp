# Changelog

## 4.1.0

Continente MCP: search Continente.pt, rank favourites, manage your basket and read order history from any MCP client.

### Behaviour changes

- Adding less than a product's minimum (e.g. 1 banana when the minimum is 3) is now refused with `below_minimum_quantity` instead of adding the wrong amount.
- `get_most_bought` ranks products by how many orders include them and shows quantities per unit (`32 un + 1.2 kg`).

### Install

1. **`npx continente-mcp` works** — the server now starts when run through npx or a global install; before, it exited straight away.

### Basket

2. **Weighted products add the right amount** — "add 4 bananas" now adds 4 bananas; before, products sold by weight were added in the wrong unit and reported an error.
3. **Minimums shown up front** — search results show minimum quantities such as "600 gr (3 un)", so assistants know before adding.
4. **No duplicate basket changes after a re-login** — if the session expires during a change, the server logs in again and retries only when nothing was written.
5. **Unclear units are never guessed** — when Continente's unit data for a product is ambiguous, quantity changes stop with `quantity_semantics_unknown`.

### Search and order history

6. **Favourites found further down** — search checks the first 105 results for favourites to put first, up from 20.
7. **Weights in order history** — items bought by weight show "1.2 kg" instead of being rounded down to 1.
8. **Unreadable orders flagged** — order history and most-bought say when orders could not be read instead of returning partial results silently.

### For assistants

9. **Structured results** — `search_products`, `get_cart`, `add_to_cart` and `update_cart_item` return machine-readable data (IDs, names, prices, quantities, minimums) alongside the text.
10. **Clearer input errors** — product IDs, quantities, search text (up to 250 characters) and limits (1–50) are checked before the browser opens.

### Reliability and privacy

11. **Recovers after a browser crash** — the next call starts a fresh browser instead of failing until `close_session`.
12. **Account files kept private** — the cookie cache and favourites are created readable only by you, and the session is only ever sent to continente.pt.

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
