# Python: черновик требований

Component ID: `component.programming.Python`. Slug: `programming-python`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `programming-python:help-01` — [Python](https://help.loginom.ru/userguide/processors/programming/python/), Help 7.4, прочитано 2026-10-02.
- `programming-python:help-02` — [Входные наборы](https://help.loginom.ru/userguide/processors/programming/python/input-tables.html), Help 7.4, прочитано 2026-10-02.
- `programming-python:help-03` — [Входные переменные](https://help.loginom.ru/userguide/processors/programming/python/input-variables.html), Help 7.4, прочитано 2026-10-02.
- `programming-python:help-04` — [Выходные наборы](https://help.loginom.ru/userguide/processors/programming/python/output-table.html), Help 7.4, прочитано 2026-10-02.
- `programming-python:help-05` — [Перечисления](https://help.loginom.ru/userguide/processors/programming/python/enum.html), Help 7.4, прочитано 2026-10-02.
- `programming-python:help-06` — [Панель вывода](https://help.loginom.ru/userguide/processors/programming/python/console.html), Help 7.4, прочитано 2026-10-02.
- `programming-python:help-07` — [Описание API](https://help.loginom.ru/userguide/processors/programming/python/api-description.html), Help 7.4, прочитано 2026-10-02.
- `programming-python:help-08` — [Горячие клавиши](https://help.loginom.ru/userguide/processors/programming/python/hotkeys.html), Help 7.4, прочитано 2026-10-02.
- `programming-python:help-09` — [Ограничения](https://help.loginom.ru/userguide/processors/programming/python/python-features-restriction.html), Help 7.4, прочитано 2026-10-02.
- `programming-python:help-10` — [Параметры Python](https://help.loginom.ru/userguide/admin/parameters/python-parameters.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `programming-python:r01` | Текст кода, фиксированная выходная схема, метаданные, InputTable(s), OutputTable(s), Append/Set. | Digest кода сохраняется; несколько портов читаются/пишутся по корректным индексам. Bool/int/float/str/datetime/None совпадают с independent expected. | `programming-python:help-01`, `programming-python:help-02`, `programming-python:help-04`, `programming-python:help-05`, `programming-python:help-07`, `programming-python:help-08` |
| `programming-python:r02` | InputVariables, доступ по именам/индексам/итераторам, optional input. | factor=3 даёт известный output; отсутствие переменной и входа различается с NULL. Get/GetColumn/IsNull сверяются по каждому типу. | `programming-python:help-02`, `programming-python:help-03`, `programming-python:help-07` |
| `programming-python:r03` | Динамическая схема и AssignColumns/AddColumn/InsertColumn/DeleteColumn/ClearColumns до Append. | Одинаковый сценарий с флагом on/off проверяет доступность изменения схемы; после первой строки — отказ. Имена, метки, виды/назначения сохраняются. На том же узле с неизменным кодом вход A/B → B/C без configure меняет схему до Append; node-specific policy разрешается только по readback флага после отдельного discovery, oracle проверяет все выходы. CrossTable PASS недостаточен. | `programming-python:help-01`, `programming-python:help-04`, `programming-python:help-07` |
| `programming-python:r04` | builtin_pandas_utils: to_data_frame/useNullableArrays, prepare_compatible_table/fill_table, with_index. | DataFrame roundtrip сохраняет None/nullable integer/boolean; index on/off даёт ожидаемое число полей. Oracle не запускает код candidate для expected. | `programming-python:help-02`, `programming-python:help-04`, `programming-python:help-07` |
| `programming-python:r05` | Внутри процесса: очередь одного Python узла и startup timeout; отдельный процесс: параллельность без startup timeout. | Два коротких независимых узла подтверждают ожидание на Windows in-process и отдельные процессы; Linux переносит in-process настройку в external mode. | `programming-python:help-01`, `programming-python:help-09` |
| `programming-python:r06` | PY_ENV, известные/неизвестные окружения, передача environment; Linux venv/image и Docker/Podman. | Исполняемый интерпретатор/пакет подтверждает environment marker; запрещённое имя не запускается. Настройки администратора не меняются скрыто ради зелёного теста. | `programming-python:help-01`, `programming-python:help-09`, `programming-python:help-10` |
| `programming-python:r07` | Внешние модули и пути saved/unsaved/venv; filestoragepath/getLocale; stdout/stderr. | Собственный модуль x+7 находится относительно пакета; смена cwd проверяющего не влияет. FS JSON и locale совпадают с fixture, stdout/stderr сохраняют разную роль. | `programming-python:help-01`, `programming-python:help-06`, `programming-python:help-09`, `programming-python:help-10` |
| `programming-python:r08` | Ошибки/остановка, runtime version/bitness и preview/full execution. | Syntax/runtime exception с позицией кода не считается готовым output; preview <preview> и execute <main> различаются; 201/151 строк читаются полностью. После cancellation нет собственного orphan process. | `programming-python:help-01`, `programming-python:help-06`, `programming-python:help-09` |
| `programming-python:r09` | Платформенные ограничения in-process и допустимая версия API. | Отдельные квалификации версии/разрядности. Не обещать Anaconda/multiprocessing/GUI в in-process; незавершённые threads/сбой native extension не исправлять автоматическим retry. | `programming-python:help-09` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `programming-python:s1` — Код и фиксированные порты в отдельном процессе. Требования: `programming-python:r01`, `programming-python:r02`. Среда: Разрешённый Python подходящей разрядности.
- `programming-python:s2` — Динамические поля и pandas. Требования: `programming-python:r03`, `programming-python:r04`. После: `programming-python:s1`. Среда: Закреплённые pandas/numpy для соответствующих cases.
- `programming-python:s3` — Окружения, модули и два execution modes. Требования: `programming-python:r05`, `programming-python:r06`, `programming-python:r07`. После: `programming-python:s2`. Среда: Windows для in-process; Linux venv/image fixtures.
- `programming-python:s4` — Отказы, остановка и версии. Требования: `programming-python:r08`, `programming-python:r09`. После: `programming-python:s3`. Среда: Изолированное окружение для отказов Python.

## Заметки черновика

Необязательные несколько табличных входов и переменные → один/несколько табличных выходов. Режим внутри процесса только Windows; отдельный процесс Windows/Linux. Python должен быть установлен и разрешён администратором.

Таблица четырёх строк с integer, float, bool, datetime, NULL, empty и текстом; вторая таблица и factor=3. Независимые expected для обычного цикла и pandas преобразования. Отдельный тестовый модуль и файл JSON; никакого нового JS/import handler для fixture.

Dynamic schema extraction и preview запускают весь Python код; не использовать их как безопасную проверку конфигурации при side effects. Stop in-process возможен только между инструкциями; после timeout проверить отдельный процесс/контейнер и не считать kill доказательством logout.
