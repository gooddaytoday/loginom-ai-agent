# SOAP-запрос: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.integration.SoapRequest`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

SOAP connection + необязательная таблица и переменные → данные, WSDL fault, дополнительные данные. WSDL1.1 и SOAP1.1/1.2. Без таблицы — один запрос без параметров.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `integration-soaprequest:help-01` | [SOAP-запрос](https://help.loginom.ru/userguide/processors/integration/soap-request.html) | 7.4 | 2026-10-02 |
| `integration-soaprequest:help-02` | [SOAP-сервис](https://help.loginom.ru/userguide/integration/connections/list/soap-service.html) | 7.4 | 2026-10-02 |
| `integration-soaprequest:help-03` | [Настройка аутентификации](https://help.loginom.ru/userguide/integration/connections/list/auth-type.html) | 7.4 | 2026-10-02 |
| `integration-soaprequest:help-04` | [Сравнение редакций](https://help.loginom.ru/userguide/compare-editions.html) | 7.4 | 2026-10-02 |

### Матрица окружений/провайдеров

WSDL1.1 × SOAP1.1/SOAP1.2; WSDL из файла/URL/резерва с XSLT on/off; auth «Не требуется» / «Имя пользователя и пароль» (Negotiate/NTLM/Basic/Digest) / «Токен OAuth» (2.0) / клиентский сертификат из Windows-хранилища либо файлов. Отдельный пункт «Basic» описан Help для REST: его доступность в SOAP — discovery_required, Basic внутри username/password — отдельная проверка. Auth WSDL и операции может различаться. Каждая комбинация с отдельным источником ожидаемого envelope.

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `integration-soaprequest:r01`<br>`integration-soaprequest:s1` | Операция WSDL, mapping входных параметров, выходных полей и обрабатываемых fault атрибутов. | Ledger подтверждает operation/action/envelope; сверить отдельно result=30 и заданный business fault во всех трёх портах. | `integration-soaprequest:help-01` |
| `integration-soaprequest:r02`<br>`integration-soaprequest:s1` | По строке / группировка по ID, отсутствие входа; HTTP headers и три timezone-политики запроса. | Две строки группы A формируют один запрос с двумя Items; без входного порта — один вызов. Date и DateTime сериализуются по выбранной политике. | `integration-soaprequest:help-01` |
| `integration-soaprequest:r03`<br>`integration-soaprequest:s2` | Ответ: default-zone, duplication родителей, strict XSD и составные метки. | Z/+03:00/naive даты и повторяющиеся элементы сверить независимым XML parser; invalid typed XML различается со strict on/off. | `integration-soaprequest:help-01` |
| `integration-soaprequest:r04`<br>`integration-soaprequest:s2` | Описание error codes, raw SOAP response, timeout и simulation из файла; запись исходящих запросов. | Fault не считается транспортным success; timeout связан с ledger. Simulation не вызывает сервис и возвращает fixture; raw bytes совпадают с сервером. | `integration-soaprequest:help-01` |
| `integration-soaprequest:r05`<br>`integration-soaprequest:s3` | WSDL основной/резервный, XSLT, раздельная auth загрузки WSDL и запросов, TLS. | Сломанный основной WSDL включает контролируемый резервный; неверный XSLT/credentials даёт точную причину. Получение WSDL не доказывает авторизацию операции. Отдельный Basic-only пункт для SOAP не обещать: Help описывает его для REST; поддержанный Basic в username/password проверить отдельно. | `integration-soaprequest:help-02`, `integration-soaprequest:help-03` |
| `integration-soaprequest:r06`<br>`integration-soaprequest:s3` | SOAP1.1/1.2, edition/platform профили, метки/комментарии и логирование строк. | На Standard/Enterprise/Cloud проверить оба протокола по envelope и согласованным output schemas; настройки воспроизводятся новым профилем. | `integration-soaprequest:help-01`, `integration-soaprequest:help-04` |

### Самостоятельные fixtures

Независимый локальный WSDL и SOAP fixture: операция Sum с повторяющимися Items, ответ total, controlled WSDL fault, malformed response, delay. Input A:10,20 и B:5 даёт grouped totals30/5; ledger хранит envelope/request IDs без секретов.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `integration-soaprequest:s1` | Операции, группы и три выхода; покрывает `integration-soaprequest:r01`, `integration-soaprequest:r02` | 3 | `foundation:oracle-tabular`, `foundation:connections`, `foundation:external-effects` | Standard/Enterprise/Cloud, независимый WSDL/SOAP fixture |
| `integration-soaprequest:s2` | Разбор ответа, fault и debugging modes; покрывает `integration-soaprequest:r03`, `integration-soaprequest:r04` | 4 | `integration-soaprequest:s1`, `foundation:typed-variables`, `foundation:file-artifacts` | окружение предыдущего этапа |
| `integration-soaprequest:s3` | WSDL/auth/protocol матрица; покрывает `integration-soaprequest:r05`, `integration-soaprequest:r06` | 4 | `integration-soaprequest:s2` | Тестовые SOAP1.1/1.2 и auth endpoints |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:connections](../../foundations/external-systems/plan.md), [foundation:external-effects](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md), [foundation:file-artifacts](../../foundations/external-systems/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `node-context.mjs` для identity, `port-mapping-procedure.mjs` для наблюдённых bindings и `node-operation-runner.mjs` для ownership. Подключения БД/сервиса добавляет общий foundation; `connection-recovery.mjs` восстанавливает browser-сессию и не заменяет CRUD подключений Loginom.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `integration-soaprequest-node.mjs`, `integration-soaprequest-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

## Ошибки и восстановление

Операция SOAP может изменять сервис. После неизвестного эффекта запрещён автоматический повтор; fault/error сохранять с request ID, не подменять simulation. Не публиковать секреты из raw envelope.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/integration-soaprequest.test.mjs` и `client/test/integration-soaprequest-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/integration-soaprequest.test.mjs test/integration-soaprequest-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «SOAP-запрос» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Пустая подключённая таблица, NULL/group ID, schema fault при нескольких faults и timezone типизация устанавливаются discovery.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `integration-soaprequest:s1` | XML и HTTP-сервисы | integration-soaprequest | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `integration-soaprequest:s2` | XML и HTTP-сервисы | integration-soaprequest | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `integration-soaprequest:s3` | XML и HTTP-сервисы | integration-soaprequest | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
