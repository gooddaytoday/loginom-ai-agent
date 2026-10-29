# Browser recovery scroll anchor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task after independent plan review. Steps use checkbox (`- [ ]`) syntax. Root owns review, commits, checkpoints and the single native invocation.

**Goal:** Получить исходный strict BR-S5 PASS, проверив минимальную гипотезу: поиск прекращается раньше, чем существующее ожидание успевает увидеть доступную точку прокрутки либо точный файл.

**Architecture:** Producer `rendered_window_ready` продолжает доказывать покрытие native range. Shared reader дополнительно ждёт уже существующее разрешение `scroll` с `point_observed`, сохраняя поиск точного имени до любого нового scroll. Используется только переданный caller-ом `ready`, без нового поля наблюдения, waiter или actuator.

**Tech Stack:** существующие Node ESM/`node:test`, managed runtime, stock staging; pins и команды — [предыдущий план](2026-10-29-browser-recovery-export-failure-evidence.md).

**Spec:** [дизайн](../specs/2026-10-19-browser-recovery-design.md), [план5/Task2](2026-10-19-browser-recovery-5-acceptance.md), [runbook](../../testing/loginom-ai-agent/browser-recovery.md). Факты — [последний source report](../../testing/loginom-ai-agent/reports/2026-10-20-browser-recovery-source/report.md#2026-10-30--actual-export-failure-evidence-br-s5-fail-branch-b-captured).

## Global Constraints

- До implementation — independent plan GO; задачи строго последовательно. До native — focused checks, clean source commit, source review без mandatory findings, fresh stock stage/verifyResources и independent actual-artifact/invocation preflight.
- BR-S5: строго `completed`, verified execution/export_file, current bytes/SHA/lineage/CSV, первый следующий Dock final Save/`modified:false`, native exact-own Close/logout/noDiscard, managed ACK/exit0. Один authenticated managed browser; unchanged public tools/fault/target/harness/assertions.
- Сохранить12 scroll, delta±1000, export ready100×100ms, guards и outer deadlines. Delivery/observer сохраняют собственные ready bounds. Нет вложенного ready, reset deadline, нового retry жеста, второго browser или расширения лимитов.
- Empty rows, invalid/missing native proof, чужие root/document/workflow/tab/folder/scroll owner отказывают до ожидания. Native binding, action permission, current hit-test и pre-gesture epoch не ослаблять.
- Первая native неожиданность → existing finally/report/STOP. Нет повторного S5/Export/Save/жеста, ручного cleanup/kill или продолжения старых standalone probes. Исторические FAIL/UNKNOWN остаются; full upstream только после strict PASS.

## Наблюдение, гипотеза и предел доказательства

В exact capsule journal620 текущего actual Export `rendered_window_ready:true`,65 name cells, один owner, top2000/max15896;25 outside_viewport,40 point_not_observed,0 allowed scroll/eligible anchors.35 строк имеют exact table owner среди `interaction.covering`,34 — только его. Все65 scroll refs совпадают с observation root. В snapshot viewport1920×961; центральные строки имеют положительные видимые координаты. Следующий exact-current-name lookup пуст, не truncated, document/workflow тот же; revision отличается. Поэтому сбой не объясняется исключительно отсутствием строк или их положением за viewport.

`workspace-ui.mjs:3130` доказывает native store/view/row binding и геометрическое покрытие range; `interactionOf` отдельно проверяет до9 точек ячейки, а `allowed_actions` даёт scroll только при point_observed. `findNativeStorageRow:115` завершает ready по range-only, затем после exact lookup немедленно отказывает при0 anchors. Это первое доказанное несоответствие предположения reader: достаточный native range принят за достаточную готовность следующего поиска/scroll. Producer не обещает доступную точку и сам по себе не ошибочен.

**Одна проверяемая гипотеза:** same-owner range-ready/target-absent/no-anchor — промежуточное наблюдение, которое успеет смениться actionable anchor или обнаруженным точным файлом в уже разрешённом ожидании. Новые чтения могут это проверить без жеста. Временность, CSS/pointer-events и причина hit по owner **не доказаны**; permanent obstruction остаётся возможным. Source test проверяет поведение при заданной последовательности, единственный unchanged S5 проверяет достаточность исправления в actual caller. PASS не доказывает конкретный CSS-механизм; timeout/иной отказ останавливает эту гипотезу без нового механизма.

## Минимальное решение и цена

Сохранить `findNativeStorageRow({name,read,roots,ready,act,guard})` и исходный внешний exact-name lookup/detail перед выбором anchor. В existing logical `table()` использовать прежний selector eligible anchors: exact storage name prefix, scroll metadata, allowed_actions содержит scroll, interaction.state===point_observed.

В начале **каждого** sample сбрасывать один local boolean найденного target. После всех прежних bindings/native-readiness проверок:

1. Range false → вернуть snapshot в прежний ready; дополнительный name lookup не нужен.
2. Range true и eligible anchor есть → вернуть snapshot; normal path и число reads прежние.
3. Range true и anchors нет → guard, существующий `read({discover_roots:true,storage_name:name})`, прежний `bind(r,false)` и exact tid selector; >1 match — прежний ambiguity refusal. Запомнить только наличие одного exact match для **этого** sample; lookup не выдаёт разрешение на scroll.
4. Predicate принимает snapshot только при range true и (eligible anchor либо этот exact match). Возврат ready не заменяет исходный внешний fresh exact lookup/detail и его name/binding validation.

Boolean живёт внутри одного вызова `table()`, не между search steps/callers, и сбрасывается до чтения. Один небольшой local selector anchors допустим, поскольку его используют predicate и конечный выбор gesture; никаких exported helpers/новой структуры snapshot. Свежий внешний lookup нужен и после дополнительного: target может исчезнуть между чтениями; тогда сохраняется существующая ветка B с её exact table/lookup/error payload, без жеста.

Стоимость: normal path0 новых reads; каждый range-ready/no-anchor sample добавляет1 exact-name discovery. Если он нашёл target, последующий исходный lookup означает1 дополнительное чтение на этом успешном переходе. Перенос всего lookup в sampler экономил бы это чтение, но добавлял бы передачу pair/table+lookup и менял нормальный путь без необходимости. Лимиты samples/deadline не увеличиваются.

**Изменение отказа явно:** устойчивый valid range/no-anchor/absent-target теперь исчерпывает существующий caller readiness timeout вместо немедленного branch-B no_scroll_owner. Использовать существующий timeout/error/cleanup путь, не преобразовывать его новым catch и не обещать exact failure capsule для timeout. Ранние invalid no_scroll_owner, реальный поздний branch B, folder_end и их diagnostic retention остаются. Public schema/codes не расширяются.

Existing `waitArtifactDiscoveryReady` проверяет grid hit/loading и может признать эту же ситуацию ready; он не доказывает hit ячейки. Его использование переносит другой owner/API и не решает предположение reader. Existing `tableScrollers` относится к native Views/BufferedStore, а artifact discovery имеет отдельный direct-grid actuator/бюджеты/refresh: их не переносить. Root-hit в covering не разрешает новый root gesture. Достаточен нынешний ready и прежний action admission.

Оценка всего slice:7 tracked файлов, около+280/−35 строк, включая production1(~+25/−5), tests2(~+80/−25), этот план и3 owning docs. Private design report дополнительно до45 строк. Считать фактический `git diff --stat` вместе с tests/docs; при>630 changed lines пересмотреть до продолжения. Новых подсистем, полей API, dependencies, hooks и persistence0. Единственная новая механика — дополнительное условие существующего ожидания и conditional read, необходимые для hypothesis; отдельный cooldown/telemetry не нужны.

## Review Focus

1. Range уже true, точки ещё нет: новый scroll не выдаётся; read-only settlement даёт fresh anchor (Task1 Step1).
2. Exact target вне compact table elements появляется во время ожидания: существующий name discovery освобождает ожидание, без требования scroll anchor (Step3).
3. Target исчезает между inner/outer lookup: original branch B удерживает exact observations, не кликает старую ссылку (Step3).
4. Постоянное перекрытие, cancel, foreign owner: существующие bounds/guards и refusal; никаких новых жестов (Step3).
5. Actual Export восстановление/lease/diagnostic failure и соседний delivery сохраняют свои контракты; no extra normal-path reads (Steps3–4).

### Task 1: Уточнить existing readiness в shared reader

**Files:** Modify `packages/loginom-runtime/client/lib/text-export-output.mjs`; Test `packages/loginom-runtime/client/test/text-export-virtual-storage.test.mjs`, `packages/loginom-runtime/client/test/text-export-read-refusal.test.mjs`. Producer/workspace-ui, artifact-delivery, observer, harness и journal не менять.

**Interfaces:** прежние shared-reader signature/ready(observe,condition)→snapshot. Реальные callers: actual `readNativeExportFile` (`executor.mjs:2255`), delivery `readRow` (`artifact-delivery.mjs:119`), native observer (`tools/loginom-acceptance/text-export-observer-native.mjs:100`). Последний не запускать; production caller callbacks сохраняются.

- [x] **Step1 — один behavioral RED.** В existing virtual-storage fixture после первого1000px scroll вернуть range-ready:true, same owner, target absent, name rows outside_viewport/point_not_observed с covering exact table owner, без allowed scroll. Existing injected sleep публикует свежий eligible anchor при неизменном scrollTop, target появляется после следующего штатного scroll. Настоящие findNativeStorageRow+waitForExportStorageObservation должны вернуть exact target с trace `[1000,1000]` и одним sleep100; ни один act не использует blocked snapshot. Старый reader падает no_scroll_owner до sleep — сохранить RED. Не имитировать неизвестный CSS и не копировать private labels/paths в fixture.
- [x] **Step2 — минимальный GREEN.** Реализовать только описанный conditional lookup/predicate/local boolean. Существующий outer lookup и action selection сохранить; один reused local anchors selector вместо расхождения критериев. Повторить только Step1 test, получить PASS.
- [x] **Step3 — по одному достижимому поведению.** Сначала test: во время same-owner no-anchor ожидания exact target появляется только в name discovery, не table elements; target возвращён без следующего scroll. Затем permanent no-anchor/absent-target: existing injected sleep не меняет sample, ровно100 sleeps×100ms и existing timeout без act; отдельно cancellation/owner change отказывают до следующего жеста. Существующие range-false/invalid binding/end/budget tests переиспользовать. После каждого нового test — отдельный запуск/минимальная необходимая правка.
  Затем actual Export fixture: range-ready blocked sample → следующий read actionable; existing read/download/restoration путь проходит, blocked row не используется для act. Только late diagnostic tests адаптировать к достижимой гонке: conditional lookup видит target, внешний lookup уже пуст; retain exact table/outer lookup, прежний no_scroll_owner/public refusal, redaction/private journal, quiet graph/release1/download0. Early missing-row/scroll и callback throw/wrong ACK tests не менять. Старые assertions про немедленный no-anchor отказ заменить именно проверкой нового bounded-wait поведения, не удалять защиту. Не добавлять test-only production injection, global timers или новую Page fixture.
- [x] **Step4 — focused checks/source review.** Из `packages/loginom-runtime/client` pinned Node `--test test/text-export-virtual-storage.test.mjs test/text-export-observation.test.mjs test/text-export-read-refusal.test.mjs test/artifact-delivery.test.mjs test/browser-recovery.test.mjs`; до него новые tests запускать через `--test-name-pattern`. Проверить `git diff --check`/stat и отсутствие других production changes. Typecheck script у runtime отсутствует. Root делает clean source candidate commit и independent focused spec/quality review; устранить mandatory comments до Task2. Existing producer561/diagnostic183 проверки без изменений ради отчёта не повторять.

Task1 завершён только source GREEN+approved review; он не означает causal fix или S5 PASS. Любая необходимость второго waiter, нового action admission, API либо изменения гарантий → STOP/replan/review, не расширять этот diff.

### Task 2: Единственная unchanged managed BR-S5

**Files:** existing stock staging и `packages/desktop/test/loginom/browser-recovery-acceptance.ts` без правок. Root обновляет этот план, current master checkpoint≤20строк, BR-S5 status плана5 и append существующего source report.

**Interfaces:** Task1 clean source/review → новый private stock desktop/linux-x64 stage; исходные S5 assertions/managed cleanup.

- [ ] **Step1 — stock stage/preflight.** Выполнить штатные stageResources/verifyResources с product pins; проверить actual source/resource byte equality и source/manifest identity, приватную конфигурацию без вывода значений. Independent preflight проверяет фактический unchanged invocation и own fresh SaveAs/Group/UUID. Старым артефактам не присваивать новую identity.
- [ ] **Step2 — первый E2E.** Ровно одна BR-S5 по команде [storage-settle Step6](2026-10-29-browser-recovery-storage-settle.md) из `packages/desktop`, подставить только новые private resources. Исходный strict результат из Global Constraints обязателен. Первый unexpected → existing finally, фактический report, STOP; никаких probes/повторов/ручного cleanup. Existing journal позволяет установить достигнутый этап; отсутствие нужных фактов честно UNKNOWN.
- [ ] **Step3 — проверить исход и закончить.** Root сверяет current file/bytes/SHA/lineage/CSV, первый следующий Dock Save/modifiedfalse, exact native cleanup отдельно от context/OS и managed ACK/exit. Только при strict PASS — один `bun run test:upstream` из `packages/loginom-runtime` с pinned Node в command-local PATH; затем независимое review нового scope/результата и owning docs. При FAIL/BLOCKED source остаётся candidate, гипотеза live не подтверждена; не добавлять hardening или следующий механизм. Original release/models/installed acceptance, deferred cross-platform mode assertion и merge/release — вне этого slice.

## Checkpoint — Task1 COMPLETE / Task2 pending

- Task1 source `c3ab0f5172`: conditional existing wait/точный name lookup;3файла84+/25−, production20 changed lines. Normal reads/bounds/permissions сохранены.
- Meaningful RED→GREEN и focused231/231PASS/0warnings; actual Export success и late-B refusal/journal/cleanup fixtures проходят.
- Independent source spec/quality Approved, mandatory0/optional0. Source approval не доказывает transient CSS-причину или S5 PASS.
- Следующий шаг — Task2 fresh stock stage/verify и actual-artifact/invocation preflight; одна unchangedS5 только после решения root.
- Исходный native S5 FAIL/cleanup BLOCKED/OS unknown остаются; новых native запусков/повторов не было.
