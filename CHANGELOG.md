# Changelog

## 4.0.0-rc.1

Release candidate; not yet a stable release.

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

### Known limitation

On 12 September 2026, the account used for live verification received HTTP 500 from Continente's basket page even after fresh login. The authenticated minicart returned an unrecognised basket shape. Search, favourites and order-history tools worked. Basket writes are covered by controlled tests but have not been verified live. This candidate must not be promoted to stable until that limitation is resolved and live quantities are verified.

### Release process

One manifest version, matching lockfile and Git tag; cross-platform checks; npm publishing followed by a matching GitHub release. Prereleases use npm's `next` channel.

## 3.1.0

First public release, published on 1 May 2026. This historical version and tag are retained. The intervening source version 3.2.0 was never published to npm or released on GitHub.
