# Импорт — Excel файл: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.imports.Excel`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Необязательные управляющие переменные → одна импортированная таблица. .xlsx/.xlsm: Linux и Windows; .xls: Windows. Файл, URL и набор файлов — режимы одного узла.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `imports-excel:help-01` | [Excel-файл](https://help.loginom.ru/userguide/integration/import/excel/) | 7.4 | 2026-10-02 |
| `imports-excel:help-02` | [Примеры импорта из Excel-файла](https://help.loginom.ru/userguide/integration/import/excel/excel-examples.html) | 7.4 | 2026-10-02 |

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `imports-excel:r01`<br>`imports-excel:s1` | Выбор листа по имени/номеру, именованного диапазона, всего листа; A1/R1C1 и расширение до последней строки. | Сравнить диапазоны B3:D6 и R3C2:R6C4; импорт одного листа/одного named range. Расширение named range даёт дополнительные нижние строки. | `imports-excel:help-02` |
| `imports-excel:r02`<br>`imports-excel:s1` | Пустые строки: импортировать/исключить/до первой; количество строк заголовка. | Для заполненных строк 1,2,4 результат содержит 4,3,2 строки соответственно при согласованном диапазоне; заголовки не превращаются в данные. | `imports-excel:help-01` |
| `imports-excel:r03`<br>`imports-excel:s1` | Ручные имя/метка/тип/вид/использование поля; анализ 1–200 строк и просмотр исходных/преобразованных значений. | Последняя за пределом sample строка содержит иной тип; полный oracle обнаруживает ошибку преобразования, а не принимает preview как доказательство. | `imports-excel:help-01` |
| `imports-excel:r04`<br>`imports-excel:s2` | Автоопределение столбцов Нет/Только новые/Все и обновление типов; сохранение пользовательских настроек. | Вторая версия книги добавляет C и меняет A: сверить каждую политику по отдельной схеме; режим Все запрещает ручное редактирование. Дополнительно на одном узле A/B → B/C без configure: отдельное node-specific policy discovery/readback и независимый oracle всех полей/типов/значений; CrossTable PASS не разрешает Excel relaxed policy. | `imports-excel:help-01` |
| `imports-excel:r05`<br>`imports-excel:s2` | Множественный импорт, разделитель &#124; и маска *; последовательный/параллельный режимы и число потоков. | Две книги по 3 строки дают 6; trailing/двойной разделитель не создаёт строки. ? в URL не трактуется как маска; порядок параллельного результата не предполагать. | `imports-excel:help-01` |
| `imports-excel:r06`<br>`imports-excel:s2` | Информация о файле: отсутствует, имя/относительный/абсолютный путь, каждый вариант со временем модификации. | Сопоставить происхождение всех 6 строк с manifest файлов и их временем; полный путь секретов URL не публиковать в evidence. | `imports-excel:help-01` |
| `imports-excel:r07`<br>`imports-excel:s2` | Файл/HTTP/HTTPS/Basic auth, .xls/.xlsx/.xlsm, автоматическая/ручная метка и клонирование. | Проверить доступные ОС форматы, отказ неверной авторизации, сохранённые label/comment; .xls на Linux не выдавать за поддержанный. | `imports-excel:help-01` |

### Самостоятельные fixtures

Независимая библиотека создаёт книгу с двумя листами и именованным диапазоном, двумя заголовочными строками, пустой строкой внутри, формулой с сохранённым результатом, NULL/empty, датой и точным десятичным числом. Отдельные книги той же и изменённой схемы, HTTP fixture с Basic auth; ожидаемые ячейки заданы до Loginom.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `imports-excel:s1` | Одна книга, диапазон и фиксированная схема; покрывает `imports-excel:r01`, `imports-excel:r02`, `imports-excel:r03` | 1 | `foundation:oracle-tabular`, `foundation:file-artifacts` | окружение предыдущего этапа |
| `imports-excel:s2` | Динамическая схема, несколько файлов, URL и платформы; покрывает `imports-excel:r04`, `imports-excel:r05`, `imports-excel:r06`, `imports-excel:r07` | 3 | `imports-excel:s1`, `foundation:dynamic-schema`, `foundation:typed-variables` | Windows для .xls; тестовый HTTP(S) источник |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:file-artifacts](../../foundations/external-systems/plan.md), [foundation:dynamic-schema](../../foundations/dynamic-schema/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать admission и provenance из `host-artifacts.mjs`, `artifacts.mjs`, `upload-lineage.mjs`; структуру native configure/readback из `text-import-node.mjs` и `text-import-procedure.mjs`. CSV controls, лимиты и parser текстового импорта не переносить на новый формат.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `imports-excel-node.mjs`, `imports-excel-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

### Политика схемы и границы зависимости

В imports-excel:s2 prerequisite foundation:dynamic-schema означает только базовый механизм привязки policy к узлу/режиму и чтения свежей схемы. Его текущая приёмка относится к CrossTable Sliding и не разрешает relaxed policy для Excel. До реализации imports-excel:r04 провести отдельное node-specific discovery режимов «Только новые»/«Все» и неоднозначного описания «Нет», согласовать расширение policy с владельцем и привязать разрешение к подтверждённому native readback конкретного режима. На том же узле заменить содержимое источника A/B → B/C без изменения мастера, прочитать новый execution по исходной операции; независимый oracle проверяет поля, типы, порядок, значения, исчезновение/добавление и сохранность пользовательских настроек согласно режиму. Режим без подтверждённого разрешения сохраняет strict policy и отказывает на несовпадении схемы.

## Ошибки и восстановление

После смены файла/диапазона старый preview не доказывает чтение новых байтов; подтвердить digest каждого источника. Не исполнять макросы ради .xlsm. Перезапуск загрузки допускается только после выяснения состояния.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/imports-excel.test.mjs` и `client/test/imports-excel-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/imports-excel.test.mjs test/imports-excel-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «Импорт — Excel файл» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Help двусмысленно описывает новые поля при автоопределении Нет; точное поведение, границы формул/дат и ограничения multiple import + named range фиксируются discovery, не догадкой.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `imports-excel:s1` | Локальные файлы и форматы | imports-excel | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `imports-excel:s2` | Локальные файлы и форматы | imports-excel | shared-table-shell | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. Новая разрешённая динамическая policy требует собственного discovery и владельца; CrossTable PASS её не разрешает. |

<!-- parallel-execution:end -->
