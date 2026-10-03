# Экспорт — База данных: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.exports.DataBase`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Подключение БД + исходная таблица + необязательные управляющие переменные → переменные статуса (0/1, ошибка); табличного результата экспорта нет.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `exports-database:help-01` | [База данных](https://help.loginom.ru/userguide/integration/export/database.html) | 7.4 | 2026-10-02 |
| `exports-database:help-02` | [Создание таблицы](https://help.loginom.ru/userguide/integration/export/database/new-table-design.html) | 7.4 | 2026-10-02 |
| `exports-database:help-03` | [Подключения](https://help.loginom.ru/userguide/integration/connections/) | 7.4 | 2026-10-02 |

### Матрица окружений/провайдеров

Матрица подключений: BigQuery, ClickHouse, Firebird, MS Access, MS Excel, MS SQL, MySQL, ODBC, Oracle, PostgreSQL, SQLite. Первый воспроизводимый профиль — PostgreSQL; SQLite — второй. Остальные профили сохраняют отдельные NOT_RUN до своей проверки ОС/драйвера/прав/версии; PASS одного провайдера не переносится на другой. Подключение подготавливается независимо от обработчиков импорта/экспорта.

Ограничения Help: TRUNCATE недоступен SQLite/Firebird/Access; ODBC разрешает выбор, но драйвер может отказать. ClickHouse использует TRUNCATE вместо очистки DELETE и ALTER DELETE для ключевого удаления; UPDATE отсутствует в ClickHouse/BigQuery. MS Excel допускает только добавление/обновление. Пачки настраиваются для ClickHouse/Oracle/PostgreSQL/ODBC (1–1000000); fast loader — только PostgreSQL и три вставляющих режима. Транзакции READ COMMITTED лишь при поддержке СУБД; transaction commit interval проверяется отдельно.

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `exports-database:r01`<br>`exports-database:s1` | Дополнение, очистка+заполнение, TRUNCATE+заполнение, удаление по ключу, удаление+дополнение, обновление. | Для каждого из 6 режимов сравнить Target после выполнения независимым SQL-клиентом; удаление не вставляет строки, обновление не вставляет новый ключ. | `exports-database:help-01` |
| `exports-database:r02`<br>`exports-database:s1` | Явное соответствие/ключевые поля, auto-link по имени затем метке, обновление полей и автоматическая синхронизация. | Переставить исходные поля и совпадающие метки: проверить связи по identity/type, существующие связи сохраняются; schema change не подменяет ключ. | `exports-database:help-01` |
| `exports-database:r03`<br>`exports-database:s2` | Создание таблицы: поля/порядок/тип/размер/NOT NULL/PK; удаление существующей; просмотр или редактирование DDL. | Сверить DDL каталога БД. Длина строки сверх лимита/NULL в NOT NULL дают отказ; удаление допустимо только в своей fixture-схеме. Обновление DDL назначения проверяется внешним oracle и не требует relaxed output-schema policy. | `exports-database:help-02` |
| `exports-database:r04`<br>`exports-database:s2` | Режим через integer-переменную 0–5; ignore-errors и статус, число строк пачки, период фиксации. | Перебрать 0–5 и недопустимые значения; провоцировать ошибку во второй пачке и сравнить реально committed строки со статусом, не считать activation успехом. | `exports-database:help-01` |
| `exports-database:r05`<br>`exports-database:s2` | Матрица SQL-диалектов и PostgreSQL fast loader Авто/Да/Нет. | На PostgreSQL проверить размеры 99/100/499/500/501 и batch; VIEW/RULE/неподдержанный тип проверяют ограничения fast loader. Провайдерный лог подтверждает COPY/INSERT, числа — oracle. | `exports-database:help-01` |

### Самостоятельные fixtures

Независимый SQL-клиент создаёт Target с начальными (1,A,10),(2,B,20),(9,Z,90). Вход (2,B2,25),(3,C,30), отдельные NULL/overflow/дубликат ключа. Каждый destructive case получает новую схему; ожидаемое состояние БД рассчитывается до запуска.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `exports-database:s1` | Шесть операций и точные bindings на PostgreSQL; покрывает `exports-database:r01`, `exports-database:r02` | 3 | `foundation:oracle-tabular`, `foundation:connections`, `foundation:external-effects` | окружение предыдущего этапа |
| `exports-database:s2` | DDL, пачки, переменные и провайдеры; покрывает `exports-database:r03`, `exports-database:r04`, `exports-database:r05` | 4 | `exports-database:s1`, `foundation:typed-variables` | окружение предыдущего этапа |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:connections](../../foundations/external-systems/plan.md), [foundation:external-effects](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `node-context.mjs` для identity, `port-mapping-procedure.mjs` для наблюдённых bindings и `node-operation-runner.mjs` для ownership. Подключения БД/сервиса добавляет общий foundation; `connection-recovery.mjs` восстанавливает browser-сессию и не заменяет CRUD подключений Loginom.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `exports-database-node.mjs`, `exports-database-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

### Политика схемы и границы зависимости

DDL и автоматическая синхронизация связей назначения меняют внешнюю таблицу/настройки sink, но не разрешают relaxed policy чтения результата Loginom. Поэтому CrossTable dynamic-schema не является prerequisite. Сверять target DDL и bindings отдельным DB oracle; неизвестное изменение входной схемы не принимается без наблюдённого mapping и строгой проверки.

## Ошибки и восстановление

До Execute фиксировать целевой объект, режим и исходное состояние; DDL/TRUNCATE/частичные commit могут быть необратимы. Потерянный ответ не допускает повтор INSERT/DELETE. Проверить БД другим соединением; rollback только своей активной транзакции.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/exports-database.test.mjs` и `client/test/exports-database-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/exports-database.test.mjs test/exports-database-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «Экспорт — База данных» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Границы порогов fast loader, точное сопоставление numeric режима и каждый dialect подтвердить на закреплённых версиях до приёмки.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `exports-database:s1` | Базы данных и Warehouse | exports-database | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `exports-database:s2` | Базы данных и Warehouse | exports-database | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
