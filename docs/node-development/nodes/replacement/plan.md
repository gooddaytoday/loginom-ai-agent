# 11. Замена: подплан сопровождения и приёмки

[Карточка и принятые границы](README.md) · [реестр](../../registry.json) · [работа с одним узлом](../../workflow/single-node.md).

Обработчик `transform.replace_columns` уже реализован в режиме `exact`. Этот подплан адаптирует исторический 11 к текущему runtime и standalone CLI: это маршрут адресного исправления, проверки переноса или отдельно назначенного расширения, не повторная разработка с нуля. Историческое принятие сохраняется в своём scope; технические Desktop проверки не являются аналитической CLI-приёмкой. Новых живых наблюдений и прогонов при составлении документа не было, readiness не повышается.

До начала выбрать точное изменение и пройти [подготовку/жизненный цикл](../../workflow/lifecycle.md). Этот документ не назначает следующий узел и не разрешает слияние.

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

Ниже — обязательная узловая матрица для ранее объявленного ограниченного scope. При адресном исправлении выбрать затронутые строки и обосновать выбор; расширение режима добавляет новые строки. До автономной попытки сохранить входы и expected отдельно от handler, с версиями и SHA. Ожидания не вычислять импортом реализации и не подгонять по её приёмочному выводу.

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

Первичная отладка — штатными скриптами текущего runtime в назначенной изоляции. После неё выполнить адресные source tests и проверить независимый oracle, включая его отказ на подменённых значениях/схеме/идентичности. Только затем подготовить неизменный candidate и получить слот по [CLI-регламенту](../../workflow/acceptance-cli.md): standalone CLI Loginom AI Agent, назначенный профиль модели, бизнес-цель и входные файлы без пошаговых UI-команд.

Критерий аналитического PASS — полный малый output/артефакт, проверенная схема и настройки, новый execution и сохранённый пакет, которые независимо воспроизводятся после отдельного открытия. Configure-only и Close проверяются отдельно; обычный продуктовый путь не переоткрывает мастер ради повторной проверки. Непроверенные платформы, большие наборы и дополнительные режимы остаются явно ограниченными.

Передать checkpoint с точными source/runtime/client/model/platform pins, заявленным scope, результатами и неизменёнными исходными FAIL. Техническое завершение, аналитическая проверка, integration и release — отдельные состояния реестра.

## Полное поэтапное покрытие Help 7.4 — 2026-10-02

Снимок исходников: `5f772aea9de6414a19feb6ecc109a196c9e92453`. Исследованы официальные страницы ниже и существующие handlers; живой discovery, новые прогоны и реализация расширений не выполнялись. `accepted_scope_maintenance` означает сопровождение ранее принятого ограниченного объёма, а не новую CLI-приёмку. Все расширения имеют статус `discovery_required`; полное покрытие не достигается одним первым этапом.

### `replacement:s1` — Сопровождение internal exact

Статус: `accepted_scope_maintenance`. Приоритет: P0. Покрывает: `replacement:r01`.
Жёсткие предпосылки: `foundation:oracle-tabular`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `replacement:r01` — Exact string/integer/real, replace/add, остальное keep/null/value и _Replaced. Источник: `replacement:help1`, `replacement:help2`, `replacement:help5` Проверка: Прежние fixtures без изменения точности/NULL семантики.

### `replacement:s2` — Полные внутренние правила и типы

Статус: `discovery_required`. Приоритет: P1. Покрывает: `replacement:r02`, `replacement:r03`.
Жёсткие предпосылки: `replacement:s1`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `replacement:r02` — Точность числового поиска, nearest-match/tie boundaries, изменение типа замены, регистр. Источник: `replacement:help1`, `replacement:help2` Проверка: Граничный набор X, тип результата и значения точно; неопределённые ties подтвердить до приёмки.
- `replacement:r03` — Regex поиск/замена и fallback regex $1; последовательность exact→regex→остальное. Источник: `replacement:help1`, `replacement:help3`, `replacement:help5` Проверка: Пересекающиеся правила, invalid regex, NULL и _Replaced для всех fallback режимов.

### `replacement:s3` — Внешние таблицы и файлы правил

Статус: `discovery_required`. Приоритет: P2. Покрывает: `replacement:r04`, `replacement:r05`.
Жёсткие предпосылки: `replacement:s1`, `foundation:file-artifacts`. Рекомендуется после: нет.
Условия среды: доступный компонент выбранной редакции Loginom 7.4; отдельный тестовый пакет и аккаунт.

- `replacement:r04` — Несколько внешних таблиц; роли Значение/Замена/Информационное/Не используемое и первый подходящий ряд. Источник: `replacement:help1` Проверка: Каждая входная identity наблюдается, дубликаты правил упорядочены; дополнительное информационное поле проверено.
- `replacement:r05` — Импорт/экспорт таблицы правил: UTF-8, два TSV поля без заголовка, locale decimals и ? как NULL. Источник: `replacement:help4` Проверка: Независимый parser небольшого файла; неподходящие строки и сохранение/повторное применение правил.

### Реализация и общие контракты

Расширять replacement-node/parameters/procedure, использовать multiple-input подход union/join для внешних таблиц. У regex, external tables и numeric tolerance своя readback-модель; порядок правил сохраняется.

Переиспользовать `node.apply` с pure validation до эффектов, общий gate/journal/deadline и наблюдаемые node/port identities. Для новых возможностей актуализировать node registry/contracts, parameter schema, driver/readback, compact user-v1 и адресные tests; имена полей/режимов API закрепить после discovery. Публичный новый контракт и уточнённые критерии приёмки согласуются до runtime-изменения. Названия Help не являются готовыми runtime enum.

Общие зависимости раскрыты в [приёмке](../../foundations/acceptance/plan.md), [типизированных портах](../../foundations/typed-ports/plan.md), [динамической схеме](../../foundations/dynamic-schema/plan.md), [обучении](../../foundations/training/plan.md) и [внешних системах](../../foundations/external-systems/plan.md). `recommended_after` передаёт опыт; самостоятельный fixture позволяет начинать без готового парного import/export либо аналитического предшественника.

### Дополнительные самостоятельные fixtures

X=[5,10,15,99], rules 5→-5,15→-15, tolerance=5: ожидание [-5,-15,-15,99] зафиксировано Help и отдельно проверяется. Строки [A12,B12,NULL,empty], exact A12→exact и regex ^A→regex: точное правило приоритетно. Две внешние строки для B12 демонстрируют приоритет первой.

Перед автономным прогоном разместить задачу и входы отдельно от `expected`/oracle; указать точные типы, NULL, порядок там, где он значим, и числовую точность. Неоднозначную формулу/тип/границу сначала подтвердить отдельной диагностикой, затем заморозить ожидания. Сохранённые исторические fixtures, если перечислены выше, используются в исходных границах.

### Приёмка и восстановление

- Для каждого требования выполнить new/existing, Done/Close/Execute там, где применимо; проверить сохранённые настройки, свежий результат и save/reopen. Положительный тест сопровождается отказом на неверные типы/поля/порты.
- Адресные tests запускаются из пакета; oracle проверяется намеренной подменой значения, порядка, схемы и execution identity. Полный небольшой результат проверяется независимо; preview или старый PASS не доказывает новый этап.
- Один operation_id не допускает повторного эффекта. Потерянный ответ и expiry сохраняют неоднозначность до штатного inspect/recover; дедлайн не продлевается. Cancel закрывает только принадлежащий операции draft, чужие узлы/связи неизменны.
- Cold-check должен поддерживать именно заявленный вид результата, число выходов и точность. Текущий базовый скрипт читает один tabular output 0 и сравнивает строки без порядка; такие ограничения устраняются в prerequisite до зависимой приёмки.
- PASS требует чистый source SHA, pins клиента/runtime/модели/платформы, независимый oracle и подтверждённые `package_closed=true`, `logged_out=true`. Неисполненные строки остаются NOT_RUN; сохранение/технический успех/аналитика/интеграция/выпуск различаются. Checkpoint — до 20 строк, с результатом, ограничениями и следующим этапом.

### Проверенные официальные источники

- `replacement:help1` — [Замена](https://help.loginom.ru/userguide/processors/transformation/substitution/), Help 7.4, прочитано 2026-10-02.
- `replacement:help2` — [Точное совпадение](https://help.loginom.ru/userguide/processors/transformation/substitution/exact-match.html), Help 7.4, прочитано 2026-10-02.
- `replacement:help3` — [Регулярное выражение](https://help.loginom.ru/userguide/processors/transformation/substitution/regexp-match.html), Help 7.4, прочитано 2026-10-02.
- `replacement:help4` — [Структура файла замен](https://help.loginom.ru/userguide/processors/transformation/substitution/import-tz.html), Help 7.4, прочитано 2026-10-02.
- `replacement:help5` — [Заменять остальное](https://help.loginom.ru/userguide/processors/transformation/substitution/other-match.html), Help 7.4, прочитано 2026-10-02.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `replacement:s1` | Выражения и настройки строк | replacement | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `replacement:s2` | Выражения и настройки строк | replacement | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `replacement:s3` | Выражения и настройки строк | replacement | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
