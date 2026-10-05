# Инструкция: завершить переработку подпланов узлов

Временный документ передачи работы. Удалить отдельным коммитом перед слиянием PR [#34](https://github.com/gooddaytoday/loginom-ai-agent/pull/34).

## 1. Цель

В ветке `node-coverage-plans` привести подпланы всех узлов к [шаблону](templates/node-plan.md) для Multica и подготовить PR #34 (`node-coverage-plans` → `loginom`) к слиянию. Слияние выполняет владелец отдельной командой: PR не мёржить.

Решения владельца, которые не пересматриваются:

- все 62 черновика новых узлов переписываются по шаблону в этом PR;
- для 14 реализованных узлов переписывается только подплан с этапом 0 «перепроверка»; приёмочный комплект (`acceptance/`) собирает будущая карточка Multica, не этот PR;
- CI (Windows/macOS) не чинить — он красный по причинам вне ветки (не перенесены `a771f3f11` и `4319e180f`);
- `history/` и `provenance.json` остаются архивом, не трогать;
- вся документация — на русском; код и имена — на английском.

## 2. Текущее состояние

Ветка `node-coverage-plans`, локально 3 коммита сверх `origin/node-coverage-plans` (`9ce5bdf1e`):

| Коммит | Содержание |
|---|---|
| `9632c8ea9` | RUNBOOK вобрал правила из `workflow/{orchestrator,shared-memory,single-node,lifecycle}.md` (удалены); из README убран прежний процесс Paperclip; отчёты 2026-09-24 и старые записи `validation.md` перенесены в `history/legacy-orchestration/` |
| `92394ed8f` | В шаблон добавлен блок «Вариант для реализованного узла»; пилоты: [Калькулятор](nodes/calculator/plan.md) (реализованный) и [ARIMAX](nodes/datamining-arimax/plan.md) (новый); образец [Скользящее окно](nodes/transform-slidingwindow/plan.md) обновлён на базу `dada8010e`; карточка Кросс-таблицы отражает слияние PR #33 |
| `031ffb1e4` | `tools/validate.py`: проверка строки `Статус:` и разделов `## 0.`…`## 6.` в каждом `plan.md`, запрет упоминать прежний процесс (Hermes, Paperclip) как действующий; `registry.json`: новый `next_action` у 77 узлов; `inventory.md` перегенерирован |

Готовы по шаблону: `calculator`, `datamining-arimax`, `transform-slidingwindow`, `transform-crosstable`. Осталось 74 подплана (13 реализованных + 61 новый).

`validate.py` сейчас падает намеренно: 592 ошибки `plan without section N <slug>` и 13 ошибок `legacy process as current` в карточках реализованных узлов. После переписывания всех узлов ошибок быть не должно.

Попытка распараллелить работу на 9 субагентов дважды остановлена владельцем до первых правок; файлов узлов они не меняли.

## 3. Правила безопасности

1. Перед началом и перед каждой записью: `git -C /Users/kartamyshev/Git/loginom-ai-agent branch --show-current` должен вывести `node-coverage-plans`. Иначе — остановиться и сообщить владельцу. Владелец однажды случайно переключил ветку на `loginom` во время работы.
2. Признак чужой ветки: `nodes/calculator/plan.md` не начинается со строки `Статус: \`reverification_required\``, а `nodes/datamining-arimax/plan.md` выглядит как «черновик требований».
3. Субагентам запрещены git-команды записи (`add`, `commit`, `checkout`, `switch`, `stash`) и `validate.py --render`; коммитит только основной агент.
4. Каждый субагент правит только свои каталоги `docs/node-development/nodes/<slug>/`.
5. Не печатать и не коммитить секреты; `.env` в корне репозитория (Multica) — gitignored.
6. Не трогать `transform-crosstable`, `transform-slidingwindow`, `calculator`, `datamining-arimax`, `history/`, `provenance.json`.

## 4. Обязательное чтение перед работой

- [templates/node-plan.md](templates/node-plan.md) — целиком, включая блок «Вариант для реализованного узла».
- Пилот реализованного узла: [calculator/plan.md](nodes/calculator/plan.md) и [calculator/README.md](nodes/calculator/README.md).
- Пилот нового узла: [datamining-arimax/plan.md](nodes/datamining-arimax/plan.md) и [datamining-arimax/README.md](nodes/datamining-arimax/README.md).
- Образец до этапа 0: [transform-slidingwindow/plan.md](nodes/transform-slidingwindow/plan.md).
- Пример после приёмки, общие изменения W1–W3 и разбиение на этапы: [transform-crosstable/plan.md](nodes/transform-crosstable/plan.md).
- [RUNBOOK](RUNBOOK.md), [порядок создания подплана](workflow/new-node-plan.md), [CLI-приёмка](workflow/acceptance-cli.md).

## 5. Проверенные факты базы

Ссылаться на базу `loginom@dada8010e` (вершина `loginom` после PR #33). Источники:

| Источник | Где | Ревизия |
|---|---|---|
| Справка Loginom 7.4 | `~/Git/loginom-help/data/...`; цитировать `loginom-help@353e506b:data/<путь>` и URL `https://help.loginom.ru/userguide/...` | `353e506b` |
| E2E | `~/Git/e2e-tests/tests/acceptance`, `tests/toreview`, `testdata/`; селекторы вида `WizrdMCF;...`, метки — `bg/labels.ts` | `486caef44` |
| Runtime | `packages/loginom-runtime/client/lib/` | `dada8010e` |

Runtime:

- 15 типов в `client/lib/node-contracts.mjs:8-22` (последняя колонка — путь справки), диспетчер `client/lib/node-support.mjs:27-41`.
- Только табличные узлы. Несколько табличных выходов — только у Фильтра строк (`read.ports=[0,1]`). Два входа — Слияние и Объединение. Локальные управляющие переменные — только у Кросс-таблицы (`node-api.mjs`: `local_variables`, `bindings`).
- Нет: обучаемых узлов (train/retrain), чтения выходного порта переменных, портов деревьев, внешних подключений (БД, Kafka, хранилище, REST/SOAP, 1С), выполнения кода (Python, JavaScript, команды ОС). Файловые артефакты — только у текстового экспорта (`output.file_artifacts`).
- Общая табличная оболочка — `createTabularTransformNodeSupport` (`client/lib/calculator-node.mjs:38`); строгое выравнивание схемы — `alignReadSchema` (`client/lib/node-read-contract.mjs:78`).
- Вложения больше 1 KiB поддерживаются (W2 Кросс-таблицы в базе).

Cold-check (`scripts/node-acceptance/`):

- порядок, имена, метки и типы колонок сверяются позиционно, строки — без учёта порядка; до 100 строк на выход, до 32 выходов (`expected-outputs.mjs:14,29-39`);
- числа сравниваются точно (`cold-check.mjs:232`, `requireExactNumbers: true`) — для статистических и вещественных выходов нужно общее изменение «допуск, объявленный в `expected.json` до прогона» (в ARIMAX это W2) либо точно представимые данные;
- каждый ожидаемый выход однозначно сопоставляется узлу по типу и метке (`COLD_OUTPUT_NOT_UNIQUELY_MATCHED`, `expected-outputs.mjs:72-81`).

Реализованные узлы:

- причина перепроверки: Кросс-таблица изменила общую оболочку (`calculator-node.mjs`, `node-read-*`, `workspace-ui.mjs`, `node-procedure.mjs`, `collapse-native-{output,source}.mjs`), а CLI-регрессии 14 старых узлов не было — только unit-тесты;
- прежний oracle: `packages/loginom-runtime/tools/loginom-acceptance/<prefix>_*.py` (ожидания — `*_goal_contract.py` или аналог; входы — `tools/loginom-acceptance/fixtures/`), транспорт Hermes к CLI не адаптирован;
- префиксы модулей: field-parameters → `reform-*`, row-filter → `filter-*`, collapse-columns → `collapse-*`, text-import → `text-import-*`/`import-*`, missing-values → `missing-values-*`, text-export → `text-export-*`;
- история: `services/loginom-ai/docs/plans/loginom-dock/NN-*.md`, `NN-completion-audit.md` или `services/loginom-ai/docs/loginom-dock/nodeNN-branch-acceptance-*.json`; номер NN — `legacy_subplan` в реестре. PASS истории не переносится.

## 6. Что писать в каждом узле

### 6.1 `plan.md` реализованного узла

Образец — Калькулятор.

1. Шапка: `Статус: \`reverification_required\`. Редакция 1 от <дата>, автор — переработка подпланов в ветке \`node-coverage-plans\`.`; Component ID, slug; runtime type и режимы «закреплены»; база `loginom@dada8010e`; Loginom 7.4.2; Linux x64; строка со ссылками на шаблон, RUNBOOK, CLI-приёмку, карточку, реестр.
2. `## 0. Как выполняется назначение` — карточка с `Объём — этап 0 подплана (перепроверка).`; разрешено/не разрешено (общая оболочка и `cold-check.mjs` — без решения владельца); таблица параметров; стоп-условия (дефект в общей оболочке; нужен режим вне принятого объёма).
3. `## 1. Цель и проверенная основа` — принятый объём из реестра (`initial_scope`, `limitations`); таблица источников: runtime (строки `node-contracts`/`node-support`, модули, лимиты параметров), общая оболочка, реестр (readiness, Desktop-случаи), справка, E2E, история, прежний oracle.
4. `## 2. Этапы` — этап 0 по шаблону (комплект из прежнего oracle → адресные тесты `client/test/<prefix>-*.test.mjs` (указать число) и весь `client/test` → CLI и cold-check → живая сверка при расхождении → исправление в принятом объёме); «Этап 1 и далее» — список «Непокрытые режимы Help 7.4» из текущего подплана.
5. `## 3. Данные и независимые проверки` — комплект `acceptance/` из прежнего контракта: файл данных (колонки, разделитель, NULL-маркер, число строк, размер), таблица ожиданий, правила oracle, ограничения cold-check. Для текстового экспорта проверить, поддерживает ли cold-check файловые выходы; если нет — это ограничение этапа 0.
6. `## 4. Проверки, приёмка и завершение` — адресная матрица (контракт, режимы, NULL, изменение существующего, persistence, recovery, регрессия) и задание модели на бизнес-языке без имён инструментов и чисел.
7. `## 5. Ловушки — переподтвердить, не копировать` — наблюдения из completion audit и прежнего подплана.
8. `## 6. Точка продолжения` — подтверждено / Генератор / Исполнитель / Ловец / следующая карточка.

Сохранить содержание прежнего подплана: матрица fixtures и oracle → разделы 3–4, негативные случаи → 4–5, непокрытые режимы → этап 1 и далее. Длина — около 100–160 строк.

### 6.2 `plan.md` нового узла

Образец — ARIMAX.

1. Шапка: `Статус: \`discovery_required\`...`; runtime type и режим — «предложение до конца этапа 0» (формат `<категория>.<snake_name>` / `<режим>`).
2. Раздел 0: если узлу нужна отсутствующая возможность runtime (раздел 5), это общее изменение W1…Wn; первая карточка — этап 0 отдельно, этап 1 — после решения владельца по W; стоп-условие «нет решения владельца по Wn». Для узлов с внешней средой (`conditional_reserve`: exports-tableau, imports-onecrequest, integration-execcmd; а также БД, Kafka, хранилище, REST/SOAP, 1С, Python, команды ОС) в строке «Внешняя среда» указать точную среду и стоп-условие «среда недоступна».
3. Раздел 1: согласованные решения (что делает узел, что в этапе 1, что позже и почему); таблица источников с пометками «Наблюдено в коде / Документировано / гипотеза».
4. Раздел 2: этап 0 с конкретным пронумерованным списком наблюдений для этого узла (палитра, заголовок мастера, порты, умолчания, границы, имена/метки/типы выходов, момент появления схемы, смена источника, отказы); этап 1 — самостоятельный срез (scope, файлы `client/lib/<node>-*.mjs`, ближайший обработчик-образец, общие изменения, видимость для модели, тесты); этапы 2+ — отдельные карточки.
5. Раздел 3: комплект `acceptance/` (`task.md`, `data/<файл>.csv` с явными колонками и значениями или правилом генерации, `expected.json` из `oracle.py`), таблица fixtures, правила oracle, ограничения cold-check.
6. Разделы 4–6 — как у ARIMAX.

Каждая строка требований (`<slug>:r01`…) текущего черновика должна попасть в этап 1 или в последующие этапы; предложенные проверки — в разделы 3–4; заметки черновика и узловые отказы — в разделы 2 и 5. Старую таблицу «Требования справки» целиком не сохранять. Длина — около 110–180 строк.

Для обучаемых узлов (datamining-*) использовать те же W1 (обучение и переобучение) и W2 (допуск вещественных выходов), что в ARIMAX. Для недетерминированных алгоритмов (нейросети, инициализация k-means, случайное сэмплирование и разбиение) — фиксированный seed или проверка детерминированности на этапе 0. Для деревьев (trees-*) порты деревьев — общее изменение. Для управляющих узлов (control-*) — вложенные сценарии и порты переменных. Для программирования — пересечение с JavaScript-режимом Калькулятора и требование Python на сервере Loginom. Для REST/SOAP — контролируемый тестовый сервис.

### 6.3 `README.md` (карточка)

Короткая карточка, как у Калькулятора (реализованный) или ARIMAX (новый): заголовок, ID, slug, номер истории, ссылки на подплан и реестр; «Состояние» (что следующей карточкой, какие W ждут решения); «Принятый объём» или «Планируемый объём по этапам»; «Ограничения» (для реализованных); «Источники».

### 6.4 Требования валидатора

- строка, начинающаяся с `Статус: `, и заголовки ровно `## 0. …` … `## 6. …`;
- строка с «Hermes» или «Paperclip» обязана содержать «истор» или «прежн»;
- нет ссылок на удалённые `workflow/single-node.md`, `lifecycle.md`, `orchestrator.md`, `shared-memory.md`;
- все относительные ссылки разрешаются (каталог узла — `docs/node-development/nodes/<slug>/`, корень репозитория — `../../../../`).

## 7. Пакеты работы

Пакеты не пересекаются по файлам; их можно выполнять по одному или параллельно субагентами (раздел 8).

| Пакет | Узлы | Тип |
|---|---|---|
| A | text-import, field-parameters, row-filter, grouping, sorting, join | реализованные |
| B | union, replacement, duplicates, date-time, missing-values, collapse-columns, text-export | реализованные |
| C | control-condition, control-execnode, control-loop, control-referencenode, control-supernode, variables-calculator, variables-coluniondatavar, variables-datatovar, variables-replace, variables-vartodata | новые |
| D | datamining-assnrules, datamining-clope, datamining-clustering, datamining-emclust, datamining-linregression, datamining-logregression, datamining-neuralnetclass, datamining-neuralnetreg, datamining-sonn | новые, обучаемые |
| E | exports-database, exports-excel, exports-kafka, exports-lgd, exports-tableau, exports-warehouse, exports-xml | новые; образец — текстовый экспорт |
| F | imports-database, imports-excel, imports-kafka, imports-lgd, imports-onecrequest, imports-warehouse, imports-xml | новые; образец — текстовый импорт и доставка вложений (`artifact_id`, `upload_operation_id`) |
| G | integration-datatoxml, integration-execcmd, integration-extractxml, integration-restrequest, integration-soaprequest, integration-sqlscript, programming-javascript, programming-python | новые, внешняя среда |
| H | preprocessing-binning, preprocessing-coarseclasses, preprocessing-datapartition, preprocessing-elimoutlier, preprocessing-sampling, preprocessing-smoothing, research-autocorrelation, research-corranalysis, research-factoranalysis, research-quality | новые, статистика |
| I | transform-coluniondata, transform-enrichdata, transform-ungroupdata, trees-calculatortree, trees-datatotree, trees-joindatatree, trees-jsontotree, trees-treetodata, trees-treetojson, trees-uniontree | новые; деревья |

Сбор фактов по узлу:

```sh
cd /Users/kartamyshev/Git/loginom-ai-agent
python3 -c "import json;n=[x for x in json.load(open('docs/node-development/registry.json'))['nodes'] if x['slug']=='<slug>'][0];print(json.dumps(n,ensure_ascii=False,indent=1))"
rg -n "<type или имя>" packages/loginom-runtime/client/lib/node-contracts.mjs packages/loginom-runtime/client/lib/node-support.mjs
ls packages/loginom-runtime/client/lib | rg '^<prefix>-'; ls packages/loginom-runtime/client/test | rg '^<prefix>-'
ls packages/loginom-runtime/tools/loginom-acceptance | rg '^<prefix>'
rg -il "<англ. имя>|<рус. имя>" ~/Git/e2e-tests/tests ~/Git/e2e-tests/bg/labels.ts
ls ~/Git/loginom-help/data/processors/<раздел>/
```

## 8. Порядок выполнения

1. Проверить ветку (раздел 3) и чистоту рабочей копии: `git status --short` пуст.
2. Прочитать раздел 4.
3. Для каждого пакета (или параллельно субагентами):
   - переписать `plan.md` и `README.md` каждого узла по разделу 6;
   - `python3 docs/node-development/tools/validate.py` и исправить все ошибки, где упоминаются slug пакета;
   - выборочно перечитать 2 подплана пакета: шапка, разделы 0–6, факты со ссылками на строки кода существуют (`sed -n '<строки>p' <файл>`), нет выдуманных наблюдений стенда;
   - коммит пакета: `git add docs/node-development/nodes/<slugs...>` и `git commit -m "docs(node-development): rewrite <группа> subplans on the template"`.
4. Если используются субагенты — каждому дать: путь к этому файлу, букву пакета, запрет git-записи и `--render`, требование вернуть по строке на узел (число строк, предложенный runtime type, W, неподтверждённые факты). Субагенты в фоне; не переключать ветку, пока они работают.
5. После всех пакетов:
   - `python3 docs/node-development/tools/validate.py --render`, затем `python3 docs/node-development/tools/validate.py` — `PASS`, `errors: []`;
   - `rg -n "Hermes|Paperclip" docs/node-development --glob '!history/**'` — только исторические упоминания;
   - `git diff --check`.
6. Обновить [validation.md](validation.md): запись от текущей даты — все подпланы по шаблону, реализованные узлы со статусом `reverification_required`, новые — `discovery_required`; что проверено (`validate.py`), что не проверялось (runtime, UI, E2E, модельные прогоны); готовность реестра не менялась. Обновить строку «62 остальных новых подплана — черновики…».
7. Удалить этот файл отдельным коммитом: `git rm docs/node-development/rework-instructions.md`.
8. Влить свежий `loginom`, если он ушёл вперёд: `git fetch origin && git merge origin/loginom`; конфликт `inventory.md` снимается `validate.py --render`.
9. `git push origin node-coverage-plans`.
10. Обновить описание PR #34 (`gh pr edit 34 --body ...`): что переписано (процесс, шаблон, 78 подпланов и карточек, валидатор, реестр), что проверено (только документация, без живых прогонов), что CI красный по причинам вне ветки. Не мёржить.
11. Отчёт владельцу на русском: итог, список коммитов, узлы с общими изменениями W, неподтверждённые факты.

## 9. Ловушки

- Не переносить PASS истории на текущий клиент и не повышать готовность в реестре.
- Не выдумывать наблюдения стенда: всё, что не видно в коде, справке или E2E, — «гипотеза» и пункт этапа 0.
- Номера строк кода проверять на `dada8010e`: после Кросс-таблицы многие сдвинулись (например, `cold-check.mjs` и `node-read-contract.mjs`).
- E2E с меткой `:toreview` и `fixture.skip` — не приёмка; LGD-импорт в E2E агент не поддерживает.
- Задание модели — только бизнес-язык: без имён инструментов, enum, ожидаемых чисел и сведений об oracle.
- Не менять `plan_status` и слои готовности в `registry.json`.
