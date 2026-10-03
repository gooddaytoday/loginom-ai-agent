# Разбор XML: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.integration.ExtractXml`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Таблица с XML-строками + XSD connection + необязательные переменные → таблица данных и таблица ошибок/кодов; второй порт обязателен для приёмочного oracle.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `integration-extractxml:help-01` | [Разбор XML](https://help.loginom.ru/userguide/processors/integration/extracting-xml.html) | 7.4 | 2026-10-02 |
| `integration-extractxml:help-02` | [Набор XSD-схем](https://help.loginom.ru/userguide/integration/connections/list/schemes.html) | 7.4 | 2026-10-02 |

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `integration-extractxml:r01`<br>`integration-extractxml:s1` | Выбор XML-столбца, XSD root и полей; весь набор / каждая строка / поле ID. | Проверить объём 3 item и принадлежность документу; row-ID начинается с 0. Для режима весь набор использовать ровно один документ. После явного изменения XSD/выбора полей фиксировать strict schema обоих выходов; данные сами не разрешают изменение схемы. | `integration-extractxml:help-01` |
| `integration-extractxml:r02`<br>`integration-extractxml:s1` | Остановка при первой ошибке либо продолжение; codes, необязательные ID и описание ошибки. | В последовательности good/bad/good при продолжении обрабатывается третий документ; при stop фиксируется предел обработки. Ошибка во втором порту не теряется. | `integration-extractxml:help-01` |
| `integration-extractxml:r03`<br>`integration-extractxml:s2` | Разэкранирование XML-сущностей, строгая XSD и ускоренный разбор. | Escaped XML проходит только с флагом, malformed/type-invalid различаются; выключенная строгая проверка не доказывает валидность. | `integration-extractxml:help-01` |
| `integration-extractxml:r04`<br>`integration-extractxml:s2` | Дублирование единичных значений, составные метки, timezone/default-zone. | Для двух дочерних строк сверить родительское поле с duplication on/off; zoned/naive даты проверяет независимый parser в pinned zone. | `integration-extractxml:help-01` |
| `integration-extractxml:r05`<br>`integration-extractxml:s2` | Пустой набор, NULL/пустая XML-строка, управляющие переменные и сохранение. | Пустой набор даёт 0 строк; invalid cell даёт документированный error, а не произвольный пропуск. Оба выходных schema сохраняются после reopen. | `integration-extractxml:help-01` |

### Самостоятельные fixtures

Три независимо записанные XML-строки: корректный Order с 2 Item, malformed XML, корректный Order с 1 Item; request IDs 7,8,9. XSD/parser отдельно дают 3 успешные item-строки и ошибку ID8. Отдельный escape-документ и пустой набор.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `integration-extractxml:s1` | Разбор, идентификация и два выхода; покрывает `integration-extractxml:r01`, `integration-extractxml:r02` | 2 | `foundation:oracle-tabular`, `foundation:connections` | окружение предыдущего этапа |
| `integration-extractxml:s2` | Валидация, escaping, время и переменные; покрывает `integration-extractxml:r03`, `integration-extractxml:r04`, `integration-extractxml:r05` | 3 | `integration-extractxml:s1`, `foundation:typed-variables` | окружение предыдущего этапа |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:connections](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `node-procedure.mjs`, `port-mapping-procedure.mjs`, `node-output-procedure.mjs`, `table-output-pages.mjs` и `table-output-values.mjs`; каждый выход проверять отдельно по настроенной строгой схеме; количество портов само по себе не требует dynamic-schema policy.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `integration-extractxml-node.mjs`, `integration-extractxml-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

### Политика схемы и границы зависимости

Схема обоих выходов определяется выбранными XSD root/полями и параметрами мастера; изменение этих настроек требует явного configure со строгим readback. Число документов/строк и дублирование родителей не являются динамической схемой. Поэтому CrossTable dynamic-schema не является prerequisite; несовпадающий с настройками output schema отклоняется.

## Ошибки и восстановление

Partial success не прятать: сравнивать данные и log каждого документа. Повтор read не должен переисполнять upstream источник с внешним эффектом.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/integration-extractxml.test.mjs` и `client/test/integration-extractxml-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/integration-extractxml.test.mjs test/integration-extractxml-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «Разбор XML» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Полный перечень error codes, поведение NULL XML, повторных IDs и partial output при stop закрепить discovery.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `integration-extractxml:s1` | XML и HTTP-сервисы | integration-extractxml | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `integration-extractxml:s2` | XML и HTTP-сервисы | integration-extractxml | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
