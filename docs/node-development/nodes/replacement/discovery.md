# Замена: регулярные выражения, этап 0 (LAB-532)

Живое исследование 30.10.2026, Loginom **7.4.2**, Linux x64 (mas),
`https://app.loginom.ai/app/?testable=true`, Node 24.19.0, Chromium 1246.
Исходники: `v038@1e0d8e62e2ab4503afa24bc3614bec84ea332d5b`.
Использован worker из назначенной пары
`~/.config/loginom-multica/cards/01a149a6-e621-7bf1-a543-c6ee415e52b1/`.
Создан собственный черновик и загружен только исследовательский CSV.
Действия выполнялись через DOM `data-tid`; внутренний JavaScript Loginom не
менялся. Материализованный store и значения controls читались только для
идентификации строк и настроек. CLI не собирался, модельных прогонов не было.
Это предложение объёма этапа 1; критерии ожидают решения владельца.

## Где задаётся regex

Узел палитры: `Трансформация → Замена`, component ID
`component.transform.Replace`, runtime type `transform.replace_columns`.
На странице «Замена» корень `MF;TF-1;WizrdMCF;ReplaceColumnsWizard;`
(далее `R`).

| Элемент | Наблюдение / data-tid после R |
|---|---|
| Выбор поля | `colInputData_Code`; после открытия мастера выбранное поле нужно прочитать заново |
| Способ замены поля | `colReplaceSource_Code` → редактор `grdDataList;tbl;celleditor;cbx;trg_picker`; варианты «Не заменять», «Ввод вручную» |
| Таблицы | Для строкового поля с ручным вводом одновременно видны группы «Точное совпадение» и «Регулярные выражения» |
| Добавление regex | `grdReplaceItems;tbl;GroupHeader;1;AddButton`; группа 0 относится к exact |
| Редактор шаблона | `ReplaceEditor;fldVariant;ValueContainer;txt`, вложенный input |
| Редактор константы | `ReplaceEditor-1;fldVariant;ValueContainer;txt`, вложенный input; присутствует `trg_SetNullTrigger`, замена на NULL этим триггером не проверялась |
| Подтверждение строки | `roweditorbuttons;update` / `roweditorbuttons;cancel` (без R) |
| Строка таблицы | `colReplaceValue_1`, `colReplaceBy_1`, `colReplaceDelete_1`; суффикс DOM не равен native Index |
| Тип замены | `btnTypeChange` предлагает тип данных: логический, дата/время, вещественный, целый, строковый. Это не переключатель exact/regex |
| Остальные значения | `cbxReplaceOther;trg_picker`: «Не заменять», «На пропущенное», «На значение», «На регулярное выражение» |
| Регистр | `chkCaseSensitivity`; в проверке сохранено native значение false, но regex без inline-флага оставался чувствителен к регистру |

Regex — отдельная группа правил внутри ручной таблицы, а не третий вариант
«Способа замены». В native записи наблюдались `CollectionID=1`, `Index=0`,
`RegularExpression`, `Replacement`, `ReplacementType=0`, `ValueRender`,
`ReplaceRender`. Exact-группа использует `CollectionID=0`. Пустая группа
имеет запись-заполнитель без значений: её нельзя считать правилом.

В DOM у обычной ячейки и summary-строки повторяется один `data-tid`.
Нужна привязка к наблюдённой записи и исключение `tr.x-grid-row-summary`;
нельзя выбирать произвольное первое совпадение в обработчике.

## Семантика и выход

Использован [input.csv](fixtures/regex/input.csv): восемь строк, Id integer,
Code/Keep string, UTF-8, `;`, NULL-маркер `NULL`, пустая строка отдельно.

| Проверка | Наблюдённый результат |
|---|---|
| `AB-([0-9]{2})` → константа `SKU-$1` | `AB-12`, `AB-12 AB-34`, `xAB-56y`, `AB-00` заменены целиком на `SKU-$1` |
| Подстрока / несколько совпадений | Для `xAB-56y` не сохраняются x/y; для `AB-12 AB-34` получается одна константа, а не две подстановки |
| Группа захвата | `$1` остался буквальным текстом. Наблюдение относится к `ReplacementType=0`; другие виды подстановки не исследованы |
| Регистр regex | `ab-34` не совпал с `AB-([0-9]{2})` даже при сохранённом `chkCaseSensitivity=false` |
| Inline-флаг | С `(?i)AB-([0-9]{2})` значение `ab-34` заменено на `SKU-$1` |
| Порядок правил | После первого широкого regex добавлен `^AB-00$` → `ZERO`; `AB-00` остался `SKU-$1`: применяется первое совпавшее правило |
| Other keep | NO, NULL и пустая строка сохранены, флаг false |
| Other null | NO, исходный NULL и пустая строка дают NULL и флаг true, включая исходный NULL |
| Add | Исходный Code сохранён; добавлены string `Code_Replace` и boolean `Code_Replaced` |
| Replace | Исходный Code заменён string-значением, остаётся boolean `Code_Replaced`; `Code_Replace` исчезает |
| Незатронутые поля | Все Id и Keep сохранены |

Вход `Input_Data-0` и выход `Output_Data-0` не менялись. Имеющийся `Input_Add`
существовал до выбора regex; выбор группы не создал нового табличного порта.
Внешние таблицы не подключались. Выходная схема по составу и типам совпадает
с exact при тех же add/replace. Нативные подписи: `Code Замена`, `Code Заменен`.
При ручном переключении replace → add целевой порядок оказался
`Id, Code, Code_Replaced, Keep, Code_Replace`; порядок нужно задавать явно,
не выводить из порядка source-списка. В заданиях порядок указан.

Настройки и результаты повторно прочитаны после закрытия и открытия мастера
того же черновика. Это не сохранение пакета и не независимый cold-check.
Независимое сохранение/переоткрытие проверяется только на этапе 1.

Доказательства — вложение карточки, не Git: DOM-снимки `25-groups.json`,
`27-regex-editor.json`, `33-add-schema.json`, `35-output-values.json`,
`41-other-policy.json`, `44-replace-schema.json`, `46-replace-values.json`,
`47-options.json`, `48-inline-pattern.json`, `50-inline-output.json` и снимки экрана.
Ключевые выходные ячейки:
`MF;TF-1;ModelForm;PreviewWindow;PreviewForm;DataSetForm;normalHeaderCt;Code_Replace_0`,
`Code_Replace_2`, `Code_Replace_3` (литерал/целая ячейка),
`Code_1` (inline-регистр), `Code_7` (приоритет), `Code_Replaced_5` (исходный NULL).

## Предлагаемый контракт этапа 1

Аддитивный `mode: regex` существующего узла. Использовать прежние
`rules[].field/type/pairs/other` и `output_mode`:
`type=string`, `pairs[].from={type:string,value:<regex>}`,
`pairs[].to={type:string,value:<строковая константа>}`.
Порядок pairs значим, применяется первое совпадение по search.
`case_sensitive` и `precision` для regex не передавать: регистр управляется
inline-флагом в самом шаблоне, существующий флажок exact сохранять.
Это предложение, публичная схема и обработчик в этой работе не изменены.

Первый объём: строковые входы; непустой regex в общей ASCII-подграмматике
(литералы, скобки, `[0-9]`, `{2}`, `^/$`, `(?i)`); константная строковая
замена; other keep/null; add/replace; patch существующего regex-only узла.
Существующие ограничения длины/коллизий и запрет переносов/NUL сохранить.
Неизвестную конструкцию или неподдержанный сохранённый режим отклонять явно.
Не заменять проверку валидности шаблона Loginom одной проверкой JS RegExp:
`(?i)` поддержан стендом, но не JavaScript regex.

Смешанные exact+regex таблицы, преобразование типов, NULL как шаблон,
`ReplacementType != 0`, other value/regex, Unicode-folding, пустые и
нулевой длины regex, lookaround и обратные ссылки вне первого объёма.
На существующем узле неподдержанное смешение нужно распознавать до записи,
а не стирать скрытую группу. Стандарт сохранности незапрошенных правил
сохраняется для принятого regex-only объёма.

### Предлагаемые критерии

1. `task-regex.md`: один импорт → один узел «Замена», add/other keep;
   patch текста замены в том же узле; все восемь строк, типы, порядок полей,
   флаги, NULL и пустая строка совпадают с `regex/expected.json`.
2. `task-regex-replace.md`: replace/other null, inline `(?i)` и два
   перекрывающихся regex; все ячейки совпадают с `regex/expected-replace.json`.
3. После Save — штатный cold-check сохранённого пакета, новый профиль,
   повторное выполнение без перенастройки; package_closed и logged_out true.
4. Для каждого сценария стандартные ≥2 PASS из 3 исполнителя и 2/3
   независимой проверки на одном опубликованном SHA, разными аккаунтами.
5. Негативные случаи: числовое поле, неподдержанный шаблон/режим, коллизии,
   смешанная таблица; понятный отказ без потери настроек. Проверки изменённых
   пакетов зелёные, регрессия exact обязательна. Пределы/критерии не снижать.

Новых механизмов верификации не требуется. Ожидания используют существующий
формат cold-check: один output 0, полная позиционная схема и мультимножество
строк. Метки не заданы пользователем, поэтому `label_any=true`. Модель получает
задание и CSV; oracle/expected/доказательства ей не передаются.

## Оценка реализации и схемы

Оценка до правки, не обещание результата: **два цикла** с бизнес-прогоном
между ними. Первый: режим/валидация/чтение группы/запись и add-сценарий.
Второй: patch, приоритет, replace/null, cold и регрессия. Примерно 150–250
строк диффа в существующих файлах узла, плюс адресные тесты; без новых модулей.
Точный размер определится наблюдёнными отказами этапа 1.

| Файл | Предполагаемая правка |
|---|---|
| `replacement-node.mjs` | Зарегистрировать дополнительный mode и передать его процедуре |
| `replacement-parameters.mjs` | Отдельная валидация regex/pairs, отказ для непокрытых настроек |
| `replacement-context.mjs` | Читать CollectionID=1 и строковые RegularExpression/Replacement; сегодня записи без DataValueType/ReplaceByType пропускаются |
| `replacement-procedure.mjs` | Работать с группой 1, порядком и patch; не переписывать exact-флажок |
| `replacement-readback.mjs` | Mode regex и наблюдённые пары; прежний exact-readback сохранить |
| `replacement-output.mjs`, `replacement-preflight.mjs` | Изменение не ожидается: схема и входной порт прежние; подтвердить тестами |

Общие места потребуют только аддитивной регистрации/доставки:
`node-contracts.mjs` (список режимов), `node-api.mjs` (enum и описание),
`node-result-schema.mjs` (enum mode readback), `workspace-ui.mjs` (отдельная
ветвь привязки ячеек CollectionID=1 к native-record; нынешняя разрешает
только 0). Общая оболочка уже принимает `implementation.modes`.
Тексты ограничений — в карточке/skill продукта.
Изменений `packages/agent`, бюджетов, deadline или нового протокола не требуется
по текущей оценке. Если минимальной аддитивной правки окажется недостаточно —
остановка с вопросом владельцу, без расширения общего кода в этой карточке.

Измерены **байты UTF-8 компактного JSON.stringify(inputSchema)** на указанном
SHA, без изменения исходников. В копию enum `properties.mode.enum` добавлен
один литерал `regex`; параметры используют прежнюю форму.

| Схема dock_node_apply | До | После | Приращение |
|---|---:|---:|---:|
| Полная `nodeApplyInputSchema` | 45 891 | 45 899 | **8 Б** |
| `userNodeTool(...).inputSchema` | 13 342 | 13 350 | **8 Б** |

Воспроизведение из корня, без браузера:

```sh
bun -e 'import {nodeApplyInputSchema,nodeApiTools} from "./packages/loginom-runtime/client/lib/node-api.mjs"; import {userNodeTool} from "./packages/loginom-runtime/client/lib/user-workflow.mjs"; for (const s of [nodeApplyInputSchema,userNodeTool(nodeApiTools.find(t=>t.name==="dock_node_apply")).inputSchema]) {const c=structuredClone(s);const before=Buffer.byteLength(JSON.stringify(c));c.properties.mode.enum.push("regex");console.log(before,Buffer.byteLength(JSON.stringify(c)));}'
```

8 Б — только enum входа. Описания параметров и enum readback считаются
отдельно при реализации. Это не замер всего MCP-конверта и не резерв для
остальных узлов. Предел 46 000 Б не использован как стоп этапа 0; общий запас
обеспечивает F2 (LAB-516). Схема здесь не правится.


## Тип результата Замены — LAB-701, 01.11.2026

Исследование на `v039@004e96dbfa47e8b5251493ab38ae5766ecc0fa5a`,
mas, Loginom 7.4.2, Chromium 1246, `?testable=true`, worker назначенной пары.
Штатные DOM-жесты по `data-tid`; материализованные локальные controls/stores
только читались, внутренний JavaScript Loginom не менялся.

Корень `MF;TF-1;WizrdMCF;ReplaceColumnsWizard;` (R).
`btnTypeChange` — split button: клик по телу меню не открывает, `ArrowDown`
открывает `btnTypeChange;mn`. Наблюдены `itmTypeChangeBoolean`,
`itmTypeChangeDTime`, `itmTypeChangeFloat`, `itmTypeChangeInt`, `itmTypeChangeStr`.
Тип подтверждается совпадением native `iconCls` с классом принадлежащего
кнопке `btnIconEl`: `bg-TBGDataType-dtString/dtInteger/dtFloat/dtDateTime`.
Входной `grdDataList` сохраняет `DataType`; целевой тип не хранится в этой записи.
В точной таблице ключ хранит исходный `DataValueType`, замена — новый
`ReplaceByType`. Это разные типы, а не изменение типа входного ключа.

Редактор ключа `ReplaceEditor;fldVariant;ValueContainer;txt`, результата
`ReplaceEditor-1;fldVariant;ValueContainer;Int64Field` (integer),
`num` (real), `datetimefield` (datetime); Null — соответствующий `trg_SetNullTrigger`.
Для datetime наблюдён `Ext.ux.DateTimeField`, ввод ISO `2026-11-01T00:00:00`
после Tab дал native Date и отображение `11/01/2026, 00:00`.
Материализованный `ReplaceRender` — Date; локальная ISO-дата читается без UTC-конверсии.
Смена типа существующей таблицы преобразует её константы: integer 12 стал
1900-01-11. Поэтому обработчик сначала удаляет запрошенную таблицу, затем
выбирает тип и записывает полные новые пары. Незаданные поля не меняются.

**Автоматического преобразования оставшегося текста нет.** Пара строка
`"12"` → integer 12 и `other:null` дала значение 12; строки `bad`, пустая,
`3.5`, `-7` и исходный NULL дали NULL, флаг true у всех шести строк.
Даже синтаксически корректное число без пары не преобразуется.
`cbxReplaceOther` содержит только «Не заменять», «На пропущенное», «На значение».
При другом типе замены с `other:keep` нативная схема Code стала **variant**,
с `other:null` — **integer**. Первая комбинация не входит в точный scalar-контракт
и отклоняется до записи; предлагается явно выбрать null/value.
Дата поддержана константами с целыми секундами и `other:null`; boolean и
datetime other.value не входят в эту добавку. Regex остаётся строковым.

Доказательства вне Git: `02-type-options.json`, `03-integer-type.json`,
`05-output-type.json` (variant), `06-other-options.json`, `07-typed-integer-pair.json`,
`08-scalar-schema.json`, `09-integer-output.json`, `10-date-editor.json`,
`11-date-values.json`. Снимок сразу после жеста может предшествовать ответу
сервера; окончательные значения подтверждены повторным чтением и выполнением.

Новый аддитивный `rules[].result_type` — string/integer/real/datetime;
пропуск равен входному типу. `type` и `from` сохраняют тип ключа, `to` и
`other.value` используют тип результата. Новые typed-константы и их типы
проходят обычные production readback, port-read, CSV и cold-check.
Фикстура и независимый Python oracle — `acceptance/convert/`; сценарий
`replace-convert` проверяет целые, вещественные, даты, незаданные числовые
строки, плохой текст, NULL и пустые строки. Oracle готовится до модельных прогонов.


### Отказ первого production-прогона и ограниченная правка меню

Кандидат `0634be15ca7f5ea753b612a7a599c09a508e73c8`: во внутреннем
`lab701-r1/execution-events.jsonl:376` и `:497` настройка нового и существующего
узла завершилась `Replacement control unavailable: itmTypeChangeInt`.
Меню видно в DOM, но оно — портал вне поддерева мастера; общий observer его
не выдавал как регион, а процедура продолжала читать только мастер.
Правка регистрирует единственный точный регион `btnTypeChange;mn` только для
чтения настроек Замены. Референсы вариантов требуют native-привязку к кнопке,
её меню и текущей записи входного поля; штатные visibility/hit-test и one-flight
проверки сохраняются. Отдельные red→green тесты исполняют production observer
и production выбор корня, включая чужое меню и дубликаты.
Незатронутые Boolean/Variant-поля читаются как passthrough, без требования
поддержки их редактора результата. Это не добавляет Boolean-правила.


### Представление datetime в независимом expected.json

Stock cold matcher требует локальное ISO с тремя цифрами миллисекунд даже
для целых секунд (`2026-11-01T00:00:00.000`). Python oracle использует
`isoformat(timespec="milliseconds")`; это формат ожидания, а не расширение
редактора результата на дробные секунды. Исходная фикстура без `.000`
отклонялась matcher при правильных типах и всех значениях cold-readback.
Нормализация только формата ожидания даёт полное совпадение существующим
stock matcher. Сам matcher, значения ожиданий и критерии не менялись;
зачётные живые прогоны выполняются заново с этой фикстурой.


## Числовая точность — LAB-728, 01.11.2026

Этап 0 на `e66fd0d0500d715d8de138473ed9e54b5a2e86c0`, Loginom 7.4.2,
Chromium 1246, mas, worker назначенной пары, `app/?testable=true`.
Только DOM-жесты и чтение материализованных controls/stores.
Корень R: `MF;TF-1;WizrdMCF;ReplaceColumnsWizard;`.

- `edPrecision`: минимум 0, native max Infinity, шаг 0.01, decimalPrecision=2;
  это **абсолютный допуск**, а не число знаков округления. Принимаются конечные
  неотрицательные значения с максимум двумя десятичными знаками. Разделитель
  читается у принадлежащего control, при записи обязательны blur и readback.
- При 0.25 ключ 10 совпадает с 9.75 и 9.750001, но не с 9.749999.
  У отрицательного ключа -10 границы -10.25/-9.75 также включены.
- В перекрытии выбирается ближайший ключ; tie выбирает **больший**:
  10.25 → 10.5 между 10 и 10.5. Повторено при допуске 0.5 и после
  перестановки первых двух записей таблицы. Нестабильности не наблюдалось.
- Integer использует тот же допуск: при 1 ключи 10/12 заменили 9/13,
  8 остался без замены, tie 11 → 12. Ноль и отрицательный ноль совпали с 0.
- Допуск >0 добавляет `<имя>_Delta` типа real с меткой «Отклонение»: ключ −
  исходное значение, NULL без совпадения. Это поле есть и у integer,
  независимо от replace/add; precision=0 не добавляет Delta.
- После завершения и повторного открытия того же мастера прочитаны сохранённые
  real precision=0.5 и integer precision=1. Константы и порядок сохранены.

DOM результатов: `MF;TF-1;ModelForm;PreviewWindow;PreviewForm;DataSetForm;normalHeaderCt;`
с ячейками `R_0`, `R_2`, `R_4`, `R_Delta_4`, `I_2`, `I_Delta_2`;
`I_Delta` имеет native icon `bg-TBGDataType-dtFloat-before`.
Сырые снимки и cleanup — вложение карточки, не Git.
Фикстура 26 строк, независимый Decimal-oracle и expected записаны до правки
обработчика: [nearest](acceptance/nearest/task.md), [oracle](acceptance/nearest/oracle.py),
[expected](acceptance/nearest/expected.json). Save/cold — отдельная приёмка.
