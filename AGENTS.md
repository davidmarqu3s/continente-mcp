# Project instructions

## Versioning and releases

- Keep the public tool interface compatible unless a breaking change is intentional and documented.
- Use Conventional Commit PR titles (`fix:`, `feat:`, `docs:`, `refactor:`, `chore:`). Mark actual compatibility breaks with `!` and a `BREAKING CHANGE:` explanation. Squash merge with that title.
- Ordinary feature/fix PRs must not bump package versions or edit generated release notes. Release Please accumulates changes in one release PR.
- Review the proposed semantic version and release notes; automation cannot determine compatibility for us. Compatible fixes are patches, additions are minors, and incompatible supported behaviour/setup changes are majors. Refactoring effort alone does not justify a major.
- The release PR owns package.json, package-lock.json, .release-please-manifest.json and CHANGELOG.md version changes. Tags match exactly: `vX.Y.Z`. Never reuse or rewrite published versions/tags.
- Check the release PR's current commit on all supported platforms before merging. Bot-created PRs receive explicitly dispatched Checks runs.
- Merging a release PR creates a GitHub release and dispatches the checked npm publisher. Verify both succeed. Use `next` for prereleases and `latest` for stable npm versions.
- Publication does not deploy Mac or Optiplex installations. Update pinned deployments separately and record their exact version/commit.
- Before a stable release, verify live account behaviour appropriate to the changes. Never place orders/payments as a test, expose credentials, or automatically replay uncertain basket writes.
- Full procedure and recovery instructions: docs/releases.md.
