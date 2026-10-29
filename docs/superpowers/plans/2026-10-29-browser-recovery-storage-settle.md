# Browser recovery storage settle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task after independent plan review. Steps use checkbox (`- [ ]`) syntax for tracking. Root owns review, checkboxes, checkpoints and commits.

**Goal:** Получить неизменённый BR-S5 PASS, устранив следующий scroll до готовности текущего rendered file window.

**Architecture:** Существующий workspace observation сообщает один boolean готовности native file window. Общий `findNativeStorageRow` ждёт его через переданный caller-ом `ready`, заново ищет target и использует прежний native scroll. Границы native records заменяют неподтверждённое endpoint-равенство старого исследовательского плана.

**Tech Stack:** существующие Node ESM, `node:test`, managed runtime и stock `stageResources`; версии и абсолютные tool paths — в [предыдущем плане](2026-10-20-browser-recovery-rendered-window.md).

**Spec:** [browser recovery design](../specs/2026-10-19-browser-recovery-design.md), [план5/Task2](2026-10-19-browser-recovery-5-acceptance.md), [runbook](../../testing/loginom-ai-agent/browser-recovery.md). Основание: `.superpowers/sdd/2026-10-20-browser-recovery-rendered-window/design-reassessment.md` и принятый Task1 BLOCKED report/review.

## Global Constraints

- Independent preflight GO, mandatory0/optional0; root авторизует Task1 последовательно с clean source commit до единственной BR-S5. Принятые Plans1–4 и BR-S1/S3 не переоткрывать.
- BR-S5: completed, verified execution/export_file, current bytes/SHA/lineage, первый следующий Dock final Save/modifiedfalse, native exact-own Close/logout/noDiscard, managed ACK/exit0. Не менять harness/assertions/active-input/ownership/public tools; один managed authenticated browser; upload не повторять.
- Сохранить12 scroll, delta±1000, export ready100×100ms, caller guards и outer deadlines. Delivery/observer сохраняют свои ready bounds. Нет второго browser, нового actuator, retry жестов, refresh/upload verification loop, API-параметров, hooks, настроек или зависимостей.
- Unknown/refused gesture — прежний STOP; чужой owner/root/document/tab/folder и empty rows — отказ до readiness. Only same-owner false readiness допускает passive ожидание.
- Удаление endpoint measurement gate — изменение способа доказательства, не критериев BR-S5. Старые terminal/OS результаты не переоценивать.

## Review Focus

1. Старое непустое окно имеет anchors, но не покрывает viewport: не отправлять второй scroll.
2. Alloutside того же owner: дождаться обновления без жеста; empty/foreign: сразу отказать.
3. Static/short/end: не требовать смены IDs или равенства TD/content end; native first/last record должны быть доказаны.
4. Target появляется в settling: повторить exact lookup до нового scroll; существующие byte/download bindings сохраняются.
5. Timeout/cancel/stuck/refused gesture: не расширять bounds, не повторять жест, не скрывать ошибку. Narrow observations не получают полный grid scan.

## Решение и цена

`waitArtifactDiscoveryReady` не подходит: `isLoading=false` и grid hit совместимы со старым partial window. `discoverArtifactAndDownload` добавляет direct grid actuator,55s/96steps/700px, Refresh/loadCount и known-upload-bytes. Его loop не переносить и не обобщать.

Producer уже доказывает `pnlFileStorage` component→native view/store→DOM row→record→same DOM row для file bytes (`workspace-ui.mjs:2915–2941`). Повторить этот локальный read-only proof в detailed grid observation; не выделять общий framework и не менять file-byte ветку. Новый boolean нужен потому, что existing snapshots не содержат ни row-container rect, ни native first/last record proof. `listing_complete:false` сохраняет свой смысл.

Точное поле: `file_storage.rendered_window_ready?: boolean`; оно относится только к detailed snapshot с `observation_root` точного `...;pnlFileStorage;tbl`. Отсутствие — proof unavailable/invalid; false — valid pending window; true — valid sufficient window. Не выдавать поле в roots/navigation/name-cell reads.

Proof: unique observed parent `...;pnlFileStorage`, component.el===parent, component.getView().el.dom===observed owner, тот же non-buffered `bg.filedialog.FileStore`, `isLoading()===false`, bounded `getRange()` array длиной `getCount()` (существующий предел10000). Непустые rendered name rows принадлежат owner, каждая имеет одну name-cell и round trip `getRecord/getNode`, records образуют непрерывный возрастающий диапазон в текущем store. Использовать фактический порядок store, не выводить index из имени. Невалидная связь/пустота не превращается в false.

Условие для первого/последнего row-контейнера и его native index:

```text
(firstIndex === 0 || firstRowRect.top <= ownerRect.top)
&& (lastIndex === records.length - 1 || lastRowRect.bottom >= ownerRect.bottom)
```

Все rect конечны, относятся к одному synchronous observation; порядок row geometry согласуется с DOM/native order. Используются DOMRect, без clientHeight arithmetic, px tolerance и обязательной смены refs. Outer rect консервативен; native first/last снимает border gap для начала/конца/короткого списка. Intermediate window внутри outer border может timeout; добавлять epsilon/условие `top===max` запрещено. Поле не гарантирует стабильность будущих refs: pre-gesture epoch/hit guards остаются.

Оценка slice: до10 tracked файлов, около+345/−15 строк, включая этот план, tests/fixtures и3 owning docs. Production2 файла около+65/−10. При >720 changed lines остановиться и пересмотреть; acceptance harness и artifact-discovery не входят в diff.

### Task 1: Дождаться готового native window и проверить исходный BR-S5

**Files:**
- Modify: `packages/loginom-runtime/client/lib/workspace-ui.mjs` (fileStorage detailed producer), `packages/loginom-runtime/client/lib/text-export-output.mjs` (`findNativeStorageRow`).
- Test: `packages/loginom-runtime/client/test/workspace-ui.test.mjs`, `packages/loginom-runtime/client/test/text-export-virtual-storage.test.mjs`.
- Только если используется новый table-read путь: минимальная коррекция existing snapshots в `client/test/artifact-delivery.test.mjs`, `client/test/text-export-read-refusal.test.mjs`; не создавать adapter/harness.
- Root docs: owning plan5, append `docs/testing/loginom-ai-agent/reports/2026-10-20-browser-recovery-source/report.md`, current `docs/migration/linux-implementation-checkpoint.md`≤20строк; исторические записи не менять.

**Interfaces:** прежние `findNativeStorageRow({name,read,roots,ready,act,guard}) → snapshot`, `ready(observe,condition)` и все3 callers; additive observed boolean только в detailed grid snapshot. Producer не выполняет действий, store read не заменяет exact name/bytes/download proof.

- [ ] **Step1 — RED tracer.** В `text-export-virtual-storage.test.mjs` использовать настоящие `findNativeStorageRow` и `waitForExportStorageObservation`; injected sleep публикует свежий window. После первого1000px scroll старое окно имеет anchors, `rendered_window_ready:false`; target появляется лишь со следующим true snapshot. Assert returned exact target и trace `[1000]`. Старый reader должен провалить поведение, не ошибку fixture. Запустить pinned Node `--test test/text-export-virtual-storage.test.mjs` из `packages/loginom-runtime/client`, сохранить RED вне Git.
- [ ] **Step2 — minimal GREEN reader.** Внутри каждого logical table read вызвать guard и проверить pinned document/workflow/tab/directory, actual roots→detail root и row scroll owner до condition. Брать owner из всех name rows, не только point_observed anchors; alloutside не равно empty. Empty/invalid binding/missing boolean отказывают сразу. false ждать только существующим `ready`. После settled table заново выполнить exact-name discovery/detail до выбора anchor/scroll; fast already-rendered exact row сохранить. При true применять прежние progress/reset/end/budget проверки. Запустить tracer, получить PASS без нового sleep/budget.
- [ ] **Step3 — producer vertical TDD.** Один test через настоящий `workspaceUiCapability`/existing Page fixture показывает, что delayed partial native range не выдаёт true, а смена same-owner rendered range даёт true. RED — boolean отсутствует. Реализовать поле в существующем fileStorage блоке только для selected grid root по proof/predicate выше; сохранить source scan charge/visibility/redaction и отсутствие сканирования в narrow roots/navigation. Запустить pinned Node `--test test/workspace-ui.test.mjs`, получить PASS; без отдельной production helper/API.
- [ ] **Step4 — соседние поведения по одному.** Проверить producer static full native list, short list и terminal range с последним native record при `cell.bottom<row.bottom<owner.bottom`; stale terminal range без last record остаётся false. Проверить row↔record mismatch/foreign view/empty дают unavailable. Затем reader alloutside→ready без второго жеста; foreign root/document/tab/directory/owner и empty отказывают до sleep, unchanged complete ready не ждёт, stuck/timeout/cancel сохраняют bounds. Добавлять только отсутствующее покрытие: один test→проверка→необходимая правка; уже GREEN защитный test не объявлять RED. Минимально обновить затронутые existing fixture snapshots.
- [ ] **Step5 — focused checks и clean source commit.** Из `packages/loginom-runtime/client`: pinned Node `--test test/workspace-ui.test.mjs test/text-export-virtual-storage.test.mjs test/text-export-observation.test.mjs test/text-export-read-refusal.test.mjs test/artifact-delivery.test.mjs test/browser-recovery.test.mjs`; затем `git diff --check`, проверить scope/estimate. Runtime package не имеет typecheck script. Root делает `fix(runtime): settle native storage windows`, удостоверяется в clean build inputs до stage.
- [ ] **Step6 — первый E2E, одна неизменённая BR-S5.** Fresh private stock stage desktop/linux-x64 с product pins и штатным `verifyResources`; identities/source/manifest сохраняются private, secrets не выводятся. Из `packages/desktop` выполнить существующий invocation ниже, без изменения harness. Требовать все исходные assertions. Первый неожиданный отказ — FAIL/STOP и existing cleanup, без второго S5/Export/Save/gesture retry. Native/context/OS facts учитывать отдельно; broad suite до первого успешного main path не расширять.

```bash
LOGINOM_AI_AGENT_TEST_CONFIG=/home/george/.config/loginom-ai-agent-tests/browser-recovery.json \
LOGINOM_AI_AGENT_TEST_RESOURCES=<new-private-stock-resources> \
/home/george/.cache/loginom-toolchain/bun-linux-x64/bun \
test/loginom/browser-recovery-acceptance.ts BR-S5 \
/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/saved-A-fresh.json
```

- [ ] **Step7 — после main-path PASS.** Один `bun run test:upstream` из `packages/loginom-runtime`, pinned Node в command-local PATH. Root проверяет текущие acceptance receipts, получает independent scoped spec+quality review, разрешает mandatory замечания; optional hardening не добавляется. Обновить3 owning docs и этот план по фактам, checkpoint≤20строк, отдельный report commit. Merge/release не входят в задачу.
