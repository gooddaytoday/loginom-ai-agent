# 16. Свёртка столбцов: подплан сопровождения и приёмки

[Карточка и принятые границы](README.md) · [реестр](../../registry.json) · [работа с одним узлом](../../workflow/single-node.md).

Обработчик `transform.collapse_columns` уже реализован в режиме `unpivot`. Этот подплан адаптирует исторический 16 к текущему runtime и standalone CLI: это маршрут адресного исправления, проверки переноса или отдельно назначенного расширения, не повторная разработка с нуля. Историческое принятие сохраняется в своём scope; технические Desktop проверки не являются аналитической CLI-приёмкой. Новых живых наблюдений и прогонов при составлении документа не было, readiness не повышается.

До начала выбрать точное изменение и пройти [подготовку/жизненный цикл](../../workflow/lifecycle.md). Разработчик работает в Astra medium в своей задаче, ветке и worktree. Первичная разработка получает Goal до готовности изменения к первому ревью, без собственного token_budget. Этот документ не назначает следующий узел и не разрешает слияние.

## Узловые требования

Unpivot преобразует упорядоченные transposed поля в строки, сохраняя information поля и явный ignore_empty. Это не разделение текстового списка. Роли не пересекаются; scalar input пяти типов, входной variant не поддержан.

Mixed scalar может дать variant output; точный тип каждой ячейки не выводится по виду строки. Нативный путь полного exact variant-чтения ограничен 50 строками ×8 полями и 1 МиБ, проверяет происхождение. Расширять лимиты или переносить прототипы в public путь этим подпланом не требуется. В information запрещены служебные names/displaynames/values/datatypes.

## Проверенные исходники и материалы

Текущий handler и параметры: [collapse-node.mjs](../../../../packages/loginom-runtime/client/lib/collapse-node.mjs); [collapse-parameters.mjs](../../../../packages/loginom-runtime/client/lib/collapse-parameters.mjs).

Адресные source tests: [collapse-parameters.test.mjs](../../../../packages/loginom-runtime/client/test/collapse-parameters.test.mjs); [collapse-procedure.test.mjs](../../../../packages/loginom-runtime/client/test/collapse-procedure.test.mjs); [collapse-output-reconcile.test.mjs](../../../../packages/loginom-runtime/client/test/collapse-output-reconcile.test.mjs); [collapse-native-source.test.mjs](../../../../packages/loginom-runtime/client/test/collapse-native-source.test.mjs); [collapse-native-journal.test.mjs](../../../../packages/loginom-runtime/client/test/collapse-native-journal.test.mjs).

Независимые проверяющие материалы и fixtures: [collapse_node_acceptance.py](../../../../packages/loginom-runtime/tools/loginom-acceptance/collapse_node_acceptance.py); [collapse_acceptance.py](../../../../packages/loginom-runtime/tools/loginom-acceptance/collapse_acceptance.py); [audit.py](../../../../packages/loginom-runtime/tools/loginom-acceptance/collapse/acceptance-kit/audit.py); [expected.json](../../../../packages/loginom-runtime/tools/loginom-acceptance/collapse/acceptance-kit/expected.json).

Файлы проверены на наличие, их прогоны сейчас не выполнялись. Часть entrypoints в каталоге loginom-acceptance всё ещё ожидает Hermes skill/pins и прежний формат evidence. Они служат источником oracle и семантических проверок; перед новой приёмкой адаптировать транспорт, pins и сбор receipts к [standalone CLI](../../workflow/acceptance-cli.md), сохранив проверки значений, freshness и отказов. Нельзя переименовать старый PASS в CLI PASS или запускать прежний Hermes launcher.

Историческая постановка: [16](../../../../services/loginom-ai/docs/plans/loginom-dock/16-collapse-columns.md). Прежние Help/E2E пути в ней — указатели на версионируемые источники, а не доказательство текущего live-состояния.

## Шаги изменения

1. Проверить native роли, порядок и ignore_empty; при existing input mapping разрешать уже эффективные поля, не устаревшие исходные имена.
2. В validate/resolveCollapseParameters проверить полные списки и reserved names до мутации; перестановка transposed меняет порядок свёртки осознанно.
3. Согласовать служебные Names/DisplayNames/Values/DataTypes с реальным output mapping. Mixed schema не превращать автоматически в string для чтения.
4. Для exact variant проверить source ownership, полный размер и границы reader. Если доказательство не помещается, вернуть ограничение или согласовать отдельный путь; не выдавать sample за весь output.
5. Независимый oracle сравнивает тройку исходный RowID/имя свёрнутого поля/типизированное значение, учитывая ignore_empty. Save/reopen подтверждает роли и тот же результат.

## Независимые fixtures и oracle

Ниже — обязательная узловая матрица для объявленного полного scope. При адресном исправлении выбрать затронутые строки и обосновать выбор; расширение режима добавляет новые строки. До автономной попытки сохранить входы и expected отдельно от handler, с версиями и SHA. Ожидания не вычислять импортом реализации и не подгонять по её приёмочному выводу.

| Случай | Вход/изменение | Независимая проверка |
| --- | --- | --- |
| Числовой unpivot | RowID 1: A10,BNULL; RowID 2: A20,B30; information=[RowID],transposed=[A,B]. | ignore_empty=false: 4 строки, true: 3. Каждому значению соответствует исходный RowID и имя поля; порядок проверять только в явно гарантированной части. |
| Пять типов | Малый набор integer/real/string/boolean/datetime с NULL, empty и текстом null. | Проверить каждый scalar tag и значение в variant без приведения к строке; Int64 и дробную точность хранить в независимом типизированном oracle. |
| All-null/empty | Все transposed NULL и отдельный header-only вход; варианты DataTypes output включён/исключён. | Полный набор служебных полей/типов сохраняется; число строк соответствует ignore_empty, а не успешному открытию preview. |
| Mapping/persistence | Переименованный input, перестановка transposed, label и output mapping; 10 малых отдельных случаев. | Сравнить полный выход каждого случая в пределах reader, настройки после отдельного reopen и fresh execution. Суммарный небольшой объём не оправдывает превышение лимита одного результата. |

## Негативные случаи

- Пересечение/дубли ролей, пустой transposed, unknown/reserved field, input variant: отказ до настройки.
- 51 строка,9 полей, >1 МиБ, чужой источник или подменённые type tags: exact verifier не должен выдавать полный PASS за пределами контракта.
- Concurrent change, reply loss и обрыв во время typed read: не склеивать данные разных исполнений; неизвестный эффект остаётся неопределённым.
- Для изменённых фаз отдельно различить отказ до эффекта, известную ошибку с подтверждённым cleanup и неизвестный эффект. Повтор operation_id не создаёт второй узел/запуск; lost reply не оправдывает слепой retry. Чужой пакет и посторонние связи неизменны.

## Автономная проверка и передача

Преобразовать месячные показатели из столбцов в строки, сохранив идентификаторы и исходные типы, проверить оба правила пропусков и сохранить пакет с независимым полным результатом.

Первичная отладка — штатными скриптами текущего runtime в назначенной изоляции. После неё выполнить адресные source tests и проверить независимый oracle, включая его отказ на подменённых значениях/схеме/идентичности. Только затем подготовить неизменный candidate и получить слот по [CLI-регламенту](../../workflow/acceptance-cli.md): standalone CLI Loginom AI Agent, Sol low, согласованная подписка, бизнес-цель и входные файлы без пошаговых UI-команд.

Критерий аналитического PASS — полный малый output/артефакт, проверенная схема и настройки, новый execution и сохранённый пакет, которые независимо воспроизводятся после отдельного открытия. Configure-only и Close проверяются отдельно; обычный продуктовый путь не переоткрывает мастер ради повторной проверки. Непроверенные платформы, большие наборы и дополнительные режимы остаются явно ограниченными.

Передать checkpoint с точными source/runtime/client/model/platform pins, заявленным scope, результатами и неизменёнными исходными FAIL. Техническое завершение, аналитическая проверка, integration и release — отдельные состояния реестра. Один этап ревью и один раунд исправлений выполняются по общему жизненному циклу; этот подплан не добавляет повторного полного ревью.
