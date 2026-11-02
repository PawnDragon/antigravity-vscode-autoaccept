# Changelog

## 0.1.5

- Rename the project to antigravity-vscode-autoaccept and the extension to Antigravity VS Code Auto Accept.
- Publish under the new extension ID Pawnkoolong.antigravity-vscode-autoaccept.
- Update the status bar, command titles, documentation, repository links, and VSIX filename.
- Introduce antigravityVscodeAutoAccept settings and commands while retaining legacy settings and command bindings.
- Document installation of the new extension and disabling the previous extension to avoid duplicate approvals.
- Keep polling OFF while the previous extension is active and avoid conflicting legacy command registrations.

## 0.1.4

- Automatically discover the current window's Antigravity backend on macOS as well as Linux.
- Keep installation, configuration, commands, and status identical across supported platforms.
- Use portable backend liveness checks to recover after a backend exits.
- Preserve spaces, Unicode, and literal quotes in macOS workspace paths; resolve filesystem aliases when matching workspaces.
- Add platform discovery regressions and run CI on both macOS and Linux.

## 0.1.3

- Remove the SSH prerequisite from both READMEs and the Marketplace description.
- Clarify installation alongside Antigravity in the same extension host.
- Retain the current Linux host compatibility requirements.

## 0.1.2

- Treat empty conversation maps as idle instead of protocol errors.
- Show WAITING while the backend starts and log recovery when ready.
- Include the adapter version in startup logs.
- Add bilingual documentation, CI, and release workflows.

## 0.1.1

- Request the production UI projection to avoid oversized history responses.
- Continue scanning from unfinished steps instead of rereading completed history.

## 0.1.0

- Adapt the Ezra status-bar interaction for the official Antigravity VS Code sidebar.
- Submit and verify one-time command approvals in the current Linux SSH workspace.
- Leave questions, explicit Ask rules, hooks, and non-command permissions manual.
