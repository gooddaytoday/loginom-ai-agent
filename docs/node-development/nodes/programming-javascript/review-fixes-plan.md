# JavaScript Review Fixes Implementation Plan

> Execution: inline in the existing isolated worktree. Preserve the nine-item scope.

**Goal:** Исправить все девять подтверждённых дефектов ревью и доказать это регрессиями.

**Architecture:** Сохранить текущие public receipts, native ownership и original
deadlines. Расширить только доказанные safe-refusal ветки, исправить собственный
Save tracker и согласовать bounded транспортные allowances.

**Tech Stack:** ESM, Node24.19.0, Bun1.3.14, MCP SDK1.30.0, TypeScript Host.

**Spec:** [review-fixes-design.md](review-fixes-design.md).

## Global Constraints

- Source≤32768 UTF-8 bytes/1024LF; existing module policy and secret redaction.
- Loginom7.4.2/Linux v1 scope; source default300000ms, context600000ms, maximum1800000ms.
- No repeated unknown gesture, extended original deadline, synthetic cleanup or foreign owner.
- Tests from package directories; Host typecheck via `bun typecheck`.

## Task 1 — подтверждённые собственные Save

Files: `client/lib/bridge.mjs`, `client/test/support/package-cleanup-bridge.mjs`,
`client/test/package-cleanup-bridge.test.mjs`, runtime AGENTS ownership description.

- [ ] Add actual bridge regression cases for generated ID and lost Save reply/inspection.
- [ ] Add negative cases for older reconciled Save, unrelated receipt, changed document,
      non-resolved inspection and mismatched path/action/operation ID.
- [ ] Confirm failures under Node `--experimental-test-module-mocks`.
- [ ] Track first admitted Save sequence/document/action/path; reconcile only matching
      direct or verified inspection receipts. Update wrapper expected test count.
- [ ] Run the fixture and package-cleanup/saved-state suites.

## Task 2 — проверенные source/wizard отказы

Files: `javascript-{wizard-recovery,existing-schema-refusal,source-admission,
source-policy-refusal,code-node}.mjs` and their matching `*.test.mjs`.

- [ ] Convert review reproductions to regressions using actual admission/applyNode boundaries.
- [ ] Require FAILED with confirmed cleanup and no pending phase for exact stale digest,
      verified Done/Close refusal and preflight delivery rejection; retain owner negatives.
- [ ] Add `stale_digest` only to closed refusal producer/verifier; accept valid finish modes.
- [ ] Run existing full-source delivery validation in `verifySource` before target phase.
- [ ] Run matching suites; ensure unknown discard/ACK/callback errors stay AMBIGUOUS.

## Task 3 — предел графа

Files: `javascript-{managed-selection,owned-selection,output-context,managed-close}.mjs`
and their selection/output/close fixture tests.

- [ ] Exercise actual serialized observers at20/21/200/201 nodes with the same native owner.
- [ ] Raise all JS graph inventory bounds to200, retaining dense/unique owner checks.
- [ ] Require valid21/200 and refusals at201/duplicate/foreign native identity.

## Task 4 — transport allowances

Files: runtime `src/call-timeout.mjs` and type declaration; `src/managed-entry.mjs`;
Host `src/{adapter,host-port}.ts`; `javascript-managed-{declared,views}.mjs`.

- [ ] Add pure deadline-policy tests with source/context/default/cursor/explicit bounds,
      plus actual Host dispatch timeout assertions and ordinary-call preservation.
- [ ] Wire shared timeout policy across MCP, runtime IPC and outer Host transport.
- [ ] Add generated browser settlement tests permitting40s Apply and >60s Views under
      a180s original deadline, with one gesture and host timeout covering browser wait.
- [ ] Pass remaining deadline+5000ms to declared effects and Views capture/settle.
- [ ] Run timeout/adapter/HostPort/managed-entry and managed declared/Views suites.

## Task 5 — завершение

- [ ] Update migrated-file SHA transforms with precise review-fix reasons.
- [ ] Run full Client tests independently with pinned Node and exact dependencies.
- [ ] Run changed runtime/Host checks, Host `bun typecheck`, provenance and diff check.
- [ ] Record result/counts/limits below and link the checkpoint from node README.
- [ ] Audit all nine items against current code and test assertions; leave no partial fix.

## Checkpoint

2026-10-05: clean worktree switched from dev to `javascript-fixes` at reviewed source.
Implementation not started; exact npm dependencies already available under
`/tmp/node-javascript-review-deps/node_modules`; pinned Node available in installed
0.1.17-prod resources. No live Loginom actions authorized or performed.
