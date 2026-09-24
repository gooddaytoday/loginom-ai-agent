# 11. Замена: подплан сопровождения и приёмки

[Карточка и принятые границы](README.md) · [реестр](../../registry.json) · [работа с одним узлом](../../workflow/single-node.md).

Обработчик `transform.replace_columns` уже реализован в режиме `exact`. Этот подплан адаптирует исторический 11 к текущему runtime и standalone CLI: это маршрут адресного исправления, проверки переноса или отдельно назначенного расширения, не повторная разработка с нуля. Историческое принятие сохраняется в своём scope; технические Desktop проверки не являются аналитической CLI-приёмкой. Новых живых наблюдений и прогонов при составлении документа не было, readiness не повышается.

До начала выбрать точное изменение и пройти [подготовку/жизненный цикл](../../workflow/lifecycle.md). Разработчик работает в Astra medium в своей задаче, ветке и worktree. Первичная разработка получает Goal до готовности изменения к первому ревью, без собственного token_budget. Этот документ не назначает следующий узел и не разрешает слияние.

## Узловые требования

Точная внутренняя таблица замен для string/integer/real. output_mode replace/add и other keep/null/value задают поведение явно. Частичные rules существующего узла сохраняют остальные правила; новый требует правила и режим.

Значения типизированы; integer допускает десятичную строку Int64. Для чисел precision=0, для строк явный case_sensitive. Case-insensitive ключи ограничены ASCII. В real поле other.value принимает максимум два десятичных знака; это не ограничение точности exact pairs. Строки до 2048 символов без переносов/NUL.

## Проверенные исходники и материалы

Текущий handler и параметры: [replacement-node.mjs](../../../../packages/loginom-runtime/client/lib/replacement-node.mjs); [replacement-parameters.mjs](../../../../packages/loginom-runtime/client/lib/replacement-parameters.mjs).

Адресные source tests: [replacement-parameters.test.mjs](../../../../packages/loginom-runtime/client/test/replacement-parameters.test.mjs); [replacement-context.test.mjs](../../../../packages/loginom-runtime/client/test/replacement-context.test.mjs); [replacement-procedure.test.mjs](../../../../packages/loginom-runtime/client/test/replacement-procedure.test.mjs); [replacement-output.test.mjs](../../../../packages/loginom-runtime/client/test/replacement-output.test.mjs).

Независимые проверяющие материалы и fixtures: [replacement_acceptance.py](../../../../packages/loginom-runtime/tools/loginom-acceptance/replacement_acceptance.py); [replacement_evidence_audit.py](../../../../packages/loginom-runtime/tools/loginom-acceptance/replacement_evidence_audit.py); [replacement_configuration_evidence.py](../../../../packages/loginom-runtime/tools/loginom-acceptance/replacement_configuration_evidence.py); [replacement_persistence_evidence.py](../../../../packages/loginom-runtime/tools/loginom-acceptance/replacement_persistence_evidence.py).

Файлы проверены на наличие, их прогоны сейчас не выполнялись. Часть entrypoints в каталоге loginom-acceptance всё ещё ожидает Hermes skill/pins и прежний формат evidence. Они служат источником oracle и семантических проверок; перед новой приёмкой адаптировать транспорт, pins и сбор receipts к [standalone CLI](../../workflow/acceptance-cli.md), сохранив проверки значений, freshness и отказов. Нельзя переименовать старый PASS в CLI PASS или запускать прежний Hermes launcher.

Историческая постановка: [11](../../../../services/loginom-ai/docs/plans/loginom-dock/11-replacement.md). Прежние Help/E2E пути в ней — указатели на версионируемые источники, а не доказательство текущего live-состояния.

## Шаги изменения

1. Сверить native редакторы таблицы, other-policy и add/replace на целевой версии. Раздельно зафиксировать имя выходного значения и служебного _Replaced.
2. Проверить тип каждой пары и уникальность ключа с учётом регистра/Int64; в resolveEffectiveReplacementParameters соединить patch с подтверждёнными сохранёнными правилами.
3. Применить полный набор пар выбранного поля, прочитать политику остальных значений и режим. Переключение add/replace должно согласованно обновить поля и mapping.
4. Сохранить оригинальные значения неперечисленных полей и правил. Не заменять source schema строковой конверсией для упрощения редактора.
5. Проверить значения и флаги замен независимо, включая семантику совпавшей пары from=to. Повторное выполнение после reopen использует сохранённую таблицу замен.

## Независимые fixtures и oracle

Ниже — обязательная узловая матрица для объявленного полного scope. При адресном исправлении выбрать затронутые строки и обосновать выбор; расширение режима добавляет новые строки. До автономной попытки сохранить входы и expected отдельно от handler, с версиями и SHA. Ожидания не вычислять импортом реализации и не подгонять по её приёмочному выводу.

| Случай | Вход/изменение | Независимая проверка |
| --- | --- | --- |
| Строковые правила | A,a,B,empty,NULL,literal null; пары A→Alpha,empty→Empty с other=keep. | Case-sensitive заменяет только A/empty. Для ASCII insensitive отдельно ожидается замена A/a. NULL и literal null не сливаются. |
| Числа | Integer 0, -7, 9007199254740993 как текстовый Int64 в oracle; real 1.234567 и 2.5. | Точные пары меняют только выбранные значения, исходная точность сохраняется. Другие real значения с other.value=9.25 проверяются отдельно. |
| Other и режим | Тот же набор при other=null/value и output_mode add/replace. | Проверить исходный/новый столбец и _Replaced для каждого RowID; семантику флага для совпадающего from=to закрепить до autonomous run. |
| Partial/persistence | Два поля с правилами; patch меняет только первое и затем режим вывода; пустой вход. | Второе правило и прочие свойства сохранены, пустой output имеет полную схему, настройки воспроизводимы после reopen. |

## Негативные случаи

- Дубли ключей после case-folding, не-ASCII insensitive, NaN/Infinity, Int64 за границей, wrong type: отказ до редактирования.
- other.value с real >2 десятичных знаков, недопустимый перенос строки, коллизии _Replace/_Replaced: явный отказ, не округление/переименование.
- Потеря ответа при Apply пары либо смене режима: не продублировать правило; подмена сохранённой other-policy должна провалить аудит.
- Для изменённых фаз отдельно различить отказ до эффекта, известную ошибку с подтверждённым cleanup и неизвестный эффект. Повтор operation_id не создаёт второй узел/запуск; lost reply не оправдывает слепой retry. Чужой пакет и посторонние связи неизменны.

## Автономная проверка и передача

Нормализовать коды точными согласованными таблицами замен, показать непокрытые значения через заданную политику и проверить сохранение неперечисленных правил после изменения узла.

Первичная отладка — штатными скриптами текущего runtime в назначенной изоляции. После неё выполнить адресные source tests и проверить независимый oracle, включая его отказ на подменённых значениях/схеме/идентичности. Только затем подготовить неизменный candidate и получить слот по [CLI-регламенту](../../workflow/acceptance-cli.md): standalone CLI Loginom AI Agent, Sol low, согласованная подписка, бизнес-цель и входные файлы без пошаговых UI-команд.

Критерий аналитического PASS — полный малый output/артефакт, проверенная схема и настройки, новый execution и сохранённый пакет, которые независимо воспроизводятся после отдельного открытия. Configure-only и Close проверяются отдельно; обычный продуктовый путь не переоткрывает мастер ради повторной проверки. Непроверенные платформы, большие наборы и дополнительные режимы остаются явно ограниченными.

Передать checkpoint с точными source/runtime/client/model/platform pins, заявленным scope, результатами и неизменёнными исходными FAIL. Техническое завершение, аналитическая проверка, integration и release — отдельные состояния реестра. Один этап ревью и один раунд исправлений выполняются по общему жизненному циклу; этот подплан не добавляет повторного полного ревью.
