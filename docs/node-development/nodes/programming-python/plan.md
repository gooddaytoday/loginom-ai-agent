# Python: подплан для Multica

Статус: `discovery_required`. Редакция 1 от 2026-10-05, автор — переработка подпланов в ветке `node-coverage-plans`.
Component ID: `component.programming.Python`, slug `programming-python`. Runtime type и режим: `programming.python` / `external_process` — предложение до конца этапа 0.
База назначения: ветка задания из карточки; исследованы исходники `loginom@dada8010e`. Loginom: ожидается 7.4.2, фактическую версию записать на этапе 0; платформа исполнителя — Linux x64.

Шаблон — [node-plan](../../templates/node-plan.md), образец — [ARIMAX](../datamining-arimax/plan.md). Общий порядок — [RUNBOOK](../../RUNBOOK.md) и [CLI-приёмка](../../workflow/acceptance-cli.md). [Карточка](README.md) · [реестр](../../registry.json).

## 0. Как выполняется назначение

Оркестрация — Multica, сквад «Обработчики узлов»: Генератор тасок готовит назначение, Тест-Манки #1 разрабатывает и проходит приёмку, Ловец Галюцинаций независимо принимает опубликованный SHA.

Карточка:

```text
Ветка: <ветка задания>
Узел: programming-python
Обработать узел по его подплану до независимой приёмки. Объём — этап 0 подплана.
```

Первая карточка — этап 0 отдельно; этап 1 — после решения владельца по W из раздела 2. В ветке задания должны быть RUNBOOK, подплан, инструменты приёмки и принятые зависимости, отсутствие — Blocked.

Разрешено: живое исследование в собственном аккаунте, комплект `acceptance/`, затем назначенный срез и согласованные W, PR и публикация доказательств.
Не разрешено: merge и релиз; следующие этапы; общие изменения без решения владельца; изменения конфигураций обвязки.

| Параметр | Значение |
|---|---|
| Узел | `component.programming.Python`, slug `programming-python` |
| Исходный SHA | вершина ветки задания; Генератор фиксирует в карточке |
| Runtime type и режим | `programming.python` / `external_process` — предложение до конца этапа 0 |
| Стенд и аккаунты | из конфигов ролей; пара worker/reviewer, один стенд |
| Модель приёмки | из конфигурации обвязки; предел модельного прогона 7200 с |
| Внешняя среда | Установленный и разрешённый администратором Python той же разрядности, что сервер Loginom; на Linux отдельный процесс, версия/путь закрепляются на этапе 0. Этап 2 — pinned pandas/numpy; этап 3 — Windows in-process и Linux venv/Docker/Podman fixtures. |

Стоп-условия — Blocked с конкретным вопросом Генератору:

- нет обязательных файлов/принятых зависимостей, CLI или пара аккаунтов не `ready`;
- компонент отсутствует в палитре, среда недоступна или требуемое разрешение администратора отсутствует;
- нет решения владельца по нужному W; нужен режим вне назначенного этапа;
- неизвестный исход операции: сохранить попытку и writer marker, сначала проверить фактический эффект.

## 1. Цель и проверенная основа

Цель: Ограниченный табличный пример в разрешённом отдельном Python-процессе на сервере; без установки библиотек по ходу работы. Это предложение объёма из реестра, а не доказательство стенда. Этап 1 — «Код и фиксированные порты в отдельном процессе»; остальные режимы выделены по требованиям в отдельные этапы, чтобы каждый срез принимался независимо.

| Источник | Факт | Наблюдено или гипотеза |
|---|---|---|
| Runtime базы | Обработчика нет в 15 типах `client/lib/node-contracts.mjs:8-22` и диспетчере `node-support.mjs:27-41`. Нет универсальных внешних подключений, исполнения кода и чтения выходных переменных; `node-api.mjs:40-41` — только local bindings Кросс-таблицы | Наблюдено в коде `dada8010e` |
| Реестр | `plan_status: discovery_required`, `handler: null`; `backlog`, готовность не повышена | Наблюдено |
| Справка | [Python](https://help.loginom.ru/userguide/processors/programming/python/) = `loginom-help@353e506b:data/processors/programming/python/README.md` | Документировано; UI не наблюдался |
| Справка | [Входные наборы](https://help.loginom.ru/userguide/processors/programming/python/input-tables.html) = `loginom-help@353e506b:data/processors/programming/python/input-tables.md` | Документировано; UI не наблюдался |
| Справка | [Входные переменные](https://help.loginom.ru/userguide/processors/programming/python/input-variables.html) = `loginom-help@353e506b:data/processors/programming/python/input-variables.md` | Документировано; UI не наблюдался |
| Справка | [Выходные наборы](https://help.loginom.ru/userguide/processors/programming/python/output-table.html) = `loginom-help@353e506b:data/processors/programming/python/output-table.md` | Документировано; UI не наблюдался |
| Справка | [Перечисления](https://help.loginom.ru/userguide/processors/programming/python/enum.html) = `loginom-help@353e506b:data/processors/programming/python/enum.md` | Документировано; UI не наблюдался |
| Справка | [Панель вывода](https://help.loginom.ru/userguide/processors/programming/python/console.html) = `loginom-help@353e506b:data/processors/programming/python/console.md` | Документировано; UI не наблюдался |
| Справка | [Описание API](https://help.loginom.ru/userguide/processors/programming/python/api-description.html) = `loginom-help@353e506b:data/processors/programming/python/api-description.md` | Документировано; UI не наблюдался |
| Справка | [Горячие клавиши](https://help.loginom.ru/userguide/processors/programming/python/hotkeys.html) = `loginom-help@353e506b:data/processors/programming/python/hotkeys.md` | Документировано; UI не наблюдался |
| Справка | [Ограничения](https://help.loginom.ru/userguide/processors/programming/python/python-features-restriction.html) = `loginom-help@353e506b:data/processors/programming/python/python-features-restriction.md` | Документировано; UI не наблюдался |
| Справка | [Параметры Python](https://help.loginom.ru/userguide/admin/parameters/python-parameters.html) = `loginom-help@353e506b:data/admin/parameters/python-parameters.md` | Документировано; UI не наблюдался |
| E2E | `e2e-tests@486caef44:bg/labels.ts` содержит метку компонента; поиск по component ID/названию и профильным путям не установил адресного сценария этого мастера. import_xml/export_xml/db_import относятся к другим компонентам. | Прочитано как источник требований; не выполнялось |
| История | Прежней принятой реализации этого обработчика в реестре нет; сведения об активной работе требуют сверки карточки | Гипотезы стенда проверяет этап 0 |

## 2. Этапы

### Этап 0 — подготовка, живое исследование, контракт

Подготовка: checkout и сверка SHA, сборка из закоммиченных исходников, `loginom status` = `ready`. Наблюдения — штатными средствами runtime с `?testable=true`, каждый отказ мастера прочитать из кнопки ошибки.

1. Палитра, точный заголовок и корень мастера, страницы, число/тип/необязательность портов; доступность в назначенной редакции.
2. Умолчания, границы, disabled/dependent настройки и точные причины отказов, включая неизвестный параметр.
3. Подтвердить разрешённый интерпретатор на сервере Loginom, bitness/version, PY_ENV; Python на машине агента не доказывает серверный runtime.
4. Наблюдать редактор кода, OutputTables схемы и optional inputs/variables, None/empty/datetime; metadata и текущий process mode.
5. Проверить same-node source A/B→B/C до Append при флаге on/off, pandas nullable/index и preview/full execution.
6. Закрепить Linux external/Windows in-process, startup timeout, concurrency, environment/module paths, stdout/stderr и cancellation.
7. Имена, метки, типы и порядок полей каждого выхода, момент появления схемы до/после Execute; NULL, пустой вход и смена источника того же узла.

Результат — `discovery.md`: «наблюдено / гипотеза», конкретные значения и точные схемы, предложение W владельцу. После исследования закрепляются runtime type/режим, fixtures и acceptance до кода; `ready_for_development` не присваивается этим документационным PR.

### Этап 1 — Код и фиксированные порты в отдельном процессе

- `programming-python:r01` — Текст кода, фиксированная выходная схема, метаданные, InputTable(s), OutputTable(s), Append/Set.
- `programming-python:r02` — InputVariables, доступ по именам/индексам/итераторам, optional input.

Scope этапа 1 ограничен перечисленными требованиями. Создание, изменение существующего узла, выполнение, полный readback и persistence входят в этот срез; режимы последующих этапов отклоняются до мутации с объяснением.

Файлы (предложение): новые `packages/loginom-runtime/client/lib/python-{node,parameters,procedure,readback}.mjs`, адресные `client/test/python-*.test.mjs`; регистрация `node-contracts.mjs` и `.d.ts`, `node-support.mjs`, `node-api.mjs`, результат `node-result-schema.mjs`, `user-results.mjs`. Общие точки меняются только в объёме принятого W.
Образец: Калькулятор — образец работы с текстом и mapping; самостоятельный Python не подменяется JavaScript-режимом Калькулятора или локальным Python агента.

Общие изменения; владелец и SHA каждой зависимости закрепляются до назначения:

- **W1** — Редактор Python, фиксированные схемы/несколько портов, Unicode readback и cold-check по node_id+port index; node-api/procedure и node-read-*.
- **W2** — Входные переменные и динамическая схема до Append при подтверждённом флаге; source A/B→B/C без configure, этап 2.
- **W3** — Полное чтение всех 201/151 строк каждого порта, пределы expected-outputs/cold-check — этапы 2/4.
- **W4** — Идентичность Python окружения, корреляция собственного процесса/контейнера и отмена без orphan или скрытого повторного исполнения; executor/recovery, этапы 3–4.

Видимость для модели: `semantics` объясняет бизнес-результат и ограничения; `description` у каждого параметра, строковые enum; readback возвращает сохранённые режим/связи/порты и freshness. Код/запрос выполняет сервер Loginom, обработчик не вычисляет результат вместо узла.
Тесты из пакетов: `bun run test:upstream` в `packages/loginom-runtime`; при изменении приёмки — из `scripts/node-acceptance`: `node --test tests/*.test.mjs`. Адресные тесты новых файлов реализуются карточкой, сейчас их нет.

### Этап 2 — Динамические поля и pandas (отдельная карточка)

- `programming-python:r03` — Динамическая схема и AssignColumns/AddColumn/InsertColumn/DeleteColumn/ClearColumns до Append.
- `programming-python:r04` — builtin_pandas_utils: to_data_frame/useNullableArrays, prepare_compatible_table/fill_table, with_index.

Назначение после независимой приёмки предыдущего этапа и решения владельца по требуемым W; приёмочный комплект отдельный, без переноса PASS.
### Этап 3 — Окружения, модули и два execution modes (отдельная карточка)

- `programming-python:r05` — Внутри процесса: очередь одного Python узла и startup timeout; отдельный процесс: параллельность без startup timeout.
- `programming-python:r06` — PY_ENV, известные/неизвестные окружения, передача environment; Linux venv/image и Docker/Podman.
- `programming-python:r07` — Внешние модули и пути saved/unsaved/venv; filestoragepath/getLocale; stdout/stderr.

Назначение после независимой приёмки предыдущего этапа и решения владельца по требуемым W; приёмочный комплект отдельный, без переноса PASS.
### Этап 4 — Отказы, остановка и версии (отдельная карточка)

- `programming-python:r08` — Ошибки/остановка, runtime version/bitness и preview/full execution.
- `programming-python:r09` — Платформенные ограничения in-process и допустимая версия API.

Назначение после независимой приёмки предыдущего этапа и решения владельца по требуемым W; приёмочный комплект отдельный, без переноса PASS.

## 3. Данные и независимые проверки

Комплект `nodes/programming-python/acceptance/` (следующие срезы — `acceptance/stageN/`): `task.md` с `{{PACKAGE_PATH}}` на бизнес-языке, `data/` только с входами модели, `expected.json` из независимого `oracle.py` до кода/прогона. Oracle и expected модели не передаются.

Формат CSV: UTF-8, заголовок, разделитель `,`, десятичный `.`, NULL-маркер `?`, пустая строка в кавычках. `values.csv`: `Id,Amount,Text,Flag,Date`, строки `1,10,hello,true,2024-02-29T00:00:00.000`, `2,20,"",false,2024-03-01T00:00:00.000`, `3,?,я,true,2024-03-02T00:00:00.000`, `4,-5,?,false,?`; типы integer/real/string/boolean/datetime. `second.csv`: `Id,Amount` = `5,2` и `6,4`; variable factor=3. Отдельный module.py возвращает x+7, data.json задаёт фиксированную строку; byte manifest каждого входа — до прогона.
Размеры, число строк, SHA256, кодировка, типы, разделители и NULL фиксируются в `fixtures/manifest.json` до прогона. Доставка — проверенные `artifact_id`/`upload_operation_id`; >1 KiB поддерживается базой, одновременно не более восьми вложений.

| Набор | Содержание и назначение |
|---|---|
| `typed-loop` | Bool/int/float/str/datetime/None, доступ name/index/iterator, отсутствие input отдельно от NULL. |
| `dynamic-pandas` | A/B→B/C на том же узле; nullable roundtrip и with_index; ожидаемые поля заранее. |
| `environment-module` | PY_ENV known/unknown, venv/image marker, paths saved/unsaved/cwd, stdout/stderr. |
| `errors-large` | Syntax/runtime/cancel, preview <preview> / execute <main>, полный read 201/151 после W3. |

Oracle: Независимый oracle читает CSV и явные expected, не запускает пользовательский/candidate код для получения ожиданий. Проверяет все порты, nullable типы, порядок полей, marker интерпретатора, отсутствие собственного orphan. Не импортирует runtime, отвергает старое исполнение/чужой узел/подмену значений; источники и эффекты связаны с собственной попыткой.

Ограничения `scripts/node-acceptance/expected-outputs.mjs:7-14,29-39,72-81`: до 32 таблиц, до 100 строк на выход; порядок колонок позиционный, строки сравниваются без порядка. Числа точные (`cold-check.mjs:232`, `requireExactNumbers: true`): в первом комплекте только точно представимые суммы/значения, допуск требует отдельного решения. Адресации порта одного узла, переменных и файлов в expected нет. Для нетабличного результата, внешнего ledger и нескольких портов PASS требует принятых W и дополнительного независимого аудита; подмена результата таблицей не доказывает исходный порт/эффект.

## 4. Проверки, приёмка и завершение

Адресная матрица охватывает все этапы; строка вне назначенного среза остаётся `not_checked`. Требования до живого исследования документированы, а не наблюдены.

| Проверка | Условие успеха |
|---|---|
| Контракт | Неизвестные поля/режимы, несогласованный тип/связь и параметры следующего этапа отклонены до мутации; ошибка объясняет исправление |
| `programming-python:r01` | Digest кода сохраняется; несколько портов читаются/пишутся по корректным индексам. Bool/int/float/str/datetime/None совпадают с independent expected. |
| `programming-python:r02` | factor=3 даёт известный output; отсутствие переменной и входа различается с NULL. Get/GetColumn/IsNull сверяются по каждому типу. |
| `programming-python:r03` | Одинаковый сценарий с флагом on/off проверяет доступность изменения схемы; после первой строки — отказ. Имена, метки, виды/назначения сохраняются. На том же узле с неизменным кодом вход A/B → B/C без configure меняет схему до Append; node-specific policy разрешается только по readback флага после отдельного discovery, oracle проверяет все выходы. CrossTable PASS недостаточен. |
| `programming-python:r04` | DataFrame roundtrip сохраняет None/nullable integer/boolean; index on/off даёт ожидаемое число полей. Oracle не запускает код candidate для expected. |
| `programming-python:r05` | Два коротких независимых узла подтверждают ожидание на Windows in-process и отдельные процессы; Linux переносит in-process настройку в external mode. |
| `programming-python:r06` | Исполняемый интерпретатор/пакет подтверждает environment marker; запрещённое имя не запускается. Настройки администратора не меняются скрыто ради зелёного теста. |
| `programming-python:r07` | Собственный модуль x+7 находится относительно пакета; смена cwd проверяющего не влияет. FS JSON и locale совпадают с fixture, stdout/stderr сохраняют разную роль. |
| `programming-python:r08` | Syntax/runtime exception с позицией кода не считается готовым output; preview <preview> и execute <main> различаются; 201/151 строк читаются полностью. После cancellation нет собственного orphan process. |
| `programming-python:r09` | Отдельные квалификации версии/разрядности. Не обещать Anaconda/multiprocessing/GUI в in-process; незавершённые threads/сбой native extension не исправлять автоматическим retry. |
| Смена источника/настроек | Тот же узел, новая попытка; незапрошенные настройки сохранены, новый результат не подменён прежним |
| Persistence | Сохранение после всех чтений; новый профиль открывает пакет, настройки/связи и результат проверены без восстановления |
| Recovery | Неизвестный внешний эффект не повторён; причина отказа мастера прочитана; собственные эффекты подтверждены независимо |
| Регрессия | Адресные тесты и весь `client/test`; тесты принятого W |

Задание модели: Обработать values.csv предоставленным сценарием Python расчёта сумм, показать результат и сведения о пропусках, заменить исходные значения в том же источнике, повторить выполнение и сохранить пакет в {{PACKAGE_PATH}}.

PASS исполнителя: CLI, независимый cold-check в пределах поддержанного табличного среза, обязательный аудит портов/эффектов после согласованных W, вся адресная матрица этапа, `package_closed=true`, `logged_out=true`; частичный вывод/preview не даёт PASS. Ловец принимает тот же чистый опубликованный SHA. Реестр отражается только по доказательствам принятой карточки; `integration` и `release` не трогаются.

## 5. Ловушки — переподтвердить, не копировать

Следующие положения взяты из прежнего черновика и Help, их поведение на стенде остаётся гипотезой до этапа 0:

Необязательные несколько табличных входов и переменные → один/несколько табличных выходов. Режим внутри процесса только Windows; отдельный процесс Windows/Linux. Python должен быть установлен и разрешён администратором.

Таблица четырёх строк с integer, float, bool, datetime, NULL, empty и текстом; вторая таблица и factor=3. Независимые expected для обычного цикла и pandas преобразования. Отдельный тестовый модуль и файл JSON; никакого нового JS/import handler для fixture.

Dynamic schema extraction и preview запускают весь Python код; не использовать их как безопасную проверку конфигурации при side effects. Stop in-process возможен только между инструкциями; после timeout проверить отдельный процесс/контейнер и не считать kill доказательством logout.

## 6. Точка продолжения

- **Подтверждено:** источники Help/E2E и отсутствие обработчика на `dada8010e`; живых наблюдений и прогонов нет, `discovery_required`.
- **Генератор:** сверить активные карточки, назначить этап 0, зафиксировать SHA/аккаунты/внешнюю среду.
- **Исполнитель:** discovery, матрица W для владельца, fixtures и независимый комплект до обработчика.
- **Владелец:** решение по W до карточки разработки; следующие этапы отдельными назначениями.
- **Ловец:** независимая приёмка опубликованного SHA каждого среза; непроверенное остаётся `not_checked`.
