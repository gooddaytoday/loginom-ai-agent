# Task 2 — Host capability chain

Result: private `browserRecovery?: boolean` passes from `launchNodeHost` through the Node Host handshake and `createLoginomHost` to task runtime start. Validation runtime receives `false`; readiness remains browser-free. Neither environment nor model tool arguments set the capability.

TDD cycles (all commands run from `packages/loginom-host` with pinned Bun in `PATH` and `LOGINOM_AI_AGENT_TEST_NODE` set to the pinned Node):

1. `bun test test/node-host.test.ts --test-name-pattern 'a non-boolean browser recovery capability'` — RED: string `"true"` was accepted, promise resolved. After adding typed client payload and handshake validation: GREEN, 1 pass.
2. `bun test test/browser-recovery-capability.test.ts` — RED: both cases received no `browserRecovery` in validation runtime start. After forwarding through Host and supervisor: GREEN, 2 pass. The test exercises a real compiled Node Host, validation through `connection.check`, and a task `dock_prepare` with opposite model arguments and hostile environment value.

Final checks: `bun test test/node-host.test.ts test/browser-recovery-capability.test.ts` — 25 pass, 0 fail; `bun typecheck` — pass; after strengthening the validation count assertion, `bun test test/browser-recovery-capability.test.ts` — 2 pass; `git diff --check` — pass.

Self-review: uses the existing `closeSavedPackageOnShutdown` transport chain; no new mechanism, dependency, runtime recovery behavior, or release workflow change. The controlled managed-entry fixture proves capability routing, not native browser recovery behavior. No deviations or unresolved concerns.
