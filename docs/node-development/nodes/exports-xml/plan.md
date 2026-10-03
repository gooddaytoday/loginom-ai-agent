# Экспорт — XML файл: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.exports.Xml`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Таблица + обязательный набор XSD + необязательные управляющие переменные → XML-файл. Выбор root задаёт структуру документа.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `exports-xml:help-01` | [XML-файл](https://help.loginom.ru/userguide/integration/export/xml.html) | 7.4 | 2026-10-02 |
| `exports-xml:help-02` | [Набор XSD-схем](https://help.loginom.ru/userguide/integration/connections/list/schemes.html) | 7.4 | 2026-10-02 |

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `exports-xml:r01`<br>`exports-xml:s1` | Destination, XSD root, явные и автоматические field→element/attribute связи совместимых типов. | Проверить XML tree и значения всех трёх записей; incompatible mapping отказывает до записи. Одинаковые leaf-name в разных ветвях различимы. | `exports-xml:help-01` |
| `exports-xml:r02`<br>`exports-xml:s1` | BOM, отступы/переводы строк, экранирование табуляций/переносов в атрибутах и обоих видов кавычек. | Проверять одновременно байты соответствующих escaping/BOM и семантический XML; экранирование не приводит к потере символов. | `exports-xml:help-01` |
| `exports-xml:r03`<br>`exports-xml:s2` | Timezone: не указывать / не указывать для Date / всегда. | При pinned server zone отдельно проверить Date и DateTime, суффиксы зон и сохранение момента без зависимости от timezone проверяющей машины. | `exports-xml:help-01` |
| `exports-xml:r04`<br>`exports-xml:s2` | Переменные, пустой набор, NULL/empty, существующий файл и восстановление. | Схема независимо определяет допустимый пустой документ/nil; неверный mandatory field даёт отказ. После reopen подтверждён свежий XML нового execution. | `exports-xml:help-01` |

### Самостоятельные fixtures

Независимая таблица 3 строки и XSD с повторяющимися элементами, атрибутами, date/dateTime, optional/nillable. Значения содержат кавычки, табуляцию, перенос и &. Oracle — XML parser + XSD validator и явная ожидаемая структура, не импорт-обработчик.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `exports-xml:s1` | XSD mapping и сериализация XML; покрывает `exports-xml:r01`, `exports-xml:r02` | 2 | `foundation:oracle-tabular`, `foundation:connections`, `foundation:file-artifacts`, `foundation:external-effects` | окружение предыдущего этапа |
| `exports-xml:s2` | Время, переменные и граничные данные; покрывает `exports-xml:r03`, `exports-xml:r04` | 3 | `exports-xml:s1`, `foundation:typed-variables` | окружение предыдущего этапа |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:connections](../../foundations/external-systems/plan.md), [foundation:file-artifacts](../../foundations/external-systems/plan.md), [foundation:external-effects](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `text-export-node.mjs` как образец sink lifecycle и `text-export-output.mjs` для привязки файла к execution, `storage-policy.mjs` и `artifacts.mjs` для destination/admission. Текстовые форматные поля и его частные ограничения не являются контрактом нового формата.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `exports-xml-node.mjs`, `exports-xml-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

## Ошибки и восстановление

До выполнения проверить bindings, XSD/destination и возможность overwrite. Partial XML не объявлять готовым файлом; новый запуск только после reconciliation предыдущей записи.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/exports-xml.test.mjs` и `client/test/exports-xml-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/exports-xml.test.mjs test/exports-xml-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «Экспорт — XML файл» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Encoding, конкретное NULL/nil/missing преобразование и overwrite семантика уточняются discovery, не выводятся из простого roundtrip.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `exports-xml:s1` | XML и HTTP-сервисы | exports-xml | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `exports-xml:s2` | XML и HTTP-сервисы | exports-xml | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
