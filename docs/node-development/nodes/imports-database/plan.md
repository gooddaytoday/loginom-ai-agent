# Импорт — База данных: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.imports.DataBase`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Входы: подключение БД и необязательные управляющие переменные. Выходы: таблица и переменные статуса (код 0/1/2 и текст ошибки). Preview ограничен 100 строками и не заменяет полный результат.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `imports-database:help-01` | [База данных](https://help.loginom.ru/userguide/integration/import/database.html) | 7.4 | 2026-10-02 |
| `imports-database:help-02` | [Подключения](https://help.loginom.ru/userguide/integration/connections/) | 7.4 | 2026-10-02 |
| `imports-database:help-03` | [Фильтр строк](https://help.loginom.ru/userguide/processors/transformation/row-filter/) | 7.4 | 2026-10-02 |

### Матрица окружений/провайдеров

Матрица подключений: BigQuery, ClickHouse, Firebird, MS Access, MS Excel, MS SQL, MySQL, ODBC, Oracle, PostgreSQL, SQLite. Первый воспроизводимый профиль — PostgreSQL; SQLite — второй. Остальные профили сохраняют отдельные NOT_RUN до своей проверки ОС/драйвера/прав/версии; PASS одного провайдера не переносится на другой. Подключение подготавливается независимо от обработчиков импорта/экспорта.

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `imports-database:r01`<br>`imports-database:s1` | Выбор таблицы/представления, список извлекаемых полей и метки из описаний БД. | Таблица и VIEW дают одинаковые 6 записей; subset сохраняет выбранный порядок и описания там, где провайдер их поддерживает. | `imports-database:help-01` |
| `imports-database:r02`<br>`imports-database:s1` | SQL-запрос, пустой результат с сохранённой схемой и точные типы результата. | Независимый SELECT с ORDER BY и WHERE id>100 даёт соответственно полный упорядоченный результат и ноль строк с той же схемой. | `imports-database:help-01` |
| `imports-database:r03`<br>`imports-database:s2` | Фильтр режима выбора таблицы: AND/OR, NULL, строки, регистр; фильтрация по невыводимому полю. | Фильтр amount>10 при выводе только id сверить с WHERE; строковый регистр проверять по фактической collation. Номер строки/список уникальных значений не предлагать. | `imports-database:help-01` |
| `imports-database:r04`<br>`imports-database:s2` | Параметры :name в WHERE и макроподстановки %name%; типы переменных и кавычки. | Строка с апострофом, число и дата проходят типизированными параметрами; подстановка меняет таблицу/условие. Текст в кавычках остаётся литералом. | `imports-database:help-01` |
| `imports-database:r05`<br>`imports-database:s2` | Игнорирование ошибок и тайм-аут импорта; различать успешную активацию, код 1 и код 2. | Контролируемые SQL-ошибка и задержка дают разные статусы; разрешённый частичный набор после тайм-аута не объявлять полным. Проверить тайм-аут отдельно от подключения/preview. | `imports-database:help-01` |
| `imports-database:r06`<br>`imports-database:s2` | Провайдерные варианты и изменение полей исходной таблицы. | На каждом подключении сверить schema/type/NULL; после ADD COLUMN проверить выбранные поля и сохранённый запрос, запретить угадывание исчезнувшего поля. Явная перенастройка фиксирует новую strict schema; неожиданное изменение без configure должно быть обнаружено, а не автоматически принято. | `imports-database:help-01` |

### Самостоятельные fixtures

В отдельной БД создать независимым SQL-клиентом таблицу People(id, label, amount, active, occurred_at) и VIEW: 6 строк, повторная метка, NULL, пустая строка, кириллица, дата с секундами, отрицательная сумма. Манифест содержит DDL, значения и типы; эталонный SELECT выполняет другой клиент.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `imports-database:s1` | Таблица и SQL на одном принятом подключении; покрывает `imports-database:r01`, `imports-database:r02` | 2 | `foundation:oracle-tabular`, `foundation:connections` | окружение предыдущего этапа |
| `imports-database:s2` | Фильтры, параметры, ошибки и провайдеры; покрывает `imports-database:r03`, `imports-database:r04`, `imports-database:r05`, `imports-database:r06` | 4 | `imports-database:s1`, `foundation:typed-variables` | окружение предыдущего этапа |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:connections](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `node-context.mjs` для identity, `port-mapping-procedure.mjs` для наблюдённых bindings и `node-operation-runner.mjs` для ownership. Подключения БД/сервиса добавляет общий foundation; `connection-recovery.mjs` восстанавливает browser-сессию и не заменяет CRUD подключений Loginom.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `imports-database-node.mjs`, `imports-database-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

### Политика схемы и границы зависимости

Зависимость от CrossTable dynamic-schema отсутствует: явный набор полей и изменение SELECT через configure закрепляют новую строгую схему. В imports-database:r06 при изменении источника сверять прежний mapping; неожиданная схема или исчезнувшее поле должны завершаться отказом до явной перенастройки. Автоматическое принятие произвольной схемы SQL/макросов после execute этим этапом не разрешено: если discovery выявит отдельный поддержанный автоматический режим, его policy и oracle потребуют самостоятельного согласования.

## Ошибки и восстановление

Потерянный ответ выполнения не повторять автоматически: SQL-текст может иметь побочные эффекты. При timeout/ignore-errors сохранять частичные строки и статус отдельно от полного результата.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/imports-database.test.mjs` и `client/test/imports-database-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/imports-database.test.mjs test/imports-database-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «Импорт — База данных» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Точные native формы статуса, поддержка столбцовых описаний и правила collation каждого драйвера требуют discovery.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `imports-database:s1` | Базы данных и Warehouse | imports-database | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `imports-database:s2` | Базы данных и Warehouse | imports-database | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
