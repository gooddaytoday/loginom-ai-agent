# imports.text: оставшиеся возможности 7.4.2

LAB-975, облегчённый этап 0, 07.11.2026, mas3/Linux. База назначения и исходников
`origin/v040@4b202757f6d0021160dd4dfc104ee788ae33cbec`; целевой PR — `v040`.
Это предложение критериев до правки обработчика. Код runtime, публичные схемы,
продуктовый skill, ready/accepted status узла не изменяются. Сборка CLI запрещена
назначением и не выполнялась. Ниже ручное DOM-исследование, **не run-check PASS**.

## Основа наблюдений

Только `https://app.loginom.ai/app/?testable=true`, версия на LoginForm 7.4.2,
готовый Chromium 1246. Использована только пара
`~/.config/loginom-multica/cards/01a124e5-1222-7d75-8447-c66208fc7459/`.
Worker: собственный `lab975-text-research.lgp`, синтетические typed/variant CSV
в собственном `lab975/`. Ввод и действия — по data-tid, чтение — DOM; внутренний
JS Loginom не вызывался и не подменялся. У login inputs data-tid есть у владельцев
edtUsername/edtPassword, а не у самих input: использован input внутри владельца.
Сырые снимки находятся во вложении карточки, в Git их нет.

Список/маска исследованы ранее в [multi-file.md](multi-file.md), LAB-890,
и повторно проверены вручную в новом собственном пакете этой карточки.
Имя из переменной **не исследовалось повторно**: полностью переиспользуется
[file-variable.md](file-variable.md) и `acceptance/file-variable/`, LAB-886.
Исторические наблюдения отделены от нового UI: они не доказывают новый SHA.

Ниже `W=MF;TF-1;WizrdMCF`, `P=W;ImportTextFilePreviewWizard`,
`F=W;ImportTextFileParamsWizard`, `C=F;ColumnDefsTuning`. TF-1 — наблюдённый
prefix собственного workflow, не константа будущего обработчика.

| Возможность | data-tid / наблюдение | Доказательство |
|---|---|---|
| Список | P;edtFileName;ValueControl, P;btnAddFileName; одно поле источника, не новый режим/порт. Прежнее наблюдение: разделитель U+FF5C, пустые элементы пропускаются | 35-list-source.json, 37-list-mapping.json, 38-list-parallel-output.json; пустые позиции — прежний multi-file.md, 15/16 |
| Маска | Ввод в том же поле. Прежнее наблюдение sales_*.csv: пять строк без returns; после Save и добавления марта — шесть без изменения маски | 39-mask-source.json, 42-mask-output.json — пять строк без returns; добавление марта — прежний multi-file.md, 26/27 |
| Parallel | P;chkParallelProcessing;ValueControl;DisplayEl; P;cbbMaxThreadCount;ValueControl;trg_picker | 33-thread-options.json, 35-list-source.json, 38-list-parallel-output.json — threads=2 и пять строк |
| Типы | F;cbbAutoDetectColumnsMode;ValueControl;boundlist;Нет / Только_новые / Все | 14-auto-options.json |
| Повторный анализ | C;btnRefreshAll и C;btnRefreshData, C;seReadRowCount (default 25, введено 2) | 15-auto-all.json, 16-reanalyse.json |
| Влияние формата | После анализа с незаданной десятичной запятой Amount — Строковый; после выбора точки и анализа двух строк — Вещественный. Остальные: Id integer, Active boolean, EventAt datetime, Note string | 15-auto-all.json → 16-reanalyse.json, C;grdSettings;grd-1;normalHeaderCt;1_2 |
| Только новые и структура | typed.csv: ручной Amount string. После смены на typed-update.csv тип сохранён, но retained схема ещё из пяти полей. btnRefreshAll дал шесть полей с Extra integer, Amount стал real | 46-auto-new-before.json, 47-auto-new-after.json, 48-auto-new-refresh.json |
| Нет и явный анализ | При mode=Нет ручной Amount string после явной btnRefreshData стал real; Нет не блокирует явную команду анализа | 49-auto-none-before-analysis.json → 50-auto-none-after-analysis.json |
| Variant | F;edtVariantAsGeneralType;ValueControl;DisplayEl, checked отражён x-form-cb-checked | 23-variant-enabled.json |
| Variant on/off | При on Value — Переменный, значения 42, word, 3.50, <null>; при off и btnRefreshData — Строковый | 23/24/25-variant-*.json, C;grdSettings;grd-1;normalHeaderCt;1_2 |
| Автометка | W;DoneWizard;cbxNodeTitleMode;trg_picker; варианты Автоматическая_метка и Пользовательская_метка; W;DoneWizard;edtDisplayName | 18-label.json, 19-label-options.json |
| Смена источника и метка | Автометка typed.csv после Execute; замена источника на variant.csv в том же узле обновила поле метки до variant.csv | 20-executed.json, 26-auto-label-source-change.json |
| Пользовательская метка | Worker: LAB975 import после Execute. Reviewer: «Ежедневные продажи» сохранилась после замены typed-update.csv на typed.csv | 27-variant-output.json; 51-custom-title.json → 52-custom-title-after-source.json |
| HTTP | Обычный URL в P;edtFileName;ValueControl допускает переход на F, но чтение остаётся под bg-mask-message/«Загрузка», таблица не получена; Back/Close не выполнились | 28-http-input.json, 29-http-next.json, 30-http-settled.json, 31-http-result.json |
| Basic | В наблюдённой странице P нет полей HTTP username/password/auth; edtConnection — readonly «Хранилище файлов». Подключение другого типа не исследовано. Basic-успеха/отказа credentials нет | 11-connection.json, 28-http-input.json; это не доказательство отсутствия Basic в продукте |
| Имя из переменной | P;edtFileName;SwitchButton → VariableControl;trg_picker, FileName binding и прежний cold; порт Input_Var-1, не новый output | LAB-886: file-variable.md и acceptance/file-variable/; повтор не делался |

Первичный typed.csv был выполнен, output 0 открыт через Graph;typed.csv;Output_Data-0.
В `21-output.json` сохранены все три строки и пять полей, но дата отображена
до минут, сумма с двумя десятичными знаками. Эти строки доказывают действие
UI, не точность секунд/native subtype. Variant выполнен с пользовательской
меткой, output записан в `27-variant-output.json`. CSV и типизированный cold
этой новой матрицы не выполнялись. Строки/типы предложения oracle не выводятся
из этих экранных округлений.

Порты на Graph: `Input_Connection-0`, `Input_Var-1`, один `Output_Data-0`.
Автоопределение/Variant/метка не добавляют портов. Служебные FileName/FileTime
меняют схему этого же output; список файлов не создаёт отдельный порт на файл.
Порты и вывод списка/маски подтверждены новым ручным наблюдением,
а модельный прогон этих возможностей не выполнялся. Модельный `mode` предлагается оставить `delimited`.

## Ручной Save и cold маски

Reviewer: список с parallel=true, threads=2 и FileName дал пять записей
(38-list-parallel-output.json). После замены списка на sales_*.csv,
parallel=false и «Абсолютный путь, Время модификации» получены те же пять
записей и FileName/FileTime (42-mask-output.json). Save → Close Package →
logout, LoginForm подтверждён (43-main-cleanup.json). Новый чистый context,
новый вход, открыть lab975-text-research2.lgp и нажать Graph;…;Launch
**до открытия мастера**: 44-cold-mask-output.json снова содержит пять записей
и шесть полей, с абсолютными путями и заполненным FileTime. Затем мастер
45-cold-mask-settings.json прочитал сохранённые mask, parallel=false, threads=2
(неактивен) и вариант file-info. Это ручной cold, без восстановления настроек.
Добавление нового файла в этом повторе не делалось; прежнее наблюдение марта
остаётся в multi-file.md. Экспорт CSV, stock cold и модельные прогоны — NOT_RUN.

## Границы стенда и непроверенное

HTTP-опыт использовал только адрес того же разрешённого стенда
`https://app.loginom.ai/lab975-unavailable.csv`; это **не CSV endpoint** и не
положительный/отрицательный тест HTTP-контракта. Во время наблюдения не было
btnError, чтение оставалось под loading mask; нельзя из этого заключить, что
сервер не поддерживает HTTP, или обещать точный код отказа. Контролируемый
CSV endpoint с Basic в назначении отсутствует. Локальный HTTP-сервер,
проброс порта, credential-in-URL и клиентское скачивание не применялись.

Дополнительный контекст reviewer той же пары создал собственный отдельный
пакет/каталог и загрузил fixtures. До повторного чтения списка/маски появился
диалог «Обнаружен разрыв связи. Восстановить сессию?». У видимой кнопки
«Восстановить» и её родителей не обнаружен data-tid. `32-session-loss.json`
и reviewer.png фиксируют ограничение. Жесты добавления узла после разрыва
не создали узел: их нельзя выдавать за наблюдённую семантику списка/маски.
Диалог восстановления не обходился CSS/внутренним JS. Это окружение,
не дефект text-import и не принятый FAIL бизнес-сценария. После нового входа
в чистом контексте reviewer создан пакет lab975-text-research2.lgp;
список/маска выполнены уже в нём (33–42), не путём восстановления сессии.

Появление Extra и сброс ручного Amount при btnRefreshAll наблюдены (46–48).
Не проверены исчезновение/переименование колонок и сохранение всех остальных
ручных свойств при каждом варианте анализа, предел analysis rows,
поведение позднего смешанного значения за пределом выборки, производительность
потоков. Выбор none/new/all в UI есть; его подпись сама по себе не доказывает
эти свойства. Они входят в предложенные тесты этапа 1.

FileTime доступен и в новом UI (34-info-options.json, 42-mask-output.json):
FileName имеет тип dtString, FileTime — dtDateTime. Выведены абсолютные пути
обоих файлов и пять значений времени, отображённых до минут. Однако точный
серверный timestamp и timezone
независимо не получены. Максимальная длина списка, коллизия FileName/FileTime,
HTTP-редиректы, Basic-challenge/неверный пароль, server HTTPS и переменные
credentials — NOT_CHECKED. Не объявлять их отсутствующими только по снимку P.

## Циклы этапа 1 по ценности

Один цикл — один самостоятельный ready PR с red→green и живым бизнес-прогоном
до следующего цикла. Диапазоны — оценка строк обработчика и адресных тестов,
не фактический диф этого docs-PR. Никаких карточек/подзадач этим документом
не создаётся. Все критерии ниже предложены владельцу, ещё не утверждены.

| Приоритет / PR | Пользовательский результат | Объём | Файлы в client/lib |
|---|---|---:|---|
| 1. Автотипы, new/all, повторный анализ | Быстро загрузить понятную таблицу без ручного описания каждого поля; сохранить ручной Amount при new | 250–400 строк, 1 цикл | text-import-procedure.mjs, text-import-node.mjs, text-import-readback.mjs; адресные bindings workspace-ui.mjs, node-api.mjs |
| 2. Явный список и FileName | Собрать месяцы одной таблицей с происхождением строк | 300–450, 1 цикл | те же; node-import-continuation.mjs, storage-policy.mjs, user-workflow.mjs |
| 3. Маска одного каталога | Подхватывать новую месячную выгрузку без перенастройки | 200–350, 1 цикл | text-import-node.mjs/procedure.mjs, storage-policy.mjs, адресный inventory файлов |
| 4. FileName из переменной | Ежедневно менять один путь, сохраняя узел и связь | 200–350, 1 цикл + резерв | text-import-node.mjs/procedure.mjs/readback.mjs; активный редактор workspace-ui.mjs и существующий W1 binding. Основа LAB-886, экспорт в эту карточку не включён |
| 5. Variant | Сохранить собственные типы смешанного поля и NULL | 120–220, 1 цикл | text-import-procedure.mjs/readback.mjs, node-api.mjs; адресный допуск существующего native reader при необходимости |
| 6. Автометка | Метка следует источнику либо остаётся пользовательской | 80–150, 1 цикл | text-import-node.mjs и адресный Done read/write; без смены общей семантики finish |
| 7. Parallel/threads | Поменять стратегию чтения без потери/добавления строк | 100–180, 1 цикл | text-import-procedure.mjs/readback.mjs, workspace-ui.mjs |
| 8. Пути источника | Видеть относительный/абсолютный путь каждой строки | 100–180, 1 цикл | text-import-node.mjs/readback.mjs, существующий output mapping; FileTime отдельно после решения об эталоне |
| Отложено. HTTP/Basic | Прямой серверный импорт защищённого CSV | Оценка реализации не утверждается без рабочего endpoint | текущие source guards не принимают URL; сначала отдельное решение о source proof и credentials, не расширять молча storage policy |

Сумма первых восьми диапазонов — 1 350–2 280 строк вместе с адресными тестами;
это восемь небольших PR, а не разрешение на общий большой рефакторинг. Каждый
цикл должен иметь полноценный readback и сохранение; нельзя считать только
клики мастера готовым поведением. FileTime/HTTP не спрятаны в суммарную оценку.

## Предложенные критерии

[Задания и таблица fixtures/oracle/expected](acceptance/extended/README.md).
Они используют существующую форму typed expected, без новых механизмов
верификации. Каждый положительный случай: все значения, типы, NULL/empty/zero,
кратности, точные имена и порядок полей; тот же узел при изменениях; CSV,
Save, clean-profile cold Execute без восстановления настройки, cleanup.
Незапрошенная метка поля — label_any. Для автометки метка **узла** задана
поведением задачи и проверяется отдельно.

- Автоопределение: первый typed output, затем update/new с ручным Amount string,
  затем all с Amount real; none сохраняет заданную схему при автоматическом чтении. Явная команда анализа — отдельное действие.
  Чтобы совместить новую структуру и ручные типы, handler должен прочитать
  исходные настройки, явно обновить структуру и восстановить только сохранённые
  пользовательские свойства по однозначным именам. Нативный btnRefreshAll
  этого сохранения не гарантирует; expected-auto-new — предложение такого
  поведения, не наблюдённый native PASS. Настройки режима и
  числа строк читаются независимо после reopen. Схема хвоста не считается
  известной по двум строкам анализа: полный выход обязателен.
- Список/маска: одна одинаковая схема; все пять записей, FileName, дубликат,
  returns исключён. Нативное позиционное чтение разных схем не называть
  объединением по именам. Несовместимость — отдельная граница на утверждение.
  Список сохраняет явные пути; маска после добавления марта даёт шесть строк.
- Переменная: актуальный разрешённый путь, смена значения той же переменной,
  сохранённая связь; NULL/empty — отказ, без старого literal fallback.
  Полный прежний комплект используется как есть, шаблоны %Name% не расширяются.
- Variant: on — точные subtype integer/string/real/NULL; off — строки чисел
  из исходника, NULL сохранён. Стадия on должна иметь свой Save/cold, поскольку
  итоговая стадия составного задания off сама по себе её persistence не доказывает.
- Метка: automatic меняется с источником; custom сохраняется после смен туда
  и обратно. Имя/метки полей при этом не переименовываются.
- Parallel: false → true/2 на тех же файлах, равные мультимножества, независимый
  readback и сохранение; порядок строк и ускорение не критерии.
- Пути: ожидаемый абсолютный путь строится из разрешённого SOURCE_DIR и basename
  до прогона, относительный — только файлы рядом с пакетом. FileTime остаётся
  диагностическим до решения владельца о независимом эталоне.

После реализации — ≥2/3 PASS и независимые 2/3 на том же SHA, проверки изменённых
путей и штатный run-check start + wait. В этапе 0 новых сценариев в каталоге нет,
их запуск с вымышленным именем или старым CLI не имитировался.

## Аддитивность и бюджет

`text-import-procedure.mjs:validateSettings` сейчас допускает один явный
storage path и пять scalar типов; `configureImport` явно не считает автоанализ
подтверждением запрошенной схемы. `text-import-node.mjs:verifyTextImportSource`
связывает одну квитанцию с одним destination; `text-import-readback.mjs`
требует output.length === used columns. Это адресные границы, которые нужно
расширить для списка/служебных полей/Variant, сохранив прежнюю single-file ветку.

Общие **аддитивные** изменения ожидаются: schema/карточка imports.text,
owner-bound UI поля и readback, доступ к существующему source inventory и W1.
Действующий source proof других импортов не ослабляется. Общая оболочка,
deadline, общий бюджет, packages/agent и новый decoder не входят в объём.
Если для маски не хватает существующей authority на каждый файл, либо для HTTP
требуется новый общий контракт, этап 1 останавливается с одним вопросом.
Docs-этап не делает эти изменения и не утверждает их заранее разрешёнными.

Полная [карточка-предложение](acceptance/extended/card-proposal.json): скопирована
текущая карточка imports.text; добавлены только необязательные варианты настройки
и несколько verified source proofs. cache_key и все hash-поля — 64 нуля.
Предлагаемые пределы 16 файлов, 2048 символов и analysis.rows до 1 000 000 —
API-эскиз, **не измеренные нативные пределы**. Старые запросы сохраняют смысл;
отсутствие настройки сохраняет прежнее значение. До этапа 1 нужны взаимные
guards source_path/source_paths/source_mask и full-path variable witness.

| Что видит модель | База | После предложения | Лимит |
|---|---:|---:|---:|
| Сжатый dock_node_apply, model_tool_bytes | 14 539 | 14 539, проекция | 20 000 |
| Полная inputSchema (модели не отправляется) | 63 280 | пока не реализована | нет |
| Полная карточка imports.text, compact JSON | 7 390 | 11 240 | 12 000 |
| SKILL.md | 39 954 | 39 954, не меняется | 40 000 |
| Существующая строка маршрутизации | 104 | 104, не меняется | около 200 |
| references/nodes/imports.text.md | 4 756 | 9 540, сохранён прежний текст + новые инструкции | 6 000 |

Штатный `node --test test/model-schema-budget.test.mjs` на базе: 51/51, exit 0;
model_tool_bytes берётся из его diagnostic, full_input_schema_bytes только
измеряется. Подробные parameters текущая userNodeTool проекция заменяет compact
object; поэтому неизменный размер сжатого apply — **прогноз**, не тест будущего
handler. На реализованном SHA замер повторить.

Точные замеры — [budgets.json](acceptance/extended/budgets.json); полный проект
файла узла — [imports.text.md.proposal](acceptance/extended/imports.text.md.proposal).
Файлу требуется 9 540 Б: превышение 3 540 Б. SKILL имеет запас только 46 Б,
новые строки туда не предлагаются. Это пункт решения архитектуры выдачи,
не стоп этапа 0 и не разрешение повысить предел/потерять прежние инструкции.
Карточке хватает 11 240 Б, запас 760 Б; HTTP/Basic schema в неё не выдумана.
