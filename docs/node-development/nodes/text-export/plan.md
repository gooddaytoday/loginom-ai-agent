# 17. Текстовый экспорт: подплан сопровождения и приёмки

[Карточка и принятые границы](README.md) · [реестр](../../registry.json) · [работа с одним узлом](../../workflow/single-node.md).

Обработчик `exports.text` уже реализован в режиме `delimited`. Этот подплан адаптирует исторический 17 к текущему runtime и standalone CLI: это маршрут адресного исправления, проверки переноса или отдельно назначенного расширения, не повторная разработка с нуля. Историческое принятие сохраняется в своём scope; технические Desktop проверки не являются аналитической CLI-приёмкой. Новых живых наблюдений и прогонов при составлении документа не было, readiness не повышается.

До начала выбрать точное изменение и пройти [подготовку/жизненный цикл](../../workflow/lifecycle.md). Этот документ не назначает следующий узел и не разрешает слияние.

## Узловые требования

Один табличный вход, без табличного выхода: mappings=[],read.ports=[],sample_rows=0,require_exact_numbers=false. Результат — подтверждённые file_artifacts. Новый узел требует полный формат и destination; existing patch сохраняет неперечисленное только после проверки сохранённого формата.

UTF-8,CSV/TSV,разделители ;/,/табуляция, header none/names/labels, BOM, LF/CRLF, точка/запятая, двойные кавычки и ограниченные форматы даты/boolean/NULL по валидатору. Файл ≤16 МиБ. Overwrite по умолчанию reject; replace требует destination в каждом запросе. Политика каталога текущего выбранного пользователя заменяет старое ограничение /test-2.

## Проверенные исходники и материалы

Текущий handler и параметры: [text-export-node.mjs](../../../../packages/loginom-runtime/client/lib/text-export-node.mjs); [text-export-parameters.mjs](../../../../packages/loginom-runtime/client/lib/text-export-parameters.mjs).

Адресные source tests: [text-export.test.mjs](../../../../packages/loginom-runtime/client/test/text-export.test.mjs); [text-export-lifecycle.test.mjs](../../../../packages/loginom-runtime/client/test/text-export-lifecycle.test.mjs); [text-export-connect.test.mjs](../../../../packages/loginom-runtime/client/test/text-export-connect.test.mjs); [text-export-virtual-storage.test.mjs](../../../../packages/loginom-runtime/client/test/text-export-virtual-storage.test.mjs); [text-export-observation.test.mjs](../../../../packages/loginom-runtime/client/test/text-export-observation.test.mjs).

Независимые проверяющие материалы и fixtures: [text_export_acceptance.py](../../../../packages/loginom-runtime/tools/loginom-acceptance/text_export_acceptance.py); [audit-text-export.py](../../../../packages/loginom-runtime/tools/loginom-acceptance/audit-text-export.py); [audit-native-text-export-observer.py](../../../../packages/loginom-runtime/tools/loginom-acceptance/audit-native-text-export-observer.py); [contract.json](../../../../packages/loginom-runtime/tools/loginom-acceptance/fixtures/text-export/contract.json).

Файлы проверены на наличие, их прогоны сейчас не выполнялись. Часть entrypoints в каталоге loginom-acceptance всё ещё ожидает Hermes skill/pins и прежний формат evidence. Они служат источником oracle и семантических проверок; перед новой приёмкой адаптировать транспорт, pins и сбор receipts к [standalone CLI](../../workflow/acceptance-cli.md), сохранив проверки значений, freshness и отказов. Нельзя переименовать старый PASS в CLI PASS или запускать прежний Hermes launcher.

Историческая постановка: [17](../../../../services/loginom-ai/docs/plans/loginom-dock/17-text-export.md). Прежние Help/E2E пути в ней — указатели на версионируемые источники, а не доказательство текущего live-состояния.

## Шаги изменения

1. Проверить requireExportDestination/storage-policy для назначенного аккаунта и реальный export wizard, включая сохранённые неподдержанные опции.
2. Раздельно наблюдать native Data input, Connection и Variables: не соединять источник с портом по одному UI-номеру. Связать источник и прочитать полную схему до мастера.
3. Настроить параметры, preview-format и overwrite; Done/Close не должны создавать файл. При replace подтвердить точное назначение, диалог и новый execution.
4. Через существующий managed authenticated browser/download путь получить файл; проверить origin, имя, обычный файл без symlink, размер, bytes/SHA и связь с session/document/node/execution.
5. Output lease не становится input/upload admission автоматически. Проверить свежесть независимо от совпавших ожидаемых байтов; сохранение самого .lgp выполнить отдельным package.save_checkpoint.

## Независимые fixtures и oracle

Ниже — обязательная узловая матрица для ранее объявленного ограниченного scope. При адресном исправлении выбрать затронутые строки и обосновать выбор; расширение режима добавляет новые строки. До автономной попытки сохранить входы и expected отдельно от handler, с версиями и SHA. Ожидания не вычислять импортом реализации и не подгонять по её приёмочному выводу.

| Случай | Вход/изменение | Независимая проверка |
| --- | --- | --- |
| CSV escaping | Кириллица, кавычки, ; внутри поля, перенос внутри значения, NULL и empty. | Независимый encoder/parser и фиксированные bytes/SHA; при null_marker="" явно признать неоднозначность NULL/empty, не утверждать их восстановимость. |
| TSV и формат | Те же данные при TSV,BOM,CRLF,header none/labels; real с десятичной запятой, boolean Да/Нет, дата с ненулевым временем. | Проверить все байты: BOM, окончания строк, удвоение кавычек и видимые метки. Представление midnight может отличаться от fixed-width timestamp — закрепить ожидаемый формат отдельно. |
| Пустота и ширина | Header-only и файл без заголовка с 0 байт; 40 полей×3 строки со сложным последним полем. | Полная byte-проверка, не только число строк/первые столбцы. Источник пустого экспорта должен иметь подтверждённую схему. |
| Overwrite/persistence | Создать файл, повторить с reject, затем явный replace; после reopen указать новый destination. | Reject сохраняет старый SHA, replace подтверждает свежее выполнение, новый путь содержит ожидаемые байты; сохранённый формат не восстанавливать из expected. |

## Негативные случаи

- Чужой каталог/path traversal, скрытый overwrite, unsupported encoding/delimiter, tabular read/mapping, >16 МиБ: явный отказ без усечения.
- Чужой origin, symlink, несовпавшее имя/размер/SHA, старый файл с теми же байтами без freshness receipt: аудитор отвергает.
- Потерянный ответ подтверждения replace/download, отмена и неизвестный Execute: не перезаписывать повторно ради доказательства; cleanup и lease должны соответствовать реальному состоянию.
- Для изменённых фаз отдельно различить отказ до эффекта, известную ошибку с подтверждённым cleanup и неизвестный эффект. Повтор operation_id не создаёт второй узел/запуск; lost reply не оправдывает слепой retry. Чужой пакет и посторонние связи неизменны.

## Автономная проверка и передача

Выгрузить согласованную таблицу в CSV и TSV с заданным форматом, проверить запрет и явную замену файла, сохранить пакет и независимо сверить байты всех результатов.

Первичная отладка — штатными скриптами текущего runtime в назначенной изоляции. После неё выполнить адресные source tests и проверить независимый oracle, включая его отказ на подменённых значениях/схеме/идентичности. Только затем подготовить неизменный candidate и получить слот по [CLI-регламенту](../../workflow/acceptance-cli.md): standalone CLI Loginom AI Agent, назначенный профиль модели, бизнес-цель и входные файлы без пошаговых UI-команд.

Критерий аналитического PASS — полный малый output/артефакт, проверенная схема и настройки, новый execution и сохранённый пакет, которые независимо воспроизводятся после отдельного открытия. Configure-only и Close проверяются отдельно; обычный продуктовый путь не переоткрывает мастер ради повторной проверки. Непроверенные платформы, большие наборы и дополнительные режимы остаются явно ограниченными.

Передать checkpoint с точными source/runtime/client/model/platform pins, заявленным scope, результатами и неизменёнными исходными FAIL. Техническое завершение, аналитическая проверка, integration и release — отдельные состояния реестра.

## Полное поэтапное покрытие Help 7.4 — 2026-10-02

Снимок исходников: `5f772aea9de6414a19feb6ecc109a196c9e92453`. Исследованы официальные страницы ниже и существующие handlers; живой discovery, новые прогоны и реализация расширений не выполнялись. `accepted_scope_maintenance` означает сопровождение ранее принятого ограниченного объёма, а не новую CLI-приёмку. Все расширения имеют статус `discovery_required`; полное покрытие не достигается одним первым этапом.

### `text-export:s1` — Сопровождение UTF-8 CSV/TSV

Статус: `accepted_scope_maintenance`. Приоритет: P0. Покрывает: `text-export:r01`.
Жёсткие предпосылки: `foundation:oracle-tabular`, `foundation:file-artifacts`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `text-export:r01` — Сохранить delimited экспорт, фактические байты/SHA, overwrite и отсутствие табличного выхода. Источник: `text-export:help1` Проверка: Повторить исходные fixtures с destination collision и unchanged file после Done/Close.

### `text-export:s2` — Полное представление файлов

Статус: `discovery_required`. Приоритет: P1. Покрывает: `text-export:r02`, `text-export:r03`, `text-export:r04`.
Жёсткие предпосылки: `text-export:s1`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `text-export:r02` — Режимы с разделителями/фиксированной ширины, ограничители, семь перечисленных Help кодировок, BOM, LF/CRLF и варианты заголовков. Источник: `text-export:help1` Проверка: Сравнить байты, ширины и декодированные значения; непредставимый символ не выдавать за сохранённый.
- `text-export:r03` — NULL, bool, числовые разделители, стандартные и пользовательские date/time formats. Источник: `text-export:help1`, `text-export:help2` Проверка: Проверить значения независимо от locale preview; различить календарный месяц и минуты.
- `text-export:r04` — Автоматическая/пользовательская метка и заметка Markdown. Источник: `text-export:help1` Проверка: Сохранить и открыть пакет; проверить описание и неизменную identity экспортного узла.

### `text-export:s3` — Управление назначением и форматом переменными

Статус: `discovery_required`. Приоритет: P3. Покрывает: `text-export:r05`.
Жёсткие предпосылки: `text-export:s1`, `foundation:typed-variables`, `foundation:external-effects`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `text-export:r05` — Управляющие переменные для параметров экспорта. Источник: `text-export:help1` Проверка: Два значения переменной дают два заранее разрешённых назначения/формата; receipt связан с каждым выполнением.

### Реализация и общие контракты

Расширять text-export-node/parameters и file_artifacts receipt: отсутствие табличного выхода сохраняется. Изменение формата не должно обходить storage-policy, explicit overwrite и проверку фактических байтов.

Переиспользовать `node.apply` с pure validation до эффектов, общий gate/journal/deadline и наблюдаемые node/port identities. Для новых возможностей актуализировать node registry/contracts, parameter schema, driver/readback, compact user-v1 и адресные tests; имена полей/режимов API закрепить после discovery. Публичный новый контракт и уточнённые критерии приёмки согласуются до runtime-изменения. Названия Help не являются готовыми runtime enum.

Общие зависимости раскрыты в [приёмке](../../foundations/acceptance/plan.md), [типизированных портах](../../foundations/typed-ports/plan.md), [динамической схеме](../../foundations/dynamic-schema/plan.md), [обучении](../../foundations/training/plan.md) и [внешних системах](../../foundations/external-systems/plan.md). `recommended_after` передаёт опыт; самостоятельный fixture позволяет начинать без готового парного import/export либо аналитического предшественника.

### Дополнительные самостоятельные fixtures

Таблица из 3 строк: кириллица, кавычка, разделитель, multiline, NULL, bool, 1.25 и дата с миллисекундами. Независимый encoder/parser проверяет каждый формат; фиксированная ширина проверяется по позициям и длинам. Отдельные заранее заданные пути для каждого исполнения.

Перед автономным прогоном разместить задачу и входы отдельно от `expected`/oracle; указать точные типы, NULL, порядок там, где он значим, и числовую точность. Неоднозначную формулу/тип/границу сначала подтвердить отдельной диагностикой, затем заморозить ожидания. Сохранённые исторические fixtures, если перечислены выше, используются в исходных границах.

### Приёмка и восстановление

- Для каждого требования выполнить new/existing, Done/Close/Execute там, где применимо; проверить сохранённые настройки, свежий результат и save/reopen. Положительный тест сопровождается отказом на неверные типы/поля/порты.
- Адресные tests запускаются из пакета; oracle проверяется намеренной подменой значения, порядка, схемы и execution identity. Полный небольшой результат проверяется независимо; preview или старый PASS не доказывает новый этап.
- Один operation_id не допускает повторного эффекта. Потерянный ответ и expiry сохраняют неоднозначность до штатного inspect/recover; дедлайн не продлевается. Cancel закрывает только принадлежащий операции draft, чужие узлы/связи неизменны.
- Cold-check должен поддерживать именно заявленный вид результата, число выходов и точность. Текущий базовый скрипт читает один tabular output 0 и сравнивает строки без порядка; такие ограничения устраняются в prerequisite до зависимой приёмки.
- PASS требует чистый source SHA, pins клиента/runtime/модели/платформы, независимый oracle и подтверждённые `package_closed=true`, `logged_out=true`. Неисполненные строки остаются NOT_RUN; сохранение/технический успех/аналитика/интеграция/выпуск различаются. Checkpoint — до 20 строк, с результатом, ограничениями и следующим этапом.

### Проверенные официальные источники

- `text-export:help1` — [Текстовый файл](https://help.loginom.ru/userguide/integration/export/txt-csv.html), Help 7.4, прочитано 2026-10-02.
- `text-export:help2` — [Пользовательский формат дата/время](https://help.loginom.ru/userguide/integration/export/txt-csv/datetime-formats.html), Help 7.4, прочитано 2026-10-02.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `text-export:s1` | Локальные файлы и форматы | text-export | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `text-export:s2` | Локальные файлы и форматы | text-export | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `text-export:s3` | Локальные файлы и форматы | text-export | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
