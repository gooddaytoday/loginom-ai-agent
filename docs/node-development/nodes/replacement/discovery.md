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
