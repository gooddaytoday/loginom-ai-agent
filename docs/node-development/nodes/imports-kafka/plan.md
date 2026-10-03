# Импорт — Kafka: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.imports.Kafka`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Подключение Kafka + необязательные управляющие переменные → таблица сообщений. Чтение может изменять сохранённые offsets группы; схему выходных полей выяснить в discovery.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `imports-kafka:help-01` | [Kafka](https://help.loginom.ru/userguide/integration/import/kafka.html) | 7.4 | 2026-10-02 |
| `imports-kafka:help-02` | [Kafka](https://help.loginom.ru/userguide/integration/connections/list/kafka.html) | 7.4 | 2026-10-02 |
| `imports-kafka:help-03` | [Сравнение редакций](https://help.loginom.ru/userguide/compare-editions.html) | 7.4 | 2026-10-02 |

### Матрица окружений/провайдеров

Подключение Kafka: PLAINTEXT, SASL_Plaintext, SSL, SASL_SSL; SASL PLAIN/SCRAM-SHA-256/SCRAM-SHA-512. Каждый доступный профиль проверяется отдельно; секреты поступают из окружения и не сохраняются в evidence.

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `imports-kafka:r01`<br>`imports-kafka:s1` | Топик, group.id, client.id, предел сообщений и ожидание одного сообщения. | При лимите 4 прочитано ровно 4 доступных сообщения; пустой топик завершается по timeout без вымышленных строк. Проверить реальные ключи/значения/metadata. | `imports-kafka:help-01` |
| `imports-kafka:r02`<br>`imports-kafka:s2` | Все пять типов смещения: без заданного, начало, текущее сохранённое, абсолютное, относительно конца. | Для каждой партиции заранее записать offsets; сверить фактические message IDs и конечные offsets новым клиентом, не только row count. | `imports-kafka:help-01` |
| `imports-kafka:r03`<br>`imports-kafka:s2` | Дополнительная конфигурация Consumer, переменные и аутентификация подключения. | Менять одно допустимое свойство и topic через переменную; неверное свойство/ACL даёт отказ. Конфликт wizard и дополнительного свойства — discovery. | `imports-kafka:help-01` |
| `imports-kafka:r04`<br>`imports-kafka:s2` | Сохранение и повторное выполнение с уже продвинутыми offsets. | Повтор не обязан вернуть прежние строки: expected определяется сохранённой позицией группы. Проверить отсутствие повторного потребления после lost reply. | `imports-kafka:help-01` |

### Самостоятельные fixtures

В изолированном топике 2 партиции, в каждой 3 сообщения с уникальными ключами и порядковыми номерами. Независимый producer готовит байты; эталонный consumer читает без изменения группы под проверкой. Начальные group offsets фиксируются административным клиентом.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `imports-kafka:s1` | Ограниченное чтение из отдельного топика; покрывает `imports-kafka:r01` | 3 | `foundation:oracle-tabular`, `foundation:connections`, `foundation:external-effects` | Enterprise/Cloud и независимый Kafka fixture |
| `imports-kafka:s2` | Offsets, повтор, Consumer и переменные; покрывает `imports-kafka:r02`, `imports-kafka:r03`, `imports-kafka:r04` | 4 | `imports-kafka:s1`, `foundation:typed-variables` | окружение предыдущего этапа |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:connections](../../foundations/external-systems/plan.md), [foundation:external-effects](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `node-context.mjs` для identity, `port-mapping-procedure.mjs` для наблюдённых bindings и `node-operation-runner.mjs` для ownership. Подключения БД/сервиса добавляет общий foundation; `connection-recovery.mjs` восстанавливает browser-сессию и не заменяет CRUD подключений Loginom.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `imports-kafka-node.mjs`, `imports-kafka-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

## Ошибки и восстановление

Не сбрасывать offsets общей группы. Отмена и потеря ответа требуют независимой сверки offsets; слепой retry может пропустить сообщения или прочитать другой набор.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/imports-kafka.test.mjs` и `client/test/imports-kafka-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/imports-kafka.test.mjs test/imports-kafka-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «Импорт — Kafka» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Автокоммит offsets, схема metadata, tie-break порядка между партициями и границы относительного смещения Help подробно не определяет.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `imports-kafka:s1` | Серверный код, процессы и специальные источники | imports-kafka | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `imports-kafka:s2` | Серверный код, процессы и специальные источники | imports-kafka | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
