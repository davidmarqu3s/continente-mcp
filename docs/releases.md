# Releases

`package.json` is the version source. `npm version` updates it and the lockfile together; the running MCP reads that version. Git tags use `v` plus the exact version. Published versions/tags are never reused or rewritten.

The published npm/GitHub release is 4.0.0. Source version 3.2.0 was never published. The current follow-up is unreleased and should receive a new semantic version after review; do not reuse the 4.0.0 tag. The ordinary-product live basket roundtrip passed in 4.0.0; details are in the changelog.

## One-time npm setup

After `release.yml` exists on GitHub, open the package's npm settings and configure its trusted publisher:

- GitHub owner: `davidmarqu3s`
- Repository: `continente-mcp`
- Workflow filename: `release.yml`
- Environment: leave blank (the workflow does not specify one)
- Allow direct `npm publish`

The workflow uses GitHub OIDC with Node 24, which supplies a compatible npm CLI. Do not add a long-lived `NPM_TOKEN`. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

This account setting is separate from committed workflow files. Until configured, publishing is not ready.

## Normal release

1. Choose a semantic version: patch for compatible fixes, minor for compatible additions, major for removed functionality or higher runtime requirements. Use `-rc.1`, `-rc.2`, etc. while validation is incomplete.
2. Update both manifests with `npm version <version> --no-git-tag-version`. Add a `## <version>` section to `CHANGELOG.md` with migration notes and known limitations.
3. Run `npm ci`, `npm test`, `npm run check:release`, and `npm pack --dry-run`. Review the changes in a pull request and wait for all platform checks.
4. Merge the reviewed commit into `master`. From that clean commit, create and push its version tag, for example `git tag -a v4.0.0-rc.1 -m "Release 4.0.0-rc.1"` followed by `git push origin v4.0.0-rc.1`.
5. The tag workflow reruns platform checks, rejects mismatched versions, packs the code, publishes to npm, then creates the GitHub release using the changelog. Prereleases go to `next`; stable releases go to `latest`.
6. Confirm the workflow and npm version, then update deployments separately. Tag publication does not update Mac clients or Optiplex.

A failed workflow can be rerun. If npm already contains that exact tarball, the workflow skips republishing and finishes the GitHub release; different bytes for the same version stop the run. Never delete an existing tag or unpublish a version as routine cleanup.

The checks exercise tests and a real Chromium launch on Linux, Windows and macOS, without account credentials. Live account functionality still needs separate verification before a stable release.
