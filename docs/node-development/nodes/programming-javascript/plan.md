# JavaScript: подплан для Multica

Статус: `discovery_required`. Редакция 1 от 2026-10-05, автор — переработка подпланов в ветке `node-coverage-plans`.
Component ID: `component.programming.JavaScript`, slug `programming-javascript`. Runtime type и режим: `programming.javascript` / `script` — предложение до конца этапа 0.
База назначения: ветка задания из карточки; исследованы исходники `loginom@dada8010e`. Loginom: ожидается 7.4.2, фактическую версию записать на этапе 0; платформа исполнителя — Linux x64.

Шаблон — [node-plan](../../templates/node-plan.md), образец — [ARIMAX](../datamining-arimax/plan.md). Общий порядок — [RUNBOOK](../../RUNBOOK.md) и [CLI-приёмка](../../workflow/acceptance-cli.md). [Карточка](README.md) · [реестр](../../registry.json).

## 0. Как выполняется назначение

Оркестрация — Multica, сквад «Обработчики узлов»: Генератор тасок готовит назначение, Тест-Манки #1 разрабатывает и проходит приёмку, Ловец Галюцинаций независимо принимает опубликованный SHA.

Карточка:

```text
Ветка: <ветка задания>
Узел: programming-javascript
Обработать узел по его подплану до независимой приёмки. Объём — этап 0 подплана.
```

Первая карточка — этап 0 отдельно; этап 1 — после решения владельца по W, нужным этому этапу (раздел 2). В ветке задания должны быть RUNBOOK, подплан, инструменты приёмки и принятые зависимости, отсутствие — Blocked.

Разрешено: живое исследование в собственном аккаунте, комплект `acceptance/`, затем назначенный срез и согласованные W, PR и публикация доказательств.
Не разрешено: merge и релиз; следующие этапы; общие изменения без решения владельца; изменения конфигураций обвязки.

| Параметр | Значение |
|---|---|
| Узел | `component.programming.JavaScript`, slug `programming-javascript` |
| Исходный SHA | вершина ветки задания; Генератор фиксирует в карточке |
| Runtime type и режим | `programming.javascript` / `script` — предложение до конца этапа 0 |
| Стенд и аккаунты | из конфигов ролей; пара worker/reviewer, один стенд |
| Модель приёмки | `openai/gpt-6-luna`, вариант `high`; итог исполнителя и независимая проверка ревьюера; предел модельного прогона 7200 с |
| Внешняя среда | Движок JavaScript сервера Loginom 7.4.2 и собственное файловое хранилище; для этапа 3 — ES6/CommonJS модули, HTTP ledger и изолированный FS-каталог; для этапа 4 — Windows/Linux. |

Стоп-условия — Blocked с конкретным вопросом Генератору:

- нет обязательных файлов/принятых зависимостей, CLI или пара аккаунтов не `ready`;
- компонент отсутствует в палитре, среда недоступна или требуемое разрешение администратора отсутствует;
- нет решения владельца по нужному W; нужен режим вне назначенного этапа;
- неизвестный исход операции: сохранить попытку и writer marker, сначала проверить фактический эффект.

## 1. Цель и проверенная основа

Цель: Ограниченный детерминированный табличный пример: вход, вычисленные поля, выход и ошибка исполнения. Это предложение объёма из реестра, а не доказательство стенда. Этап 1 — «Код, фиксированные таблицы и базовый API»; остальные режимы выделены по требованиям в отдельные этапы, чтобы каждый срез принимался независимо.

| Источник | Факт | Наблюдено или гипотеза |
|---|---|---|
| Runtime базы | Обработчика нет в 15 типах `client/lib/node-contracts.mjs:8-22` и диспетчере `node-support.mjs:27-41`. Нет универсальных внешних подключений, исполнения кода и чтения выходных переменных; `node-api.mjs:40-41` — только local bindings Кросс-таблицы | Наблюдено в коде `dada8010e` |
| Реестр | `plan_status: discovery_required`, `handler: null`; `backlog`, готовность не повышена | Наблюдено |
| Справка | [JavaScript](https://help.loginom.ru/userguide/processors/programming/java-script/) = `loginom-help@353e506b:data/processors/programming/java-script/README.md` | Документировано; UI не наблюдался |
| Справка | [Внешние модули](https://help.loginom.ru/userguide/processors/programming/java-script/external-modules.html) = `loginom-help@353e506b:data/processors/programming/java-script/external-modules.md` | Документировано; UI не наблюдался |
| Справка | [Входные наборы](https://help.loginom.ru/userguide/processors/programming/java-script/input-tables.html) = `loginom-help@353e506b:data/processors/programming/java-script/input-tables.md` | Документировано; UI не наблюдался |
| Справка | [Входные переменные](https://help.loginom.ru/userguide/processors/programming/java-script/input-variables.html) = `loginom-help@353e506b:data/processors/programming/java-script/input-variables.md` | Документировано; UI не наблюдался |
| Справка | [Выходные наборы](https://help.loginom.ru/userguide/processors/programming/java-script/output-tables.html) = `loginom-help@353e506b:data/processors/programming/java-script/output-tables.md` | Документировано; UI не наблюдался |
| Справка | [Глобальные функции](https://help.loginom.ru/userguide/processors/programming/java-script/global-function.html) = `loginom-help@353e506b:data/processors/programming/java-script/global-function.md` | Документировано; UI не наблюдался |
| Справка | [Перечисления](https://help.loginom.ru/userguide/processors/programming/java-script/enum.html) = `loginom-help@353e506b:data/processors/programming/java-script/enum.md` | Документировано; UI не наблюдался |
| Справка | [Функции Калькулятора](https://help.loginom.ru/userguide/processors/programming/java-script/calc-functions.html) = `loginom-help@353e506b:data/processors/programming/java-script/calc-functions.md` | Документировано; UI не наблюдался |
| Справка | [Fetch API](https://help.loginom.ru/userguide/processors/programming/java-script/fetch-api.html) = `loginom-help@353e506b:data/processors/programming/java-script/fetch-api.md` | Документировано; UI не наблюдался |
| Справка | [File Storage API](https://help.loginom.ru/userguide/processors/programming/java-script/fileapi.html) = `loginom-help@353e506b:data/processors/programming/java-script/fileapi.md` | Документировано; UI не наблюдался |
| Справка | [Консоль отладки кода](https://help.loginom.ru/userguide/processors/programming/java-script/console.html) = `loginom-help@353e506b:data/processors/programming/java-script/console.md` | Документировано; UI не наблюдался |
| Справка | [Описание API](https://help.loginom.ru/userguide/processors/programming/java-script/api-description.html) = `loginom-help@353e506b:data/processors/programming/java-script/api-description.md` | Документировано; UI не наблюдался |
| Справка | [Горячие клавиши](https://help.loginom.ru/userguide/processors/programming/java-script/hotkeys.html) = `loginom-help@353e506b:data/processors/programming/java-script/hotkeys.md` | Документировано; UI не наблюдался |
| E2E | `e2e-tests@486caef44:tests/toreview/acceptance/wizards/javascript/`: js_code/js_data_input/js_data_output/js_errors/js_module/js_general; labels.ts:554 задаёт заголовки мастера. Метка :toreview и skipped cases не дают приёмку. | Прочитано как источник требований; не выполнялось |
| История | Прежней принятой реализации этого обработчика в реестре нет; сведения об активной работе требуют сверки карточки | Гипотезы стенда проверяет этап 0 |

## 2. Этапы

### Этап 0 — подготовка, живое исследование, контракт

Подготовка: checkout и сверка SHA, сборка из закоммиченных исходников, `loginom status` = `ready`. Наблюдения — штатными средствами runtime с `?testable=true`, каждый отказ мастера прочитать из кнопки ошибки.

1. Палитра, точный заголовок и корень мастера, страницы, число/тип/необязательность портов; доступность в назначенной редакции.
2. Умолчания, границы, disabled/dependent настройки и точные причины отказов, включая неизвестный параметр.
3. Сверить существующую карточку JavaScript, её stage/SHA/evidence до нового назначения; не создавать дубликат по историческому сообщению владельца.
4. Наблюдать редактор/Unicode/readback, static/dynamic выходы, optional 0/1/2 inputs и 1/2 outputs, NULL=undefined и Date/IEEE754.
5. Проверить same-node A/B→B/C без configure и границу изменения схемы до первого Append; preview активирует входы и исполняет код.
6. Наблюдать ES6/CommonJS, Calc/Console, Fetch/FS, Promise rejection и Linux Atomics без переноса PASS Кросс-таблицы.
7. Имена, метки, типы и порядок полей каждого выхода, момент появления схемы до/после Execute; NULL, пустой вход и смена источника того же узла.

Результат — `discovery.md`: «наблюдено / гипотеза», конкретные значения и точные схемы, предложение W владельцу. После исследования закрепляются runtime type/режим, fixtures и acceptance до кода; `ready_for_development` не присваивается этим документационным PR.

### Этап 1 — Код, фиксированные таблицы и базовый API

- `programming-javascript:r01` — Код и фиксированная схема: поля/метки/типы/виды/назначения; один/несколько выходов и optional inputs.
- `programming-javascript:r02` — InputTable(s)/Columns/Get/GetColumn/IsNull, OutputTable(s)/Append/Set/Get и metadata перечисления.
Scope этапа 1 ограничен перечисленными требованиями. Создание, изменение существующего узла, выполнение, полный readback и persistence входят в этот срез; режимы последующих этапов отклоняются до мутации с объяснением.

Файлы (предложение): новые `packages/loginom-runtime/client/lib/javascript-{node,parameters,procedure,readback}.mjs`, адресные `client/test/javascript-*.test.mjs`; регистрация `node-contracts.mjs` и `.d.ts`, `node-support.mjs`, `node-api.mjs`, результат `node-result-schema.mjs`, `user-results.mjs`. Общие точки меняются только в объёме принятого W.
Образец: Калькулятор expression — образец сохранения текста и mapping, но его JavaScript-режим и самостоятельный JavaScript-компонент различны; Loginom исполняет код.

Общие изменения; владелец и SHA каждой зависимости закрепляются до назначения:

- **W1** — Редактор кода, фиксированные выходные схемы/несколько портов, точный Unicode readback и независимая адресация node_id+port index; node-api/procedure, node-read-* и cold-check.
- **W2** — Типизированные входные переменные и динамическая схема до Append, только при подтверждённом readback флаге; same-node source A/B→B/C без configure; этап 2.
- **W3** — Полное чтение более 100 строк каждого порта и пределы приёмки; этап 2. Текущий expected-outputs ограничен 100 строками.
- **W4** — Ledger внешних HTTP/FS эффектов, корреляция отмены/Promise ошибок; этапы 3–4; не повторять код при неизвестном результате.

Видимость для модели: `semantics` объясняет бизнес-результат и ограничения; `description` у каждого параметра, строковые enum; readback возвращает сохранённые режим/связи/порты и freshness. Код/запрос выполняет сервер Loginom, обработчик не вычисляет результат вместо узла.
Тесты из пакетов: `bun run test:upstream` в `packages/loginom-runtime`; при изменении приёмки — из `scripts/node-acceptance`: `node --test tests/*.test.mjs`. Адресные тесты новых файлов реализуются карточкой, сейчас их нет.

### Этап 2 — Динамическая схема и typed variables (отдельная карточка)

- `programming-javascript:r03` — InputVariables по имени/индексу; динамические AssignColumns/AddColumn/InsertColumn/DeleteColumn/ClearColumns.
- `programming-javascript:r04` — Несколько входов/выходов, пустые и разные схемы; preview не равен полному исполнению.
Назначение после независимой приёмки предыдущего этапа и решения владельца по требуемым W; приёмочный комплект отдельный, без переноса PASS.
### Этап 3 — Модули, Calc, сеть и File Storage (отдельная карточка)

- `programming-javascript:r05` — ES6 static/dynamic import и CommonJS require; пути saved/unsaved/package/module, UTF-8/UTF-16LE+BOM.
- `programming-javascript:r06` — builtIn/Calc, глобальные setTimeout/clearTimeout, atob/btoa, getLocale; Console.
- `programming-javascript:r07` — builtIn/Fetch: Headers, Request/Response, text/json/arrayBuffer, clone/bodyUsed, redirect и AbortController.
- `programming-javascript:r08` — builtIn/FS: чтение/запись/append, дескрипторы, metadata/директории, copy/rename/truncate/delete, flags/encodings.
Матрица FS этапа 3 по `fileapi.md:74-355`: `appendFileSync`, `closeSync`, `copyFileSync`, `existsSync`, `fstatSync`, `ftruncateSync`, `lstatSync`, `mkdirSync`, `openSync`, `readdirSync`, `readFileSync`, `readSync`, `realpathSync`, `renameSync`, `rmdirSync`, `rmSync`, `statSync`, `truncateSync`, `unlinkSync`, `writeFileSync`, обе формы `writeSync`; отдельные случаи flags/encodings, metadata Stats/FileHandle/Dirent и ошибок missing/permission.
Назначение после независимой приёмки предыдущего этапа и решения владельца по требуемым W; приёмочный комплект отдельный, без переноса PASS.
### Этап 4 — Асинхронные отказы и platform boundaries (отдельная карточка)

- `programming-javascript:r09` — Синтаксис/runtime/Promise ошибки, отмена, точность IEEE754 и Linux Atomics ограничение.
Назначение после независимой приёмки предыдущего этапа и решения владельца по требуемым W; приёмочный комплект отдельный, без переноса PASS.

## 3. Данные и независимые проверки

Комплект `nodes/programming-javascript/acceptance/` (следующие срезы — `acceptance/stageN/`): `task.md` с `{{PACKAGE_PATH}}` на бизнес-языке, `data/` только с входами модели, `expected.json` из независимого `oracle.py` до кода/прогона. Oracle и expected модели не передаются.

Формат CSV: UTF-8, заголовок, разделитель `,`, десятичный `.`, NULL-маркер `?`, пустая строка в кавычках. `values.csv`: `Id,Amount,Text,Flag,Date`, строки `1,10,hello,true,2024-02-29T00:00:00.000`, `2,20,"",false,2024-03-01T00:00:00.000`, `3,?,я,true,2024-03-02T00:00:00.000`, `4,-5,?,false,?`; типы integer/real/string/boolean/datetime. `second.csv`: `Id,Amount` = `5,2` и `6,4`; variable factor=3. Независимый код бизнес-примера умножает Amount на factor, копирует остальные поля; ожидаемые результаты вручную рассчитаны вне candidate.

`data/calculation.js` — самостоятельный вход модели, не oracle: копирует Id/Text/Flag/Date, добавляет AmountScaled=Amount×коэффициент, сохраняет NULL Amount как NULL. Текст записать и byte-manifest закрепить до модельного прогона; ожидаемые значения считаются отдельно по CSV. В этапе 1 коэффициент 3 закреплён в коде; в этапе 2 берётся из типизированной входной переменной factor=3, после изменения переменной изменяется только AmountScaled.
Размеры, число строк, SHA256, кодировка, типы, разделители и NULL фиксируются в `fixtures/manifest.json` до прогона. Доставка — проверенные `artifact_id`/`upload_operation_id`; >1 KiB поддерживается базой, одновременно не более восьми вложений.

| Набор | Содержание и назначение |
|---|---|
| `typed-static` | NULL, empty, дата, boolean, безопасные integer; второй фиксированный агрегатный выход. |
| `dynamic-large` | Source A/B→B/C без configure; отдельные 201/151 строки, полный oracle после W3. |
| `modules-network-fs` | Модули x+7, echo ledger, каждый FS метод/форма и encoding с byte expected. |
| `errors-platform` | Syntax/runtime/rejected Promise после частичного Append, cancellation, 2^53±1, Linux Atomics. |

Oracle: Python oracle по CSV не исполняет candidate JavaScript и не импортирует runtime; проверяет все клетки обоих выходов, schema/метаданные и freshness. Для Fetch/FS сверяет ledger и байты; матрица FS API перечислена в этапе 3 и переподтверждается на этапе 0 по Help. Не импортирует runtime, отвергает старое исполнение/чужой узел/подмену значений; источники и эффекты связаны с собственной попыткой.

Ограничения `scripts/node-acceptance/expected-outputs.mjs:7-14,29-39,72-81`: до 32 таблиц, до 100 строк на выход; порядок колонок позиционный, строки сравниваются без порядка. Числа точные (`cold-check.mjs:232`, `requireExactNumbers: true`): в первом комплекте только точно представимые суммы/значения, допуск требует отдельного решения. Адресации порта одного узла, переменных и файлов в expected нет. Для нетабличного результата, внешнего ledger и нескольких портов PASS требует принятых W и дополнительного независимого аудита; подмена результата таблицей не доказывает исходный порт/эффект.

## 4. Проверки, приёмка и завершение

Адресная матрица охватывает все этапы; строка вне назначенного среза остаётся `not_checked`. Требования до живого исследования документированы, а не наблюдены.

| Проверка | Условие успеха |
|---|---|
| Контракт | Неизвестные поля/режимы, несогласованный тип/связь и параметры следующего этапа отклонены до мутации; ошибка объясняет исправление |
| `programming-javascript:r01` | После ввода текст кода совпадает по digest/Unicode/отступам; четыре строки дают фиксированные ожидаемые выходы. Неподключённый input не превращается в пустую подставную таблицу. |
| `programming-javascript:r02` | Индекс/имя/итератор читают одни значения; NULL=undefined, empty string отдельно. Проверить boolean, Date, number и безопасные integer, DataType/DataKind/UsageType. |
| `programming-javascript:r03` | factor=3 влияет только на сумму; schema mutation разрешена до первого Append и при установленном флаге. После Append/при выключенном флаге — реальный отказ, не скрытая перестройка. На том же узле с неизменным кодом вход A/B → B/C без configure меняет схему до Append; node-specific policy разрешается только по readback флага после отдельного discovery, oracle проверяет все выходы. CrossTable PASS недостаточен. |
| `programming-javascript:r04` | Полные 201 и 151 строки на двух выходах проверяет oracle; preview может остановиться после минимальных 100 на каждом и не доказывает полноту. |
| `programming-javascript:r05` | Три допустимых способа дают x+7; missing module и CommonJS→ES6 выявляют ограничения. Reopen из другого рабочего каталога использует путь пакета, не runtime cwd. |
| `programming-javascript:r06` | Известные строка/дата/число проверяют Calc и кодировки UTF-8/Latin-1; отменённый timer не пишет output; locale BCP47 закреплена. Console assert/error/warn/info/log/clear проверяются отдельно в preview и с учётом уровня server log. IF/IFF и функции входных данных не объявляются доступными через Calc. |
| `programming-javascript:r07` | Echo fixture подтверждает method/body/headers; каждый формат тела, follow/error/manual и abort имеют собственный expected. Повторное чтение consumed body даёт отказ. |
| `programming-javascript:r08` | В собственной fixture-директории сверить bytes, metadata и итоговый список; каждый метод FS из списка этапа 3 и обе writeSync формы имеют свой case, включая missing/permission errors. Полное покрытие не выводить из одного read/write roundtrip. |
| `programming-javascript:r09` | Инъекция ошибки после части Append не даёт complete; rejected Promise обнаруживается по независимому marker/evidence, даже если узел активен. 2^53±1 проверяет честность точности, Linux Atomics не подменяется. |
| Смена источника/настроек | Тот же узел, новая попытка; незапрошенные настройки сохранены, новый результат не подменён прежним |
| Persistence | Сохранение после всех чтений; новый профиль открывает пакет, настройки/связи и результат проверены без восстановления |
| Recovery | Неизвестный внешний эффект не повторён; причина отказа мастера прочитана; собственные эффекты подтверждены независимо |
| Регрессия | Адресные тесты и весь `client/test`; тесты принятого W |

Задание модели: Обработать values.csv сценарием calculation.js, который умножает сумму операции на заданный коэффициент, сохраняет исходные реквизиты и пропуски, показать результат и сведения о пропусках, изменить исходные значения в том же источнике, выполнить сценарий снова и сохранить пакет в {{PACKAGE_PATH}}.

PASS исполнителя: CLI, независимый cold-check в пределах поддержанного табличного среза, обязательный аудит портов/эффектов после согласованных W, вся адресная матрица этапа, `package_closed=true`, `logged_out=true`; частичный вывод/preview не даёт PASS. Ловец принимает тот же чистый опубликованный SHA. Реестр отражается только по доказательствам принятой карточки; `integration` и `release` не трогаются.

## 5. Ловушки — переподтвердить, не копировать
Следующие положения взяты из прежнего черновика и Help, их поведение на стенде остаётся гипотезой до этапа 0:

Оперативное уточнение владельца от 2026-10-02: этот узел **уже разрабатывается**. Продолжать существующую карточку; указанный выше SHA описывает базу исследования, а не HEAD активного исполнителя. ID карточки, текущий stage, рабочий SHA и evidence пока не сверены. Перед отдельным назначением общего редактора, oracle или других prerequisites проверить, что уже входит в текущую разработку JavaScript. Начало работы не меняет readiness и не доказывает реализацию всей матрицы.

Необязательные несколько табличных входов и переменные → один/несколько табличных выходов. Код исполняется движком Loginom; backend Node.js и runtime handler не должны вычислять результат вместо узла.

Матрица: Windows/Linux; table schema static/dynamic; 0/1/2 inputs и 1/2 outputs; data/variables API; ES6/CommonJS; Calc/global/Console; Fetch/FS. Это покрытие интерфейсов узла, не доказательство правильности всех возможных пользовательских JS-программ.

Таблица A из 4 строк (id,amount,text,flag,date), независимая B из 2 строк, переменная factor=3; вручную рассчитанные amount×3 и второй агрегатный выход. Отдельные файлы ES6/CommonJS с функцией x+7, изолированные HTTP ledger/FS fixtures. Скрипт является частью business input; expected скрыты от модели.
Preview выполняет код и активирует входы, поэтому file/network effects учитываются до preview. Не переписывать ошибочный пользовательский алгоритм ради PASS. Lost reply требует проверить effect ledger; Promise rejection без ошибки узла не считается успехом.

## 6. Точка продолжения

- **Подтверждено:** источники Help/E2E и отсутствие обработчика на `dada8010e`; живых наблюдений и прогонов нет, `discovery_required`.
- **Генератор:** сверить активные карточки, назначить этап 0, зафиксировать SHA/аккаунты/внешнюю среду.
- **Исполнитель:** discovery, матрица W для владельца, fixtures и независимый комплект до обработчика.
- **Владелец:** решение по W до карточки разработки; следующие этапы отдельными назначениями.
- **Ловец:** независимая приёмка опубликованного SHA каждого среза; непроверенное остаётся `not_checked`.
