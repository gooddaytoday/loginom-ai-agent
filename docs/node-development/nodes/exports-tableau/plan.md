# Экспорт — Tableau файл: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.exports.Tableau`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 6.4 (историческая), прочитана 2026-10-02. Каталожный статус: `historical_only`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Исторический Help 6.4: таблица + необязательные переменные + необязательное Tableau-подключение → Extract-файл, опционально публикация. В каталоге Help 7.4 узел отсутствует; availability не подтверждена.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `exports-tableau:help-01` | [Tableau файл](https://help.loginom.ru/6.4/userguide/integration/export/tableau.html) | 6.4 | 2026-10-02 |

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `exports-tableau:r01`<br>`exports-tableau:s1` | Квалификация наличия component.exports.Tableau и актуальности исторических режимов. | Обнаружить точный component ID/версию/ОС, проверить Help6.4 против мастера; если отсутствует — documentary coverage сохраняется, реализации/приёмки нет. | `exports-tableau:help-01` |
| `exports-tableau:r02`<br>`exports-tableau:s1` | Локальный Extract: имя файла/таблицы, создание таблицы, пересоздание файла и создание отсутствующей таблицы. | Три строки независимо читаются из файла; флаг recreate требует create-table. Формат файла определяется наблюдением, не догадкой .tde/.hyper. | `exports-tableau:help-01` |
| `exports-tableau:r03`<br>`exports-tableau:s2` | Публикация: подключение, project, имя серверного источника; append/overwrite/оба выключены. | Только одна таблица Extract допускается к публикации. Append/overwrite взаимоисключающие; независимое чтение подтверждает число строк и неизменность соседнего источника. | `exports-tableau:help-01` |
| `exports-tableau:r04`<br>`exports-tableau:s2` | Управляющие переменные, сохранение пути/режима и частичная публикация. | Отказ сервера отделить от готового локального файла; потерянный ответ сверить по source revision, не публиковать повторно автоматически. | `exports-tableau:help-01` |

### Самостоятельные fixtures

После допуска на реально поддержанном build: независимая таблица 3 строки и отдельный Tableau project. Файл читает инструмент Tableau, выбранный по установленному формату; серверный результат — отдельный read-only клиент. Исходные имена и counts фиксируются до запуска.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `exports-tableau:s1` | Историческая доступность и локальный файл; покрывает `exports-tableau:r01`, `exports-tableau:r02` | 5 | `foundation:oracle-tabular`, `foundation:file-artifacts`, `foundation:external-effects` | Build с фактически доступным Tableau exporter и независимым reader |
| `exports-tableau:s2` | Tableau Server и полный исторический scope; покрывает `exports-tableau:r03`, `exports-tableau:r04` | 5 | `exports-tableau:s1`, `foundation:connections`, `foundation:typed-variables` | Выделенный Tableau project |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:file-artifacts](../../foundations/external-systems/plan.md), [foundation:external-effects](../../foundations/external-systems/plan.md), [foundation:connections](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `text-export-node.mjs` как образец sink lifecycle и `text-export-output.mjs` для привязки файла к execution, `storage-policy.mjs` и `artifacts.mjs` для destination/admission. Текстовые форматные поля и его частные ограничения не являются контрактом нового формата.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `exports-tableau-node.mjs`, `exports-tableau-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

## Ошибки и восстановление

Удаление/перезапись файла и публикация требуют точного destination из задания; неизвестный эффект проверять и локально, и на сервере. ОС-причину недоступности не выводить из отсутствия в палитре.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/exports-tableau.test.mjs` и `client/test/exports-tableau-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/exports-tableau.test.mjs test/exports-tableau-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «Экспорт — Tableau файл» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Доступность в 7.4, поддержанный Extract формат/API, лимиты и отличия от 6.4 неизвестны. Условие продолжения — документированные build/edition/OS и наблюдение компонента, а не установка случайной версии.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `exports-tableau:s1` | Серверный код, процессы и специальные источники | exports-tableau | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `exports-tableau:s2` | Серверный код, процессы и специальные источники | exports-tableau | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
