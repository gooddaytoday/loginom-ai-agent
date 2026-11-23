# Группировка: недостающие агрегаты и параметры, LAB-998

Этап 0, предложение до решения владельца. База исходников и будущих правок:
`v040@bc63453453e22e1369809a7d36d2fee7719b7c7d`. Исследование 07.11.2026,
13:54–14:31 UTC, mas2/Linux, Loginom 7.4.2, только
`https://app.loginom.ai/app/?testable=true`, worker назначенной пары
`~/.config/loginom-multica/cards/01a124e5-1623-7a32-93c7-a3754c7dbdd7/`.
Создан собственный новый несохранённый Package1, синтетический источник
lab998-grouping.csv. Все изменения — UI-жесты по data-tid; чтение DOM и
локальных cached stores. Внутренние функции мутации Loginom не вызывались.
CLI не собирался, модель и run-check не запускались. Native discovery
использовал уже установленный Chromium 1243; это не приёмка pinned CLI.

Сырые DOM/снимки/локальные cached-значения приложены к карточке архивом
`lab998-evidence.zip`; в Git их нет. Ниже номера файлов этого архива.
`W=MF;TF-1;WizrdMCF` — конкретный наблюдённый префикс, не константа кода.
`G=W;GroupDataWizard`, `D=W;FactorEditDialog`.

## Где выбирается и что меняется

`G;colDisplayName_Region` + `frmMoveButtons;btnMove0` задают ключ;
Amount/Text + `btnMove1` — показатели. Числовому полю назначается Sum,
строковому — Only. Двойной щелчок содержательной
`G;colUsedFields_Amount` открывает D; одноимённая summary-клетка пустая.
01–05 фиксируют доступные функции, выбранные роли, маски и параметры.

| Возможность | data-tid в D;grpFactors | Маска | Integer / String | Выход при нескольких функциях |
|---|---|---:|---|---|
| Медиана | chb-5;DisplayEl | 32 | да / disabled | Amount_Median, real |
| Мода | chb-6;DisplayEl | 64 | да / да | Amount_Mode integer; Text_Mode string |
| Стандартное откл. | chb-7;DisplayEl | 128 | да / disabled | Amount_Std, real |
| Кол-во пропусков | chb-9;DisplayEl | 512 | да / да | Amount_Null / Text_Null, integer |
| Первый | chb-10;DisplayEl | 1024 | да / да | Amount_First integer; Text_First string |
| Последний | chb-11;DisplayEl | 2048 | да / да | Amount_Last integer; Text_Last string |
| Единственный | chb-12;DisplayEl | 4096 | да / да | Amount_Only integer; Text_Only string |
| Список | chb-13;DisplayEl | 8192 | да / да | Amount_Concat / Text_Concat, string |

Суффиксы **Std** и **Null** отличаются от CrossTable StdDev/NullCount.
Новые функции добавляют столбцы одному выходу; число табличных портов
не меняется: один вход 0 и один выход 0. Обучение отсутствует.
Unique_count (256, Uniq) уже есть в базе, повторной реализации не требует.
Полная маска Amount в опыте — 16097 (Sum плюс восемь новых функций).
Схема с 16 полями прочитана отдельно от форматированных ячеек (09).
При единственной функции нативное имя target/source нужно перепроверить
штатным output mapping; этот опыт с несколькими функциями его не доказывает.

Список включает четыре отдельные настройки под
`D;cntCheckboxes;fs;`: `cbxConcatSeparator`, `cbxConcatWrapper`,
`fc;chkConcatUniqueOnly;DisplayEl`, `fc;cbxConcatSort;trg_picker`.
Наблюдены ввод `|`, ограничители без/двойная/одинарная кавычка и варианты
Без_сортировки / По_возрастанию / По_убыванию (04).
UniqueOnly **true по умолчанию**, Sort=false, Separator="," и Wrapper="".
Наличие пункта ASC зафиксировано; отдельное численное выполнение ASC в этом
исследовании не заявляется. Произвольные separator/длины не проверены.

`G;pedDimCache;ValueControl;DisplayEl` — кэшировать значения групп,
по умолчанию true. `G;pedSortResult;ValueControl;DisplayEl` — сортировать
результат по ключам, по умолчанию false. Они не меняют схему или число групп.
Включение sort_result дало A,B,C,D,E. Отключение cache на том же узле
сохранило все скалярные агрегаты (05 → 10/11); оно не является новым
исполнением источника или доказательством его свежести.

## Значения, влияющие на критерии

`fixtures/modes.csv`: 13 строк, исходный порядок групп B,A,C,D,E.
Все семь скалярных семейств независимо вычислены из CSV и сравнены с полными
cached-значениями пяти групп (08/09), без чтения чисел из округлённого DOM.

| Случай | Наблюдение |
|---|---|
| Медиана | A [4,4,10,NULL] → 4; B [1,3,3,5] → 3; all-NULL → NULL |
| Мода | A → 4/alpha, B → 3/beta; D all-NULL → **0 / пустая строка** |
| StdDev | A → 3.4641016151377544, B → 1.632993161855452; singleton → 0; all-NULL → NULL |
| Число пропусков | A → 1/1, D → 2/2; E с пустым Text → 0/0 |
| First/Last | У A Last Amount и Text — NULL; у B Last Text — пустая строка |
| Only | C → 7/solo; E из двух одинаковых строк → 2/пустая строка; A/B → NULL |
| List | NULL исключён, пустая строка включена, all-NULL → пустая строка |

По умолчанию unique=true: B Text → `"beta"|"alpha"|""`, A →
`"alpha"|"gamma"`. Затем unique=false и DESC на том же Text:
A → `"gamma"|"alpha"|"alpha"`, B → `"beta"|"beta"|"alpha"|""`,
E → `""|""` (10/11). Числовой список по умолчанию B — `1,3,5`.
Эти правила явно записаны как предложение; all-NULL Mode не заменяется
более привычным SQL NULL. Tie мод, Real/date/Boolean/Variant-агрегаты,
пустой набор и экранирование кавычек внутри элементов не исследованы.

## Предлагаемый объём и размер изменения

Комплект [acceptance/modes](acceptance/modes/README.md) предлагает десять
циклов: median, mode, stddev, null_count, first, last, only, concat,
cache_groups, sort_result. Это один цикл на возможность, не десять запусков
в этой карточке. Критерии полных значений/типов/CSV/Save/cold/cleanup остаются
стандартными; label_any и ordered используются существующие.

| Циклы | Основные production-файлы для этапа 1 |
|---|---|
| Семь скалярных функций, по одному | grouping-parameters.mjs (биты/типы), grouping-output.mjs (суффиксы/типы), адресные тесты |
| Concat, один | плюс grouping-procedure.mjs, grouping-readback.mjs; grouping-context.mjs уже читает concat, workspace-ui.mjs может потребовать аддитивного допуска четырёх контролов |
| Cache, один | grouping-parameters.mjs, grouping-procedure.mjs; исходный options уже наблюдается |
| Sort result, один | те же файлы; output/schema не меняются, ordered acceptance |

Оценка — десять отдельных адресных циклов, предварительно 200–350 строк
production-кода суммарно, не измеренный diff и без обещания числа итераций.
Существующий configure уже перечисляет 14 checkboxes, но preservation checks
для concat/options придётся применять только к незапрошенным настройкам.
Это изменение условий конкретного обработчика, без общего рефакторинга.
Общие изменения ожидаются **только аддитивные**: node-api.mjs (enum/optional
поля), node-result-schema.mjs (concat readback), тексты node-contracts.mjs,
продуктовые reference и регистрация будущих run-check случаев. Новых модулей
runtime, обходов UI, механизма проверки и packages/agent не требуется.
Необходимость общей неаддитивной правки на этапе 1 — отдельный stop.

## Model-visible бюджеты

Размер JSON — UTF-8 `JSON.stringify`, без pretty-print, с zero placeholders
в hash-полях [предложенной карточки](modes-card.proposal.json).

| Объект | База | После предложения | Лимит |
|---|---:|---:|---:|
| Карточка transform.group_data | 3442 | 5066 | 12000 |
| SKILL.md | 39961 | 39961 | 40000 |
| Строка маршрутизации | 122 | 122 | ~200 |
| references/nodes/transform.group_data.md | 333 | 1753 | 6000 |

Маршрутизация не растёт: режим aggregate остаётся тем же. Текст дополнения
лежит в modes-skill.proposal.json и пока не установлен в продукт.
`node --test test/model-schema-budget.test.mjs` на базе: exit 0, 51 тест;
model_tool_bytes=14539, full_input_schema_bytes=63337. При сохранении нынешней
компактной проекции type-specific поля не попадают в apply, поэтому 14539 —
оценка также после аддитивной схемы; после реализации нужен новый фактический
замер. У full_input_schema_bytes предела нет.

Нет модельных прогонов, CSV-экспорта, Save/cold или independent PASS этого SHA.
Это предложение для утверждения владельцем перед изменением обработчика.
