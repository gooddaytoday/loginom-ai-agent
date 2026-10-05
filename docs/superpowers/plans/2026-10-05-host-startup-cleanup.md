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
- [x] Dependencies installed in this worktree.
- [x] Startup teardown and node-entry regression cycles complete.
- [x] Readiness cleanup failure propagation regression complete.
- [x] CLI guard release and retry regression cycles complete.
- [x] Full host suite and focused CLI suite pass.
- [x] Both package typechecks and diff check pass.
- [x] Independent review complete; findings resolved.
- [x] Task 2 and canonical lifecycle instructions updated; implementation committed.
- [x] Completion audit proves the approved goal.

## Verification checkpoint — 2026-10-05

Dependencies: isolated `bun install --frozen-lockfile --ignore-scripts`, Bun 1.3.14; lockfile unchanged. Pinned Node copied to `/tmp/loginom-host-startup-tools/node`, version 24.19.0 and the hash above verified. Node IPC fixtures require unrestricted execution on this host: the sandbox stalled IPC; the same regression checks were rerun outside it against only owned temporary processes/profiles. No shared Loginom or eval resources were invoked.

Observed regression cycles:

- Unconfirmed readiness-runtime cleanup originally allowed `host.close()` to resolve; after propagation it rejects, while clean readiness failure remains recoverable. The targeted six-test group passed.
- Failed startup with delayed TERM originally exceeded the 10s test deadline; the bounded close implementation waited for the fixture's actual delayed exit and rejected with `cleanupConfirmed: false`.
- Missing executable originally reported unconfirmed cleanup; no-spawn proof now reports confirmed cleanup and retains the original startup cause.
- A shortened 5s startup budget against actual node-entry originally left `.writer` despite confirmed teardown. The common CLI boundary now holds the guard through runtime close, removes it after clean host exit, and permits a real same-profile `status` retry. Fourteen assertions passed.
- Forced KILL retains the guard/alias; replacing the owner nonce prevents guard removal and preserves the primary startup error. Both process tests passed.

Final sequential checks, from package directories:

```sh
# packages/loginom-host
LOGINOM_AI_AGENT_TEST_NODE=/tmp/loginom-host-startup-tools/node bun test
bun typecheck
# packages/agent
LOGINOM_AI_AGENT_TEST_NODE=/tmp/loginom-host-startup-tools/node bun test test/cli/profile.test.ts test/cli/profile-windows.test.ts test/cli/standalone.test.ts test/cli/standalone-status.test.ts test/cli/standalone-proxy.test.ts test/cli/loginom-management.test.ts test/cli/run-outcome.test.ts
bun typecheck
# worktree diff
git diff --check
```

Host: **142 pass, 6 skip, 0 fail; 801 assertions, 25 files, 50.97s**. CLI: **33 pass, 2 skip, 0 fail; 279 assertions, 7 files, 109.40s**. Native Windows skips are expected on Linux. Afterwards only formatting and Windows skip metadata were changed; Linux fixture bodies remained unchanged. Both typechecks passed.

Independent read-only review covered client teardown, node-entry, readiness propagation, CLI error preservation/nonce release, fixture isolation and unnecessary architecture. Its single finding was corrected: `child.on("error")` keeps handling subsequent post-spawn errors until actual exit. No open correctness findings or overengineering remained.

Live Loginom/Chromium and native Windows/macOS acceptance are not included. Forced/unconfirmed cleanup still retains the guard by design; lost-descendant cleanup is deferred. No merge, installed binary update or new baseline was performed.

## Completion audit

Implementation and regressions: `86f7103d8` (`fix(loginom-host): await startup cleanup before releasing profile`), following the initial plan commit `c688d1551`. Task 2 and both package lifecycle instructions now record the verified behavior and forced-cleanup limitation. The final documentation commit contains this checkpoint.

Read-only isolation audit found the main checkout still at `6bc9ad04968801a4bf7545846c9dfe10abb539a7` with clean tracked status. Changes are confined to the approved branch and its host/client/CLI implementation, temporary fixture tests, instructions and reports. No harness, public protocol, generated API, dependency or lockfile changes exist. All requested executable checks and independent review passed; only the documentation commit remained at the time this checkpoint was saved. The final clean-worktree check is performed after that commit, before Goal completion.
