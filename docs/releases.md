# Releases

Each project has its own version sequence. Continente uses semantic versions and matching `vX.Y.Z` tags. `package.json` is the runtime version source; the lockfile and Release Please manifest track the same released version. Published versions and tags are immutable. Existing 4.0.0 history is preserved.

## Everyday contributions

Use Conventional Commit PR titles and squash merge after checks:

- `fix:` — compatible bug fix (patch).
- `feat:` — compatible client-facing addition (minor).
- `feat!:`, `fix!:` or another type with `!` — intentional breaking change (major); explain migration in `BREAKING CHANGE:`.
- `docs:`, `test:`, `refactor:`, `chore:` — do not force a release by themselves. If a change fixes shipped behaviour, label it `fix:` even when the implementation is a refactor or dependency update.

Do not bump versions in ordinary PRs. Release Please maintains one accumulating release PR containing the proposed version, lockfile, manifest and generated changelog. A batch of fixes and features receives one minor bump, not one bump per PR. Review the compatibility impact rather than blindly trusting the inferred version. Release when a useful tested batch is ready; urgent fixes need not wait. There is no compulsory release schedule.

## Automation

`.github/workflows/release-please.yml` runs on master and can be manually dispatched. It uses a pinned Release Please action and the built-in GitHub token. The repository must allow GitHub Actions to create pull requests; workflow permissions grant only the capabilities needed by the job.

Bot-created PR checks may require approval, and bot-created tags do not automatically trigger publishing. The preparation workflow explicitly dispatches `ci.yml` on each created/updated release branch and `release.yml` on each new release tag. No long-lived personal token is required.

Before merging a release PR:

1. Review the version and changelog. Confirm manifests match and all five platform checks pass on the current release PR commit.
2. Run live account verification appropriate to the changes. Automated CI uses isolated state and a real Chromium startup; it does not verify the signed-in storefront. Never place an order or pay as a test.
3. Merge the release PR. Release Please then creates the tag/GitHub release and dispatches the npm publisher. The publisher reruns checks, validates the exact tag/version/lockfile/notes, and publishes the checked package via npm trusted publishing.
4. Verify npm and the Release workflow succeeded; a GitHub release by itself does not prove npm publication. Deployments are separate: explicitly update pinned Mac/Optiplex installations and record their version/commit.

The default accumulating release PR proposes stable releases. For a risky candidate, deliberately prepare a reviewed semantic prerelease such as `4.1.0-rc.1`; do not merge the normal stable release PR prematurely. The publisher routes prereleases to npm `next` and stable versions to `latest`.

## Publisher setup

npm trusted publisher for `continente-mcp`:

- GitHub owner: `davidmarqu3s`
- Repository: `continente-mcp`
- Workflow filename: `release.yml`
- Environment: none
- Allow direct `npm publish`

The workflow uses GitHub OIDC with Node 24. Do not add an NPM_TOKEN. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Recovery and manual releases

If preparation fails, rerun Prepare release. If a release exists but npm publishing was not dispatched, manually run Release on that exact version tag (`gh workflow run release.yml --ref vX.Y.Z`). If a Release run failed, rerun that run. Release Please may not emit an already-created tag again on retry.

The publisher verifies tarball integrity before skipping an already-published npm version. Different bytes for the same version stop the run. Never delete tags or unpublish packages as routine recovery.

For an exceptional manual release, update package.json/package-lock.json together, the root version in .release-please-manifest.json, and CHANGELOG.md in a reviewed PR. After the same verification, tag the merged commit with its exact version. Human-pushed `v*` tags still trigger the existing publisher. Keep any pending automated release PR in sync before proceeding.
