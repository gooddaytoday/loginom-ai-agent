# Headless preflight Implementation Plan

**Goal:** Проверенный offline patch exact89b, который явно выбирает headless и сохраняет безопасную terminal management diagnostics.
**Architecture:** Общий fixed-command builder используется двумя существующими preflight вызовами; management сохраняет дополнительный allowlisted receipt, не меняя gates.
**Tech Stack:** Bun/TypeScript, существующий fake CLI и Linux supervisor; runtime dependencies отсутствуют.
**Spec:** evals/docs/proposals/2026-10-13-preflight-headless-design.md

## Global constraints

Все изменения только evals/. Модели/criteria/CLI/runtime/shared defaults прежние; на сервер ничего не устанавливать до owner pin approval. Tests/typecheck из evals/. Исходные receipts и ERROR не менять. Текущий удалённый lease не трогать. Нет live/model/reference/product/probe/recovery вызовов. Independent Ben ACCEPT остаётся обязательным.

## Task1: общие preflight argv и TDD headless

Files: evals/src/node-eval-ops.ts, evals/test/profile.test.ts, evals/fixtures/fake-cli.ts.
- [x] Existing baseline: `bun test test/node-eval-ops.test.ts test/profile.test.ts`; записать skips, `bun typecheck`.
- [x] Mechanical GREEN extraction: `export function nodePreflightCommand(operation: "status" | "check") { return ["loginom", operation, "--format", "json"] }`; обе старые точки вызова используют её. Повторить адресные checks, изменение поведения отсутствует.
- [x] RED: fake fixture с EVAL_FAKE_REQUIRE_HEADLESS=1 возвращает recoverable-error без --headless; test вызывает реальные management процессы с `nodePreflightCommand("status")` и ожидает ready. Check той же fixture возвращает LOGINOM_CONNECTION_VALID только с --headless; его cleanup также подтверждён.
- [x] GREEN: builder возвращает `["loginom", operation, "--headless", "--format", "json"]`; два status/check consumers используют его. Выполнить адресную regression и существующие node-ops gates.

## Task2: TDD allowlisted diagnostic refusal

Files: evals/src/profile.ts, evals/test/profile.test.ts.
- [x] RED: fake state recoverable-error/LOGINOM_RUNTIME_START_FAILED содержит дополнительные password/token/URL поля; вызвать management с private cleanupDir и ожидать result.json/exitCode/view_state/view_failure/capture_complete и mode0600, без дополнительных данных. Старое отсутствие файла должно быть причиной RED.
- [x] GREEN: до проверки cleanup записать result.json через writeFile({mode:0o600}); сохранить только поля из design. Не сохранять raw streams, env, stdin или произвольные view fields.
- [x] Дополнительная negative regression: неизвестные state/failure/code строки не попадают в receipt, unrecognized indicators true; cleanup/error semantics прежние. PASS на уже зелёном allowlisted коде, новых production changes не потребовалось.
- [x] Cleanup-rejection regression: EVAL_FAKE_CHANGED_WRITER=1; management продолжает отказывать, новый result.json сохраняет terminal/capture/failed cleanup, replacement guard остаётся. Дополнительная проверка уже зелёной реализации PASS; исходный diagnostic RED выше воспроизвёл отсутствующий receipt. Supervisor не ослаблен.
- [x] `bun test test/profile.test.ts test/node-eval-ops.test.ts`; `bun test`; `bun typecheck`; git diff --check. В отчёте отделить offline PASS/skip от NOT_RUN Native READY.
- [x] Commit `fix(evals): make preflight headless and retain safe management outcome`; сохранить точный patch/commit/check receipts для review. Перед server pin deploy — owner decision с concrete tested artifact; бюджет и текущий lease неизменны.

## Фактическая проверка

Baseline и mechanical extraction:68 PASS/6 SKIP/0 FAIL. Headless RED: реальный fake CLI exit1 вместо0; GREEN: status ready/check valid, cleanup confirmed. Diagnostic RED: ENOENT result.json; GREEN:0600 safe allowlisted receipt, sensitive fields не копируются. Unknown-field и cleanup-rejection regressions:2 PASS, заменённый writer guard сохранён. Полный suite:578 PASS/9 SKIP/0 FAIL,51 files/657.64s; bun typecheck PASS; diff check PASS. Raw logs не включены; хэши и наблюдённые summaries сохранены в checks.json. Native READY/реальная нижняя причина/новый pin/Ben ACCEPT не подтверждены.
