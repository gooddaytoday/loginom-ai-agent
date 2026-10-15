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

- [x] Add actual bridge regression cases for generated ID and lost Save reply/inspection.
- [x] Add negative cases for older reconciled Save, unrelated receipt, changed document,
      non-resolved inspection and mismatched path/action/operation ID.
- [x] Confirm failures under Node `--experimental-test-module-mocks`.
- [x] Track first admitted Save sequence/document/action/path; reconcile only matching
      direct or verified inspection receipts. Update wrapper expected test count.
- [x] Run the fixture and package-cleanup/saved-state suites.

## Task 2 — проверенные source/wizard отказы

Files: `javascript-{wizard-recovery,existing-schema-refusal,source-admission,
source-policy-refusal,code-node}.mjs` and their matching `*.test.mjs`.

- [x] Convert review reproductions to regressions using actual admission/applyNode boundaries.
- [x] Require FAILED with confirmed cleanup and no pending phase for exact stale digest
      and verified Done/Close refusal; preflight delivery rejection is NOT_APPLIED with
      effect_possible=false. Retain owner negatives.
- [x] Add `stale_digest` only to closed refusal producer/verifier; accept valid finish modes.
- [x] Run existing full-source delivery validation in `verifySource` before target phase.
- [x] Run matching suites; ensure unknown discard/ACK/callback errors stay AMBIGUOUS.

## Task 3 — предел графа

Files: `javascript-{managed-selection,owned-selection,output-context,managed-close}.mjs`
and their selection/output/close fixture tests.

- [x] Exercise actual serialized observers at20/21/200/201 nodes with the same native owner.
- [x] Raise all JS graph inventory bounds to200, retaining dense/unique owner checks.
- [x] Require valid21/200 and refusals at201/duplicate/foreign native identity.

## Task 4 — transport allowances

Files: runtime `src/call-timeout.mjs` and type declaration; `src/managed-entry.mjs`;
Host `src/{adapter,host-port}.ts`; `javascript-managed-{declared,views}.mjs`.

- [x] Add pure deadline-policy tests with source/context/default/cursor/explicit bounds,
      plus actual Host dispatch timeout assertions and ordinary-call preservation.
- [x] Wire shared timeout policy across MCP, runtime IPC and outer Host transport.
- [x] Add generated browser settlement tests permitting40s Apply and >60s Views under
      a180s original deadline, with one gesture and host timeout covering browser wait.
- [x] Pass remaining deadline+5000ms to declared effects and Views capture/settle.
- [x] Run timeout/adapter/HostPort/managed-entry and managed declared/Views suites.

## Task 5 — завершение

- [x] Update migrated-file SHA transforms with precise review-fix reasons.
- [x] Run full Client tests independently with pinned Node and exact dependencies.
- [x] Run changed runtime/Host checks, Host `bun typecheck`, provenance and diff check.
- [x] Record result/counts/limits below and link the checkpoint from node README.
- [x] Audit all nine items against current code and test assertions; leave no partial fix.

## Checkpoint — 2026-10-05

Все девять дефектов исправлены в `javascript-fixes` поверх проверенного
`6f6a66eb62c78ab2e8b10cd1bd7f38bcf931d8d6`. Исходные файлы `origin/javascript`
и исторические acceptance/candidate записи сохранены. Independent spec review
одобрил дизайн до реализации; implementation выполнена в текущем worktree.

| Дефект | Исправление | Проверка настоящей границы |
| --- | --- | --- |
| Save без ID | Private ID выдаётся до executor dispatch и связывается с собственным receipt | actual bridge shutdown fixture generated-id |
| Save после inspection | exact nested receipt + original sequence/document/action/path; older Save не вытесняет новый | actual bridge resolved/unresolved/foreign/wrong-path/action/document, no-effect/validation/older-reconciliation retry |
| source/context timeout | shared bounded policy MCP→IPC→outer transport; cursor не продлевает original reader deadline | runtime budget/default/cursor/invalid cases; actual HostPort dispatch + built adapter with virtual clock |
| граф21..200 | четыре JS owner observers и Close согласованы с generic max200 | serialized capture/selection/output at20/21/200;201/duplicate/foreign reject; actual Close guard |
| Done/Close refusal | supported finish modes в trusted proof verifiers | actual source/wizard admission + applyNode, owner negatives, retained unknown ACK/discard |
| stale digest | reason разрешён только после verified discard до callback | actual full read→Close→closed proof→applyNode for done/close/execute; foreign callback refusal |
| redaction | full source delivery preflight в verifySource до target | new/existing factory→applyNode NOT_APPLIED/effect=false/cleanup=true/no pending; no browser/target dispatch |
| declared Apply | remaining original deadline+5000ms вместо35s cap | generated Apply settles40s, one click/no replay, dispatcher timeout covers180s original budget |
| Views | remaining original deadline+5000ms для capture/settle | generated capture70s+settle70s within180s, one click and exact original deadline |

### Проверенные результаты

- **Client:** все258 файлов выполнены отдельными процессами Node24.19.0;
  3471 tests, **3461 PASS /0 FAIL /10 SKIP**. Два исправленных test fixtures
  перепроверены отдельно после полного прогона; остальные файлы не изменялись.
- **Save bridge:** wrapper проверяет **36 PASS /0 FAIL** actual shutdown cases.
- **Operator fixtures:** все91 файла выполнены изолированно, **18638 PASS /0 FAIL**
  test executions. Часть shared tests повторно импортируется разными operator
  файлами; число обозначает выполненные случаи, не уникальные определения.
- **Runtime:** **48 PASS /0 FAIL**, включая managed-entry/resource close и timeout policy.
- **Host:** все26 файлов в отдельных Bun1.3.14 процессах,
  **157 PASS /0 FAIL /6 SKIP**; actual Node Host bundle/run/close также **6 PASS**.
  `bun typecheck` PASS. Совместный `bun test` ранее дал ошибку чтения зависимостей
  в `node-host` beforeAll; изолированная реальная сборка и запуск прошли.
- **Provenance:** source-map verifier **PASS,5045 files**. Обновлены только три
  фактически изменённых migrated-file transforms, исходные hashes сохранены.
- `git diff --check`: PASS.

Адресные RED→GREEN: refusal76tests/9FAIL до исправления →174PASS;
Save33tests/3FAIL →36PASS с расширенными негативными случаями;
graph10tests/6FAIL →10PASS; generated Apply/Views15tests/2FAIL →15PASS.

### Диагностика тестовых отказов

- **Outdated test:** `javascript-public-source.test.mjs` ожидал redaction отказ
  в beforeTarget. Намеренное исправление переносит полный preflight в verifySource;
  тест теперь требует ранний typed NOT_APPLIED/effect=false/cleanup=true.
- **Fixture defect:** новая stale-digest регрессия создавала разные original
  deadlines для admission и applyNode. Она использует общий clock; exact deadline
  guard не ослаблен. Save validation fixture дополнен requestFailure response.
- **Flaky:** disconnect caller получает локальный transport rejection до
  завершения HostPort journal settlement. Test-signal-collector подтвердил5/5 PASS
  до изменения и асинхронную гонку по исходникам; после добавления явного
  `await port.close()` перед проверками журнала — ещё5/5 PASS и вся группа9PASS.
  Проверки pending records и filesystem inventory сохранены, sleeps/retries нет.

### Ограничения и продолжение

Новые результаты относятся к исходникам и fixtures. Live Loginom, повторная CLI
acceptance campaign, Windows/macOS native acceptance и установленный клиент не
проверялись заново. Historical pair13/candidate15 не объявляются проверкой этих
исправлений. Client10 и Host6 SKIP сохранены как пропуски, не PASS.

Implementation changes оставлены в рабочей ветке для просмотра diff; merge,
push, выпуск и изменение пользовательской установки не выполнялись.
Следующий этап при необходимости — отдельный build candidate и live acceptance
на исправленном source snapshot, с собственной provenance и новым evidence.

## Повторное ревью: явный null в Save operation_id

Пользователь согласовал исправление: UUID создаётся только при отсутствии ID.
Для `package.save_as` и `package.save_checkpoint` явный `null` должен дойти до
исходного валидатора и получить no-effect отказ; Save без ID остаётся допустимым.

- [x] Добавить две регрессии в `client/test/support/package-cleanup-bridge.mjs`:
  два запроса с null не сохраняют пакет, следующий запрос без ID получает UUID
  и остаётся основанием для guarded shutdown. Null проверяет реальный executor.
- [x] Проверить FAIL до исправления; заменить в `client/lib/bridge.mjs`
  `args.operation_id ?? randomUUID()` на строгую проверку undefined.
- [x] Прогнать все Save/shutdown fixtures и связанные executor/cleanup тесты,
  обновить source-transforms для изменённых мигрированных файлов и проверить
  provenance и `git diff --check`. Не запускать release или live acceptance.

Результат: новые регрессии обеих Save-команд воспроизвели SUCCEEDED вместо
NOT_APPLIED до исправления. После него обе получают точный отказ исходного
валидатора `operation_id`, без Save или записи receipt; следующий Save без ID
получает UUID и подтверждает guarded shutdown. Все38 bridge fixtures и79
executor/cleanup/catalog тестов PASS на Node24.19.0. Две проверки каталога с
дочерним Node сначала получили пустой вывод в sandbox; повтор всей группы
вне sandbox прошёл79/79. Source provenance5045 файлов PASS; live Loginom,
release и пользовательская установка не проверялись и не изменялись.
