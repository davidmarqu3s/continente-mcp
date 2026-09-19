# Changelog

## [4.1.0](https://github.com/davidmarqu3s/continente-mcp/compare/v4.0.0...v4.1.0) (2026-09-19)


### Features

* add structured tool results and automated release preparation ([#3](https://github.com/davidmarqu3s/continente-mcp/issues/3)) ([19772e3](https://github.com/davidmarqu3s/continente-mcp/commit/19772e31cfd918b2379256c780b70498d2d517ff))

## 4.0.0

Stable release.

### Breaking changes

- Node.js 20.18.1 or newer is required, matching dependency requirements.
- Personal backup, keepalive and browser-cookie export utilities are no longer shipped in this package. Existing operators must migrate their scheduled script paths. Normal MCP tools use automatic login and do not require these utilities.

### Fixes

- Automatic login from a private credentials file, consistent cookie paths, Windows profile support and login paths containing spaces.
- Basket reads distinguish unknown responses from empty baskets; mutations require an authenticated basket and confirmed final quantities.
- Invalid quantities are rejected before changes; concurrent tools no longer navigate the same page at the same time.
- Favourite matching handles numeric IDs, slugs and .html links; failed refreshes retain the cache.
- Missing prices remain unknown; malformed-cookie diagnostics do not expose cookie values.
- Compatible dependency updates resolve the audit findings; duplicate setup documentation and obsolete development artifacts removed.

### Live basket verification

On 12 September 2026, the native signed-in website confirmed that `Cart-MiniCartShow` with `basket: {}` represents a session without a basket yet. The stricter audit check had mistakenly rejected that valid empty state. The parser now recognises that exact response while still rejecting guests and malformed responses.

The MCP was verified live through empty → add one product → read quantity one → update to two → remove → empty. The test product was removed; no order was placed. Adding also now waits for the product form rather than for background network traffic to become idle. This verification covers an ordinary unit product; it does not certify every weighted product variant.

### Release process

One manifest version, matching lockfile and Git tag; cross-platform checks; npm publishing followed by a matching GitHub release. Stable releases use npm's `latest` channel.

## 3.1.0

First public release, published on 1 May 2026. This historical version and tag are retained. The intervening source version 3.2.0 was never published to npm or released on GitHub.
