# Охват и оценка внедрения

Живые наблюдения — [discovery](discovery.md). Оценка условна до утверждения
[контракта](contract-proposal.md). Существующий общий W1 не повторяется.
Пути client/lib ниже относительно `packages/loginom-runtime`.
Новые модули, диспетчеры или изменения `packages/agent` не нужны.

## Что действительно общее

Связь с variables/control input, owner/port guards, mapping, lifecycle,
receipts, Execute и Save уже общие. Они не требуют своей копии для каждого
узла. Новый общий writer/readback может обслуживать только **объявленные**
поля с доказанным жестом; никаких новых полей всех 49 типов «бесплатно» нет.
После регистрации поля узлу не нужна копия SwitchButton/picker процедуры.
Наличие такой регистрации и успешного reader обязательно даже для boolean.

| Типы / группа | Общий код без новой копии в узле | Узловая регистрация / адаптер |
|---|---|---|
| `transform.filter_data` | W1 link, variable lookup и lifecycle | `/groups/i/j/value`, row ID и scalar оператор; адаптер к уже работающему `{kind:variable,name}`. Сохранить старый operand API |
| `imports.text` | Тот же жест, subtype 3 из W1 | `/settings/source/source_path`, существующая admission/provenance при каждом новом пути, независимый variable readback; не переписывать source как literal |
| `datamining.clustering` | Жест integer | Существующий `/clusters`, 2…1000, manual K, dependency от auto=false; нормализацию не менять |
| `transform.group_data` | Жест boolean | Новый literal `/sort_result` в parameter_schema и binding к pedSortResult, сохранение ролей/агрегатов |
| `transform.sorting` | Жест boolean | `/compare_with_locale`; native owner SortingColumnCollection, прежние keys и сравнение |
| Остальные 20 строк старой матрицы с наблюдёнными switch: `datamining.lin_regression`, `transform.reform_columns`, `transform.join_data`, `transform.union_data`, `preprocessing.data_recovery`, `transform.collapse_columns`, `exports.text`, `datamining.log_regression`, `exports.excel`, `imports.excel`, `integration.rest_request`, `preprocessing.binning`, `preprocessing.data_partition`, `preprocessing.elim_outlier`, `preprocessing.sampling`, `preprocessing.smoothing`, `research.auto_correlation`, `transform.cross_table`, `transform.sliding_window`, `trees.from_json` | Возможные пользователи общего writer после собственного подтверждения | Каждое поле: TID/owner/codec/условия режима; строки таблиц требуют row adapter. CrossTable local bindings сохраняют свой scope. REST query не становится variable binding |
| Остальные 7 строк матрицы: `transform.calculator`, `transform.replace_columns`, `research.duplicates`, `transform.date_time`, `programming.javascript`, `research.corr_analysis`, `trees.to_table` | Только существующие W1/lifecycle там, где порт наблюдён | Общие parameter bindings пока не обещаны. Var.* и InputVariables — отдельные потребители, не замена управления настройкой |
| `imports.lgd`, `exports.lgd` | Кандидаты на reuse проверенного жеста | Уже есть узловые bindings и файловые guards. Только совместимый адаптер с regression существующих API; не повод переписать их в этом этапе |
| Остальные 15 зарегистрированных типов: `variables.user`, `variables.calculator`, `variables.replace`, `variables.column_union`, `variables.from_table`, `variables.to_table`, `research.quality`, `research.factor_analysis`, `preprocessing.coarse_classes`, `datamining.assn_rules`, `trees.from_table`, `trees.to_json`, `transform.enrich_data`, `transform.ungroup_data`, `transform.col_union_data` | Имеющийся общий lifecycle, наблюдённые W1 ports | В старой матрице этих полей нет; отдельное адресное наблюдение до регистрации. Builtin variables.user вообще existing-only, не универсальный wizard |

5 + 20 + 7 + 2 + 15 = 49 зарегистрированных типов. Это классификация исходников
и старой матрицы, не результаты живой приёмки всех 49 обработчиков.
Для Variant-входа Калькулятора/Группировки/Сортировки нужна собственная проверка
правил узла. Общий typed reader нельзя считать признанием всех функций над V.

## Места изменений и объём

Добавленные/изменённые строки с адресными тестами — порядок величины, не обещание
диффа. Нельзя начать реализацию на основании этой оценки без решения владельца.

| Существующие файлы | Изменение | Строки |
|---|---|---:|
| `client/lib/node-api.mjs`, `node-contracts.mjs`, `.d.ts`, `user-workflow.mjs` | Optional envelope, строгая валидация конфликтов, describe binding_schema | 90–150 |
| `workspace-ui.mjs`, `node-procedure.mjs` | Owned variable-mode/picker observation, общий жест и отдельный readback после Done; существующий journal | 170–260 |
| `node-apply.mjs`, `node-support.mjs`, `node-result-schema.mjs`, `user-results.mjs` | Routing только объявленных полей, inventory в ответе, сохранить proof при сжатии | 70–120 |
| `variable-port-mapping.mjs`, `node-target-browser.mjs`, `crosstable-variables.mjs` | Reuse без копии W1; точные type/kind/ConnectedRecord проверки, если отсутствуют | 0–50 |
| Существующие `filter-*`, `text-import-*`, `clustering-*`, `grouping-*`, `sorting-*` | Пять деклараций, row/conditional adapters и readback bound mode вместо скрытого literal | 120–210 |
| `scripts/node-acceptance/{cold-check,expected-outputs,run-check}.…` | После утверждения: existing cold audit для bindings и две задачи, без нового runner | 100–170 |
| `client/test/…`, существующие acceptance tests, product references | Отказы, сохранение старых контрактов, budget и cold regression | 200–320 |
| **Bindings, пять полей всего** | Включая проверки/короткую справку | **750–1280** |
| `node-procedure.mjs`, `node-port-output.mjs`, адресные readers/tests трёх узлов | Условное расширение W2 typed Variant + schema acceptance после наблюдения | **+130–240** |

Если общий writer нельзя встроить безопасно в существующий lifecycle, это
предмет решения владельца, а не разрешение на рефакторинг или новый framework.
В частности default-producing ветки обработчика не должны перезаписать bound
поле literal до того, как общий writer будет вызван.

## Циклы после полного этапа 0

Один цикл = один ready PR с одной проверяемой правкой, red→green,
обязательные проверки и бизнес-прогон на точном SHA. Два узла не означают
два независимых implementation одновременно; порядок ниже даёт работающий срез.

| Цикл | Правка и проверяемый результат |
|---|---|
| 1 | Общий envelope/жест/readback + адаптер scalar Фильтра; две фазы Limit, прежний API и cold |
| 2 | Файловая subtype 3 регистрация Import Text, два verified файла, source-only update и cold |
| 3 | Boolean регистрация Grouping sort_result и Sorting locale; unchanged keys/roles, Save/reopen |
| 4 | Integer регистрация K, conditional/range отказы, обучающий сценарий без изменения normalizing/training contracts |
| 5 | Общий exact Variant output/cold для трёх типов после адресной W2 проверки; принятие входа уже наблюдено |

Ориентир **5 циклов +1 резерв** по новому наблюдённому отказу; остальные
44 типа отдельно в оценку пяти полей не включены. На implementation
не переносить неутверждённые NULL/coercion либо весь список из матрицы.

После каждой правки: `required-checks.py list --base <база>`, проверки по путям
и verify по отчёту. Client → полный suite с pinned Chromium под nice -n 19;
runtime src → полный host bun test; acceptance scripts → полный acceptance suite.
Живые прогоны только существующим `run-check start`, затем `wait` одной командой,
≤2 параллельно, с неизменённой моделью/1800 с/нагрузочными условиями сквада.
Положительная приёмка: cold и ≥2/3 на одном SHA, затем независимая 2/3 тем же SHA.
В этом docs PR сборок, live model runs и утверждения implementation PASS нет.

## Запас файлов, видимых модели

Измерено в UTF-8 на базовом SHA. Предел отдельного node reference — 6 000 Б.

| Reference | Сейчас, Б | Запас, Б |
|---|---:|---:|
| `transform.filter_data.md` | 2961 | 3039 |
| `imports.text.md` | 4756 | 1244 |
| `datamining.clustering.md` | 3472 | 2528 |
| `datamining.lin_regression.md` | 560 | 5440 |
| `transform.group_data.md` | 333 | 5667 |
| `transform.sorting.md` | 677 | 5323 |
| `transform.cross_table.md` | 5086 | 914 |
| `imports.lgd.md` | 5015 | 985 |
| `exports.lgd.md` | 5004 | 996 |

`packages/product/skills/loginom-automation/SKILL.md` — **39 954 Б**,
запас до существующих 40 000 — **46 Б**. Общая ссылка длиннее 46 Б сейчас
не помещается. В первом срезе общая справка доступна через узловые references;
SKILL не расширять, пока отдельным разрешённым изменением не освобождено место.
