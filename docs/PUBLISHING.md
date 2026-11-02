# Publishing

[English README](../README.md) · [中文 README](../README.zh-CN.md)

## First public release

The public publisher is `Pawnkoolong`, and the extension ID is
`Pawnkoolong.antigravity-vscode-autoaccept`. This is a new Marketplace listing.
Disable the previous `Pawnkoolong.antigravity-sidebar-autoaccept` extension and
the earlier `securerag-local.antigravity-sidebar-autoaccept` development extension
before enabling the new one, so only one adapter handles each approval. Do not
unpublish the previous listing: existing installations do not automatically
move to the new extension ID.

## GitHub

This directory is the standalone repository root. Publish only this directory,
not the parent research workspace. Private runtime notes and local packages are
ignored. After authenticating GitHub CLI, use your own Git author identity:

```sh
git add .
git commit -m "Prepare Antigravity VS Code Auto Accept release"
gh repo create PawnDragon/antigravity-vscode-autoaccept --public --source=. --remote=origin --push
```

CI runs checks and packages the extension. Tag the matching version to release:

```sh
git tag v0.1.7
git push origin v0.1.7
```

The release workflow checks the version, runs tests, packages with official
`vsce`, and attaches the VSIX to a GitHub release.

## Visual Studio Marketplace

1. Open [publisher management](https://marketplace.visualstudio.com/manage) and
   create or select the publisher used in `package.json`.
2. Add a Trusted Publishing policy with these exact fields:
   - Repository owner: `PawnDragon`
   - Repository: `antigravity-vscode-autoaccept`
   - Workflow: `publish.yml`
   - Environment: leave empty.
   After renaming a repository, verify that token exchange still succeeds. If
   it returns 401, create a replacement policy using the current repository
   name and the same workflow before retrying publication.
3. Push the configured manifest and a passing build.
4. Run **Publish to Visual Studio Marketplace** in Actions. It uses OIDC and
   `vsce publish --oidc`, with no PAT committed.

For a manual upload, run `npm ci`, `npm test`, and `npm run package`, then upload
`dist/antigravity-vscode-autoaccept.vsix`. Use official `vsce` for public builds;
the Python packager remains a local installation shortcut.

Publisher ownership and GitHub/Microsoft sign-in require the owner's account.
A local repository or generated VSIX is not a published listing.
After a successful upload, confirm that the new version has passed Marketplace
validation and is visible on the public listing. Upload success alone does not
mean that validation or public availability has completed.

[Official publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

Before repository identity is configured, `npm run package:local` builds an
installable VSIX without rewriting relative documentation links. Public
Marketplace packages should use `npm run package` after setting the repository.
