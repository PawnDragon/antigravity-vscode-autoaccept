# Validation

[English README](../README.md) · [中文 README](../README.zh-CN.md)

Automated checks cover backend ownership, workspace matching, HTTP transport,
one-time approvals, prompt revalidation, stopping, ambiguous timeouts, explicit
Ask exclusions, long-history cursors, empty maps, and backend startup states.
Tests use synthetic commands and local HTTP fixtures, without calling a model
or executing fixture commands.

The adapter has been exercised against the real official
`google.google-antigravity@1.10.0` on a Linux Remote SSH host. Backend records
confirmed one-time approvals; associated commands subsequently reached DONE.
Later 0.1.1 logs recorded 17 verified approvals in one window without the old
oversized-response failure. Two startup cases in those logs are covered by
0.1.2 regressions. Private conversation IDs, paths, commands and tokens are
omitted from this public summary.

The runtime lives on Linux. Mac and Windows clients can use that host; local
macOS/Windows implementations are not included. The internal endpoint may change.
Distinguish SUBMITTED from VERIFIED when validating an upstream update.
