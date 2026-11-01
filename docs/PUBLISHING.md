# Publishing

[English README](../README.md) · [中文 README](../README.zh-CN.md)

## First public release

The public publisher is `Pawnkoolong`, and the extension ID is
`Pawnkoolong.antigravity-sidebar-autoaccept`. Disable the earlier
`securerag-local.antigravity-sidebar-autoaccept` development extension before
installing the public one, so only one adapter handles each approval.

## GitHub

This directory is the standalone repository root. Publish only this directory,
not the parent research workspace. Private runtime notes and local packages are
ignored. After authenticating GitHub CLI, use your own Git author identity:

```sh
git add .
git commit -m "Prepare Antigravity sidebar auto-accept release"
gh repo create PawnDragon/antigravity-sidebar-autoaccept --public --source=. --remote=origin --push
```

CI runs checks and packages the extension. Tag the matching version to release:

```sh
git tag v0.1.3
git push origin v0.1.3
```

The release workflow checks the version, runs tests, packages with official
`vsce`, and attaches the VSIX to a GitHub release.

## Visual Studio Marketplace

1. Open [publisher management](https://marketplace.visualstudio.com/manage) and
   create or select the publisher used in `package.json`.
2. Add a Trusted Publishing policy with these exact fields:
   - Repository owner: `PawnDragon`
   - Repository: `antigravity-sidebar-autoaccept`
   - Workflow: `publish.yml`
   - Environment: leave empty.
3. Push the configured manifest and a passing build.
4. Run **Publish to Visual Studio Marketplace** in Actions. It uses OIDC and
   `vsce publish --oidc`, with no PAT committed.

For a manual upload, run `npm ci`, `npm test`, and `npm run package`, then upload
`dist/antigravity-sidebar-autoaccept.vsix`. Use official `vsce` for public builds;
the Python packager remains a local installation shortcut.

Publisher ownership and GitHub/Microsoft sign-in require the owner's account.
A local repository or generated VSIX is not a published listing.

[Official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

Before repository identity is configured, `npm run package:local` builds an
installable VSIX without rewriting relative documentation links. Public
Marketplace packages should use `npm run package` after setting the repository.
