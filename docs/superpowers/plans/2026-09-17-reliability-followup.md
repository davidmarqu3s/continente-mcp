# Continente MCP Reliability Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the valuable reliability work from the preserved Optiplex prototype into a reviewed follow-up release without changing the stable `4.0.0` deployment until verification is complete.

**Architecture:** Keep the released browser/auth adapter as the boundary, add a small reliability module for serialized operations, input validation, controlled authentication retry, and authoritative mutation read-back, then expose structured results alongside existing readable text. Preserve the exact native empty-basket sentinel already verified in `4.0.0`.

**Tech Stack:** Node.js 20.18.1+, MCP SDK, Playwright, Node test runner.

**Spec:** Optiplex prototype at `/home/user/projects/continente-mcp` (read-only reference); published baseline `v4.0.0`.

## Global Constraints

- Do not modify or reset the Optiplex dirty checkout.
- Keep the public package at nine tools and preserve existing text responses.
- Never retry an uncertain or already-attempted basket write.
- Do not infer quantities, units, prices, authentication, or empty baskets from incomplete responses.
- Run the complete test suite and release checks before proposing a release.

### Task 1: Port reliability primitives

**Files:**
- Create: `src/reliability.js`
- Test: `test/reliability.test.js`

- [x] Write focused tests for queue ordering, pre-write authentication retry, and uncertain-write handling; retain the existing mutation read-back coverage.
- [x] Run the focused tests and confirm they fail for the missing module/structured results.
- [x] Implement the smallest tested primitives and run the focused tests again.
- [x] Commit the isolated reliability module.

### Task 2: Integrate the server safely

**Files:**
- Modify: `src/index.js`
- Modify: `src/cart-utils.js`
- Test: `test/server.test.js`, `test/cart-state.test.js`, `test/empty-basket.test.js`

- [x] Add tests proving serialized calls, structured content, strict inputs, and exact native empty-basket handling.
- [x] Run the tests red before changing production code.
- [x] Integrate the queue and controlled retry path while preserving the nine-tool surface and readable responses.
- [x] Run all JavaScript tests and inspect mutation error paths.

### Task 3: Documentation and release gate

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/releases.md`
- Modify: `package.json`, `package-lock.json` only if the release version changes

- [x] Document quantity semantics and the follow-up release state without promising rollback.
- [x] Run `npm test`, `npm audit --omit=dev`, `npm run check:release`, `npm pack --dry-run`, and whitespace checks.
- [x] Review the diff against `v4.0.0`; this is a follow-up candidate and has not been versioned or published.
