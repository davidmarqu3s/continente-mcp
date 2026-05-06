# Lessons

## 2026-05-06

- Pattern: A missing repo-level lessons file led me to treat the gap as purely local, instead of also recording the lesson in Obsidian project memory where long-lived project learnings are expected to live.
- Rule: When a correction reveals a reusable project lesson, record it in both `tasks/lessons.md` and the matching `_claude/memory/<project>.md` note.

- Pattern: `get_cart` relied on the checkout page, which redirects to login for this session even though the mini-cart API still exposes the current storefront cart.
- Rule: For Continente cart verification, prefer the mini-cart API as the authoritative read path and surface whether the session is an authenticated account basket or only a guest/storefront cart.

- Pattern: An item could be added to a guest/storefront cart and still look successful from the add-product response.
- Rule: In this project, `add_to_cart` only counts as success when the response is tied to an authenticated Continente account session.

- Pattern: Generic browser auto-detect picked Chrome cookies even though the real shopping session lived in Arc Profile 2.
- Rule: For Arc-based shopping, detect and rank Arc profiles explicitly instead of falling back to the first browser with any Continente cookies.
