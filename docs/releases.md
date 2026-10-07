# Releases

Continente uses semantic versions with matching `vX.Y.Z` tags. `package.json` is the version source and `package-lock.json` must match it. Published versions and tags are immutable.

## Everyday contributions

Use Conventional Commit PR titles and squash merge after checks:

- `fix:` — compatible bug fix.
- `feat:` — compatible client-facing addition.
- `feat!:`, `fix!:` or another type with `!` — intentional breaking change; explain migration in `BREAKING CHANGE:`.
- `docs:`, `test:`, `refactor:`, `chore:` — internal changes. If a change fixes shipped behaviour, label it `fix:` even when the implementation is a refactor or dependency update.

Do not bump versions or edit CHANGELOG.md in ordinary PRs. Release when a useful tested batch is ready; urgent fixes need not wait.

## Making a release

1. Choose the version from the changes since the last tag (`git log vX.Y.Z..main`): patch for fixes, minor for additions, major for breaking changes. Use a prerelease such as `4.1.0-rc.1` for a risky candidate.
2. On a branch, run `npm version <version> --no-git-tag-version` and add a `## <version>` section to the top of CHANGELOG.md. `npm run check:release` confirms the versions and notes match.
3. Open a `chore: release <version>` PR. Confirm all five platform checks pass.
4. Run live account verification appropriate to the changes. CI uses isolated state and a real Chromium startup; it does not verify the signed-in storefront. Never place an order or pay as a test.
5. Squash merge, then tag the merge commit and push the tag:

   ```bash
   git switch main && git pull
   git tag v<version>
   git push origin v<version>
   ```

6. The tag runs `release.yml`: it reruns the checks, validates the tag, version, lockfile and notes, publishes to npm (prereleases to `next`, stable versions to `latest`), then creates the GitHub release from the CHANGELOG section. Verify the workflow succeeded and the version is on npm. Publishing does not update existing installations; update pinned deployments separately.

## Publisher setup

npm trusted publisher for `continente-mcp`:

- GitHub owner: `davidmarqu3s`
- Repository: `continente-mcp`
- Workflow filename: `release.yml`
- Environment: none
- Allow direct `npm publish`

The workflow uses GitHub OIDC with Node 24. Do not add an NPM_TOKEN. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Recovery

If a Release run failed, rerun it, or run it manually on the exact tag (`gh workflow run release.yml --ref vX.Y.Z`). The publisher verifies tarball integrity before skipping an already-published npm version; different bytes for the same version stop the run. Never delete tags or unpublish packages as routine recovery.
