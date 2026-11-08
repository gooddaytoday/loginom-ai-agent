# Вложенные записи — предложение LAB-1136, этап 0

08.11.2026, mas2; база и исследованный код:
`origin/v040@ecb11c0e2dce6972aaa00978050680145fd12b04`.
Только документация, fixtures и независимый oracle; runtime и продуктовый
навык не изменены, CLI не собирался. Это расширение существующего
`trees.from_json / auto_structure`, без нового enum mode или параметра.
Переход к этапу 1 **blocked**: общий reader требует изменения сверх
аддитивной регистрации; критерии ниже предложены владельцу до кода.

## Живое наблюдение Loginom 7.4.2

Только `https://app.loginom.ai/app/?testable=true`, worker назначенной пары,
новый собственный черновик Package1. Версия —
`LoginForm;Login;lblProductVersion`. Все действия — мышь/клавиатура/DOM
по `data-tid`, без вызова или подмены внутреннего JS Loginom.
Ни одного восстановления разорванного сеанса после входа не потребовалось.
Пробы выполнены вручную через UI, это **не PASS обработчика/run-check**.
Сырые снимки не коммитятся; компактное DOM-доказательство приложено к карточке.

Один импорт `documents.csv`: одна строка, четыре строковых JSON-колонки
`nested`, `mixed`, `empty`, `null`. Тот же JSON-узел последовательно
перенастраивался на эти поля; отдельный импорт `untyped.csv` и второй узел
проверили всегда пустые контейнеры и NULL-only. На этапе 1 каждый case
запускается в новом собственном пакете/чате/профиле.

### Выбор и настройки

Палитра:
`MF;TF-1;ModelForm;colVendors_Компоненты>Дерево_данных>JSON_в_дерево;TreeText`.
Узел имеет `Input_Data-0` → `Output_DataTree-0`; новые настройки портов
не создают. Выход JSON→дерево — дерево, **табличного выхода у него нет**.
Сравнение с прежним режимом — по схеме/экземплярам tree output 0;
плоская таблица от другого узла не доказывает этот результат.
`trees.to_table` и его ограничения в этой карточке не расширяются.

Префикс страницы `J = MF;TF-1;WizrdMCF;JSONToTreeWizard;`:

| Суффикс `data-tid` после J | Наблюдение |
|---|---|
| `pedSourceColumn;ValueControl;boundlist;nested` (также mixed/empty/null) | Выбор конкретного строкового JSON-поля |
| `pedBuildTreeAuto;ValueControl;DisplayEl` | Включена автоструктура; checked подтверждён `x-form-cb-checked` |
| `pedRootGeneration;ValueControl` | «Автоопределение»; список также содержит «Всегда массив» и «Всегда не массив», они не выполнялись |
| `pedStrictMode;ValueControl` | В наблюдённых прогонах включено строгое соответствие |
| `pedRootExcluded;ValueControl` | Выключено исключение корня |
| `pedDateTimeFormat;ValueControl` | `YYYY-MM-DDThh:mm:ss`; даты не исследовались |
| `btnAddChild`, `btnAddSibling`, `btnEdit`, `btnMoveUp`, `btnMoveDown`, `btnLoadByXSD` | При включённой автоструктуре disabled |
| `btnBuildTreeTemplate` | Доступна; загрузка шаблона/ручная схема не выполнялись |

Отдельного переключателя «вложенные записи», mixed, empty или NULL нет:
структура определяется входным JSON. После Execute подпись узла становится
`JSON_в_дерево:_nested` и аналогично для других полей. Это временные DOM-имена,
не стабильная идентичность узла. При повторной настройке штатное предупреждение
о деактивации подтверждено только для собственного исследуемого узла.

### Значения, границы и типы

Ниже `P = MF;TF-1;ModelForm;PreviewWindow;PreviewForm;DataTreeForm;`.
Preview открыт через контекстное меню выхода `mn;mniShowDataPreview`.
Раскрытие — через свеженаблюдённые `colTreeNode_…;TreeExpander`.
Числа в DOM-суффиксах не являются индексами JSON Pointer: в разных пробах
одинаковый leaf получает другой числовой суффикс.

| Возможность / task | Наблюдение и конкретный DOM-якорь после P | Критерий-предложение / циклы этапа 1 |
|---|---|---|
| [Вложенные записи](acceptance/task-nested-records.md) | `colTreeNode_Root>0>1` и `…>2` — два items; под первым один parts, под вторым два (`…>2>2`, `…>2>3`). После раскрытия qty=2/0/NULL; id точно `9007199254740993/4` | Полное ordered дерево, details-контейнеры и границы 1+2, точные Int64/типы/NULL; 1 цикл |
| [Смешанный лист](acceptance/task-mixed-leaves.md) | `colTreeNode_Root>0>0>2` — value, иконка `bg-TBGDataType-dtVariant`; значения 7/семь/false/NULL во всех четырёх items | Variant schema + точный тип каждой ячейки, без stringify; 1 цикл после общего reader |
| [Пустые контейнеры](acceptance/task-empty-containers.md) | В `items` id=2 нет экземпляра parts; `colTreeValue_Root>0>1>1>10` — code=NULL с `bg-cell-null-value`; у id=3 code пустой без этого класса | Parts lengths 1/0/1, details сохраняются, code A/NULL/пустая строка; 1 цикл |
| [NULL-листья](acceptance/task-null-leaves.md) | `colTreeValue_Root>0>1>1` и `…>3>1` — note=NULL; `…>2>1` — пустая строка без NULL-класса; enabled/qty четвёртой записи — NULL с сохранёнными Boolean/Integer иконками | Типы string/boolean/integer, NULL отдельно от пустой строки/false/0, missing→NULL; 1 цикл (можно объединить с предыдущим) |
| [Нет свидетеля типа](acceptance/task-untyped-containers.md) | Выходной мастер и редактор, описанные ниже: emptyArray Array=true/Container=false/Variant; emptyObject Container=true; nullOnly Variant | Полная схема плюс ноль элементов массива, пустой объект и NULL-only Variant; общий reader + регрессия |

Для последней пробы открыт штатный выходной мастер
`MF;TF-1;WizrdMCF;DataTreeOutputSocketWizard;`.
`colTargetNode_0>Root>items>emptyArray;TreeText` присутствует, хотя экземпляра
emptyArray в preview нет. Выбран этот узел, открыт `btnEdit`.
В `EditDataTreeNodeDefForm` прочитаны `edtName`, `cbxDataType`,
`chbIsArray`, `chbIsContainer`: emptyArray = «Переменный», true, false;
emptyObject = пустой тип, false, true; nullOnly = «Переменный», false, false.
Чекбоксы прочитаны по `x-form-cb-checked`, а не hidden input.
Все три редактора закрыты `btnCancel`, мастер отменён с подтверждением.

**Ограничение платформы по этим пяти пробам не обнаружено.** Утверждения
о точном subtype Variant основаны на исходном JSON и предложены для приёмки;
иконка Variant и display preview сами по себе их не удостоверяют.
Нативный FullType, Save/reopen/cold, malformed JSON, NULL целого документа,
отсутствующие контейнеры, непустые scalar arrays, sibling arrays, даты и
ручная схема здесь not_checked. Отсутствие экземпляра пустого массива
не означает отсутствие его определения — выходной мастер доказал обратное.

## Комплект и предложенная приёмка

[README комплекта](acceptance/nested-records/README.md),
[oracle](acceptance/nested-records/oracle.py),
[expected](acceptance/nested-records/expected.json),
[fixtures](fixtures/nested-records/documents.csv).
Четыре основных task/JSON/initial expected написаны до их первого Execute;
схема добавлена к ожиданию после просмотра UI. Нормализация missing scalar
и пустого объекта в NULL была предложена до Execute и подтвердилась.
Отдельный boundary fixture создан до своей пробы; его default Variant
и точные флаги внесены как предложение после просмотра выходного мастера.
Ожидания не подгонялись под ответ обработчика: runtime не выполнялся.

Прежний стандарт: полный typed main, точные типы/Int64/NULL, порядок схемы
и экземпляров, границы **каждого** массива; Save, свежий профиль и cold Execute
сохранённого графа без настройки, cleanup. На одном SHA ≥2/3 PASS исполнителя
и 2/3 независимого проверяющего, проверки затронутых пакетов. Метки, которых
нет в задаче, — `label_any`. Tree output не экспортируется в CSV; если позже
назначается отдельный табличный выход, его CSV обязателен отдельно.
Модели передаются только соответствующий task и CSV; oracle/expected/карточка
предложения остаются в оснастке. Новые cases в run-check не регистрировались.

Для этапа 1 предложено адаптировать oracle-формат в существующий tree matcher,
без нового механизма проверки и без повышения 256/16/1 MiB. Schema flags
`is_array` и `is_container` независимы. NULL-only сохраняет schema Variant;
не предлагать fictitious string subtype. Если прежний публичный контракт
не вместит это без изменения, требуется отдельное решение до кода.

## Причина отказа кода и объём реализации

`client/lib/tree-parameters.mjs:59` — явный отказ nested containers внутри
repeated record; `:55` также ограничивает число массивов одним и отвергает
пустой массив; `:60` отвергает mixed Variant. `validateSelectedTreePaths`
в том же файле требует один массив и scalar types. JSON-handler повторно
вызывает этот validator на output (`tree-node.mjs:127`). Нельзя просто снять
preflight: отказ останется после мутации. Проверку `trees.to_table` сохранять.

Общие необходимые изменения: `node-port-output.mjs:108` запрещает
Array=true/Container=false; `:110` запрещает Variant. Нужны адресные red→green
на native пустом Variant-массиве и точном чтении Variant, включая NULL-only,
с неизменными bounds/cleanup/ownership. Возможность повторно использовать
табличный Variant reader **не доказана**: tree-reader имеет другой источник
и AsVariant; нельзя объявлять точность по одному display string.
Проверка optional absent object (`:144`) остаётся вне назначения.
Ровно одна корневая строка (`:153`) сохраняется: LAB-1112 не пересекается.

Оценка: 4 адресных цикла из таблицы + 1 общий, всего **4–5 циклов** при
объединении empty/NULL. Ориентир 100–180 строк production и 120–200 строк
адресных тестов, с большой неопределённостью Variant RPC до native red→green.
Файлы: `tree-parameters.mjs`, `tree-node.mjs`, `node-port-output.mjs`,
их tree tests; описание `node-contracts.mjs` и reference навыка; штатная
регистрация/ожидания tree acceptance в scripts. `node-output-context.mjs`
для неизменного JSON wizard не требует правки по этим наблюдениям.
Новых runtime-модулей, public параметров, рефакторинга или правки
`packages/agent` не предложено. Общий reader — явный стоп до решения владельца.

## Model-visible бюджеты

Воспроизведение:
`node docs/node-development/nodes/trees-jsontotree/acceptance/nested-records/measure-schema.mjs`.
Карточка измерена с guidance выбранного auto_structure, с действующим
describe/skill-loader envelope. Все hash-поля записанного предложения —
64 нуля. Это оценка текста после замены, не runtime-регистрация.

| Поверхность | База, Б | Предложение, Б | Лимит, Б |
|---|---:|---:|---:|
| Сжатый apply / `model_tool_bytes` | 8051 | 8051 | 20000 |
| `full_input_schema_bytes` | 71306 | 71306 | нет |
| Карточка trees.from_json с guidance | 8156 | 5548 | 12000 |
| SKILL.md | 28823 | 28823 | 40000 |
| Строка маршрутизации trees.from_json | 115 | 115 | ≈200 |
| reference trees.from_json.md | 5370 | 2706 | 6000 |

Строка маршрутизации остаётся прежней: нового mode нет. Предложенный reference
заменяет существующий раздел целиком, не добавляется поверх дублированного текста.
Текущий `node --test test/model-schema-budget.test.mjs`: 185/185, exit 0.
После реализации нужны повторные фактические замеры, tests и живые run-check;
здесь нет green runtime/red→green или автономной приёмки нового поведения.
