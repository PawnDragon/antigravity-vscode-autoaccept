# Publishing

[English README](../README.md) · [中文 README](../README.zh-CN.md)

## First public release

Replace the development publisher `securerag-local` with a publisher you own:

```sh
npm pkg set publisher=YOUR_PUBLISHER_ID
npm pkg set repository.type=git
npm pkg set repository.url=https://github.com/PawnDragon/antigravity-sidebar-autoaccept.git
npm pkg set homepage=https://github.com/PawnDragon/antigravity-sidebar-autoaccept#readme
npm pkg set bugs.url=https://github.com/PawnDragon/antigravity-sidebar-autoaccept/issues
```

These are placeholders, not existing release identities. A publisher change
creates a new extension ID; disable the development extension before installing
the public one.

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
git tag v0.1.2
git push origin v0.1.2
```

The release workflow checks the version, runs tests, packages with official
`vsce`, and attaches the VSIX to a GitHub release.

## Visual Studio Marketplace

1. Open [publisher management](https://marketplace.visualstudio.com/manage) and
   create or select the publisher used in `package.json`.
2. Add a Trusted Publishing policy for your GitHub owner, repository, and
   workflow `publish.yml`. This workflow uses no GitHub environment.
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
