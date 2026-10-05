# Host startup cleanup — implementation plan and checkpoint

## Approved goal

Fix task 2 in `docs/testing/loginom-ai-agent/reports/2026-10-01-evals-remaining-work.md` using the existing private host lifecycle. Startup failure must await bounded teardown; confirmed close permits release of the CLI writer guard while preserving the original startup error. Forced or unconfirmed runtime cleanup retains the guard. Automatic release after lost host descendants is a separate task.

Base: `6bc9ad04968801a4bf7545846c9dfe10abb539a7`; branch: `host-startup-cleanup`; isolated Codex worktree. The main checkout, Cursor session `bc731107-6ebf-4d64-a929-e96e54256b95`, eval profiles/bundle/results, installed CLI and shared Loginom stand are outside the mutation and verification scope.

## Design and implementation

- Reuse idempotent close in `node-client` for startup rejection, invalid handshake and ordinary shutdown. Keep start default 180s; close acknowledgement 30s; TERM grace 5s; KILL followed by actual exit wait; total cleanup deadline 60s. Disconnect and post-spawn errors are not process exit evidence.
- A local `NodeHostStartupError` preserves the original error and records `cleanupConfirmed`. Only no-spawn or valid close acknowledgement plus exit 0 without signal confirms cleanup. Test budgets are internal arguments, never product environment flags.
- Accept private close before host readiness in `node-entry`. Rejected starting must not skip interruption, drain and resource close. Collect cleanup errors before acknowledging shutdown.
- Preserve an unconfirmed readiness-runtime cleanup failure at the host boundary so connection preparation cannot hide it behind a successful acknowledgement. No process registry or new supervisor.
- The common CLI profile boundary releases its own TMP alias and nonce-checked guard only after confirmed startup cleanup, then rethrows the startup error. Ordinary cleanup failures retain the guard. Keep run/management catch and startup error codes unchanged.

No new CLI modes, transport protocols, dependencies, public Protocol/HttpApi changes, harness modifications, merge, installation or baseline run.

## Verification

Real temporary Node processes and fixture-runtime cover delayed/failed startup, invalid handshake, no-spawn, TERM-delayed exit, TERM-ignoring KILL fallback, missing/bad acknowledgement, acknowledgement without exit, readiness cleanup failure, same-profile retry, and writer release order. Preserve late readiness after 30s, failed cleanup and foreign nonce regressions.

Run sequentially from package directories: full host `bun test`, focused agent CLI/profile tests, `bun typecheck` in both packages, then `git diff --check` and independent review. Explicit test Node is an isolated copy of the pinned Node 24.19.0, SHA256 `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`.

## Checkpoint

- [x] Approved scope and force-cleanup limitation recorded.
- [x] Goal created; isolated branch created from the pinned base.
- [x] Pinned Node copied and hash verified.
- [ ] Dependencies installed in this worktree.
- [ ] Startup teardown and node-entry regression cycles complete.
- [ ] Readiness cleanup failure propagation regression complete.
- [ ] CLI guard release and retry regression cycles complete.
- [ ] Full host suite and focused CLI suite pass.
- [ ] Both package typechecks and diff check pass.
- [ ] Independent review complete; findings resolved.
- [ ] Task 2 and canonical lifecycle instructions updated; commits prepared.
- [ ] Completion audit proves the approved goal.

No implementation or test result is claimed by this initial checkpoint. Live Loginom/Chromium and native Windows/macOS acceptance are not included.
