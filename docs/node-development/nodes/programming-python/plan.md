# Python: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.programming.Python`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

## Контракт и источники

Необязательные несколько табличных входов и переменные → один/несколько табличных выходов. Режим внутри процесса только Windows; отдельный процесс Windows/Linux. Python должен быть установлен и разрешён администратором.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `programming-python:help-01` | [Python](https://help.loginom.ru/userguide/processors/programming/python/) | 7.4 | 2026-10-02 |
| `programming-python:help-02` | [Входные наборы](https://help.loginom.ru/userguide/processors/programming/python/input-tables.html) | 7.4 | 2026-10-02 |
| `programming-python:help-03` | [Входные переменные](https://help.loginom.ru/userguide/processors/programming/python/input-variables.html) | 7.4 | 2026-10-02 |
| `programming-python:help-04` | [Выходные наборы](https://help.loginom.ru/userguide/processors/programming/python/output-table.html) | 7.4 | 2026-10-02 |
| `programming-python:help-05` | [Перечисления](https://help.loginom.ru/userguide/processors/programming/python/enum.html) | 7.4 | 2026-10-02 |
| `programming-python:help-06` | [Панель вывода](https://help.loginom.ru/userguide/processors/programming/python/console.html) | 7.4 | 2026-10-02 |
| `programming-python:help-07` | [Описание API](https://help.loginom.ru/userguide/processors/programming/python/api-description.html) | 7.4 | 2026-10-02 |
| `programming-python:help-08` | [Горячие клавиши](https://help.loginom.ru/userguide/processors/programming/python/hotkeys.html) | 7.4 | 2026-10-02 |
| `programming-python:help-09` | [Ограничения](https://help.loginom.ru/userguide/processors/programming/python/python-features-restriction.html) | 7.4 | 2026-10-02 |
| `programming-python:help-10` | [Параметры Python](https://help.loginom.ru/userguide/admin/parameters/python-parameters.html) | 7.4 | 2026-10-02 |

### Матрица окружений/провайдеров

Windows in-process / Windows separate / Linux separate; Linux PY_ENV=venv и image, Docker/Podman как отдельные environment gates. Установка среды — foundation/environment подготовка, не побочный эффект node handler. Покрывается Loginom Python API и конфигурация; произвольные сторонние Python библиотеки не объявляются принятыми.

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `programming-python:r01`<br>`programming-python:s1` | Текст кода, фиксированная выходная схема, метаданные, InputTable(s), OutputTable(s), Append/Set. | Digest кода сохраняется; несколько портов читаются/пишутся по корректным индексам. Bool/int/float/str/datetime/None совпадают с independent expected. | `programming-python:help-01`, `programming-python:help-02`, `programming-python:help-04`, `programming-python:help-05`, `programming-python:help-07`, `programming-python:help-08` |
| `programming-python:r02`<br>`programming-python:s1` | InputVariables, доступ по именам/индексам/итераторам, optional input. | factor=3 даёт известный output; отсутствие переменной и входа различается с NULL. Get/GetColumn/IsNull сверяются по каждому типу. | `programming-python:help-02`, `programming-python:help-03`, `programming-python:help-07` |
| `programming-python:r03`<br>`programming-python:s2` | Динамическая схема и AssignColumns/AddColumn/InsertColumn/DeleteColumn/ClearColumns до Append. | Одинаковый сценарий с флагом on/off проверяет доступность изменения схемы; после первой строки — отказ. Имена, метки, виды/назначения сохраняются. На том же узле с неизменным кодом вход A/B → B/C без configure меняет схему до Append; node-specific policy разрешается только по readback флага после отдельного discovery, oracle проверяет все выходы. CrossTable PASS недостаточен. | `programming-python:help-01`, `programming-python:help-04`, `programming-python:help-07` |
| `programming-python:r04`<br>`programming-python:s2` | builtin_pandas_utils: to_data_frame/useNullableArrays, prepare_compatible_table/fill_table, with_index. | DataFrame roundtrip сохраняет None/nullable integer/boolean; index on/off даёт ожидаемое число полей. Oracle не запускает код candidate для expected. | `programming-python:help-02`, `programming-python:help-04`, `programming-python:help-07` |
| `programming-python:r05`<br>`programming-python:s3` | Внутри процесса: очередь одного Python узла и startup timeout; отдельный процесс: параллельность без startup timeout. | Два коротких независимых узла подтверждают ожидание на Windows in-process и отдельные процессы; Linux переносит in-process настройку в external mode. | `programming-python:help-01`, `programming-python:help-09` |
| `programming-python:r06`<br>`programming-python:s3` | PY_ENV, известные/неизвестные окружения, передача environment; Linux venv/image и Docker/Podman. | Исполняемый интерпретатор/пакет подтверждает environment marker; запрещённое имя не запускается. Настройки администратора не меняются скрыто ради зелёного теста. | `programming-python:help-01`, `programming-python:help-09`, `programming-python:help-10` |
| `programming-python:r07`<br>`programming-python:s3` | Внешние модули и пути saved/unsaved/venv; filestoragepath/getLocale; stdout/stderr. | Собственный модуль x+7 находится относительно пакета; смена cwd проверяющего не влияет. FS JSON и locale совпадают с fixture, stdout/stderr сохраняют разную роль. | `programming-python:help-01`, `programming-python:help-06`, `programming-python:help-09`, `programming-python:help-10` |
| `programming-python:r08`<br>`programming-python:s4` | Ошибки/остановка, runtime version/bitness и preview/full execution. | Syntax/runtime exception с позицией кода не считается готовым output; preview <preview> и execute <main> различаются; 201/151 строк читаются полностью. После cancellation нет собственного orphan process. | `programming-python:help-01`, `programming-python:help-06`, `programming-python:help-09` |
| `programming-python:r09`<br>`programming-python:s4` | Платформенные ограничения in-process и допустимая версия API. | Отдельные квалификации версии/разрядности. Не обещать Anaconda/multiprocessing/GUI в in-process; незавершённые threads/сбой native extension не исправлять автоматическим retry. | `programming-python:help-09` |

### Самостоятельные fixtures

Таблица четырёх строк с integer, float, bool, datetime, NULL, empty и текстом; вторая таблица и factor=3. Независимые expected для обычного цикла и pandas преобразования. Отдельный тестовый модуль и файл JSON; никакого нового JS/import handler для fixture.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `programming-python:s1` | Код и фиксированные порты в отдельном процессе; покрывает `programming-python:r01`, `programming-python:r02` | 2 | `foundation:oracle-tabular`, `foundation:programming`, `foundation:typed-variables` | Разрешённый Python подходящей разрядности |
| `programming-python:s2` | Динамические поля и pandas; покрывает `programming-python:r03`, `programming-python:r04` | 3 | `programming-python:s1`, `foundation:dynamic-schema` | Закреплённые pandas/numpy для соответствующих cases |
| `programming-python:s3` | Окружения, модули и два execution modes; покрывает `programming-python:r05`, `programming-python:r06`, `programming-python:r07` | 4 | `programming-python:s2`, `foundation:file-artifacts`, `foundation:external-effects` | Windows для in-process; Linux venv/image fixtures |
| `programming-python:s4` | Отказы, остановка и версии; покрывает `programming-python:r08`, `programming-python:r09` | 4 | `programming-python:s3` | Изолированное окружение для отказов Python |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:programming](../../foundations/external-systems/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md), [foundation:dynamic-schema](../../foundations/dynamic-schema/plan.md), [foundation:file-artifacts](../../foundations/external-systems/plan.md), [foundation:external-effects](../../foundations/external-systems/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `node-procedure.mjs` и lifecycle существующего `calculator-node.mjs`; native code editor/многострочное изменение исследовать отдельно, а не копировать expression control. `node-output-procedure.mjs`/`table-output-pages.mjs` читают реальные выходы; multiport и динамические поля зависят от foundations.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `programming-python-node.mjs`, `programming-python-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

### Политика схемы и границы зависимости

В programming-python:s2 foundation:dynamic-schema предоставляет только базовый механизм policy/fresh read; приёмка CrossTable Sliding не разрешает relaxed policy для Python. Нужны отдельное node-specific discovery и согласованное расширение контракта для native-флага «Разрешить формировать выходные столбцы из кода», с разрешением только по его наблюдённому readback. Один неизменный скрипт строит поля по входным данным до Append: вход A/B заменить на B/C и повторно выполнить тот же узел без configure; независимый oracle проверяет свежую полную схему, порядок, типы и значения каждого выхода по исходной операции. Выключенный флаг, неизвестный режим, потеря identity и изменение колонок после Append должны сохранять строгий отказ. Получение схемы исполняет весь Python-код: effect ledger учитывает это выполнение отдельно.

## Ошибки и восстановление

Dynamic schema extraction и preview запускают весь Python код; не использовать их как безопасную проверку конфигурации при side effects. Stop in-process возможен только между инструкциями; после timeout проверить отдельный процесс/контейнер и не считать kill доказательством logout.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/programming-python.test.mjs` и `client/test/programming-python-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/programming-python.test.mjs test/programming-python-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «Python» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Help7.4 указывает minimum3.5/max-tested3.12; текущую поддерживаемую версию и зависимости сверить на закреплённом runtime. PY_ENV для конкретной ОС и typed integer limits проверяются до приёмки.
- Следующий шаг: назначить первый stage с pins и окружением; провести targeted discovery, закрепить controls/схемы и независимые fixtures, после чего решать readiness этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `programming-python:s1` | Серверный код, процессы и специальные источники | programming-python | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `programming-python:s2` | Серверный код, процессы и специальные источники | programming-python | shared-table-shell | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. Новая разрешённая динамическая policy требует собственного discovery и владельца; CrossTable PASS её не разрешает. |
| `programming-python:s3` | Серверный код, процессы и специальные источники | programming-python | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `programming-python:s4` | Серверный код, процессы и специальные источники | programming-python | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
