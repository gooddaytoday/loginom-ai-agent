# Knowledge Close ACK → clean exit: implementation plan
Outcome: actual Knowledge entry exits0 without signal after completed cleanup and flushed Close ACK even when a later IPC frame is incomplete; original campaign failure remains unchanged.
Authority: runtime/host AGENTS shutdown contracts and user-authorised necessary product recovery; no public interface, model/oracle/rubric or measurement requirement changes.
Evidence: existing managed-entry-close real-IPC probe against byte-identical installed Knowledge returned ACK then exit timeout (root90671b); initial workspace SDK failure root4bcf2d is environment evidence, not product RED. Original P19B leaf remains UNKNOWN.
Scope: packages/loginom-runtime/src/knowledge-entry.mjs and test/managed-entry-close.test.mjs; this plan and existing campaign checkpoint. No other code/caller/export/fixture/config needs changing.
First end-to-end result: same existing real Node JSON IPC test covers managed and Knowledge entries, observes original closed:true reply followed by actual exit0/no signal.
1. Independent applicability/spec/quality plan review before code; confirm stop still checks close and admitted work before exit. Verify existing callers of send/stop and original host ACK+exit guards.
2. Temporarily link absent W runtime client/node_modules to installed runtime client/node_modules, only after exact package-lock equality and private pinned Node SHA; remove only that own symlink in finally. No install/npm ci/loader/new dependency.
3. Extend only the existing partial-frame test across both actual entrypoints; run pinned Node test and observe Knowledge RED/managed PASS. Then minimally invoke existing checked stop path after terminal send callback/disconnect; run the same test GREEN.
4. Run existing knowledge-entry and knowledge-client tests plus managed close/resources-close tests using pinned Node; run relevant host knowledge/connection-readiness tests using pinned Bun and LOGINOM_AI_AGENT_TEST_NODE. No actual profiles/provider/browser/server traffic: local test fixtures only.
5. Independent actual code SPEC+QUALITY review, root full readback, targeted git diff --check and cleanup of own dependency symlink; preserve dirty files and canonical campaign checkpoint.
Expected git diff --stat: 3–4 worktree files, about30–55 added/removed lines including plan/checkpoint; source4–6 lines/test4–7 lines. Private review briefs stay in existing SDD, at most25lines each.
No new subsystem/wrapper/setting/retry/telemetry. Reuse existing stop/IPC fixture and installed identical-lock dependencies; these satisfy the existing clean-shutdown guarantee.
Exclusions: applying/building/installing new Benchmark resources, changing pins/budgets or old65, status/check/CLI/model/judge/cold rerun/OAuth/setup, new measurement or remeasurement, commit/push/merge/release.
Completion: observed RED→GREEN for the real IPC regression, relevant existing tests pass, review mandatory findings closed, own test symlink removed and installed resources/pins unchanged.
Limit: regression proves this partial-frame exit defect and its correction; it does not retrospectively prove the exact P19B/P14D leaf or current Benchmark readiness. No campaign PASS/acceptance is inferred.
After verified source fix: владелец разрешил локальное применение отдельной поставки Benchmark с обновлением pins; текущие границы и процедура — [план применения](2026-11-01-knowledge-benchmark-activation.md). Завершённый P19D сохраняется на старой версии без повторного запуска.

## Результат
Source fix CLOSED: actual realIPC RED4/5→GREEN5/5, существующие Node33/33 и Host7/7; independent actual SPEC+QUALITY APPROVE/rootFULLREAD7ce025. Детали и команды — existing SDD/knowledge-close-exit-{implementation,actual-review}.md.
Own temporary dependency link удалён; installed Benchmark/pins/budget/corpus не изменены. Runtime source+test: git diff --stat2files/10insertions8deletions.
Исходный этап завершился без установки. После повторного отказа P19B владелец разрешил отдельное применение по связанному плану. P19B0of1: предмодельный сбой не расходует измерение, собственная cleanup закрыта; дальнейшее применение и запуск идут по новому плану, с честной границей версий. Решение — [operating-rules, раздел1](2026-11-01-analytics-expansion-operating-rules.md). Original leaf UNKNOWN; нового запуска при передаче нет.
