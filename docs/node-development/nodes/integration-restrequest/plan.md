# REST-запрос: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.integration.RestRequest`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

REST connection + необязательная таблица запроса и управляющие переменные → таблица ответов и дополнительных данных. Без входного набора отправляется один запрос; с набором — запрос на строку.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `integration-restrequest:help-01` | [REST-запрос](https://help.loginom.ru/userguide/processors/integration/rest-request.html) | 7.4 | 2026-10-02 |
| `integration-restrequest:help-02` | [REST-сервис](https://help.loginom.ru/userguide/integration/connections/list/rest-service.html) | 7.4 | 2026-10-02 |
| `integration-restrequest:help-03` | [Примеры URL параметров](https://help.loginom.ru/userguide/integration/connections/list/rest-parameters-examples.html) | 7.4 | 2026-10-02 |
| `integration-restrequest:help-04` | [Настройка аутентификации](https://help.loginom.ru/userguide/integration/connections/list/auth-type.html) | 7.4 | 2026-10-02 |

### Матрица окружений/провайдеров

REST: GET/DELETE/POST/PUT/PATCH; URL query/segments/replacement; HTTP/HTTPS; auth «Не требуется», «Имя пользователя и пароль» (Negotiate/NTLM/Basic/Digest), «Basic», «Токен OAuth» (2.0), «Клиентский сертификат из хранилища», «Файлы сертификата клиента». Certificate-store профиль — Windows. TLS enforcement задаёт администратор, а не обработчик.

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `integration-restrequest:r01`<br>`integration-restrequest:s1` | GET/DELETE с параметрами, POST/PUT/PATCH с request body; query/segments/replacement URL. | Пять методов × три URL схемы: ledger проверяет метод, кодирование, порядок параметров и точные body bytes. Поле body и URL-параметр не получают один binding. | `integration-restrequest:help-01`, `integration-restrequest:help-02`, `integration-restrequest:help-03` |
| `integration-restrequest:r02`<br>`integration-restrequest:s1` | Ручное/автоматическое сопоставление, пользовательские headers и timezone параметров. | Сверить header/URL по каждому request ID и typed полям; изменение порядка URL-параметров меняет адрес только в query/segments режимах. | `integration-restrequest:help-01`, `integration-restrequest:help-02`, `integration-restrequest:help-03` |
| `integration-restrequest:r03`<br>`integration-restrequest:s2` | Допустимый Content-Type, оба выхода и HTTP ≥400 → completion code 6. | Wrong type и 400 дают явную ошибку в допданных; HTTP200 с неверным телом не принимается за аналитический успех. */* проверяется отдельно. | `integration-restrequest:help-01`, `integration-restrequest:help-02` |
| `integration-restrequest:r04`<br>`integration-restrequest:s2` | Интервал запросов, retry count/delay, timeout; повторы network/408/429/5xx. | Ledger считает попытки и интервалы при transient fail→success; 400 не повторяется как transient. Учитывать эффект POST при потерянном ответе. | `integration-restrequest:help-01` |
| `integration-restrequest:r05`<br>`integration-restrequest:s2` | Имитация ответа из файла, запись запросов на диск, управляющие переменные и label. | При simulation ledger пуст, ответ равен fixture; сохранённые request-файлы проверяются отдельно и не содержат реальные секреты. Имитация не заменяет live transport case. | `integration-restrequest:help-01` |
| `integration-restrequest:r06`<br>`integration-restrequest:s3` | Профили аутентификации/TLS и различие connection timeout/total timeout. | Для каждого разрешённого профиля fixture отвечает только после нужной auth; неверный сертификат/credentials дают отказ. Security override не отключается автоматически. | `integration-restrequest:help-02`, `integration-restrequest:help-04` |

### Самостоятельные fixtures

Контролируемый HTTP(S) echo-сервис с request ledger и endpoints success/400/408/429/500/wrong-content-type/delay. Входные строки содержат UTF-8, reserved URL characters, дату, JSON body. Серверный ledger и заранее заданные ответы — независимый oracle.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `integration-restrequest:s1` | Методы, URL и request bindings; покрывает `integration-restrequest:r01`, `integration-restrequest:r02` | 3 | `foundation:oracle-tabular`, `foundation:connections`, `foundation:external-effects` | Изолированный HTTP(S) ledger fixture |
| `integration-restrequest:s2` | Ошибки, повтор, simulation и сохранение; покрывает `integration-restrequest:r03`, `integration-restrequest:r04`, `integration-restrequest:r05` | 4 | `integration-restrequest:s1`, `foundation:typed-variables`, `foundation:file-artifacts` | окружение предыдущего этапа |
| `integration-restrequest:s3` | Полная матрица auth/TLS; покрывает `integration-restrequest:r06` | 4 | `integration-restrequest:s2` | Тестовые auth providers и сертификаты |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:connections](../../foundations/external-systems/plan.md), [foundation:external-effects](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md), [foundation:file-artifacts](../../foundations/external-systems/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `node-context.mjs` для identity, `port-mapping-procedure.mjs` для наблюдённых bindings и `node-operation-runner.mjs` для ownership. Подключения БД/сервиса добавляет общий foundation; `connection-recovery.mjs` восстанавливает browser-сессию и не заменяет CRUD подключений Loginom.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `integration-restrequest-node.mjs`, `integration-restrequest-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

## Ошибки и восстановление

Разрешённые native retry — часть настроек пользователя; recovery handler не добавляет ещё один HTTP retry. После lost reply проверять ledger, особенно POST/PUT/PATCH/DELETE. При отмене сохранить корреляцию завершённых и неизвестных запросов.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/integration-restrequest.test.mjs` и `client/test/integration-restrequest-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/integration-restrequest.test.mjs test/integration-restrequest-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «REST-запрос» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Схемы response/допданных, классификация transport errors, timeout при retries и поведение подключённой пустой таблицы требуют discovery.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `integration-restrequest:s1` | XML и HTTP-сервисы | integration-restrequest | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `integration-restrequest:s2` | XML и HTTP-сервисы | integration-restrequest | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `integration-restrequest:s3` | XML и HTTP-сервисы | integration-restrequest | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
