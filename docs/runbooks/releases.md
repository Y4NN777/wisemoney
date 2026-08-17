# Releasing WiseMoney

| Field | Value |
| --- | --- |
| Owner | Project maintainer |
| Versioning | Semantic Versioning, beginning at `1.0.0` |
| Application host | Vercel |
| Release record | GitHub Releases |
| User-facing notes | `https://wisemoney.y7labs.studio/updates` |

WiseMoney uses one releasable product version. The root package, web package,
public release note, changelog, Git tag, and GitHub Release must carry the same
version. The web page is written for WiseMoney users; GitHub contains the
technical record.

## Version numbers

- `PATCH` (`1.0.1`) fixes behavior without adding a new user capability.
- `MINOR` (`1.1.0`) adds a backward-compatible capability.
- `MAJOR` (`2.0.0`) introduces an intentional incompatible change, such as a
  backup format that an earlier supported release cannot read.

Use Conventional Commit subjects so Release Please can calculate the next
version: `fix:`, `feat:`, and `feat!:` (or a `BREAKING CHANGE:` footer).

## First official release: v1.0.0

### Preconditions

- The release commit contains package version `1.0.0`, the bilingual public
  note, and `## [1.0.0] - YYYY-MM-DD` in `CHANGELOG.md`.
- `pnpm release:check`, the web verification workflow, and the security scan pass.
- Vercel is configured to build `main` without automatically assigning the
  production domain. The exact build must be promoted manually.
- The repository variable `WISEMONEY_RELEASE_AUTOMATION` is not yet `enabled`.

### Procedure

1. Merge the reviewed v1 release pull request into `main`.
2. Open the resulting Vercel deployment without promoting it.
3. Verify phone and desktop layouts, vault creation/unlock, `/help`, `/updates`,
   WiseBot, offline reopening, and updating from the preceding deployed build.
4. Promote that exact Vercel deployment to the production domain.
5. Run the same essential smoke checks against the production domain.
6. Create an annotated tag on the promoted commit and push it:

   ```bash
   git tag -a v1.0.0 <promoted-commit> -m "WiseMoney v1.0.0"
   git push origin v1.0.0
   ```

7. Create and publish the GitHub Release for `v1.0.0`, using the v1 changelog
   and linking to `/updates` for the user-facing explanation.
8. Set the repository variable `WISEMONEY_RELEASE_AUTOMATION=enabled`, then run
   the `release-please` workflow once from GitHub Actions. Subsequent pushes to
   `main` maintain the next release pull request from the published v1 baseline.

### Rollback

Reassign the production domain to the last known-good Vercel deployment. Do not
wait for a revert build when users are blocked. Afterwards, revert or fix `main`
through a pull request and release a patch version.

## Later releases

1. Develop on a short-lived branch and merge through a pull request to `main`.
2. Release Please maintains one release pull request from Conventional Commits.
3. Before merging it, add the new bilingual entry at the top of
   `apps/web/src/releases/releases.json`. The release check intentionally fails
   until this user-facing note, both package versions, and the changelog agree.
4. Review the proposed SemVer bump and edit technical notes for clarity.
5. Merge the release pull request. Release Please creates a **draft** GitHub
   Release; it does not announce the version yet.
6. Test and promote the exact Vercel build, then smoke-test production.
7. Publish the draft GitHub Release. Publishing creates the public release tag
   for the commit that was tested and promoted.

There is no permanent `Unreleased` section on `main`: pending changes live in
commits and in the open release pull request. GitFlow, a `develop` branch,
canary releases, and rolling releases are intentionally out of scope until the
team or operational risk justifies them.
