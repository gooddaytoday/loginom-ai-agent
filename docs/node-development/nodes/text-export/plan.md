# 17. Текстовый экспорт: подплан сопровождения и приёмки

[Карточка и принятые границы](README.md) · [реестр](../../registry.json) · [работа с одним узлом](../../workflow/single-node.md).

Обработчик `exports.text` уже реализован в режиме `delimited`. Этот подплан адаптирует исторический 17 к текущему runtime и standalone CLI: это маршрут адресного исправления, проверки переноса или отдельно назначенного расширения, не повторная разработка с нуля. Историческое принятие сохраняется в своём scope; технические Desktop проверки не являются аналитической CLI-приёмкой. Новых живых наблюдений и прогонов при составлении документа не было, readiness не повышается.

До начала выбрать точное изменение и пройти [подготовку/жизненный цикл](../../workflow/lifecycle.md). Разработчик работает в Astra medium в своей задаче, ветке и worktree. Первичная разработка получает Goal до готовности изменения к первому ревью, без собственного token_budget. Этот документ не назначает следующий узел и не разрешает слияние.

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

Ниже — обязательная узловая матрица для объявленного полного scope. При адресном исправлении выбрать затронутые строки и обосновать выбор; расширение режима добавляет новые строки. До автономной попытки сохранить входы и expected отдельно от handler, с версиями и SHA. Ожидания не вычислять импортом реализации и не подгонять по её приёмочному выводу.

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

Первичная отладка — штатными скриптами текущего runtime в назначенной изоляции. После неё выполнить адресные source tests и проверить независимый oracle, включая его отказ на подменённых значениях/схеме/идентичности. Только затем подготовить неизменный candidate и получить слот по [CLI-регламенту](../../workflow/acceptance-cli.md): standalone CLI Loginom AI Agent, Sol low, согласованная подписка, бизнес-цель и входные файлы без пошаговых UI-команд.

Критерий аналитического PASS — полный малый output/артефакт, проверенная схема и настройки, новый execution и сохранённый пакет, которые независимо воспроизводятся после отдельного открытия. Configure-only и Close проверяются отдельно; обычный продуктовый путь не переоткрывает мастер ради повторной проверки. Непроверенные платформы, большие наборы и дополнительные режимы остаются явно ограниченными.

Передать checkpoint с точными source/runtime/client/model/platform pins, заявленным scope, результатами и неизменёнными исходными FAIL. Техническое завершение, аналитическая проверка, integration и release — отдельные состояния реестра. Один этап ревью и один раунд исправлений выполняются по общему жизненному циклу; этот подплан не добавляет повторного полного ревью.
