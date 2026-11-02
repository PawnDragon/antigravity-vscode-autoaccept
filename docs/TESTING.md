# Validation

[English README](../README.md) · [中文 README](../README.zh-CN.md)

Automated checks cover backend ownership, workspace matching, HTTP transport,
one-time approvals, prompt revalidation, stopping, ambiguous timeouts, explicit
Ask exclusions, long-history cursors, empty maps, and backend startup states.
Platform fixtures exercise Linux `/proc` and macOS `ps` discovery on either OS,
including process ownership, multiple roots, spaces, Unicode, literal quotes,
filesystem aliases, subprocess failures without token disclosure, and portable
backend liveness. CI runs Node.js 22 and 24 on both macOS and Linux.
Rename regressions cover the default OFF state, legacy settings, explicit new
settings taking priority (including OFF overriding legacy ON), and setting scope
precedence. Old command IDs forward to the new commands for existing bindings.
Activation tests verify the renamed commands and prevent duplicate polling or
command registration conflicts when the previous extension is still active.
Tests use synthetic commands and local HTTP fixtures, without calling a model
or executing fixture commands.

The adapter has been exercised against the real official
`google.google-antigravity@1.10.0` on a Linux Remote SSH host. Backend records
confirmed one-time approvals; associated commands subsequently reached DONE.
Later 0.1.1 logs recorded 17 verified approvals in one window without the old
oversized-response failure. Two startup cases in those logs are covered by
0.1.2 regressions. Private conversation IDs, paths, commands and tokens are
omitted from this public summary.

On 2026-11-02, version 0.1.4 was also tested in a real local macOS arm64 VS Code
window with official Antigravity 1.10.0 (CLI 1.4.12), using Gemini 3.8 Flash Low.
The temporary workspace path contained Chinese characters, spaces, and an
apostrophe. The same OFF/check/toggle commands worked without platform settings.
A default-fallback command permission stayed pending while OFF. Enabling the
extension produced SUBMITTED and VERIFIED logs and an ON (1) status. The backend
recorded PERMISSION_SCOPE_ONCE, the command completed, and its output file
contained the expected marker. The test did not add permanent command grants.
Stopping only that test window's backend also exercised automatic recovery:
the official backend restarted after about three seconds and the adapter logged
CONNECTED followed by READY without changing settings or selecting a mode.

The runtime automatically supports local macOS and Linux hosts with the same
configuration and commands. Local Windows hosts are not implemented. The internal endpoint may change.
Distinguish SUBMITTED from VERIFIED when validating an upstream update.
