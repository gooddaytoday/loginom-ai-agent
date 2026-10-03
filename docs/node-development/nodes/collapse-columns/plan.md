# 16. Свёртка столбцов: подплан сопровождения и приёмки

[Карточка и принятые границы](README.md) · [реестр](../../registry.json) · [работа с одним узлом](../../workflow/single-node.md).

Обработчик `transform.collapse_columns` уже реализован в режиме `unpivot`. Этот подплан адаптирует исторический 16 к текущему runtime и standalone CLI: это маршрут адресного исправления, проверки переноса или отдельно назначенного расширения, не повторная разработка с нуля. Историческое принятие сохраняется в своём scope; технические Desktop проверки не являются аналитической CLI-приёмкой. Новых живых наблюдений и прогонов при составлении документа не было, readiness не повышается.

До начала выбрать точное изменение и пройти [подготовку/жизненный цикл](../../workflow/lifecycle.md). Этот документ не назначает следующий узел и не разрешает слияние.

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

Ниже — обязательная узловая матрица для ранее объявленного ограниченного scope. При адресном исправлении выбрать затронутые строки и обосновать выбор; расширение режима добавляет новые строки. До автономной попытки сохранить входы и expected отдельно от handler, с версиями и SHA. Ожидания не вычислять импортом реализации и не подгонять по её приёмочному выводу.

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

Первичная отладка — штатными скриптами текущего runtime в назначенной изоляции. После неё выполнить адресные source tests и проверить независимый oracle, включая его отказ на подменённых значениях/схеме/идентичности. Только затем подготовить неизменный candidate и получить слот по [CLI-регламенту](../../workflow/acceptance-cli.md): standalone CLI Loginom AI Agent, назначенный профиль модели, бизнес-цель и входные файлы без пошаговых UI-команд.

Критерий аналитического PASS — полный малый output/артефакт, проверенная схема и настройки, новый execution и сохранённый пакет, которые независимо воспроизводятся после отдельного открытия. Configure-only и Close проверяются отдельно; обычный продуктовый путь не переоткрывает мастер ради повторной проверки. Непроверенные платформы, большие наборы и дополнительные режимы остаются явно ограниченными.

Передать checkpoint с точными source/runtime/client/model/platform pins, заявленным scope, результатами и неизменёнными исходными FAIL. Техническое завершение, аналитическая проверка, integration и release — отдельные состояния реестра.

## Полное поэтапное покрытие Help 7.4 — 2026-10-02

Снимок исходников: `5f772aea9de6414a19feb6ecc109a196c9e92453`. Исследованы официальные страницы ниже и существующие handlers; живой discovery, новые прогоны и реализация расширений не выполнялись. `accepted_scope_maintenance` означает сопровождение ранее принятого ограниченного объёма, а не новую CLI-приёмку. Все расширения имеют статус `discovery_required`; полное покрытие не достигается одним первым этапом.

### `collapse-columns:s1` — Сопровождение scalar→unpivot

Статус: `accepted_scope_maintenance`. Приоритет: P0. Покрывает: `collapse-columns:r01`.
Жёсткие предпосылки: `foundation:oracle-tabular`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `collapse-columns:r01` — Роли information/transposed, порядок, ignore_empty и четыре служебных поля. Источник: `collapse-columns:help1` Проверка: Сохранённые exact fixtures, 4/3 строки и native cell types.

### `collapse-columns:s2` — Все входные типы и режимы пустоты

Статус: `discovery_required`. Приоритет: P2. Покрывает: `collapse-columns:r02`, `collapse-columns:r03`.
Жёсткие предпосылки: `collapse-columns:s1`, `foundation:variant-values`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `collapse-columns:r02` — Variable вход, смешанные типы, пустая строка/NULL и all-null/header-only. Источник: `collapse-columns:help1` Проверка: Различить scalar/variant output и codes 0..6; не превращать Values в строку.
- `collapse-columns:r03` — Полные mappings, служебные поля и полное чтение сохранённого результата в пределах доказуемого бюджета. Источник: `collapse-columns:help1` Проверка: Данные после reopen сверить native-wise; out-of-bounds даёт явное ограничение, а не sample PASS.

### Реализация и общие контракты

Переиспользовать collapse-node и native full oracle; для variant входа добавить явные native type/value observations. За пределами 50×8 нынешнее full чтение честно отказывает, лимит сам по себе не повышать.

Переиспользовать `node.apply` с pure validation до эффектов, общий gate/journal/deadline и наблюдаемые node/port identities. Для новых возможностей актуализировать node registry/contracts, parameter schema, driver/readback, compact user-v1 и адресные tests; имена полей/режимов API закрепить после discovery. Публичный новый контракт и уточнённые критерии приёмки согласуются до runtime-изменения. Названия Help не являются готовыми runtime enum.

Общие зависимости раскрыты в [приёмке](../../foundations/acceptance/plan.md), [типизированных портах](../../foundations/typed-ports/plan.md), [динамической схеме](../../foundations/dynamic-schema/plan.md), [обучении](../../foundations/training/plan.md) и [внешних системах](../../foundations/external-systems/plan.md). `recommended_after` передаёт опыт; самостоятельный fixture позволяет начинать без готового парного import/export либо аналитического предшественника.

### Дополнительные самостоятельные fixtures

Одна информационная K, два transpose A,B: (k1,1,2),(k2,NULL,3). ignore_empty=false даёт 4 строки, true — 3; numeric/string/bool/date mixed case проверяет native Values и соответствующий DataTypes для каждой ячейки.

Перед автономным прогоном разместить задачу и входы отдельно от `expected`/oracle; указать точные типы, NULL, порядок там, где он значим, и числовую точность. Неоднозначную формулу/тип/границу сначала подтвердить отдельной диагностикой, затем заморозить ожидания. Сохранённые исторические fixtures, если перечислены выше, используются в исходных границах.

### Приёмка и восстановление

- Для каждого требования выполнить new/existing, Done/Close/Execute там, где применимо; проверить сохранённые настройки, свежий результат и save/reopen. Положительный тест сопровождается отказом на неверные типы/поля/порты.
- Адресные tests запускаются из пакета; oracle проверяется намеренной подменой значения, порядка, схемы и execution identity. Полный небольшой результат проверяется независимо; preview или старый PASS не доказывает новый этап.
- Один operation_id не допускает повторного эффекта. Потерянный ответ и expiry сохраняют неоднозначность до штатного inspect/recover; дедлайн не продлевается. Cancel закрывает только принадлежащий операции draft, чужие узлы/связи неизменны.
- Cold-check должен поддерживать именно заявленный вид результата, число выходов и точность. Текущий базовый скрипт читает один tabular output 0 и сравнивает строки без порядка; такие ограничения устраняются в prerequisite до зависимой приёмки.
- PASS требует чистый source SHA, pins клиента/runtime/модели/платформы, независимый oracle и подтверждённые `package_closed=true`, `logged_out=true`. Неисполненные строки остаются NOT_RUN; сохранение/технический успех/аналитика/интеграция/выпуск различаются. Checkpoint — до 20 строк, с результатом, ограничениями и следующим этапом.

### Проверенные официальные источники

- `collapse-columns:help1` — [Свёртка столбцов](https://help.loginom.ru/userguide/processors/transformation/collapse-columns.html), Help 7.4, прочитано 2026-10-02.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `collapse-columns:s1` | Табличные соединения и форма таблицы | collapse-columns | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `collapse-columns:s2` | Табличные соединения и форма таблицы | collapse-columns | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
