# CrossTable: живое исследование 2026-10-02

Стенд из задания, Loginom 7.4.2, собственный worker. Runtime: чистый
`5f772aea9de6414a19feb6ecc109a196c9e92453`, установленная обвязка не изменялась.
Это исследование интерфейса, не приёмка нового обработчика. Ранние числа прочитаны
из загруженного native Table в обычном формате; точные чтения отдельно отмечены
ниже. Независимый cold oracle подтвердил сохранённый исследовательский пакет.
Это не приёмка нового обработчика. Исходные fixtures находятся рядом.

## Восстановление и lifecycle

4502 повторно сопоставлена по worker, времени создания
`2026-10-02T15:17:36.367Z`, отсутствию выполнения и единственному точному пути
`/mc-01a0fce5ff8975a29468-w/stage0-20261002-1515.lgp`. Адресное закрытие через
Диспетчер подтверждено Refresh; admin вышел. 4499–4501 и reviewer не затрагивались.
Сохранённый файл оставлен (последующее хранилище показало размер 5043 байта).
Отрицательные исходы старых попыток и writer marker сохранены.

Первой новой живой операцией была минимальная проверка исправленного helper:
SaveCheckpoint → ранняя привязка точного active_identity → open_package READY →
канонический cleanup. Результат: закрытие пакета и выход подтверждены, пакетов
1 → 0, без сброса изменений. Отдельные status каждой новой попытки дали ready;
инвентарь клиента повторно проверен.

Исследование `stage0-20261002-1553` завершилось SaveCheckpoint собственного пакета
и каноническим закрытием/выходом в `16:42:04Z`, без сброса изменений. Сохранение
подтвердило тот же открытый граф, но `persisted_content_verified=false`:
проверка нового открытия ещё нужна. Предыдущий запрос с conflict_policy=fail
штатно отверг существующий собственный checkpoint; его квитанция сохранена.
Новый запрос replace заменил только checkpoint этой новой попытки.

## Наблюдённый интерфейс

Палитра «Трансформация / Кросс-таблица», native icon `bg-vendor-icon-crosstab`.
Мастер `WizrdMCF;CrossTabWizard`, заголовок ровно «Кросс-таблица».
Один табличный вход и выход. Исследованный граф: текстовый импорт → CrossTable.

Списки `grdDataFields` и `grdUsedFields`; роли выбираются кнопками
`frmMoveButtons;btnMove0/1/2` («Колонки», «Строки», «Факты»). Native Disposition
1/2/3 соответственно; GroupFunctions 29 для sum/min/max/avg, 1 для sum.
Не переносить маски Группировки. Up/Down меняют Order внутри роли; Delete на
выбранной строке удаляет назначение. Это проверено на Quantity, затем он добавлен
обратно. Одна data-tid ячейки может встречаться ещё и в summary row: выбирать
настоящую строку с привязкой к record, а не первый DOM match.

Для real/continuous факта default=sum; редактор `FactorEditDialog`, доступные
функции: sum, count, min, max, avg, stddev, sum of squares, distinct, missing,
first, last. Порядок индексов наблюдался, но полная матрица типов и функций ещё
не закрыта. Нужные функции подтверждать по native value каждого checkbox,
не по DOM input.checked.

Режим переключает общий `pedSlidingUniqueValues;ValueControl`. Радиокнопки
`ColumnEditDialog;rbSlidingUniqueValues/rbGroupValues` отражают режим и disabled.
В fixed `cbNullGroup/cbOtherGroup` доступны и по умолчанию false. В sliding
они disabled, но могут хранить прежние true: смена режима сама не очищает
латентные fixed-флаги. `fldSlidingUniqueValuesMinCount` в sliding доступен, 0.
Разделитель `|`, unique names=false, общий лимит=0; лимит disabled в fixed.

После параметров идут соответствие столбцов и общие свойства узла. До первого
Execute выходной список был пуст; после Execute маппинг содержал материализованные
поля. Наличие btnExecute в DOM не означает его видимость на текущей странице.
Причину отказа читать из наблюдённой кнопки ошибки; hidden кнопка не является
допустимым действием.

## Подтверждённая семантика ядра

Вход base: RowID/Region/Category string/discrete, Amount/Quantity real/continuous;
comma delimiter, dot decimal, NULL marker `?`. Row keys=Region,
column dimension=Category, Amount=sum/min/max/avg.

| Проверка | Наблюдение |
|---|---|
| Fixed, оба спецфлага true | Region, затем `<...>`, A, B, `<Прочее>`; 17 полей |
| Fixed → sliding | `<Прочее>` исчезает; NULL, A, B остаются; 13 полей |
| Sliding, replace без настройки CrossTable | B заменяется D, C_3 переиспользуется для D; значения пересчитаны |
| Sliding, add | NULL, A, B, C; 17 полей; North/C=12, South/C=24 |
| Sliding, drop | NULL, A; 9 полей, прежняя B исчезает |
| Sliding, empty | После загрузки 0 строк, только Region |
| Sliding, null-empty | NULL, empty string, single space, A, B, literal `null` — отдельные категории |
| All-null Amount для North/A | sum/min/max/avg отображаются пустыми, не 0 |
| Fixed, replace без настройки CrossTable | Прежняя B остаётся пустой; новая D попадает в «Прочее» |
| Повторная настройка Fixed | Категории пересобираются по текущему входу: B → D; это не проверка повторного чтения |
| Amount + Quantity=sum | Сначала все поля Amount, затем все поля Quantity; не category-major порядок |

Строки наблюдались North, South. Имена: `C_1_Amount_Sum`, `_Min`, `_Max`, `_Avg`,
затем C_2 и т.д. Внутри факта сначала категории, внутри категории функции
Sum/Min/Max/Avg. Метки: `<категория>|<факт>|<русская функция>`; для пустой строки
метка начинается сразу с `Amount|...`, для пробела — ` |Amount|...`.
Позиционное C_n не устанавливает идентичность категории. При двух фактах native
схема сначала включает весь Amount, затем весь Quantity.

Base North/B: sum=6, min=-5, max=11, avg=3; South/A: 37, 7, 30, 18.5.
Replace North/D: 10, -3, 13, 5; South/A: 41, 9, 32, 20.5.
При Fixed эти значения D идут в «Прочее» до повторной настройки.
Quantity=sum даёт North/D=2 и South/A=2, остальные непустые группы=1.
Отсутствующие пересечения отображаются пустыми.

## Загрузка и диагностические ограничения

Table может сразу после открытия вернуть старые columns и total=0 при
isLoading=false. Позднейшее чтение той же bound grid возвращало новую схему
и строки. Первый такой снимок нельзя принимать за пустой результат; нужны
проверки актуального источника и завершения загрузки в пределах исходного deadline.

Быстрые диагностические fill/Tab иногда оставляли прежний источник, несмотря
на возвращённый fill. Эффект сверялся по native FLastValue и новой метке импорта;
это не доказательство причины гонки. Раздельные fill, наблюдение и Tab подтвердили
нужный path. Штатный text-import-procedure уже наблюдает между fill и Tab.

Простые locator-отказы сохранены. Продолжение ограничивалось собственным
document, worker, единственным точным package path и отсутствием выполнения.
Часть старых diagnostic continuation IDs повторилась из-за отдельных module
cache; затем применены UUID. Этот журнал не сертифицирует W3 и не выдаётся за
аудированный приёмочный transcript.

## W2: наблюдённый формат размера

Native FileStorage record, привязанный к текущей grid: `FileName`, `FilePath`,
`Type=0`, `Size` — точное целое число байт. Видимая Size-ячейка на этом стенде:
1023 → `1,023`, 1024 → `1,024`, 1025 → `1,025`, 1937 → `1,937`,
1048576 → `1,048,576`. Wide fixture: 1702 → `1,702`.
Единицы KiB/MiB и округление на этой конфигурации не наблюдались.

Wide файл скачан штатным download (у splitbutton сначала выбирается пункт
скачивания файла). Получено 1702 байта, SHA256
`ab67f37c42193d61dfaf66120628d6dd48d11a3588a18cc299b95d2c1a6ace08`,
совпадает с fixture. Обнаруженные неоднозначные file inputs не использовались:
upload привязан к единственной активной форме собственного каталога.

## Границы наблюдения

Числовое ядро этапа 1 закреплено ниже; старые ранние гипотезы не означают
готовность других типов, variable bindings или альтернативных разделителей
для реализации. Этапы 2/3 требуют собственной приёмки.

Дополнение: новый профиль открыл сохранённый пакет с прежними GUID импорта и
CrossTable. Source patch штатным каналом изменил импорт на many-fields; после
завершения mapping/Done получена свежая owner-verified execution. Source patch
требует явно типизировать новые поля (Unused00…Unused31), иначе отказывает.
После отказа черновик закрыт канонически, draft_discarded=true; исходные
параметры не считались применёнными.

В CrossTable поле Unused31 изначально лежало ниже viewport. Wheel единственного
view tableview-2843 переместил y=0 → 163, поле оказалось видимым и добавлено
в строки; после обратного Wheel и bounded read y=0 на том же view. Роли:
Region Order=0, Unused31 Order=1. Результат: North/x с Amount 40/10/30/20,
Quantity=2; South/x с Amount=7, Quantity=1. Существующий output mapping
сохранил прежний порядок и добавил новый Unused31 в конец. Поэтому порядок
ролей и порядок материализованных полей нельзя считать одним и тем же.

Точный W2 binding дополнительно подтверждён: grid classname
`bg.filedialog.FileStore`; view.getRecord(row) — cached model текущего store,
view.getNode(record) === row, view DOM содержит эту строку, grid.el.dom совпадает
с наблюдённым контейнером. Для wide: id и FilePath совпадают с точным полным
путём, FileName совпадает с видимой ячейкой, Type=0, Size=1702. FullFilePath
отсутствует; правильное имя native свойства — FilePath.

Для отдельного numeric fixture (190 байт, SHA256
`ee4890db902599283bb352e9fe1f3ad9bfb243c619b4873012e419d3b1a5b8ce`)
real Amount содержит 2,4,4,4,5,5,7,9. Sum=40, min=2, max=9, avg=5,
Quantity sum=8, StdDev отображён как 2,138089935: делитель n−1. Checkbox
stddev — chb-5, native mask стал 61 для sum/min/max/avg/stddev. Новые поля
StdDev в существующем mapping добавились в конец, после Quantity; это ещё
одна причина снимать фактическую выходную схему вместо угадывания порядка.

W2 реализован отдельным коммитом `cae427bc4`: bytes берутся из привязанного
native FileStore record; формат отображения не парсится. Локальные тесты
workspace-ui и artifact-discovery: 298 PASS, 0 FAIL. Native обновлённый
кандидат ещё не собран/не принят; этот результат не закрывает W2 приёмку.

## Integer: отдельный импорт и типы результата

Изменение input definition существующего импорта на integer не изменило
его прежний real output mapping. Поэтому для матрицы создан новый импорт
GUID `45667ae0-8127-4c22-9dff-503c6681677f` и отдельный CrossTable
`6f1c67e4-5d33-496d-89ca-c96bb9708db2`; прочие узлы и связи сохранены.
Нативный CrossTable подтвердил Amount DataType=4, DataKind=1. Все 11 функций
доступны, умолчание — Sum; выбранный mask=2047.

Первый вход с текстом `2.0`…`9.0` оказался непригоден для integer parser:
Count=8, NullCount=8, UniqueCount=0, прочие результаты пусты. Он сохранён
как отрицательное наблюдение входа, а не проверка числовых агрегатов.
Повтор выполнен с `numeric-integer.csv` (158 байт) и литералами без `.0`.
Штатная смена источника и свежее выполнение того же CrossTable дали:

| Функция | Наблюдённый тип | Значение |
|---|---|---|
| Sum | real | 40 |
| Count | integer | 8 |
| Min | integer | 2 |
| Max | integer | 9 |
| Avg | real | 5 |
| StdDev | real | 2.138089935299395 |
| SumSq | real | 232 |
| UniqueCount | integer | 5 |
| NullCount | integer | 0 |
| First | integer | 2 |
| Last | integer | 9 |

Типы прочитаны по полным нативным определениям Table через канонический
`configureTablePrecision`; формат каждого числового поля подтверждён.
Результат снят после подтверждённой fresh execution `:452:12` в документе
`1790959587477-6n6xnr2cb14`, с проверенным owner. Для StdDev получен
`2,138089935299395E+00`, подтверждая делитель n−1 и для integer.
Это исследование, не автономная приёмка нового обработчика.

Sliding с одной категорией A, минимумом 3 и общим лимитом 0 материализовал
34 поля: Region и три группы по 11 функций. Группы C_2 и C_3 имеют метки
`2|Amount|...`, `3|Amount|...`; все их пересечения пропущены. Минимум — резерв
выходных групп, а не частота категории. Свежая execution `:452:14`.
Глобальный переключатель надёжно изменяется через наблюдённый DisplayEl:
центр широкого ValueControl не менял значение, InputEl закрыт DisplayEl.
Эти диагностические отказы сохранены, последующее native readback подтвердило
Sliding=true и минимум 3; первоначальные clicks не считались успешной настройкой.

Общий Sliding limit=1 при минимуме 3 сократил схему до одной группы A
(12 полей). После source patch на восемь категорий A…H тот же узел без
перенастройки успешно выполнился (`:452:19`), но сохранил только A:
Sum=2, Count=1, StdDev=0. Остальные категории отброшены; native ошибка
выполнения не появилась. Limit — верхняя граница групп, включая резерв;
это реальное усечение данных. Этап 1 ограничен подтверждённым limit=0,
min_values=0, а иной запрос должен получить отказ до мутации.

UniqueValueNames=true, Sliding, limit=0/min=0: `names.csv` дал 89 уникальных
полей (Region + 8 категорий × 11 функций), полные определения прочитаны
каноническим Table format reader по 12 страницам; диалог отменён без изменения
форматов. NULL использует `NullGroup_Amount_Sum`; empty — `Amount_Sum`;
space — `__Amount_Sum`. `A_1` → `A_1_Amount_Sum`, `A-1` →
`A_1_Amount_Sum_1`; `Privet` → `Privet_Amount_Sum`, `Привет` →
`Privet_Amount_Sum_1`. Литерал `null` — `null_Amount_Sum`. Нативные метки
сохраняют исходную категорию. Коллизии транслитерации получили суффиксы,
категории не слились. Порядок materialized mapping записан как наблюдение,
а не правило сортировки. Этот режим не входит в этап 1.

W2 дополнен живыми файлами 900/1536/3072 байта. Native Size равен точному
размеру, id=FilePath; view.getRecord(row) совпадает с записью FileStore.
Отображение: `900`, `1,536`, `3,072`. Все эти файлы — в собственном каталоге.

Матрица доступности на `types.csv`: string (DataType=5) и boolean (1)
имеют маску 1934, умолчание Count=2: Count/Min/Max/UniqueCount/NullCount/
First/Last. Datetime (2) — 1982, Count по умолчанию; дополнительно Avg и
StdDev. Real (3) — 2047, Sum по умолчанию. Для continuous Amount кнопка
Columns disabled=true, Rows и Facts enabled; ограничение discrete относится
к колонкам. Результирующие типы/значения проверены в следующей попытке (ниже).

Попытка 1645 завершена в 17:57:46Z с каноническими package_closed=true,
logged_out=true, unsaved_changes_discarded=true. Ошибка ожидания угаданной
метки Amount(+3) произошла до движения мыши; actual label был RowID(+3).
Нативный мастер упорядочил выбранные факты по порядку входных полей;
после перемещения следует явно задать требуемый порядок Up/Down и проверить его.
Исходный uncertainty marker и отрицательный результат оставлены.

В 1800 после initial SaveCheckpoint/open_package первый begin_wizard
нормализовал DOM breadcrumbs `Package1` → `stage0_20261002_1800`.
Исходная квитанция AMBIGUOUS не переписана. Read-only сверка нормализованного
пути подтвердила тот же prepared document/workflow, package и GUID импорта.
Выполнена только каноническая отмена собственного мастера: draft_discarded=true,
settings_applied=false; затем canonical cleanup package_closed/logged_out=true
в 18:03:13Z. Старые попытки и saved файлы оставлены. Следующее исследование
готовится через новое открытие сохранённого bootstrap в новом профиле;
установленная обвязка и общие контракты не изменены.


Попытка 1804 после отдельного ready открыла saved bootstrap в свежем профиле.
Нормализованный путь подтверждён до begin_wizard; канонические import/link/create/
configure/Execute отработали без восстановления настроек по guessed breadcrumbs.
Матрица `types.csv` прочитана штатным Table reader: все 35 полей, одна строка,
sample_complete=true, numbers_verified=true, ни одной precision limitation.
Один NULL в каждой колонке: Count=3, UniqueCount=2, NullCount=1. Amount:
Sum=6, Min=2, Max=4, Avg=3, StdDev=1.4142135623730951, SumSq=20,
First=2, Last=NULL. String: Min=a, Max=z, First=z, Last=NULL; Boolean:
Min=false, Max=true, First=true, Last=NULL. Datetime: Min=2026-01-01,
Max=2026-01-02, Avg=2026-01-01T12:00:00.000, StdDev=0.7071067811865476
(real, дни), First=2026-01-02, Last=NULL. Count/UniqueCount/NullCount —
integer; Min/Max/First/Last сохраняют тип факта, Avg real для числа и datetime
для datetime. First/Last включают NULL и порядок исходных записей.
Точный числовой readback не меняет статус приёмки обработчика.

Канонический returnFromOutputTable вернул тот же prepared node в его graph;
GUID-bound target rename применил `Исследование CrossTable · types` с receipt
SUCCEEDED и проверенным readback. Контракт target.label подтверждён без
угадывания auto label. Cleanup 1804 в 18:18:30Z: package_closed=true,
logged_out=true, unsaved_changes_discarded=true. Bootstrap и предыдущие файлы
сохранены; текущий исследовательский граф не выдаётся за persisted результат.


Отдельная попытка 1820: сохранённый пакет 1553 открыт в новом браузерном
профиле, тот же CrossTable GUID; свежая execution без повторной настройки.
Независимый Python grouping исходного `replace.csv` зафиксировал ожидаемые
21 поле и 2 строки до запуска штатного cold-check. Полное точное чтение
совпало по именам/меткам/типам и всем ячейкам, result=PASS,
settingsReapplied=false, cleanup package_closed/logged_out=true. Сохранённая
fixed конфигурация содержит NULL/A/D/Other: D была захвачена последней
настройкой в исходной исследовательской попытке. Это не доказательство
сохранения исходной B после перенастройки и не автономный CLI PASS.

В 1830 новое открытие и мастер подтвердили сохранённые GroupFunctions
Amount=29, Quantity=1, Category NullGroup/OtherGroup=true, минимум=0,
Sliding=false, UniqueNames=false, Separator=|, Limit=0. Edition нативного
клиента `bg.app.PlatformEdition=Enterprise`, Version=7.4.2; отдельный build
номер не объявляется, если не показан этим интерфейсом. Dropdown разделителя
содержит ровно `.`, `|`, `->`, `Пробел` (value один пробел). Каждый вариант
выбран через GUI и прочитан, затем возвращён |; канонический Close отменил
черновик (settings_applied=false, draft_discarded=true). Изменение выходных
меток с прочими разделителями остаётся вне этапа 1.

В сохранённом сценарии без подключённых пользовательских переменных каждый
VariableControl имеет value=null и isVisible(true)=false, SwitchButton
pressed=false/hidden; статический ValueControl видим. Это наблюдённое
статическое состояние, а не проверка привязки переменной. Управляющие
переменные и variant-агрегаты не подтверждены для реализации и остаются
отдельными этапами 3/2; их запросы этап 1 отвергает до мутации.

Этап 0 закрывает контракт ограниченного ядра: numeric integer/real facts
sum/min/max/avg, один discrete string column dimension, discrete row keys,
fixed/sliding с limit=0, min=0, separator=|, UniqueNames=false, без output
переопределений и переменных. Остальная семантика описана наблюдением либо
явной границей; дополнительная реализация не выводится по аналогии.
Версионированный независимый oracle/expected/initial и business task созданы
до обработчика. Контракт runtime `transform.cross_table`, mode `pivot`.

Cleanup 1830 в 18:27:05Z: package_closed/logged_out=true, unsaved_changes_discarded=false. Сохранённый исследовательский пакет не изменён.

Дополнительная проверка 1850: native F3 FColumnInfosStore не содержит DataKind, cachedProps пуст. Вид данных подтверждается только полным собственным редактором выходного порта и отрисованной таблицей определений. Cancel неизменённого редактора подтвердил settings_applied=false, но деактивировал тот же upstream port GUID (active true→false). После Cancel тело узла заменяется; повторное связывание с refreshReplacedBody=true восстановило наблюдение. Preflight обязан сохранять этот эффект в журнале и не выдавать отказ как effect_possible=false. Канонический cleanup этой попытки подтвердил закрытие пакета и выход без сброса изменений.
