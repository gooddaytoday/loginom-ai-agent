# Расширения Замены: предложение этапа 0

LAB-1003, 2026-11-07, mas2. База `v040@35e83289792225b153ce2ffd6f62f708c16800b4`.
Критерии ниже ждут решения владельца; runtime и поставляемый навык не менялись.
Исследование — Loginom 7.4.2, только https://app.loginom.ai/app/?testable=true,
новый собственный черновик worker назначенной пары. Модельных PASS нет.

## Наблюдения и границы

Префикс мастера R = `MF;TF-1;WizrdMCF;ReplaceColumnsWizard;`.
TF и автоматически формируемая метка узла меняются; использовать текущий DOM.
Чтение только DOM; вычислитель и внутренний JavaScript Loginom не подменялись.

| Возможность | Нативный выбор по data-tid | Наблюдённый результат / граница |
|---|---|---|
| Boolean | R `btnTypeChange` + ArrowDown → `itmTypeChangeBoolean`; редактор `ReplaceEditor-1;fldVariant;ValueContainer;cbx;boundlist;true/false` | yes→true, no→false, other=null: Boolean; unknown и исходный NULL дают NULL, флаг true; все 8 строк просмотрены |
| result_type + keep | Тот же Boolean; `cbxReplaceOther;boundlist;Не_заменять` | Схема Variant (`colSourceName_Status` с `bg-TBGDataType-dtVariant`); true для yes, исходные no/unknown и NULL для остальных; флаг только для совпадений |
| Смешение exact/regex | `grdReplaceItems;tbl;GroupHeader;0/1;AddButton` в одном поле | exact AB-12→EXACT-FIRST раньше regex AB-([0-9]{2})→REGEX; XAB-34Y тоже целиком REGEX, ab-56 неизменён; 8 строк просмотрены |
| Regex с иным типом результата | `itmTypeChangeInt`, затем обратно `itmTypeChangeStr` | При integer группа 1 исчезает; при string возвращается. Типизированный regex в исследованном UI недоступен |
| Подстановка групп | Редактор regex содержит строковую константу и NULL, контекст строки — импорт/экспорт/сортировка/тип/редактирование | Переключатель подстановок не найден. Существующая семантика `$1` — литерал; не объявлять поддержку замены части строки |
| Внешняя таблица | Graph `Input_Add` → второй табличный вход; R `grdDataList;tbl;celleditor;cbx;boundlist;Таблица_замен` | Ввод вручную сменяется таблицей `grdInputSource`; входы/выход 0 прежнего узла сохраняются |
| Роли справочника | `colInputSourceUsage_<имя>` → `grdInputSource;tbl;celleditor;cbx;boundlist;Значение/Замена/Информационное/Не_используемое` | Список фильтруется типом: при Boolean-результате строковое поле не предлагается как Замена. Code→Status плюс Keep как информация дали CodeKeep, Boolean Code_Replaced и 8 исходных строк |
| Импорт/экспорт правил | R `btnLoad`, `btnSave` и одноимённые пункты контекстного меню | rules.tsv загрузился как три exact-пары, ? распознан как NULL; экспорт ReplaceTable.txt (36 Б, UTF-8 без BOM, TAB/LF, без завершающего LF) и повторный импорт сохранили пары. Это удобство редактора, не новая семантика результата; отдельного цикла runtime не предлагается |

Во внешнем исследовании использовался один собственный импорт input.csv на
обоих входах: Value=Code, Replacement=Status, Information=Keep, Id не используется.
Это подтвердило совпадения NULL и пустой строки, добавление информации и
сохранение 8 строк. Приоритет дубликатов и unmatched информационного поля
на отдельном rules.csv пока `not_checked`; это предложенные критерии, не PASS.
Для Boolean и mixed исследовались значения Code/Status одного узла; комплекты
ниже разделяют их, чтобы каждый будущий сценарий проверял одну возможность.
Режим add остаётся прежним; живое исследование расширений использовало replace.

Схема выхода читается на `DerivedDataSourceMappingEngineOutputPortWizard`:
`colSourceName_Status` имеет иконку dtBoolean при other=null и dtVariant при keep.
Значения — `MF;TF-1;ModelForm;PreviewWindow;PreviewForm;DataSetForm;normalHeaderCt;`
`Status_<0..7>`, `Status_Replaced_<0..7>`, `Code_<0..7>`, `CodeKeep_<0..7>`.
Форматированный DOM не доказывает внутренние Variant-подтипы — для будущего
PASS нужен уже существующий native completed-port reader и typed matcher.

## Комплект и предложенные критерии

Все входы — `../../fixtures/extended/`, форматы и размеры — manifest.json.
`oracle.py` использует csv, re и обычные словари Python, не импортирует Loginom,
runtime или UI. Expected формируются до модельных прогонов.

| Задание в acceptance/ | Expected в этом каталоге | Статус предложения |
|---|---|---|
| `task-boolean.md` | `expected.json` | На утверждение: 8×5, Boolean/NULL/false и все флаги |
| `task-mixed.md` | `expected-mixed.json` | На утверждение: 8×5, exact приоритетнее regex, whole-cell constant |
| `task-external.md` | `expected-external.json` | На утверждение: 8×6, первый дубликат, NULL/empty, CodeInfo; не join с размножением |
| `task-result-keep.md` | `expected-result-keep.json` | На утверждение: 8×5, Variant с явным cell_type у каждой непустой ячейки |
| `task-regex-type.md` | `expected-regex-type.json` | Условная гипотеза: UI режима не предоставляет; не назначать прогон |
| `task-groups.md` | `expected-groups.json` | Условная гипотеза: подстановка SKU-$1 с сохранением окружения не найдена; не назначать прогон |
| `task-rules-file.md` | `expected-rules-file.json` | Ручной roundtrip существующего редактора, не отдельный цикл runtime |

Последние три задания и expected — описание желаемого результата для решения
владельца, не доказательство нативной возможности и не активная матрица.
Транспорт файла правил в предложенную карточку типа не включён.

Для четырёх доступных предложений: весь выход 0, точные типы/значения/NULL,
точный порядок столбцов через autosync=false, мультимножество строк,
метки label_any, повторное выполнение того же узла, CSV с ?, Save и cold
без восстановления настроек из expected. Для внешней таблицы нужны только
input.csv и rules.csv, для roundtrip — input.csv и rules.tsv, для остальных —
только input.csv. Ни oracle, ни expected, ни proposal-card модели не передавать.
При Variant CSV — дополнительная проверка; native subtype proof обязателен.
Это существующий формат expected и критерий точных типов, не новый matcher.

После отдельного назначения этапа 1: cold PASS; ≥2/3 PASS исполнителя и ≥2/3
независимых PASS на том же SHA под отдельным аккаунтом; CSV/Save/cleanup.
Только штатный run-check start+wait. На этапе 0 CLI не собирается и не запускается.

## Файлы и размер будущей правки

| Срез | Собственные production-файлы | Оценка после утверждения |
|---|---|---|
| Boolean | replacement-parameters/context/procedure/output/readback.mjs | 1 цикл, один PR |
| mixed | replacement-parameters/context/procedure/readback.mjs | 1 цикл, один PR; сохранить незапрошенную группу |
| external | replacement-preflight/parameters/context/procedure/output/readback.mjs | 2 цикла, по одному PR с новым живым сценарием; роли, повторное чтение, сохранение |
| keep при result_type | replacement-parameters/context/output/readback.mjs | 1 цикл, один PR, если существующего native Variant reader достаточно; иначе blocked до общей правки |
| Regex type / группы | — | 0: UI возможности не обнаружены, нужна граница от владельца |
| Файлы правил / сортировка / получение значений | — | 0: удобства UI без отдельной семантики результата |

Аддитивная схема типа — node-api.mjs/.d.ts; типовой каталог — node-contracts.mjs;
динамические входы external потребуют additional_tabular_inputs=true вместо false.
Это предложение изменения существующего публичного контракта, не разрешение
его менять. Общие узлы/диспетчеры/reader не рефакторить; при необходимости
изменения общего поведения — остановка и решение владельца. Native Variant
capability уже находится в node-port-output.mjs / variant-native-read.mjs.
Новых механизмов проверки не предлагается.

`node-type.proposal.json` — суммарное предложение, а не установленная карточка;
все hash-поля — 64 нуля. `skill-node.proposal.md` заменяет файл узла целиком.
Расчёт размеров и воспроизведение — в новых разделах двух подпланов.
