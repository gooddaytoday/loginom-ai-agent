# Формирование XML: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.integration.DataToXml`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Таблица + XSD connection + необязательные управляющие переменные → таблица XML-документов и ID; это не файл экспорта.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `integration-datatoxml:help-01` | [Формирование XML](https://help.loginom.ru/userguide/processors/integration/xml-generation.html) | 7.4 | 2026-10-02 |
| `integration-datatoxml:help-02` | [Набор XSD-схем](https://help.loginom.ru/userguide/integration/connections/list/schemes.html) | 7.4 | 2026-10-02 |

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `integration-datatoxml:r01`<br>`integration-datatoxml:s1` | XSD root, ручные/автоматические соответствия по типу/метке и удаление связей. | Три item попадают в правильные XML-пути; одноимённые листья разных ветвей и incompatible type не связываются произвольно. | `integration-datatoxml:help-01` |
| `integration-datatoxml:r02`<br>`integration-datatoxml:s1` | Один документ на весь набор / на строку / на значение поля идентификатора. | Для 3 строк ожидается 1/3/2 документа; групповые ID=A,B. Для row-ID начало нумерации закрепить discovery, Help не указывает базу. | `integration-datatoxml:help-01` |
| `integration-datatoxml:r03`<br>`integration-datatoxml:s2` | Пустой вход, повторный/NULL ID и сохранение порядка внутри XML. | На пустом входе во всех режимах ровно 0 строк; mixed ID fixture устанавливает правило NULL без его подмены пустой строкой. | `integration-datatoxml:help-01` |
| `integration-datatoxml:r04`<br>`integration-datatoxml:s2` | Отступы, переносы, экранирование атрибутов/кавычек; три политики timezone. | Parser подтверждает спецсимволы, byte check — escaping; Date/DateTime на pinned zone проверяются отдельно. | `integration-datatoxml:help-01` |
| `integration-datatoxml:r05`<br>`integration-datatoxml:s2` | Управляющие переменные и сохранение полного schema/mapping. | После reopen все bindings и режим идентификации те же; переменная меняет только назначенный параметр, результат привязан к новому execution. | `integration-datatoxml:help-01` |

### Самостоятельные fixtures

Вход 3 строки: group=A,item=10; A,20; B,5. Независимая XSD задаёт Order/Item, атрибуты и дату; XML parser проверяет содержимое каждого документа и ручной список ID. Ни imports-xml, ни exports-xml не нужны.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `integration-datatoxml:s1` | Соответствие XSD и все виды группирования документов; покрывает `integration-datatoxml:r01`, `integration-datatoxml:r02` | 2 | `foundation:oracle-tabular`, `foundation:connections` | окружение предыдущего этапа |
| `integration-datatoxml:s2` | Типы, форматирование и переменные; покрывает `integration-datatoxml:r03`, `integration-datatoxml:r04`, `integration-datatoxml:r05` | 3 | `integration-datatoxml:s1`, `foundation:typed-variables` | окружение предыдущего этапа |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:connections](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `node-procedure.mjs`, `port-mapping-procedure.mjs`, `node-output-procedure.mjs`, `table-output-pages.mjs` и `table-output-values.mjs`; каждый выход проверять отдельно по настроенной строгой схеме; количество портов само по себе не требует dynamic-schema policy.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `integration-datatoxml-node.mjs`, `integration-datatoxml-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

## Ошибки и восстановление

Не считать XML строку успешно построенной до парсинга и проверки каждой группы. При ошибке настройки закрывать только свой мастер; не удалять XSD или сторонние связи.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/integration-datatoxml.test.mjs` и `client/test/integration-datatoxml-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/integration-datatoxml.test.mjs test/integration-datatoxml-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «Формирование XML» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: NULL-group, порядок групп, база row-ID и точная типизация ID устанавливаются discovery.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `integration-datatoxml:s1` | XML и HTTP-сервисы | integration-datatoxml | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `integration-datatoxml:s2` | XML и HTTP-сервисы | integration-datatoxml | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
