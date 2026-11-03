# Экспорт в Excel: этап 0

Дата: 2026-10-31. База: `origin/v039` на
`3377e6b164bcf509a050fb1536bae8dbf8bece39`. Назначение LAB-641.
Статус: **blocked**, готов приёмочный проект; общие изменения требуют решения
владельца. Runtime не изменён, CLI не собирался, модельные прогоны не запускались.

## Наблюдалось на стенде

Только `https://app.loginom.ai/app/?testable=true`, worker из назначенной пары
`01a124e5-1e74-70ef-b9ea-b289e04cf35c`. Создан только собственный пакет
`lab641-excel-discovery.lgp`. Действия — по `data-tid`, чтение UI и кешированных
объектов; внутренний JavaScript Loginom не подменялся, data proxy не вызывался.

Версия `bg.app.Version`: **7.4.2**. Редакция и ОС сервера не установлены.
В палитре есть `Экспорт > Excel файл`, идентификатор элемента:
`MF;TF-1;ModelForm;colVendors_Компоненты>Экспорт>Excel_файл;TreeText`.
Созданный узел имеет icon class `bg-vendor-icon-exportexcelfile`.
`component.exports.Excel` — component/fulltype из назначения; самостоятельное
чтение fulltype в UI не выполнено. Не выдавать это за подтверждение data proxy.

Порты на DOM узла:

| Native suffix | Предлагаемый публичный смысл |
|---|---|
| `Input_Connection-0` | Подключение; в этапе 1 только локальное |
| `Input_Data-1` | Единственная входная таблица, логический input 0 |
| `Input_Var-2` | Управляющие переменные, вне этапа 1 |
| Нет `Output_Data-*` | Табличного output нет; `read.ports=[]` |

Открытие `Graph;Excel_файл;Setting` показало страницы
`TuneDataSourceInputPortWizard` → `ExportExcelFilePreviewWizard` → `DoneWizard`.
Первая страница позволяет пройти дальше без подключённой таблицы; это не
доказательство успешного исполнения пустого входа. Полная основа `data-tid`
параметров — `MF;TF-1;WizrdMCF;ExportExcelFilePreviewWizard;`.

| Control suffix | Наблюдённое значение / варианты |
|---|---|
| `edtConnection` | `Локальное` |
| `edtFileName;ValueControl` | Пустая строка |
| `edtSheetName;ValueControl` | Пустая строка; не «Лист 1» |
| `cbbFileType;ValueControl` | `1` / Excel 2007; также `0` / Excel 2003 |
| `cbbHeadersRow;ValueControl` | `2` / Метки полей; `0` / Нет строки заголовков; `1` / Имена полей |
| `cbbFloatFormat;ValueControl` | `0` / Общий; `1` / Числовой |
| `pedDecimalCount;ValueControl` | `2`; граничные значения не проверены |
| `chkDivideThousands;ValueControl` | `false` |

Для пути, листа, формата, заголовка и числовых настроек присутствуют controls
переменных. Их наличие не расширяет объём этапа 1.
Есть «Активация и просмотр»; её не нажимали. Время создания файла, поведение
Execute, train/apply и повторного исполнения **не проверены**.
Предложение: sink без обучения; только режим `xlsx`; не предлагать модели train
или отдельный apply. Это проект контракта, а не наблюдённый успешный запуск.

Отказ: на странице Excel нажат `WizrdMCF;btnNext` с пустым путём.
Появилась `WizrdMCF;btnError` («Подробнее...»), через неё открыт диалог:
`msgbox;cnt;cnt;MessagesView` → **«Имя файла не может быть пустым»**.
Кнопка Next стала «Всё равно далее». Продолжение с ошибкой не выполнялось.
Диалог закрыт OK; собственный мастер закрыт с его подтверждением. Пакет сохранён
через `MF;MainMenuForm;btnSavePackage`, закрыт штатным `btnClosePackage`.
Затем наблюдалось `PackageNodes.Count=0`, выполнен `AppMenuForm;btnLogOut`,
наблюдалась видимая `LoginForm;Login;edtUsername`. Browser context закрыт.
Файл Excel не создавался; это UI discovery, не бизнес-PASS.

## Предлагаемый контракт этапа 1

`exports.excel` / `xlsx`, палитра `Экспорт`, один табличный input 0, ноль
табличных outputs. `output.file_artifacts` — по существующей доставке текстового
экспорта; выдуманный output 0 запрещён. Параметры — отдельный объект
`parameters.excel_export`, чтобы не менять описания или enum прежних узлов.
Полная предлагаемая `parameter_schema`: [parameter-schema.json](acceptance/parameter-schema.json).
У каждого поля есть description, все enum строковые. Для нового узла обязательны
четыре поля; для существующего `{}` сохраняет настройки, непустой объект — patch.
Неподдержанные сохранённые настройки отклоняются до исполнения.

Текст для `NODE_TYPES.semantics`:

> Export the current input table to one new XLSX workbook and one explicitly named
> worksheet. Use parameters.excel_export: destination, sheet_name, header, overwrite.
> Preserve source row and field order and scalar values; keep formula-like text as
> text. No training. read.ports=[]; Execute returns output.file_artifacts. Done only
> saves settings. Close discards the wizard draft. Existing destinations, variables,
> XLS, multiple sheets, append and numeric formatting overrides are unsupported.

Предлагаемые проверки до записи: собственный абсолютный `.xlsx` destination,
отказ существующему файлу (`overwrite=reject`), непустой лист до 31 символа,
без `[]:*?/\\`, без начального/конечного апострофа; никаких замен/append.
Фиксировать Excel 2007 и общий числовой формат. Порты переменных и подключения
вне локального режима отклонять. Неизвестный исход записи не повторять автоматически.
Уточнение такого отказа остаётся обязанностью общего жизненного цикла.

Предлагаемый компактный readback: `destination`, `sheet_name`, `format:xlsx`,
`header`, `overwrite:reject`, `number_format:general`,
`input_mapping:{port:0,fields:[{index,name,label,type}]}`; отдельное подтверждение
сохранения пакета выполняет штатный Save. Квитанции и доказательства происхождения
в этот комплект не добавляются.

NULL — отсутствующее/пустое числовое значение ячейки; пустая строка — явно
строковая ячейка с пустым содержимым. Они должны оставаться различимыми в OOXML.
Если штатный exporter их схлопывает, критерий не ослаблять: вернуть владельцу.
Числа — числовые ячейки (Excel не хранит самостоятельный тип integer), Id должен
быть целым; Active — boolean, Occurred — дата/время с date-style либо `t=d`;
Text — строка, включая `=SUM(A1:A2)` без `<f>`. Никакой конвертации через CSV
для результата. Amount: abs `1e-9`, rel `1e-12`; дата: `1 мс`, локальное время
без timezone. Строки, NULL и boolean сравниваются точно. Порядок полей и строк
точный. Native integer/real schema требует отдельного cold-read входа, поскольку
XLSX хранит оба как numeric; один XLSX этого не доказывает.

## Приёмочное предложение

До любых модельных прогонов созданы [fixtures](fixtures/) и
[acceptance](acceptance/README.md). Базовый результат: 5 строк × 5 полей,
25 значений, 4 NULL, одна пустая строка, один формулоподобный текст. Сумма Amount
`1242.06789`. С заголовком — 6 × 5 = 30 позиций ячеек, без него — 25.
`empty.csv` содержит только заголовок; отдельный предлагаемый case — лист с пятью
заголовками без строк данных. Расширенные режимы/перезапись в комплект не включены.

Независимый oracle читает ZIP/XML XLSX стандартной библиотекой Python, проверяет
весь малый лист, типы, значения, порядок, единственный лист и отсутствие формул.
Тестовый writer — openpyxl; не Loginom и не runtime. Прогон этих тестов квалифицирует
reader, но не узел, доставку, сохранение или cold-check.

## Общие изменения, требующие решения

Это вывод по коду базы и наблюдённой странице Excel, не исправленный runtime-дефект:

1. `client/lib/workspace-ui.mjs:334` содержит `wizardMarkers` текстового экспорта,
   но не `ExportExcelFilePreviewWizard`; stage enum, чтение и действия параметров
   тоже имеют специальные ветви текстового экспорта (`:39`, `:2099`, `:4736`).
   Нужна минимальная поддержка наблюдённой страницы в общем observer/action коде.
2. `client/lib/node-apply.mjs:589` ограничивает осторожное освобождение sink
   строкой `exports.text`; обработка отказа скачивания также ограничена ей (`:222`).
   Добавления handler в dispatch недостаточно для равной файловой семантики
   отмены/ошибки. Нужна отдельная минимальная правка общего lifecycle.
3. `scripts/node-acceptance/run-check.py:842` обрабатывает результаты как CSV,
   а `expected-outputs.mjs:12` требует числовой output_port и табличные outputs.
   `cold-check.mjs:194` / `resolveExportInput` привязаны к `exports.text`.
   Только записи имени нового сценария недостаточно: требуется согласовать XLSX
   oracle/delivery и cold sink-путь без фиктивного табличного выхода. До согласования
   этот expected.json не передаётся stock run-check. Менять общий verifier здесь нельзя.

Изолированную реализацию мастера и декларативную регистрацию можно делать в
собственных файлах узла. Копирование lifecycle или собственного раннера проблему
не решает. Общий бюджет схемы, deadlines и `packages/agent` менять не требуется.

Размер измеряет [schema-size.mjs](acceptance/schema-size.mjs), по той же полной
inputSchema, что `node-caption-schema.test.mjs`: **43 329 → 44 263 Б**, приращение
**934 Б** (type 16, параметры 722, условие пустых портов 196); `xlsx` уже есть.
Это оценка до регистрации, без изменения production-кода. Запас до 46 000 Б —
1 737 Б; бюджет всего состава v0.3.9 проверяется отдельно. Каждый новый комментарий
схемы на этапе 1 должен войти в повторный замер.

Оценка этапа 1 после разрешения общих изменений: **3–4 цикла** — UI/регистрация;
файл/типы/порядок; доставка/cold; при необходимости отказ/повторная квалификация.
Обязательны client-full, acceptance-tests по путям, ≥2 PASS из 3 и независимые
2/3 на одном SHA. В этой карточке ни одна такая приёмка не выполнена.

Переход в `ready_for_development` требует решения владельца по предложенному
контракту и указанным общим изменениям. До него статус `blocked` сохраняется.
