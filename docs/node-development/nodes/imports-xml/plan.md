# Импорт — XML файл: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.imports.Xml`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Обязательное подключение набора XSD + необязательные управляющие переменные → таблица. Источник: XML-файл либо HTTP(S)/Basic URL.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `imports-xml:help-01` | [XML-файл](https://help.loginom.ru/userguide/integration/import/xml.html) | 7.4 | 2026-10-02 |
| `imports-xml:help-02` | [Набор XSD-схем](https://help.loginom.ru/userguide/integration/connections/list/schemes.html) | 7.4 | 2026-10-02 |

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `imports-xml:r01`<br>`imports-xml:s1` | Файл, подключение XSD, namespace/root и выбор импортируемых элементов/атрибутов. | Проверить три Item и только выбранные поля; другой root/namespace не выбирается по похожей метке. | `imports-xml:help-01` |
| `imports-xml:r02`<br>`imports-xml:s1` | Составные имена/метки и разделитель; дублирование единичных родительских значений. | Два одинаковых leaf-name разных ветвей остаются различимы; флаг duplication сравнить по каждой строке родителя. | `imports-xml:help-01` |
| `imports-xml:r03`<br>`imports-xml:s2` | Строгая XSD и Schematron валидация включены/выключены. | Невалидный тип и бизнес-правило дают разные ошибки; ускоренный режим не объявлять эквивалентом строгой проверки. | `imports-xml:help-01` |
| `imports-xml:r04`<br>`imports-xml:s2` | Временная зона по умолчанию и зоны XML; отсутствие необязательных значений. | Z и +03:00 одинакового момента дают одинаковую серверную дату; naive с default-zone преобразуется, без неё сохраняется. NULL не смешивать с empty. | `imports-xml:help-01` |
| `imports-xml:r05`<br>`imports-xml:s2` | URL/HTTP Basic, управляющий путь, автоматическая/ручная метка, комментарий и клонирование. | Новый источник подтверждается digest; 401/404 не создают успешную пустую таблицу. Метки/комментарий и привязки воспроизводятся после reopen. | `imports-xml:help-01` |

### Самостоятельные fixtures

Независимо написанные XSD/XML: Order с id, datetime и повторяющимися Item; два namespace/root, отсутствующий необязательный элемент, пустая строка, xsi:nil, спецсимволы. Expected 3 item-строки и точные типы задаются до Loginom; XSD/Schematron проверяет отдельный валидатор.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `imports-xml:s1` | XSD и локальный XML; покрывает `imports-xml:r01`, `imports-xml:r02` | 2 | `foundation:oracle-tabular`, `foundation:connections`, `foundation:file-artifacts` | окружение предыдущего этапа |
| `imports-xml:s2` | Валидация, время и внешние источники; покрывает `imports-xml:r03`, `imports-xml:r04`, `imports-xml:r05` | 3 | `imports-xml:s1`, `foundation:typed-variables` | Тестовый HTTP(S) источник; независимый Schematron validator |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:connections](../../foundations/external-systems/plan.md), [foundation:file-artifacts](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать admission и provenance из `host-artifacts.mjs`, `artifacts.mjs`, `upload-lineage.mjs`; структуру native configure/readback из `text-import-node.mjs` и `text-import-procedure.mjs`. CSV controls, лимиты и parser текстового импорта не переносить на новый формат.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `imports-xml-node.mjs`, `imports-xml-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

## Ошибки и восстановление

Повреждённый документ/неверная схема требуют исходной ошибки; не переписывать XSD ради прохождения. Проверять byte lineage XML и всех XSD.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/imports-xml.test.mjs` и `client/test/imports-xml-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/imports-xml.test.mjs test/imports-xml-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «Импорт — XML файл» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Сопоставление XSD типов, точные правила nil/missing и поддержанный Schematron dialect уточнить до expected freeze.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `imports-xml:s1` | XML и HTTP-сервисы | imports-xml | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `imports-xml:s2` | XML и HTTP-сервисы | imports-xml | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
