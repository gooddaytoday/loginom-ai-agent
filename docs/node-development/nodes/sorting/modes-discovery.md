# Сортировка: параметры и непокрытое сравнение, LAB-998

Этап 0, docs-предложение. База
`v040@bc63453453e22e1369809a7d36d2fee7719b7c7d`, mas2/Linux,
Loginom 7.4.2, 07.11.2026, 14:14–14:31 UTC, только
`https://app.loginom.ai/app/?testable=true`. Использован только worker пары
`~/.config/loginom-multica/cards/01a124e5-1623-7a32-93c7-a3754c7dbdd7/`,
собственный Package1 и три собственных синтетических файла lab998-*.
UI-жесты по data-tid; DOM и cached stores только читаются, JS Loginom не
перехватывается. CLI не собирался, модель и run-check не запускались.
Установленный Chromium native discovery — 1243, не pinned CLI-приёмка.
Архив сырых свидетельств `lab998-evidence.zip` приложен к карточке, не к Git.

`W=MF;TF-1;WizrdMCF`,
`S=W;SortingWizard;SortingColumnCollection`. Конкретный TF-1 не закрепляется
в будущем обработчике. Табличные порты остаются входом 0 и выходом 0;
ни кэш, ни потоки, ни сравнение не создают новых полей/строк/портов.
Результат сохраняет исходные значения и кратности, меняется только порядок.

## Контролы и параметры

| Возможность | data-tid относительно S | Наблюдение |
|---|---|---|
| Кэш всех данных | chkBufferWhole;ValueControl;DisplayEl | default false; затем true, сохранён после повторного открытия (14/16/21) |
| Максимум потоков | cbxMaxThreadCount;ValueControl;trg_picker; далее boundlist | Auto(0), 1,2,4,8,16,32 (13); выполнены 2 → 1 → 0 |
| Locale | chkLocaleAware;ValueControl;DisplayEl | default true, выполнен переход к false |
| Регистр ключа | colCaseSensitive_Word | default true при добавлении; false изменяет только выбранный ключ |
| Variant | colFieldDisplayName_Value, colSortDisplayName_Value, colCaseSensitive_Value | ключ native type=variant, явный false, ASC, затем RowID ASC (23) |

Поля добавляются через `colFieldDisplayName_<имя>` и btnSortingAdd либо
double-click; приоритет меняет btnMoveUp, направление — colSortDirection_*.
Настройка после изменения upstream может начинаться с
`W;TuneDataSourceInputPortWizard`. Retained Word без источника нужно явно
удалить и заменить полным новым списком ключей, не сортировать по старому
имени. Это не изменение общих правил mapping.

После выбора Auto и в начале повторного открытия наблюдалось временное
значение combobox=null, raw="", штатный readSortingBrowser отказал
`sorting_option` (18/20). После завершения загрузки — native **0** и
"Автоопределение", reader verified=true (21). Это промежуточное состояние,
не доказанный дефект и не причина ослаблять валидацию/увеличивать deadline.
Будущий writer ждёт подтверждённое значение в исходном бюджете.

## Порядок строк

`fixtures/modes.csv`: десять строк. Word ASC, RowID ASC; все значения и схема
прочитаны, не только подпись о сортировке. NULL и пустая строка различаются.

| Locale / case_sensitive | RowID в результате | Свидетельство |
|---|---|---|
| true / true | 9,10,3,6,5,2,1,4,7,8 | 14/15 |
| true / false | 9,10,3,6,2,5,1,4,7,8 | 16/17 |
| false / false | 9,10,7,8,6,2,4,3,5,1 | 19/21 |

При locale=true кириллица в этой паре стоит перед латиницей, строчные перед
прописными; при ignore-case равные буквы разрешаются RowID. Binary +
ignore-case сворачивает только Latin ASCII: a/A равны, А/а различны.
Независимый oracle задаёт явные веса узкого русского алфавита fixture,
не вызывает Python locale, Loginom или системный универсальный comparator.
Полные три таблицы совпали с этим независимым расчётом, но **идентификатор
локали пользователя не прочитан**: `readSortingBrowser.comparison.locale=null`,
locale_verified=false. Перед живой приёмкой нужно зафиксировать настройки
пары по существующему стандарту; произвольные locales/диакритика не покрыты.

Кэш и максимум потоков проверены как наблюдённые настройки в этих разных
сравнениях. Отдельные равные A/B результаты только с изменением cache или
threads ещё не запускались; соответствующие task предлагают такие циклы.
Ни ускорение, ни число реально работающих потоков из этого не следуют.

## Variant

Native discovery использовал `fixtures/variant.csv`: scalar RowID и Value
с auto Variant, NULL-маркером и десятичной точкой. Тип Value=6 зафиксирован
в импорте (22), тот же type=variant — в ключе Сортировки (23).
Результат 24: RowID **4,2,6,5,1,3**, значения
NULL, 2, 2, 3.5, 10, "text". Значит numeric сортируются численно,
а не как "10" перед "2"; NULL сохраняется, String идёт после numeric.
Повтор числа остаётся отдельной строкой с RowID.
Cached JS-значения не доказывают различие Integer/Real для каждого числа:
полная проверка subtype остаётся задачей existing bounded native decoder.

Предложенный business task **не зависит от нового auto-Variant импорта**.
`variant-wide.csv` явно импортирует Integer/Real/String, существующий Collapse
с ignore_empty=false создаёт Values Variant; RowID и Names — tie-breakers.
Его девять строк независимо вычислены oracle до будущей реализации.
Этот девятистрочный граф и его Save/cold ещё не исполнены; Boolean/DateTime,
numeric text и locale-aware Variant не объявляются покрытыми.

## Оценка этапа 1

Шесть адресных циклов: cache_all, max_threads=1→2, max_threads=2→0,
compare_with_locale=false→true, non-ASCII case=true→false, Variant.
Первым трём нужны optional literal параметры sorting-parameters.mjs и
sorting-procedure.mjs; options уже читает sorting-context.mjs и сохраняет
sorting-readback.mjs. Preservation применяется только к незапрошенным флагам.
Locale/case уже есть в schema/handler; сначала run-check, при отказе —
минимальная правка наблюдённого production-пути, не новый comparator.

Оценка — шесть циклов, предварительно 60–130 строк production-кода суммарно,
не фактический diff. Общие ожидаемые изменения только аддитивные:
node-api.mjs и тексты node-contracts.mjs, skill reference, регистрация
будущих run-check случаев. Для Variant в
`client/lib/node-procedure.mjs:263` private typedVariants сейчас включён для
variables.to_table/imports.lgd: добавить transform.sorting в существующий
список. node-port-output.mjs и variant-native-* уже содержат bounded decoder;
новый reader/верификатор не требуется. Stock ordered/cold matcher сохраняется.
Расширение этого допуска и typed cold должны проверяться на том же SHA.
Общая неаддитивная правка, packages/agent, новый критерий вне стандарта — stop.

## Бюджеты видимого модели

| Объект | База | После предложения | Лимит |
|---|---:|---:|---:|
| Карточка transform.sorting | 2651 | 3594 | 12000 |
| SKILL.md | 39961 | 39961 | 40000 |
| Строка маршрутизации | 109 | 109 | ~200 |
| references/nodes/transform.sorting.md | 677 | 2040 | 6000 |

UTF-8 JSON.stringify без pretty-print; cache_key/digests в
modes-card.proposal.json — zero placeholders, не действительные pins.
Режим keys не меняется, routing line не растёт. Дополнение reference лежит
в modes-skill.proposal.json, в продукт не устанавливалось.
Базовый budget test: exit 0, 51 тест; model_tool_bytes=14539 ≤20000,
full_input_schema_bytes=63337 (без предела). Пока компактная проекция прежняя,
новые type-specific параметры в apply не передаются; 14539 после изменения —
оценка, требующая фактического замера на этапе 1.

Нет модельной приёмки, CSV-экспорта или Save/cold этого SHA. Ожидания —
предложение по стандартным full typed/ordered/CSV/Save/cold/cleanup критериям;
после реализации необходимы ≥2/3 и независимые 2/3 на одном SHA.
