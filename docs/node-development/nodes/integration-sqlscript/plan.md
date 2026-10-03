# SQL-скрипт: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.integration.SqlScript`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Connection + необязательная таблица и переменные → таблица ошибок: номер строки, код завершения, сообщение. Скрипт не предназначен для возврата SELECT курсора; при конфликте имён поле таблицы приоритетнее переменной.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `integration-sqlscript:help-01` | [SQL-скрипт](https://help.loginom.ru/userguide/processors/integration/sql-script.html) | 7.4 | 2026-10-02 |
| `integration-sqlscript:help-02` | [Подключения](https://help.loginom.ru/userguide/integration/connections/) | 7.4 | 2026-10-02 |

### Матрица окружений/провайдеров

Матрица подключений: BigQuery, ClickHouse, Firebird, MS Access, MS Excel, MS SQL, MySQL, ODBC, Oracle, PostgreSQL, SQLite. Первый воспроизводимый профиль — PostgreSQL; SQLite — второй. Остальные профили сохраняют отдельные NOT_RUN до своей проверки ОС/драйвера/прав/версии; PASS одного провайдера не переносится на другой. Подключение подготавливается независимо от обработчиков импорта/экспорта.

Специальные ветви Help: MS SQL через ODBC/Linux — большой SELECT может помешать последующим командам; SQLite хранит незавершённую транзакцию в соединении; Firebird не поддерживает SET TRANSACTION из скрипта, multi-command требует EXECUTE BLOCK, DDL — EXECUTE IMMEDIATE/autonomous transaction; MySQL подставляет параметры текстом и может не остановиться после SELECT; Oracle — BEGIN..END и EXECUTE IMMEDIATE для DDL; PostgreSQL — Simple Query и явное разрешение failed transaction. Остальные подключения не объявляются поддержанными без проверки скрипта.

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `integration-sqlscript:r01`<br>`integration-sqlscript:s1` | Однократное и построчное выполнение, отсутствие входа; параметры/макросы и конфликт имён. | Без таблицы один INSERT, с таблицей по строке; одинаковое имя в variable и column выбирает column. Пустой подключённый input квалифицировать отдельно. | `integration-sqlscript:help-01` |
| `integration-sqlscript:r02`<br>`integration-sqlscript:s1` | Разбиение на команды и driver-enforced split; DDL/DML без возвращаемого курсора. | Два INSERT выполняются в нужном порядке; неподдерживаемая multi-command конструкция даёт отказ либо установленный driver режим, без вырезания команд. | `integration-sqlscript:help-01` |
| `integration-sqlscript:r03`<br>`integration-sqlscript:s2` | Транзакции: 0 управляет скрипт, -1 весь набор, 1 каждая строка, N>0 блок. | При ошибке строки2 ожидаемые commits различаются: весь набор откатывается; row-mode сохраняет строку1; block-mode откатывает текущий блок. Реальное состояние проверять отдельным соединением. | `integration-sqlscript:help-01` |
| `integration-sqlscript:r04`<br>`integration-sqlscript:s2` | Ignore-errors только при row transaction; timeout по строке, а при split по всем командам. | Row-mode с ignore продолжается после строки2; другие режимы не обещают продолжение. Задержка доказывает область timeout; выход ошибок содержит номер и причину. | `integration-sqlscript:help-01` |
| `integration-sqlscript:r05`<br>`integration-sqlscript:s3` | Провайдерные SQL/transaction особенности и восстановление соединения. | Для SQLite/PostgreSQL проверить собственный незавершённый transaction и ROLLBACK; Firebird/Oracle применяют корректные blocks, ограничения MySQL/MS SQL фиксируются отдельно. | `integration-sqlscript:help-01` |

### Самостоятельные fixtures

Отдельная БД Ledger с входными id=1,2,3; строка2 вызывает UNIQUE/NOT NULL ошибку. Независимый SQL-клиент проверяет committed строки, состояние транзакции и схему. Каждая политика получает чистую БД/схему.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `integration-sqlscript:s1` | Одиночный и построчный скрипт на PostgreSQL; покрывает `integration-sqlscript:r01`, `integration-sqlscript:r02` | 3 | `foundation:oracle-tabular`, `foundation:connections`, `foundation:typed-variables`, `foundation:external-effects` | окружение предыдущего этапа |
| `integration-sqlscript:s2` | Транзакции и контролируемые отказы; покрывает `integration-sqlscript:r03`, `integration-sqlscript:r04` | 4 | `integration-sqlscript:s1` | окружение предыдущего этапа |
| `integration-sqlscript:s3` | Диалекты и восстановление состояния; покрывает `integration-sqlscript:r05` | 4 | `integration-sqlscript:s2` | Отдельные принятые подключения провайдеров |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:connections](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md), [foundation:external-effects](../../foundations/external-systems/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `node-context.mjs` для identity, `port-mapping-procedure.mjs` для наблюдённых bindings и `node-operation-runner.mjs` для ownership. Подключения БД/сервиса добавляет общий foundation; `connection-recovery.mjs` восстанавливает browser-сессию и не заменяет CRUD подключений Loginom.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `integration-sqlscript-node.mjs`, `integration-sqlscript-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

## Ошибки и восстановление

0/-1/1/N имеют разную атомарность. После неизвестного commit сначала независимая сверка; не выполнять скрипт повторно, не COMMIT чужую/неизвестную транзакцию. Собственный rollback фиксируется отдельным доказательством.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/integration-sqlscript.test.mjs` и `client/test/integration-sqlscript-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/integration-sqlscript.test.mjs test/integration-sqlscript-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «SQL-скрипт» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: База индекса строки ошибок, поведение empty input при отключённом per-row, тайм-аут driver и применение переменных уточнить перед фиксацией oracle.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `integration-sqlscript:s1` | Базы данных и Warehouse | integration-sqlscript | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `integration-sqlscript:s2` | Базы данных и Warehouse | integration-sqlscript | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `integration-sqlscript:s3` | Базы данных и Warehouse | integration-sqlscript | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
