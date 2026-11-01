<div align="center">

# Antigravity Sidebar Auto Accept

**Auto-accept command approvals in the official Antigravity extension for VS Code.**

Built for the latest tested Antigravity VS Code sidebar.

[![MIT](https://img.shields.io/badge/license-MIT-2563eb.svg)](LICENSE)
[![Antigravity](https://img.shields.io/badge/Antigravity-1.10.0%20tested-16a34a.svg)](#compatibility)
[![Remote SSH](https://img.shields.io/badge/Remote%20SSH-Linux-0f766e.svg)](#compatibility)

**English** · [简体中文](README.zh-CN.md)

[Quick Start](#quick-start) · [Features](#features) · [How It Works](#how-it-works) · [Configuration](#configuration) · [Troubleshooting](#troubleshooting) · [Development](#development)

</div>

---

Keep your Antigravity agent moving while you work. This extension handles command permission cards in the **official VS Code sidebar**, submits **Allow Once**, and checks that the backend recorded the approval.

It runs on your Linux Remote SSH host, so the same setup can be used from a Mac or Windows client. No remote debugging port, desktop clicker, or global Turbo setting is required.

## Quick Start

1. Connect to your **Linux host with VS Code Remote SSH**.
2. Install Google's official **Antigravity** extension and open its sidebar.
3. Install this extension **in the SSH host**. For a VSIX, run **Extensions: Install from VSIX...** and select the package.
4. In your trusted workspace, enable **Antigravity Sidebar Auto Accept** in Settings, or add:

   ```json
   {
     "antigravitySidebarAutoAccept.enabled": true
   }
   ```

5. Look for **`AG Sidebar: ON (0)`**. The count increases after an approval is verified. Click the status item to pause or resume.

After an update, run **Developer: Reload Window** when your current task has finished. Download a VSIX from [GitHub Releases](https://github.com/PawnDragon/antigravity-sidebar-autoaccept/releases), or [build from source](#development). Marketplace publication is described in the [publishing guide](docs/PUBLISHING.md).

## Features

- **Official VS Code sidebar support** — handles command permission cards behind Allow and Submit.
- **Remote SSH operation** — runs on Linux; your desktop client can be macOS or Windows.
- **Workspace scope** — handles running conversations whose folders match this window.
- **One-time approvals** — sends Allow Once without saving permanent grants.
- **Visible results** — distinguishes submitted requests from verified approvals.
- **Long-conversation support** — requests compact responses and skips completed history.
- **A simple switch** — no extra panel and no runtime package dependencies.

## How It Works

```text
This VS Code window
        ↓
Its official Antigravity backend on the SSH host
        ↓
Current-workspace command permission card
        ↓
Recheck request → Allow Once → Verify backend approval record
```

Some auto-accept extensions repeatedly call older Antigravity command IDs absent from the tested official VS Code extension. This adapter uses the structured approval request used by the sidebar itself.

`SUBMITTED` means the backend accepted the request. `VERIFIED` means the matching one-time approval appeared in the step's completion record. The counter measures verified approvals, not command success.

### What stays manual

This release handles **command requests triggered by the default fallback policy**. It leaves these to you:

- Explicit Ask rules, hook approvals, and blocked or unknown request types.
- Ordinary questions, plan review, MCP permissions, and browser permission cards.
- Conversations outside the current workspace.

Eligible commands run without your click, including commands that can access files outside the project. Enable this behavior only in workspaces where you want it.

## Compatibility

| Component | Support |
| --- | --- |
| Official extension | `google.google-antigravity` 1.10.0; verified 2026-11-01 |
| VS Code | 1.90 or later |
| Extension host | Linux Remote SSH; local Linux uses the same discovery mechanism |
| Desktop client | macOS, Windows, or Linux connected to that host |
| Local Windows/macOS host | Not implemented in this release |
| Standalone Antigravity IDE | Not the target of this adapter |

The adapter uses an internal endpoint. New Antigravity versions may require an update; this table records the tested version rather than promising compatibility with future releases.

## Configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `antigravitySidebarAutoAccept.enabled` | `false` | Enable in this workspace. |
| `antigravitySidebarAutoAccept.intervalMs` | `1000` | Scan interval; minimum 500 ms. |

### Commands

Open the Command Palette and search for:

- **Antigravity Sidebar Auto Accept: Toggle ON/OFF**
- **Antigravity Sidebar Auto Accept: Show Logs**
- **Antigravity Sidebar Auto Accept: Check Connection**

### Status

| Status | Meaning |
| --- | --- |
| `OFF` | No new approvals will be submitted. |
| `CONNECTING` / `WAITING` | Open the official sidebar or wait for its backend. |
| `ON (N)` | Scanning; N approvals verified since this instance started. |
| `ERROR` | A connection or protocol problem needs attention; open the log. |

## Privacy

Requests go to the existing Antigravity backend on `127.0.0.1`. The adapter starts no network listener and has no telemetry. It does not log command text, full conversations, or backend tokens, and does not change global permissions.

When Ezra Auto Accept is present, this adapter attempts to stop its old command poller in the same window. Disable the original extension's startup setting when replacing it.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `WAITING` | Open this window's Antigravity sidebar; install both extensions in the SSH host. |
| `ON`, but a card remains | Questions, non-command permissions, explicit Ask, and hook approvals stay manual. |
| `ERROR` | Run **Show Logs** and inspect the last error. |
| Old `response too large` | Upgrade to 0.1.1 or later and reload the window. |
| An update behaves like the old version | Finish the task, then run **Developer: Reload Window**. |
| `SUBMITTED` without `VERIFIED` | Inspect the card manually. Ambiguous submissions are not blindly retried. |

For a bug report, include both extension versions, the host OS, and relevant log lines. Leave out tokens, private command text, and full conversations.

## Development

Use Node.js 22 or later:

```sh
npm ci
npm run check
npm test
npm run package
```

The VSIX is written to `dist/antigravity-sidebar-autoaccept.vsix`. `vsce` is a development dependency; the installed extension has no runtime dependencies.

For a local build without npm, use `python3 package.py`. To check a connection without accepting anything:

```sh
node probe.js <extension-host-pid> /path/to/workspace
```

```text
.
├── core.js                 # Backend discovery and approval flow
├── extension.js            # VS Code lifecycle, commands, status
├── test/                   # Protocol and regression tests
├── docs/                   # Publishing and validation notes
├── .github/workflows/      # CI and release workflows
├── README.md
└── README.zh-CN.md
```

See [Testing](docs/TESTING.md) for validation scope and [Publishing](docs/PUBLISHING.md) for releases.

## License and Credits

[MIT](LICENSE). Status-bar interaction was adapted from [Ezra Auto Accept 1.2.0](https://marketplace.visualstudio.com/items?itemName=Ezra.auto-accept), retaining its copyright. This project adds the sidebar protocol adapter and tests.

Independent community extension; not affiliated with or endorsed by Google or Microsoft.
