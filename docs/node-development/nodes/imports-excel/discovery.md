# Excel: checkpoint исследования этапа 0

Состояние **Blocked, этап 0 не принят**. Наблюдения 2026-10-07 выполнены кандидатом из чистого `0b88391cff0ebbfb072f401b5d295725910a748a`, обвязкой `0b57a092fead4befc903068c5e8417f20b8e5359`. Этот документ сохраняет частичный результат; он не повышает готовность реестра и не разрешает этап 1. Product XLSX CLI **NOT_RUN**; полный standalone CLI setup и отдельный status дали `ready`. Модель и конфигурация стенда не менялись.

## Среда и источники

Собственный изолированный worker, отдельные browser profiles/state/build-output/attempt. Loginom native `app.Version=7.4.2`, About и server session `PlatformEdition=Enterprise`, `IsWindows=false`; стенд назначен как Server Linux. Дистрибутив/версия ОС не наблюдались. Desktop, XLS/XLSM, HTTP/auth, W2/W3 не проверялись. Все файловые жесты относятся к собственному каталогу `excel-stage0-0921`, чужие файлы не открывались.

Нативная палитра: `ModelForm;colVendors_Компоненты>Импорт>Excel_файл;TreeText`, icon `bg-vendor-icon-importexcelfile`. Новый узел создан drag/drop. Мастер: `ImportExcelFilePreviewWizard` → `ImportExcelColumnDefsWizard` → `ColumnsMappingEngineOutputPortWizard` → `DoneWizard`. Табличный выход `Output_Data-0`, `FParam=0`. GUID определения порта одинаков у разных узлов: **нельзя использовать port GUID как глобальную идентичность**; нужен exact node + port index + owner + execution.

В приложенных результатах сохранены SHA fixture, покрытия и точные readback. Приватные сырые журналы/профили не публикуются. Публичный corpus и независимый oracle находятся в [acceptance](acceptance/README.md).

## r01: источник и область

Controls перечислены относительно `<workflow-prefix>;WizrdMCF;ImportExcelFilePreviewWizard;`. Prefix назначается новым документом; номера вкладок не являются устойчивыми идентификаторами.

| Control | Наблюдение |
|---|---|
| `edtFileName;ValueControl` | Файл/URL; для этапа 1 только одна собственная XLSX-книга |
| `cbbTableNamingMethod;ValueControl` | По номеру / По имени / Именованный диапазон; default По номеру |
| `cbbTableName;ValueContainer;cbx` | default `1`; при По имени варианты `Data`, `Other`; named range `FixtureRange` |
| `chkUsedRange;ValueControl` | default checked, весь лист |
| `cbbReferenceStyle;ValueControl` | A1 default; R1C1 альтернативная radio |
| `edtExplicitRange;ValueControl` | `B3:D6` преобразован UI в `R3C2:R6C4` при переключении reference style |
| `chkAllRows;ValueControl` | default checked; отключён при whole sheet, доступен для named range |

`Data!B3:D6`, header=1, import blanks: `(1,А,10)`, `(NULL,NULL,NULL)`, `(2,Б,20)`. A1/R1C1 проверены на одной книге. `FixtureRange=Data!$B$3:$D$6` даёт те же три строки; extend до последней строки добавляет `(3,В,30)`. Default number=1/whole sheet квалифицирован на large.xlsx. Явный sheet name проверен на малой книге.

Несколько sheet-кандидатов представлены в dropdown; native default молча выбирает номер 1. Это **не** контракт автоматического выбора для нового handler: он должен вернуть варианты, пока пользователь не выбрал лист/область. Однозначность — отдельная проверка структуры и заголовков, без изменения auto-detect columns. Обработчика выбора ещё нет; noninteractive ambiguity rejection NOT_RUN.

## r02: заголовки и пустые строки

`cbbActionBlankRow;ValueControl`: Импортировать / Исключить / До первой пустой строки; default Импортировать. `edtTitleRowCount;ValueControl`: default 1.

| Fixture/область | Наблюдённый полный результат |
|---|---|
| workbook, B3:D6, header=1, import | 3 строки, включая физически пустую |
| Та же область, exclude | 2 строки: Id 1,2 |
| Та же область, stop | 1 строка: Id 1 |
| two-headers.xlsx, whole sheet, header=2 | 1 строка `(1,А,10)`; names `Id_Identifier,Text_Caption,Amount_Total`; labels `Id\|Identifier,Text\|Caption,Amount\|Total`; types integer,string,integer |

## r03: ручная схема и sample

`ImportExcelColumnDefsWizard;cbbAutoDetectColumnsMode;ValueControl` default **Нет**. `ColumnDefsTuning;seReadRowCount` default 50. Readback 1 и 200 проверен. Native Ext maximum **2147483647**, minimum 1: UI не ограничивает анализ 200 строками; admission первого среза должен отдельно ограничить 1..200.

Grid `ColumnDefsTuning;grdSettings;grd-1;normalHeaderCt;<column>_<row>`: row 0 name, 1 label, 2 type, 3 data kind, 4 used. Наблюдены type choices boolean/date-time/real/integer/string/variant (native 1..6), kind Неопределенное/Непрерывный/Дискретный. Ручной readback: Text→Caption, label Подпись; Amount integer→real; kind Discrete; Amount used=false. Это подтверждает controls, но не завершённую persisted/cold приёмку каждой ручной настройки.

`btnRAWView`/`btnResultView` переключают исходные/преобразованные данные. `btnRefreshAll` явно перестраивает определения, `btnRefreshData` определяет типы. При Нет смена пути сохраняет старую схему; явный RefreshAll — отдельное действие. Политики Только новые/Все не исследовались и не разрешены этим checkpoint.

late-type.xlsx: строки 1..200 числовые, строка 201 содержит `late-text`. При sample=200 integer schema сохраняется. Полное чтение всех 402 ячеек даёт последнюю строку `(201,NULL)` вместо исходного текста; native warning не наблюдался. Успех исполнения и preview первых 200 строк **не доказывают отсутствия потери значений**.

## Сложные ячейки и ограничения

irregular.xlsx прочитан полностью, 4 строки × 6 колонок, types integer/string/integer/datetime/boolean/integer:

```text
1, "nonempty", 0, 2026-01-02T03:04:05, false, 3
2, "", NULL, NULL, true, NULL
3, NULL, NULL, NULL, NULL, NULL
4, "merged", NULL, NULL, NULL, NULL
```

Cached formula `=1+2` сохраняет 3. Formula без `<v>` даёт NULL; cached `#DIV/0!` даёт NULL без наблюдённого warning. Empty shared string отличается от физически отсутствующей ячейки. Merge B5:C5 сохраняет значение только B5; скрытое заполнение C5 не выполнялось. Книга не пересчитывалась и не конвертировалась в CSV. Date audit сравнивает исходный календарный clock в миллисекундах; часовой пояс значения не установлен.

Первый минимальный самописный ZIP fixture не был пригодным эталоном (COL1/Invalid row-column index). Канонический corpus заменён на стандартный XlsxWriter 3.2.9 с shared strings/styles и независимый OpenPyXL 3.1.5. Этот отказ прототипа writer не записан как несовместимость XLSX Loginom.

## Same-node и byte lineage

Нативный upload — FileStorage `btnUpload` с настоящим filechooser; download — двойной click собственного file row и browser download. Conflict prompt содержит точный destination; замена подтверждена только после сверки пути. Large: 697097 bytes, SHA256 `879e2c73c0cb4e151f861e69f7c6a6f61a91eb84c7304b4317064958bd7b8d21`; download до warm и после fresh cold дал тот же SHA.

Существующий node `7dede165-3725-404d-a058-852eb80f2529`: path library.xlsx→book-a.xlsx при фиксированной схеме Id/Text/Amount; GUID и отсутствие связей сохранились. Другие узлы не менялись. Значения v1/v2/v3 заменены v11/v12/v13 при upload bytes book-b под destination book-a. Первая проверка новых значений включала открытие и отмену wizard без Done; она не используется как чистое доказательство без configure.

Обратная замена bytes на исходный book-a проверена без открытия wizard: native deactivate, свежий Launch, полный reread всех 9 ячеек вернул v1/v2/v3 и Amount 10/20/30. Node/schema/port сохранены. SHA обеих версий и скачанной замены записан в evidence. Контракт dynamic A/B→B/C отложен до W2.

## Полное warm/cold чтение

Точный large node `a898875c-a564-4fb5-b7a0-edbba877ca77`, output 0, port GUID `58f7e6c3-511e-39d7-8853-036e0a1a7612`. Warm native process 2.1, status 3, error empty; fresh cold process 1.1 после пустого baseline нового документа, status 3, error empty. Схема Id4/Text5/Amount3/Occurred2/Active1, одинаковые names/labels и порядок. Независимый oracle проверил **каждую из 103945 ячеек в каждом профиле**, NULL и порядок; оба PASS.

Cold использовал новый browser profile и native open_package без replay старого receipt. Сохранённые source path, sheet number 1, whole sheet, header=1, import blanks, sample=50, auto=None и пять ручных типов прочитаны из wizard без восстановления. Wizard отменён штатным prompt; затем выполнен fresh Launch. Серверные bytes скачаны заново. Пакет открыт read-only из-за оставшейся блокировки первого диагностического сеанса; блокировка не обходилась, параметры не сохранялись.

Reader использует datasource cached helper `IsNull`/`AsVariant`, native typed `GetValues` blocks 100. SHA helper implementation `f3e10dab8ca1baf129a870091142bfc2ab2c77dbc853a7fcd6044c63d3f67394`. Проверяются preview owner, exact node/port, active/nonrunning node, datasource/cache/cookies, row count/schema и process history перед/после каждого блока. Первый cold read остановился с `DATASOURCE_COOKIE_CHANGED` во время инициализации; его данные не приняты. Повтор после стабилизации совпал полностью.

Гарантия только `observed_local_only`, **не atomic server snapshot**. Диагностический [prototype](acceptance/native-full-reader.mjs) извлечён из исполнявшегося кода и усилен explicit binding/fresh baseline guards; новая обобщённая обёртка проверена синтаксически и offline: exact typed NULL/0/False, отказ wrong node, старого execution, неверного count и cookie change. Live запуск именно этой версии ещё NOT_RUN. Продуктовая интеграция reader/admission/ancestry относится к W1. Обычные model preview limits не повышались. Старый текстовый cold-check не объявлен Excel oracle.

## Отказы, cleanup и точка продолжения

Нативная диагностическая ошибка при пустом filename прочитана через `btnError`: `Имя файла не может быть пустым`; OK закрыт. Intentional missing sheet/invalid range/empty/protected workbook **not_checked**, их исходные ошибки пока не известны.

corrupt.xlsx: после Next показан column stage с загрузкой; кнопка ошибки скрыта. Next/Prev не дали наблюдаемого перехода. Истёкшее ожидание не выдано за причину отказа. Мастер закрыт через точный native confirm, граф снова виден; собственный новый draft не running. Затем защищённый fixture uploaded; при следующем download browser context неожиданно закрылся. Последний download и дальнейший cleanup **AMBIGUOUS**; загрузки/скачивания не повторялись.

Cold large cleanup подтверждён: package_closed=true, logged_out=true, packages 1→0, no discard. Первый исследовательский сеанс завершился idle timeout; package cleanup не подтверждён. Последний сеанс: own new draft, readonly=false, path empty, running=false перед download; закрытие пакета/logout после browser closure не подтверждены. Локальные процессы запуска собраны до выхода; их остановка не объявляется server cleanup.

Продолжение требует Генератора: сверить/освободить только собственные диагностические сессии и разрешить восстановление после неизвестного исхода, сохранив эту попытку. Затем новая попытка: intentional failures, protected/empty, cold всех малых cases и manual properties, live усиленного prototype и повторная квалификация на финальном SHA. После полного cleanup — Review и независимая приёмка Ловцом. LAB-21 остаётся Backlog.


## Новая попытка после освобождения сессий, 2026-10-07

Исследовательский кандидат `81af6ecfe7560cd6f6c396c3dd44941223677c52` собран из чистого checkout; integrity и отдельные setup/status = ready. Профиль и попытка новые; конфигурация аккаунта, модели, runtime и стенда сохранена. Результат восстановления Генератора скачан штатным CLI. Старые download=AMBIGUOUS и cleanup=unknown не переписаны; старая попытка не изменялась.

Серверные bytes десяти канонических fixtures сверены независимым native readonly stream с гарантированным dispose; bytes/SHA совпали с manifest. Исходный спорный download workbook.xlsx не повторялся. Свои новые alias blank-exclude/blank-stop/named-extend/named-fixed содержат workbook bytes, manual/empty-schema — book-a bytes; их destination и SHA также сверены. Stream не объявляется download gesture PASS.

Live усиленного диагностического reader потребовал поддержку реального prefix `MF;TF` без числового суффикса; прежняя регулярная проверка допускала только `MF;TF-N`. Исправленная функция live прочитала large node `4a2c7a19-73c6-4bd0-996f-7343dd12aafc`, process 11.1, все 103945 ячеек. Все ordered values/schema совпали с независимым oracle. Это warm-наблюдение кандидата 81af с отдельно загруженной диагностической функцией, **не live-приёмка последующего опубликованного SHA**.

Дополнительные полные warm-аудиты, each exact node/port + fresh process baseline + persisted source/settings readback: irregular 4×6 (12.1); late-type 201×2 (13.1); two-headers 1×3 (14.1); workbook explicit B3:D6/import blanks 3×3 (15.1); exclude blanks 2×3 (16.1); R1C1/stop blanks 1×3 (17.1); named range/extend 4×3 (18.1); manual 3×2 (19.1). Sample=200 у late-type, sample=1 у manual; manual сохраняет names Id/Caption, label Подпись, types integer/string, Kind непрерывный/дискретный, Used Amount=false. Полный независимый набор ожидаемых малых таблиц задан до этих чтений и сохранён в `acceptance/expected-small-cases.json`; `oracle.py --case-bindings` проверяет exact node и каждый тип/NULL/value/order. Late string после 200 numeric rows при integer schema остаётся NULL, предупреждение не наблюдалось.

На существующем book-a узле `67544aa0-2c35-49f4-9d12-d81358502d94` намеренная смена path на book-b дала свежий process 27.1 и все 9 ожидаемых новых ячеек; GUID сохранён, path затем возвращён на book-a. Это configure-path case, не same-destination no-configure проверка.

Намеренные отказы проверены на существующем узле с закреплённой схемой: NoSuchSheet доходит до исполнения, свежий process 20.1/status 5: `Не удалось найти лист Excel`; A0:B1 отвергается на Next, кнопка ошибки показывает `Диапазон задан не верно`; corrupt и protected доходят до исполнения, свежие процессы 22.1/23.1/status 5: `Не удалось открыть Excel файл <точный собственный destination>`. Результат corrupt связан именно с 22.1, не старой ошибкой листа. Исходный workbook path/Data/B3:D6 восстановлен. Первый zero-schema corrupt loading из старой попытки остаётся отдельным наблюдением.

Новый native контекстный Download только для своего named-fixed.xlsx выполнен один раз после доказанного destination/5927 bytes/SHA. Browser download event не пришёл за 20 s, локальный целевой файл отсутствует; живой browser остался открыт, active loaders=0, выбран тот же файл. Одно page; в собственных Playwright artifacts нет файлов; persisted Chromium History, прочитанная immutable без обхода writer lock, не содержит download records. Такая запись History не доказывает отсутствие незакоммиченного события. Исход операции **AMBIGUOUS**, повтор не выполнен; прежние неизвестные операции не повторялись.

Cleanup новой попытки подтверждён отдельно: собственный пакет `/mc-01a115947dcc79a79cc4-w/excel-stage0-1019.lgp`, count=1, readonly=false, running=false; сохранение штатным Save, затем Close без discard/prompt, count=0; имя аккаунта подтверждено перед LogOut, LoginForm видна. Browser context закрыт, foreground дочерний процесс завершился exit 0. Это подтверждение не переносится на старый cleanup=unknown.

Этап 0 остаётся Blocked по стоп-условию неизвестного эффекта. Требуется решение Генератора по reconciliation нового download без повторного жеста. Остаются empty/fixed named range, same-destination replacement без configure на новой попытке, полный cold малых случаев/manual и warm/cold live reader на итоговом чистом опубликованном SHA. Product XLSX CLI NOT_RUN; LAB-21 Backlog; передача Ловцу ещё не выполняется.
