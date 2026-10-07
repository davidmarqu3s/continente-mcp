# Project instructions

## Versioning and releases

- Keep the public tool interface compatible unless a breaking change is intentional and documented.
- Use Conventional Commit PR titles (`fix:`, `feat:`, `docs:`, `refactor:`, `chore:`). Mark actual compatibility breaks with `!` and a `BREAKING CHANGE:` explanation. Squash merge with that title.
- Ordinary feature/fix PRs must not bump package versions or edit CHANGELOG.md. Release only when David asks.
- A release is one `chore: release X.Y.Z` PR that owns the package.json, package-lock.json and CHANGELOG.md changes. Choose the version by judgement: compatible fixes are patches, additions are minors, incompatible supported behaviour/setup changes are majors. Refactoring effort alone does not justify a major.
- Write the CHANGELOG.md section from `git log <last tag>..main` as numbered items, each a bold user-outcome label plus one sentence, grouped by what users notice; leave out refactors, CI and chores. Tags match exactly: `vX.Y.Z`. Never reuse or rewrite published versions/tags.
- Check the release PR on all supported platforms before merging. After merging, tag the merge commit; the tag runs the checked npm publisher and creates the GitHub release. Verify both succeed. Use `next` for prereleases and `latest` for stable npm versions.
- Publication does not deploy Mac or Optiplex installations. Update pinned deployments separately and record their exact version/commit.
- Before a stable release, verify live account behaviour appropriate to the changes. Never place orders/payments as a test, expose credentials, or automatically replay uncertain basket writes.
- Full procedure and recovery instructions: docs/releases.md.
