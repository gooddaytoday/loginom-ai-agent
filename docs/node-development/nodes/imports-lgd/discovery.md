# LGD: этап 0 LAB-772

Статус **blocked; предложение для утверждения**, 04.11.2026.
База `origin/v040@2910b8782c1ad8c016c6fc478369ddd179457e3e`;
клиент Linux x64, mas. Исследован только новый собственный черновик пары из
назначения через `https://app.loginom.ai/app/?testable=true`. Все жесты — по
наблюдённым `data-tid`, без вызовов внутренних обработчиков Loginom.
Runtime-код, production skill и общий verifier не изменены; CLI не собирался.

## Подтверждённый интерфейс

About: `MF;TF-1;About;lblVersionValue` → **7.4.2**,
`lblPlatformEditionValue` → **Enterprise**. ОС и bitness сервера в этих полях
не показаны; Linux клиента не доказывает ОС сервера.

Палитра собственного workflow:
`MF;TF-3;ModelForm;colVendors_Компоненты>Импорт>Loginom_Data_файл;TreeText`
и аналогичный путь `Экспорт>Loginom_Data_файл;TreeText`.
Обе позиции доступны, штатный drag на `ModelForm;cmpDiagram` создал узлы.
Их одноимённые графовые `data-tid` различаются суффиксом `@0`; подпись
не является идентичностью типа.

| Направление | Наблюдённые порты графа | Предложение логических портов |
|---|---|---|
| Импорт | Input_Connection-0, Input_Var-1, Output_Data-0 | 0 табличных inputs, table output 0 |
| Экспорт | Input_Connection-0, Input_Data-1, Input_Var-2; табличного output нет | table input 0, 0 табличных outputs |

`component.imports.Lgd` / `component.exports.Lgd` взяты из назначения.
Native fulltype **не подтверждён**: у SVG узла нет `data-fulltype` (null).
Runtime `imports.lgd` / `exports.lgd`, mode `native` — проект контракта;
доступность палитры не означает регистрацию этих runtime handlers.

Импорт: открытие `Graph;Loginom_Data_файл;Setting` показало
`WizrdMCF;ImportNativePreviewWizard`, заголовок «Импорт из Loginom Data файла».
Controls под этим root: `edtConnection` = «Локальное», `btnConnect` =
«Подключено», `edtFileName;ValueControl` пустой, `trg_picker`,
информационные `edtCompression`, `edtDDFSystem`, `edtWrittenChecksum`
пустые; `edtUseChecksum;ValueControl;InputEl` / `DisplayEl`.
Присутствие checkbox подтверждено; значение не выводилось из `.checked`
у input кнопочного типа. Preview — «Нет данных для просмотра».
На пустом пути Next показал `WizrdMCF;btnError`; через него
`msgbox;cnt;cnt;MessagesView` прочитано **«Имя файла не может быть пустым»**.
Продолжение с ошибкой не выполнялось. Диалог закрыт OK, мастер закрыт
с собственным подтверждением.

Экспорт: `Graph;Loginom_Data_файл@0;Setting` →
`WizrdMCF;TuneDataSourceInputPortWizard`; Next без данных позволил открыть
`ExportNativeParamsWizard`. Это наблюдение навигации, не успешный экспорт.
Поля `...;ValueControl` на странице:

| Control | Наблюдённое значение |
|---|---|
| edtConnection | Локальное |
| edtFileName | пустое |
| cbbCompression | LZ4 |
| cbbWriteChecksum | Сжатых данных |
| edtStringCacheMaxSize | 131072 |
| edtStringCacheMemoryUsage | 0 байт |

Есть `PreviewPanel;btnActivateAndView` («Активация и просмотр»); не нажимали.
Next с пустым путём показал btnError; тот же MessagesView сообщил
**«Имя файла не может быть пустым»**. Диалог и мастер закрыты штатно.
Файл не создавался. DoneWizard, последующие страницы импорта, Execute,
train/apply, сохранение настроек и повторное открытие **NOT_RUN**.
Узлы предлагаются как не требующие обучения; это ещё не live-проверка.

[Справка импорта](https://help.loginom.ru/userguide/integration/import/ldf.html)
описывает сохранённые свойства полей и проверку checksum по умолчанию.
[Справка экспорта](https://help.loginom.ru/userguide/integration/export/ldf.html)
указывает штатный LZ4 и checksum сжатых данных. Эти параметры совпадают с
наблюдением экспорта. Остальные режимы справки в текущий срез не включены.

## Контракт, предлагаемый до этапа 1

Тексты `NODE_TYPES.semantics` и схемы с description у каждого свойства:
[imports](acceptance/type-proposal.json),
[exports](../exports-lgd/acceptance/type-proposal.json).
Все enum строковые. Новое создание импорта требует source и checksum=verify;
экспорт требует destination/compression=lz4/checksum=compressed/overwrite=reject.
`{}` существующего узла сохраняет настройки, непустой объект — patch.
Проверять поддерживаемость сохранённого режима до мутации/Execute.
Отказывать переменным, внешним подключениям, DDF, Variant, смене сжатия,
перезаписи/append и неподдержанным mappings до изменения графа.
Путь нового файла — собственный абсолютный `.lgd`; результат sink —
`output.file_artifacts`, без выдуманного табличного порта.

Компактный readback импорта: `source_path`, `checksum:verify`, наблюдённые
`compression`, `written_checksum`, `bitness`,
`output_schema:[{index,name,label,type,data_kind}]`.
Readback экспорта: `destination`, `compression:lz4`, `checksum:compressed`,
`overwrite:reject`, наблюдённый `string_cache_max_size`,
`input_schema:[{index,name,label,type,data_kind}]`.
Значения readback читаются из UI; отсутствие поля не подменяется запросом.
Done сохраняет настройки, Close отменяет draft, Execute выполняет; Save
пакета отдельно. Для sink read.ports=[], для импорта read port 0.
Доставка и неизвестный эффект используют имеющийся lifecycle, без своих квитанций.

Контракт значений: integer, real, string, boolean, datetime; имена/метки,
виды discrete/continuous и порядок полей точные; порядок строк точный.
NULL отличается от пустой строки, 0, false; дата локальная без timezone,
readback abs 1 мс; real abs=0/rel=0. Никаких округлений или CSV-конвертации
результата LGD. Значения вне малого corpus, Int64 boundaries и Variant не
квалифицированы. [Приёмочный комплект](acceptance/README.md) содержит
независимо вычисленные ожидания, но не независимый decoder BGDATA.

## Общие изменения и стоп

Наблюдённые ImportNativePreviewWizard / ExportNativeParamsWizard отсутствуют
в `client/lib/workspace-ui.mjs:335` (wizardMarkers). Поддержка только нового
файла handler и регистрация типа не сделают их распознаваемыми.
Нужны минимальные изменения общего observer/action для этих двух страниц.

`client/lib/node-apply.mjs:222,290,501,593` ограничивает файловый lifecycle
`exports.text` / `exports.excel`. LGD требует тех же гарантий освобождения sink
и обработки отказов. Это общая правка сверх аддитивной регистрации.

`scripts/node-acceptance/cold-check.mjs` имеет отдельный XLSX-путь;
`expected-outputs.mjs:12` требует числового табличного порта. У LGD sink
такого порта нет. Необходим согласованный LGD файловый/cold путь и
квалифицированный reader. Сценария в run-check недостаточно; собственный
универсальный verifier не создавался. Текущие expected.json — предложения.

По стоп-условию LAB-772 карточка blocked. Переход обоих подпланов в
`ready_for_development` невозможен до разрешения общих изменений и решения
по независимому бинарному oracle. Fulltype, оставшиеся страницы и Execute
остались открытыми пунктами; текущие наблюдения их не заменяют.

## Размеры и оценка

Воспроизводимый замер:
`node docs/node-development/nodes/imports-lgd/acceptance/schema-size.mjs`.
Это оценка регистрации, не опубликованная runtime-схема:

| Объект | База, Б | Проект, Б | Бюджет, Б |
|---|---:|---:|---:|
| compact apply inputSchema | 11933 | 12164 | 20000 |
| compact name/description/inputSchema | 12428 | 12659 | 20000 |
| full apply inputSchema | 40219 | 41393 | без предела |
| карточка imports.lgd | — | 2681 | 12000 |
| карточка exports.lgd | — | 2587 | 12000 |
| SKILL.md | 49525 | 49665 | 40000 |
| routing imports / exports, с LF | — | 69 / 71 | около 200 каждый |
| references/nodes/imports.lgd.md | — | 1088 | 6000 |
| references/nodes/exports.lgd.md | — | 1220 | 6000 |

Одиночные оболочки карточек `node_types:[card]`: 2698 / 2604 Б; pins
в скрипте фиксированы для воспроизводимости. Фактические handler/schema/pins
после регистрации нужно перемерить. SKILL.md уже превышает бюджет на базе;
его общее сокращение в этой карточке не выполнялось и превышение само по себе
не стоп этапа 0 по назначению.

Сырой MCP descriptor вместе с outputSchema: 145049 → 145280 Б;
это отдельный замер полного объекта, не только определения входа модели.
Определение name/description/inputSchema и карточки приведены отдельно.

После разрешения: оценка **4–5 циклов** — завершение discovery/reader;
импорт и отказ; экспорт/доставка; круг/Save/cold; при необходимости коррекция
по бизнес-прогону. Приёмка — ≥2/3 исполнителя и 2/3 независимой проверки на
одном SHA после зелёных обязательных тестов. Текущая карточка таких PASS не имеет.

Собственный исследовательский черновик закрыт через «Не сохранять»;
меню пакетов показало «Пакет не выбран», после Logout видна LoginForm.
Browser context/browser закрыты, foreground процесс завершился exit 0.
Файлы на сервер не загружались; доказательством Save/cold это не является.

Проверка `tools/validate.py --registry-only` вернула exit 1: семь
`evidence hash v039-*` несовпадений (node-contracts, grouping-parameters,
union-parameters, replacement-node, replacement-parameters,
clustering-parameters, crosstable-parameters). Отдельный чистый worktree
исходного SHA дал те же семь ошибок и exit 1; общий реестр здесь не менялся.
