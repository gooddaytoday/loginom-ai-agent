# Общий точный reader Variant — этап 0

Назначение LAB-1135, база `origin/v040` на
`ecb11c0e2dce6972aaa00978050680145fd12b04`, mas2, Loginom 7.4.2.
Это предложение владельцу. Runtime, каталог типов, маршрутизация навыка и
штатная оснастка не изменены. Новый тип узла или пункт мастера не нужен:
речь о политике чтения уже выполненных выходов с DataType 6.

## Режим: значение вместе с фактическим подтипом

Предлагается расширить существующее точное чтение на дополнительные
табличные выходы, сохранив нынешнее обычное чтение и ограничения Collapse.
Включение новой ветки чтения, публичное разрешение full для новых типов,
поддержка Empty и приёмка требуют решения владельца до реализации.
Сейчас разрешён только этот docs-PR. Общие изменения не выполнялись.

## Наблюдение в живом UI

Исследован только `https://app.loginom.ai/app/?testable=true`, собственный
пакет `lab1135-variant-reader.lgp` в каталоге назначенной worker-пары.
Первоначальная копия данных побайтово совпадает с `fixtures/mixed.csv`.
Пакет: Text Import → Collapse Columns; результат — 15 строк, 5 полей,
`Values` имеет объявленный тип Variant. Это ручное исследование через
существующие production-функции клиента, **не автономный run-check PASS**.

Контролы мастера свёртки по `data-tid` (префикс текущей схемы `MF;TF-1`):

- `WizrdMCF;ColumnFlippingWizard;grdDataFields` — доступные поля;
- `WizrdMCF;ColumnFlippingWizard;grdUsedFields` — выбранные роли;
- `WizrdMCF;ColumnFlippingWizard;frmMoveButtons;btnMove0` / `btnMove1` —
  информационное / транспонируемое поле;
- `WizrdMCF;ColumnFlippingWizard;pedSkipNullCases;ValueControl;DisplayEl` —
  игнорирование пропусков, в опыте false.

Настройка: информационное Id; транспонируемые I/R/S/B/D в таком порядке.
Выход 0: Id integer; Names string; DisplayNames string; Values variant;
DataTypes integer. DataTypes — **тип исходного поля**, не подтип ячейки:
I/R/S/B/D дают 4/3/5/1/2 даже для NULL. После повторной свёртки самого
Variant-поля этот столбец должен быть 6; это отдельный уже существующий
сценарий `collapse-variant`, а не способ определить подтип Values.

Preview: `MF;TF-1;ModelForm;PreviewWindow`, ячейки
`PreviewForm;DataSetForm;normalHeaderCt;Values_<индекс с нуля>`.
Наблюдены значения:

| Индекс | Preview | Точный completed-port |
|---:|---|---|
| 0 | `10` | integer, tag 20, decimal `10` |
| 1 | `1.25` | real, tag 5, LE `000000000000f43f` |
| 3 | `true` | boolean, tag 11, байт `01` |
| 4 | `11/07/2026, 12:00 PM` | datetime, tag 7, serial `46333.5`, civil `2026-11-07T12:00:00.000` |
| 6 | `-2.50` | real, tag 5, значение `-2.5` |
| 7 | неразрывный пробел в DOM | string, tag 8, длина UTF-8 0, значение `""` |
| 8 | `false` | boolean, tag 11, байт `00` |
| 10–14 | `<null>` | null, tag 1, `value:null`, `is_null:true` |

Обычное чтение с require_exact_numbers=true после успешного Execute
остановилось: `Direct output read refused: unverified_precision`.
В локальном `execution-events.jsonl`: строка 1070 — подтверждённое выполнение;
1073 — отказ чтения; 1075 — диагностическое `typedVariants:true` на **том же**
выполнении; 1077 — обычное неточное чтение. В последнем у всех пяти
непустых видов Values только formatted_display и variant_display_precision.
Private opt-in прочитал 15/15 строк, сохранил подтип и native bytes.
Это сравнение доступных веток без правки кода, не red→green реализации.
Сырые доказательства хранятся вне Git; снимок Preview прикладывается к карточке.

## Native-представление и границы знания

| Tag | Decoder | Публичный adaptCell | Живое наблюдение здесь |
|---:|---|---|---|
| 1 | null | native_null | да, 5 NULL |
| 3 | signed int32 | отвергается | нет |
| 4 | binary32 | отвергается | нет |
| 5 | binary64 | real + decimal + LE bits | да |
| 7 | binary64 OADate | serial-only либо проверенный browser civil | да |
| 8 | строка с длиной и codepage | UTF-8 string + utf8_hex | да, включая пустую |
| 11 | boolean 0/1 | boolean + байт | да |
| 20 | signed int64 | decimal string + LE bits | да |
| 0 / Empty | отказ unknown/interface tag | отказ | **не получен из UI** |

У scalar frame tag читается int16 LE с начала логического payload; scalar
значение — с offset 2. Для string: длина int32 LE с offset 10,
codepage uint16 LE с offset 14, UTF-8 с offset 16. Минимальный transport
frame 60 Б включает 12 Б заголовка; padding не является значением.
Чтение уже ограничено fixed method 321/interface116, pinned реализациями,
message ID, живой сессией, идентичностью источника и выполнения, release
request/response, deadline и бюджетом 512 KiB. Предложение не ослабляет
ни один из этих guards и не вводит произвольный RPC.

NULL tag 1 и пустая строка tag 8 уже различимы. Из отсутствующего
ValueVariant/undefined нельзя выводить Empty: это может быть незагруженная
ячейка. В данном UI-опыте Empty не встретился. Назначение tag 0 и способ
создания воспроизводимого завершённого Empty ещё нужно подтвердить.
В `precision.json` Empty — **проект семантики**, не запись wire-байтов и не
утверждение, что штатный узел умеет произвести tag 0. До этого отказ остаётся.
Аналогично 3/4 нельзя объявлять поддержанными по одному наличию decoder.

Для real точность означает сохранение исходного IEEE754 pattern, включая
signed zero; decimal — round-trip представление, а не точная десятичная
арифметика исходного пользовательского числа. Integer за пределами 2^53−1
передаётся десятичной строкой, без промежуточного Number.

Для datetime сохраняются OADate bytes и decimal serial. Civil отображение
использует pinned `Date.FromOADate` / `Date.AddBias`, округление до миллисекунд
и сообщает браузерную зону (в опыте America/New_York). Это календарное время
браузера, **не доказанный UTC instant или часовой пояс источника**. Нельзя
добавлять Z/смещение или заменять serial строкой Preview. Отрицательные даты,
DST-переходы, sub-ms и нечисловые serial требуют отдельных наблюдений;
готовый вектор .006 — предложение проверки, не доказательство всех дат.

## CSV: наблюдённое представление

Добавлен штатный Text Export, выполнен, затем собственный файл скачан
через Files UI: `MF;TF-3;FileStorageForm;colName_lab1135-variant.csv`,
`btnDownload` открывает меню, фактический download — `mniDownload`.
Файл 237 Б, UTF-8 без BOM, LF, запятая, header names, NULL marker `?`,
True/False, date `yyyy/mm/dd` с `-`, time `hh:nn:ss.zzz` с `:`.
Прочитаны все 15 строк. Числа сериализованы как `10`, `1.25`, `-2.5`,
пустая string — пустое CSV-поле, boolean — `True` / `False`, NULL — `?`.
Дата с ненулевым временем: `2026-11-07 12:00:00.000`; полночь:
**`2026-11-08` без времени** даже при явном формате миллисекунд.
Сведения о subtype в CSV не добавляются. Names/DataTypes помогают лишь
этому конкретному Collapse; обычный Variant-output таких колонок не обязан иметь.
Строку `True`/числовую строку нельзя отличить от boolean/number по одному CSV.
Настоящий Empty здесь не получен: его CSV serialization остаётся неизвестной.

Автоматическое чтение файла исследовательским runtime остановилось на
проверке разрешённого export path `/test-2`; сам Execute был подтверждён,
собственный файл независимо скачан через UI. Это не объявляется stock
Export/cold PASS и не исправляется в данном PR. Первое открытие браузера
также не имело штатной download-init политики; после подтверждённых
Close/logout исследование продолжено через production `loginBrowser`.
Весь опыт остаётся discovery, не доказательством автономной приёмки.

## Предлагаемый единый контракт

За основу взять имеющуюся native cell union, а не новую параллельную схему:
`type:"variant"`, `cell_type`, `is_null`, `precision`, `representation`,
`value` и `native:{tag,encoding,...}`. Для integer — decimal string/64 bits;
real — round-trip decimal/64 bits; datetime — native serial и отдельно
проверенное civil представление; string — точная Unicode-строка;
boolean — JSON boolean; NULL — явное null. `type` поля и `cell_type`
значения сохраняются одновременно.

Если Empty будет подтверждён и одобрен: отдельный `cell_type:"empty"`,
`is_null:false`, без value, отдельное native encoding. Это требует изменения
публичной union/schema и не включается скрыто под видом поддержки NULL.
Неизвестный tag, codepage, non-finite, потерянный ответ и смена владельца
дают отказ, а не строковый fallback или частичный успешный результат.

Полное чтение: сначала подтверждённые count/schema, затем все ячейки в
согласованном порядке. Частичное чтение сообщает покрытие; sample10 не
доказывает всю таблицу. Для первого допуска сохранить существующие пределы
Collapse full: 50 строк × 8 полей / 400 ячеек, native ≤512 KiB, итоговый
escaped MCP envelope ≤1 MiB. Общий sample имеет иные пределы (100 строк,
10 000 ячеек); нельзя случайно унаследовать их как гарантию exact full.
Не заявлять atomic snapshot: остаются observed_local и unobserved ABA risk.
Нулевой набор подтверждается count+schema, без RPC ячеек.

Обычное чтение и старые wire-форматы остаются прежними; новый точный путь
включается только явно одобренным full-чтением нужного типа. Private
typedVariants не становится параметром, которым модель может обходить
admission, provenance или бюджеты. Существующий Collapse full сохраняет
проверку исходной цепочки и 1 MiB после сериализации.

## Какие узлы разблокируются

| Узел | Что даёт общий tabular reader | Что остаётся отдельно |
|---|---|---|
| Свёртка столбцов | единый subtype decode с generic completed-port | её существующие full/chain guards; повторная свёртка и Empty |
| Замена, иной result_type + keep | точный boolean/string/NULL в одном поле | нынешний preflight запрещает этот режим; настройка узла требует отдельного допуска |
| Конечные классы | точное чтение полей Variant после выполнения | учить/применять, все порты, семантика интервалов и модель не меняются |
| Таблица в переменные | **не разблокируется одним interface116** | VariablesForm/W1 adapter, subtype proof и список агрегатов |

У DataToVar выход переменных. `node-output-context.mjs:readVariableRecords`
принимает только DataType 1–5, читает ValueVariant из полного native Ext
store и намеренно не вызывает Value/$self proxy. Поэтому добавление 6 в
таблицу типов без native subtype proof потеряет integer/real/Empty.
Нельзя молча добавлять «Переменные в таблицу» в пользовательский граф ради
проверки; такой мост меняет состав сценария. Нужен отдельный утверждённый
адаптер с собственным наблюдением VariablesForm. Подготовленное
`variables-datatovar/acceptance/task-variant.md` остаётся кандидатом третьего
сценария после этого решения, не обещанным PASS данного reader.

## Приёмочный комплект — предложение

`acceptance/task-collapse.md` + `fixtures/mixed.csv`: 15 строк, все шесть
наблюдённых subtype, пустая строка, zero, false, пять NULL, порядок и типы.
`acceptance/task-replacement.md` + `fixtures/status.csv`: boolean true после
замены и исходная string `true` должны оставаться разными; string empty и NULL
тоже различаются. Режим keep пока блокирует production preflight.

`acceptance/oracle.py` использует только CSV/авторский JSON и Python stdlib.
`--write` регенерирует `acceptance/expected.json`, `--check` проверяет его
полностью и фиксированные независимые anchors int64, 0.1, −0, datetime .006,
NULL/Empty. Не импортирует reader, Loginom, журналы или результаты UI.
В expected две stock-подобные таблицы cases и 13 precision_vectors;
последние **не являются новым механизмом верификации** и не исполняются
штатным matcher до решения владельца. Файл не зарегистрирован в run-check.
Для этапа 1 выбрать `cases.collapse`/`cases.replacement` в частный expected,
проверить допустимость stock matcher для subtype/null и зарегистрировать
сценарии отдельно. Передавать модели только выбранный task и input CSV;
oracle, expected, precision vectors, карточки-предложения ей не передавать.
`fixtures/precision.csv` — предложенный дополнительный источник для будущей
проверки больших int64, 0.1, signed zero, соседних binary64 и datetime .006.
В текущем живом опыте он не импортировался; нельзя считать сохранение его
точности через Text Import уже подтверждённым.

Предлагаемые критерии владельцу:

1. Схема, порядок и количество строк точны; все значения и cell_type
   совпадают, integer не округлён, bit pattern real/datetime сохранён;
   civil ms проверяются отдельно, timezone не угадывается.
2. CSV проверяется по всем строкам вместе с native subtype результатом.
   Сам CSV не доказывает Variant type, NULL/Empty или signed zero.
3. Save → Close/logout → новое открытие и Execute без перенастройки:
   та же схема/значения/подтипы, новый документ и execution binding.
4. На одном SHA ≥2/3 PASS и независимо ≥2/3, stock CSV/Save/cold/cleanup.
   До одобрения Empty/3/4 — точный отказ без публикации fabricated subtype.
5. Регрессии всех текущих scalar/Variant consumers, full bounds, stale
   execution/source, pending callback, unknown tag и envelope budget.

Это новые критерии для общего кода, поэтому этап 1 ожидает решения.
На этапе 0 код не изменён, CLI не собирался, модельные run-check/cold
не запускались; их результаты здесь не заявлены.

## Затронутые пути и оценка циклов

| Группа | Предполагаемые файлы | Оценка |
|---|---|---:|
| табличное чтение | `client/lib/node-port-output.mjs`, `variant-native-read.mjs`, `variant-native-decode.mjs`, `variant-native-values.mjs`, `node-procedure.mjs` | 1 red→green + 1 live цикл для шести наблюдённых tags |
| full/lifecycle | `collapse-native-output.mjs`, `calculator-node.mjs`, `node-read-driver.mjs`, `node-api.mjs`, `node-apply.mjs` | 1–2 цикла admission/полнота/регрессии |
| cold | `scripts/node-acceptance/cold-check.mjs` и адресные cases | 1 цикл main+Save+reopen/cold на двух узлах |
| Empty, 3/4 | decoder/values, `variant-native-schema.mjs`, result schemas, subtype matcher | ещё 1–2 только после живого источника и решения о публичном контракте |
| выход переменных | `node-output-context.mjs`, variable ветка `node-port-output.mjs`, W1/cold и metadata schemas | отдельная карточка, ориентир 2–3 цикла после subtype discovery |

Пути client указаны относительно `packages/loginom-runtime/`.
Первая поставка — ориентир 4–5 циклов, не правка в каждом перечисленном
файле автоматически. Общий reader — общая поведенческая зависимость;
рефакторинг, новый модуль и новые RPC не предлагаются. Handler-specific
keep/aggregates/coarse-classes решаются своими назначениями.

Риски: типы, которые сегодня видят formatted_display, станут strict native;
изменится формат value у чисел; frames/cell возрастут; последовательные
RPC на mas2 медленнее; холодная whitelist расходится с main; ошибка одного
подтипа блокирует полный результат; dates округляются до ms; tag 0 может
быть неполным/другим wire-value, а не бизнес-пустотой. Нужны разрешённый
opt-in, сохранение отказов и проверка старых потребителей на том же SHA.

## Размеры того, что видит модель

Замер текущей production-базы: `node --test test/model-schema-budget.test.mjs`
в client — 185 PASS. `model_tool_bytes=8051` (лимит 20000),
`full_input_schema_bytes=71306` (не отправляется модели, без лимита).
Общий reader не является новым node type; отдельную карточку ему не создаём.
`acceptance/type-cards.proposal.json` — четыре существующие карточки с
проектом общей заметки, все hash-поля заменены 64 нулями. Размер —
UTF-8 `JSON.stringify(card)`, полная guidance всех modes:

| Тип | Сейчас, Б | Проект, Б | Лимит, Б |
|---|---:|---:|---:|
| transform.collapse_columns | 5227 | 5698 | 12000 |
| transform.replace_columns | 11968 | **12439** | 12000 |
| variables.from_table | 6514 | 6985 | 12000 |
| preprocessing.coarse_classes | 7912 | 8383 | 12000 |

`SKILL.md` сейчас 28823 Б; добавление одной `skill-note.proposal.md`
(468 Б) с двумя переводами строк даст 29293 Б, лимит 40000.
Новая routing-строка не нужна: четыре существующих типа уже маршрутизируются.
Node references сейчас: collapse 2424 Б, replacement 5587 Б,
from_table 2984 Б, coarse_classes 3466 Б. Та же заметка с двумя LF даст
2894/6057/3454/3936 Б соответственно: replacement превышает лимит 6000.
Карточку и reference Замены нужно сократить в этапе 1 либо сослаться на
общую заметку с повторным реальным замером; лимиты не увеличивать.
Project files — предложение текста, не действующая регистрация поддержки.

## Проверка самого предложения

`oracle.py --check` — PASS; штатные `check_csv` из run-check и
`matchExpectedOutputs` из expected-outputs подтвердили все 15 строк
скачанного CSV и сохранённого live typed snapshot по `cases.collapse`.
Это проверка наблюдения существующими matchers, не cold Execute.
Пакет сохранён через `MF;MainMenuForm;btnSavePackage`; штатный cleanup
подтвердил `modified_before_close:false`, `package_closed:true`,
`logged_out:true`, без discard. Браузер закрыт.

`model-schema-budget.test.mjs` — 185/185 PASS; `gitleaks dir` по новому
каталогу — без находок. Полный root `bun install --frozen-lockfile
--ignore-scripts` дважды остановился на GitHub ghostty-web 503/504;
client `npm ci --ignore-scripts --omit=dev` выполнен. Ни runtime-пути,
ни scripts/node-acceptance не изменены; обязательные проверки определяются
`required-checks.py list --base <база>` и проверяются `verify` по отчёту.

Ограничения: живой опыт только Collapse + Text Export, без независимого
повтора, cold и CLI-сборки; keep→Variant, DataToVar и Coarse Classes здесь
не исполнялись. Empty, tags 3/4, unsafe int64, sub-ms/ненулевые ms и signed
zero представлены предложенными векторами, а не заявлены проверенными в UI.
