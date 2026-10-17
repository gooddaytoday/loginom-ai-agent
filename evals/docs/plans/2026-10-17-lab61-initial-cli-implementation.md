# LAB-61 Initial Draft Lifecycle Implementation Plan

> Для исполнителя: действует явно заданная владельцем нативная цепочка Evaler→Rich→Evaler→Ben→Evaler. Этот план не создаёт новые Codex subagents или расписания. Отмечать выполненные шаги checkbox; текущий допуск покрывает только Rich offline source этап.

**Goal:** Новый imports.text/new с исходным валидным source/format без columns создаёт и закрывает собственный draft, возвращая известный initial-refusal до настройки/Apply/Execute.
**Architecture:** Сохранить составную node operation и существующие owner-bound target/configure/close guards. Узко разделить допустимый incomplete-initial lifecycle и malformed admission; существующий типизированный отказ с owned close использовать без общего ослабления validators. Публичные tools/signatures и user-v1 isolation сохраняются.
**Tech Stack:** Existing JavaScript ESM runtime client, pinned Node24.19.0, node:test, native fixture replay, Python checker regression offline.
**Spec:** [design](2026-10-17-lab61-initial-cli-design.md), [делегированное решение](../2026-10-17-lab61-initial-cli-correction-authorization.md).

## Global Constraints

- Base exact2e990a84aa25dc37a4e808da564be752aae6f564; сохранить epoch fix. Cases1b93b62c и common7d3a5c — другие пины.
- Прочитать applicable AGENTS.md, docs/node-development/RUNBOOK.md и подплан imports.text перед source work. Чистый изолированный checkout, не переключать занятый checkout и не терять чужие изменения.
- Исходные TASK/input/criteria/Ben expectations неизменны. Никаких добавленных columns, диагностического профиля, generic creator/node.add/raw UI или скрытого live setup.
- Сейчас no build/install/browser/lease/live/model/reference/product. No changes to installed CLI/helper/config/OS. Guard changes требуют независимый exact CLEAN SOURCE review до effects.
- Counts14reference/product0/recovery0/probes0, initial1/3, CSV3/3 и rework3 не менять. Только Evaler обновляет machine state; планы не расход.
- Проверки запускать из packages/loginom-runtime с pinned Node, не из root; если затронут TS, bun typecheck соответствующего пакета.

## Review Focus

- Полный исходный source/format + omitted columns отличается от malformed/missing source/format и columns empty/null: последние сохраняют безопасный admission отказ.
- Потеря owner/graph или неверный upload lineage не разрешают создавать/закрывать чужой target.
- Unknown gesture/transport/expired deadline не дают повторить запрос или расширить первоначальный срок.
- Неподтверждённый close не даёт cleanup=true и не превращается в известный безопасный отказ.
- Complete new и existing patch, включая принятый epoch recovery2e990, сохраняют результат и bounds.

### Task 1: RED для составного initial lifecycle

**Files:** Create client/test/text-import-initial-new-lifecycle.test.mjs внутри packages/loginom-runtime. Read client/test/text-import-node.test.mjs, node-apply.test.mjs и node-apply-runtime.test.mjs для фактических interfaces/fixtures. Read client/lib/text-import-node.mjs и text-import-procedure.mjs.
**Interfaces:** Existing validateTextImportNodeParameters(p,mode,request), createTextImportNodeSupport({targetOrigin,targetBuild}) и реальные node-apply/driver interfaces; не дублировать проверяемую логику в тесте и не использовать globalThis mocks.

- [ ] Написать failing test: точный исходный source/format, проверенная доставка, target=new, columns отсутствуют. Через реальные функции получить один owned create/open, типизированный initial refusal, bound native close; assert no settings setters/Apply/Execute и no injected columns. Проверить связанный journal/lineage и truthful effect/cleanup.
- [ ] Запустить `/home/user/.local/share/loginom-evals-runtime/node-v24.19.0-linux-x64/bin/node --test client/test/text-import-initial-new-lifecycle.test.mjs` на exact2e990. Сохранить ожидаемый RED с исходным request.validate; отсутствие fixture/import — не требуемый RED.
- [ ] Добавить controls для того же запроса в done/execute/close, отдельные negative empty/null и неправильные source/format/upload identity, не вызывающие browser callback. Исходный запрос/fixtures сохранить отдельно от результатов.

### Task 2: Минимальная реализация и GREEN

**Files:** Modify client/lib/text-import-node.mjs: validateTextImportNodeParameters и driver.configureTextImport в createTextImportNodeSupport; при необходимости минимально client/lib/text-import-procedure.mjs: typed initial validation/configuration path. Test новый файл Task1; inspect client/lib/node-api.mjs только если текущие описания контракта требуют синхронизации. Не расширять shared node-procedure/workspace-ui/node-apply без отдельно обоснованной необходимости и exact review.
**Interfaces:** Публичные signatures сохраняются. Incomplete-initial branch не добавляет columns в request, не меняет complete-new и existing-patch routes и использует прежний owner-bound close/typed ImportInitialSettingsError механизм.

- [ ] Реализовать узкое admission для иначе валидного исходного new source/format без columns, сохранив все прочие проверки и запрет произвольного incomplete create.
- [ ] После собственного target/open получить typed initial refusal до настроечных жестов; провести существующий owned close и сохранить доказательства, честный effect/cleanup/unsettled результат.
- [ ] Запустить RED из Task1 на candidate и сохранить GREEN; контроль malformed запросов остаётся до browser/target.
- [ ] Проверить negative owner/graph/intent mismatch, unknown effect/transport, close failure/unconfirmed close, expired deadline: no foreign close/retry/false cleanup/deadline extension. Дополнить реальные fixture tests, не подменяя native live proof.

### Task 3: Regression и точная поставка для Ben

**Files:** client/test/text-import-node.test.mjs, text-import-patch.test.mjs, text-import-format-recovery.test.mjs, node-apply.test.mjs, node-apply-runtime.test.mjs; новый test; только необходимые source/docs изTask2.
**Interfaces:** Existing complete-new, existing patch, typed refusal/close, one-operation journal и immutable source SHA остаются интерфейсом независимой проверки.

- [ ] Выполнить pinned Node `--test` для перечисленных offline tests из packages/loginom-runtime. Отдельно проверить epoch guard/recovery tests от2e990; не запускать native browser tests под видом offline.
- [ ] Выполнить доступные более широкие offline package checks; сохранить все FAIL/SKIP/environment limits, команды/версии/exit codes. Не объявлять suite полностью зелёным, если выполнен только частичный rerun.
- [ ] Проверить diff--check, exact parent2e990, чистоту/отсутствие лишних файлов, отсутствие секретов и installed changes; conventional commit на короткой отдельной ветке, bundle/diff/source manifest.
- [ ] Опубликовать clean candidate и один READY_FOR_BEN либо обоснованный BLOCKED. Доставить RED/GREEN/negative/regression logs, точные source hashes и scope-no-effects. Evaler затем назначает независимый Ben review этого точного SHA; неизвестный patch заранее не принят.

## Последующие закрытые gates

После Ben exact-source ACCEPT отдельно: immutable new version/resources/binary/manifest/config/pins, необходимый OS exact review до effects, немодельный admission с genuine completion→ordinaryRELEASED→healthyFREE. Затем отдельное решение Evaler на initial reference#2 и product10/new version/Luna-high/no-infra-retry. Full Ben10caseACCEPT и accepted common integration нужны доLAB62. Эти этапы текущему Rich offline заданию не назначены.

## Самопроверка плана

Исходный create/refuse/close TASK и отсутствие Apply/Execute покрытыTask1–2; все пять Review Focus покрыты controls/negative tests/Task3 regression. Новых public function names/parameter shapes не задано, используются существующие interfaces. Поставка/версия/границы effects отделены от source этапа; планы не увеличивают расход и не меняют criteria.
