# Browser recovery: rendered file window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task after the design gate below. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Получить первый исходный BR-S5 PASS: completed recovery, текущий Export-файл с bytes/SHA/lineage, первый следующий Dock-вызов final Save, native Close/logout/noDiscard и managed ACK/exit0.

**Architecture:** Исправлять только общий `findNativeStorageRow({name,read,roots,ready,act,guard})` через существующий `ready`, без повторения жестов. Геометрия table owner уже есть в roots; проверка binding выполняется внутри logical read до readiness. Конкретный predicate пока не принят: нужна проверяемая граница последней строки при достижении конца списка.

**Tech Stack:** существующие Node ESM, `node:test`, managed runtime и `stageResources`; pins задаёт product configuration.

**Spec:** [исходный дизайн](../specs/2026-10-19-browser-recovery-design.md), [план 5, Task 2](2026-10-19-browser-recovery-5-acceptance.md), [native runbook](../../testing/loginom-ai-agent/browser-recovery.md).

## Global Constraints

- Статус: **runtime DESIGN_BLOCKED до фактов Task1 и review predicate.** Этот документ назначает один подготовительный boundary probe после независимого review плана; его автор ничего не запускает. После Task1 — отдельное preflight-дополнение/review точного predicate до RED/кода.
- Сохранить public tools, T2/handoff/finish actions[], browser calls0, execution/export provenance, активный вход, unknown-upload rules и один managed authenticated browser.
- Существующие bounds: максимум12 scroll, `delta_y` в −1000…1000; export readiness100 logical reads с100ms sleep и исходным outer guard/deadline. Не добавлять budget, API, hooks, options, dependencies, gesture retries, новый actuator или общий coverage framework.
- Пустой/чужой список не ждать. Смену folder/workflow/document/tab/root/scroll owner проверять до ожидания; текущие отказ, отмена и unknown-effect semantics сохраняются.
- Исторические FAIL/UNKNOWN не переписывать. Installed availability уже принята; Task3 models deferred. Task2 остаётся открытой до исходного S5 PASS. Merge/release исключены.

## Review Focus

1. Старые строки после scroll ещё имеют anchors: ожидание только `anchors.length === 0` пропустит промежуточный диапазон.
2. Static/full-window, короткий список и конец: обязательная смена row identities и произвольный pixel tolerance недопустимы.
3. Изменённый binding, пустой список, отказ/unknown scroll: никакого ожидания чужого состояния или нового жеста.
4. Строка появляется во время settling: exact-name lookup повторяется до следующего scroll.
5. Неисчезающий подтверждённый transient: исходный bounded ready/guard завершает чтение; никакого расширения deadline.

## Основание и остановка дизайна

[Последний раздел source report](../../testing/loginom-ai-agent/reports/2026-10-20-browser-recovery-source/report.md) — canonical causal evidence, не S5 PASS. В сохранённой пробе old window после0→1000 содержит65 строк/24 anchors; после1000→2000 — те же65/anchors0. Позднее окно обновилось без жеста. Простое alloutside-only ожидание недостаточно: старый и новый диапазоны не перекрываются.

Уже существующие roots region `;FileStorageForm;pnlFileStorage;tbl` и rows имеют `bounding_box`; root ref совпадает с row.scroll.ref. Root bottom960, последний old row bottom688 при top1000, fresh window bottom1440 при top2000. Это позволяет отличить доказанный partial window без нового поля.

**Кандидат, не решение:** после confirmed downward scroll ждать, пока nonempty rendered name rows достигают нижней видимой границы того же owner; затем снова exact-name lookup. Полное статическое окно не обязано менять identities. Но `boxOf` возвращает `getBoundingClientRect`, а `scrollOf` вычисляет `scrollHeight-clientHeight`; source не доказывает равенство outer bottom и последней name-cell boundary. Все сохранённые snapshots последней пробы имеют top0/1000/2000 при max14672, наблюдения конечной строки отсутствуют. Не вводить допуск «один пиксель/одна строка» или обход проверки при max_top без доказательства.

## Файлы, callers и размер

- Изменять после снятия gate: `packages/loginom-runtime/client/lib/text-export-output.mjs`; тестировать настоящие `findNativeStorageRow` и `waitForExportStorageObservation` в `client/test/text-export-virtual-storage.test.mjs`.
- Callers, прочитаны, API сохраняется: `readNativeExportFile` в том же файле; `client/lib/artifact-delivery.mjs:readRow`; `tools/loginom-acceptance/text-export-observer-native.mjs`. Последние два передают собственные существующие ready/guards; не подменять их export budget.
- Существующие проверки: `text-export-observation.test.mjs`, `text-export-read-refusal.test.mjs`, `browser-recovery.test.mjs` и delivery tests. Нового harness/fixture adapter нет; тест использует существующие callbacks и фактические snapshot fields.
- Документация: этот план, owning план5, append source report, текущий Linux checkpoint≤20строк. Native harness/runbook используются без изменения assertions.
- Локальная оценка всего slice:6 tracked файлов, около+250/−20 строк вместе с тестами/планом/отчётом/checkpoint; production после gate около+25–40/−5. При>540 changed lines пересмотреть до расширения. Task1 — замена measurement части accepted192-line private driver, ожидается≤240 временных строк всего/≤60 новых; нового tracked harness нет. Если predicate требует существенно больше кода, вернуться к упрощению.
- Исходный Task2 порог770 уже пересечён: scoped lower bound856 changed lines по Task2-only файлам, без Task3 и общих документов. Это остановка и переоценка подхода: исследовательский slice завершён, новые механизмы исключены; будущий ремонт оценивается отдельно, старый перерасход не скрывается. Команда/состав оценки — ignored author note.

### Task 1: Один read-only boundary probe

**Исходник:** ignored `.superpowers/sdd/2026-10-20-browser-recovery-scroll-probe/attempt-4-driver-source.txt`; переиспользовать его accepted preparation/Save/native cleanup/auxiliary OS collector. Private adaptation меняет measurement и одну строку существующего guard: `need(!state.identityBlocked&&!state.uncertain,'READINESS_NOT_ALLOWED')`, убирая только запрет `state.phase==='measurement'`. Это отдельная диагностическая программа, не runtime search и не S5.

- [x] **Step 1 — private подготовка/static preflight.** Новый каталог0700, logs0600, fresh stock stage по параметрам внизу; штатный verifyResources. Временный driver сохраняет каталожный preflight, один authenticated context, own new empty draft/UUID, Save fail и initial modifiedfalse. До live — pinned Node `--check` и source review фактического пути `measurement → ready → guard → logical read → condition`: guard допускает measurement, но запрещает identityBlocked/uncertain; каждый logical read проверяет pinned folder/workflow/document/tab/root/owner/max_top/ожидаемый top и непустые rows до condition, включая промежуточные неготовые выборки. Проверить отсутствие causal250/1000 trial, прямого scrollTop assignment, max jump, gesture retry, recovery/connection restore и runtime edits. Source/catalog/stage identities сохранять в private evidence; raw config не выводить.
- [x] **Step 2 — одна попытка start→end geometry.** Штатной подготовкой accepted driver дойти до Files/account folder/Refresh; ready filegrid при top0, один точный observed root/owner и прежние binding guards. Read-only DOM sample только этого unique observed root и его name-cell/row/container: `getBoundingClientRect`, `clientHeight`, `clientTop`, `scrollHeight`, `scrollTop`, computed border widths и фактические bounding boxes. Связать DOM owner с выданными root/row.scroll refs через наблюдённый exact tid, принадлежность и before/after identity, не угадывать selector.
- [ ] **Step 3 — подтверждённые scroll до end.** В том же сеансе максимум `Math.ceil(initial.max_top/1000)` актов, каждый `delta_y=Math.min(1000,max_top-top)`, новый observed eligible anchor. Каждый outcome SUCCEEDED/completed/cleanup_complete и native trace точного from/to/owner; проверки Step1 выполняются до каждого readiness condition. Между актами ждать anchors существующим ready; не повторять жест и не ждать чужую/пустую таблицу. Это отдельный probe bound, runtime12 не меняется. Первый отказ/unknown/изменённый binding — STOP без второй попытки.
- [ ] **Step 3a — terminal passive observation.** После последнего confirmed scroll никаких measurement gestures. Один вызов прежнего `ready` (100 logical reads/100ms) использует тот же bound reader: первая выборка без sleep сохраняется как immediate, остальные — passive. В каждой выборке после UI detail одна read-only DOM evaluation измеряет owner, name cells, их `closest('.x-grid-item')` и общий непосредственный parent этих row containers; возвращает исходные числа и relation, не меняя DOM. Внутри evaluation проверить unique exact observed root, его текущий `state.ids.get(owner) === issuedRootRef === row.scroll.ref` через уже существующую workspace-ui identity map, membership и before/after bindings. Пустота/смена owner или binding — немедленный отказ; новая выдача строк между detail и DOM sample означает неподтверждённую relation, следующую пассивную выборку допускает тот же bound read.

  Terminal condition задаётся до запуска: current name cell — TD, row=`cell.closest('.x-grid-item')`; как в существующем `controlCodeIdentity`, unique exact gridTid=`workflow.prefix+';FileStorageForm;pnlFileStorage;tbl'`, `grid.contains(row)` и `row.contains(cell)`. Pinned owner также содержит row; один name cell на row, строки имеют один непосредственный parent; последняя строка — последняя в DOM-порядке среди этих rows и имеет максимальный bottom. Cell rect находится внутри своей row rect. Все измерения конечны; `scrollTop===initial.max_top`, `scrollHeight-clientHeight===initial.max_top`. Вычислить `contentEndY=ownerRect.top+owner.clientTop-owner.scrollTop+owner.scrollHeight`. Требовать точное `lastRowRect.bottom===rowParentRect.bottom && rowParentRect.bottom===contentEndY`; записать одновременно last name-cell rect и эти три границы. Это непосредственно наблюдаемая связь rendered row→container→scroll content end; одна позиция scroll, anchors, две одинаковые выборки или elapsed time её не заменяют. Не округлять, не добавлять epsilon, не корректировать границы предполагаемыми padding/border.

  Если структура/равенство не подтверждены, сохранять sample и продолжать только оставшиеся passive reads этого ready. При исчерпании обычного ready записать `END_BOUNDARY_UNCONFIRMED`, last/immediate geometry и перейти в existing finally; не считать это end-row proof и не придумывать production predicate. Identity/transport/unknown failures сохраняют собственный код, не маскируются этим исходом. Второго ready budget после terminal timeout нет.
- [x] **Step 4 — сохранить факты и очистку.** Existing finally accepted driver: собственный return tab/graph и saved-state; Save replace только если native modifiedtrue, затем single guarded Close/logout/noDiscard, context.close и прежний auxiliary OS collector. Native/context/OS outcomes раздельны; missing process attribution остаётся OS_NOT_CONFIRMED, не блокирует уже подтверждённую геометрию. Результат Task1 — фактические start/end geometry со всеми bindings либо точный blocker; это не S5 и не полный causal protocol PASS. Сохранить private source audit, убрать временный executable после проверки, append source report и checkpoint≤20строк. Никакого product fix/harness edit/повторной пробы.
- [ ] **Step 5 — конкретный predicate/review.** По фактам подтвердить точную связь outer/client viewport и конечной name-cell boundary; записать одно условие без arbitrary tolerance, сохраняющее static/full-window/short/end. Независимый reviewer утверждает preflight-дополнение до Task2. Если простого условия нет, STOP с ограничением, без новых уровней/эвристик.

Запуск Task1 после review — pinned `resources/bin/node <private-boundary-probe.mjs> --config /home/george/.config/loginom-ai-agent-tests/browser-recovery.json --resources <fresh-resources> --output <new-private-evidence>`, stdout/stderr в0600 файлы. Seed/Group/Export для этой пустой собственной диагностической копии не нужны.

### Task 2: Один RED→GREEN и первый сквозной BR-S5

**Interfaces:** существующие аргументы/возвращаемый snapshot `findNativeStorageRow`, `ready(observe,condition)` и внешние guards сохраняются. Никаких test-only production fields.

- [ ] **Step 1 — RED.** Один тест `export search settles a partial rendered window before another scroll`: реальная функция, после первого confirmed scroll старый nonempty window всё ещё имеет anchors, позже приходит новое окно с target из промежуточного диапазона. Подключить настоящую `waitForExportStorageObservation`; её существующий injected sleep используется только в тесте. Assert exact `wanted.csv`, trace `[1000]`, отсутствие следующего жеста до появления строки. Исходный код должен падать по поведению (не отсутствие поля/ошибка фикстуры).
- [ ] **Step 2 — minimal GREEN.** Реализовать только принятый Step1 predicate в общем reader; сохранить owner/root из уже выполняемого roots read, проверять binding до ready. Не переносить stale/foreign failures в условие ожидания. Повторно искать target после settled observation до нового scroll. Запустить focused тест и получить PASS.
- [ ] **Step 3 — необходимые соседние поведения по одному.** После GREEN проверить alloutside→new window без дополнительного gesture; unchanged full-window/короткий список/конец; binding change и empty до ожидания; guard/неисчезающий transient без нового scroll. Добавлять только отсутствующее покрытие, по одному behavior→проверка→минимальная правка; не писать batch воображаемых тестов. Существующие reset-up/stuck/owner/folder/end/budget/cancel тесты сохраняются. Уже GREEN защитный тест не объявлять RED.
- [ ] **Step 4 — focused проверки, source commit.** Из `packages/loginom-runtime/client` выполнить pinned Node `--test test/text-export-virtual-storage.test.mjs test/text-export-observation.test.mjs test/text-export-read-refusal.test.mjs test/browser-recovery.test.mjs`; `git diff --check`. Source commit `fix(runtime): settle rendered export file windows`, чистые build inputs до stage. RED/GREEN logs вне Git0600. Runtime не имеет typecheck script.
- [ ] **Step 5 — earliest verifiable E2E: один неизменённый BR-S5.** Новый stock `stageResources` с desktop/linux-x64 и product-pinned Node/Chromium в private0700 destination. Проверить штатный `verifyResources`, сохранить фактический source/manifest SHA; одноразовый launcher вне Git, удалить после использования. Выполнить команду ниже. Harness сам создаёт own SaveAs/fresh Group/current UUID; model auth не нужен.

```bash
# CWD: packages/desktop; DISPLAY берётся из действующего окружения.
LOGINOM_AI_AGENT_TEST_CONFIG=/home/george/.config/loginom-ai-agent-tests/browser-recovery.json \
LOGINOM_AI_AGENT_TEST_RESOURCES=<new-private-stock-resources> \
/home/george/.cache/loginom-toolchain/bun-linux-x64/bun \
test/loginom/browser-recovery-acceptance.ts BR-S5 \
/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/saved-A-fresh.json
```

Нужны исходные assertions: completed, verified execution/export_file, current expected bytes/SHA/lineage, first next Dock final Save/modifiedfalse, native exact-own Close/logout/noDiscard, managed ACK/exit0. Config/seed читать программно, не печатать значения/серверный путь. При первом unexpected — фактический FAIL/STOP и один существующий close; без новой попытки, Export, дополнительного Save, cleanup или kill. Context/OS outcomes учитывать отдельно; исторический OS_NOT_CONFIRMED не переписывать.

- [ ] **Step 6 — после первого успешного main path.** Один `bun run test:upstream` из `packages/loginom-runtime` с pinned Node в command-local PATH; релевантные existing delivery tests входят в suite. Повторять только после новой правки/ошибки. Root читает raw/current assertions; независимый scoped spec+quality review — по runtime ownership/readiness риску. Append очищенный source report, обновить owning Task2 только по факту и checkpoint≤20строк. Optional hardening не добавлять; коммит результата отдельно. При блокировке Step5 не расширять тестовую/диагностическую инфраструктуру.

Pinned local tools для Step4–6: Node `/home/george/.cache/loginom-toolchain/loginom-node/node-v24.19.0-linux-x64/bin/node`; Bun указан в команде; browsers `/home/george/.cache/loginom-toolchain/browsers-recovery-1246`. `stageResources` принимает абсолютные `destination,node,browsers`, `target:{platform:"linux",arch:"x64"}`, `flavor:"desktop"`.

## Checkpoint — PAUSED по запросу владельца

- Source пробы: `de0ce2eeac`; одна попытка завершена, новых запусков нет.
- Start geometry/три scroll подтверждены; четвёртый NOT_APPLIED/UI_REFERENCE_OBSCURED/no-effect, endpoint не достигнут.
- Native Close/logout/noDiscard и context close PASS; OS_NOT_CONFIRMED. Исторические ограничения сохранены.
- BLOCKED report/cleanup приняты independent spec+quality review, замечаний0; это не полная Task1/Step5 или S5 acceptance.
- Runtime/harness не менялись; Task2 DESIGN_BLOCKED. Private evidence/source audit и ignored ledger сохранены, temporary executables удалены.
- После возобновления: прочитать Task1 report/review и переоценить самый простой predicate; новая проба или правка требуют конкретной гипотезы и review. Design reassessment прерван при паузе, вывода нет.
