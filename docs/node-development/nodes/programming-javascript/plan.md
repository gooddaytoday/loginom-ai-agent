# JavaScript: подплан полного покрытия

[Карточка](README.md) · [Реестр](../../registry.json) · [RUNBOOK](../../RUNBOOK.md), [жизненный цикл](../../workflow/lifecycle.md), [CLI-приёмка](../../workflow/acceptance-cli.md).

Статус: **discovery_required**. Component ID: `component.programming.JavaScript`. Runtime type и native controls: **discovery_required**, новый handler не зарегистрирован. Основание: статический код базы `5f772aea9`, официальная Help 7.4, прочитана 2026-10-02. Каталожный статус: `current_help`.

Цель — поэтапно закрыть все нижеуказанные режимы. Первый этап не означает полноту узла. Документ не повышает implementation/acceptance readiness; живой Loginom, автономная модель и приёмочные проверки при его подготовке не запускались.

Оперативное уточнение владельца от 2026-10-02: этот узел **уже разрабатывается**. Продолжать существующую карточку; указанный выше SHA описывает базу исследования, а не HEAD активного исполнителя. ID карточки, текущий stage, рабочий SHA и evidence пока не сверены. Перед отдельным назначением общего редактора, oracle или других prerequisites проверить, что уже входит в текущую разработку JavaScript. Начало работы не меняет readiness и не доказывает реализацию всей матрицы.

## Контракт и источники

Необязательные несколько табличных входов и переменные → один/несколько табличных выходов. Код исполняется движком Loginom; backend Node.js и runtime handler не должны вычислять результат вместо узла.

| ID источника | Официальная документация | Версия | Дата чтения |
| --- | --- | --- | --- |
| `programming-javascript:help-01` | [JavaScript](https://help.loginom.ru/userguide/processors/programming/java-script/) | 7.4 | 2026-10-02 |
| `programming-javascript:help-02` | [Внешние модули](https://help.loginom.ru/userguide/processors/programming/java-script/external-modules.html) | 7.4 | 2026-10-02 |
| `programming-javascript:help-03` | [Входные наборы](https://help.loginom.ru/userguide/processors/programming/java-script/input-tables.html) | 7.4 | 2026-10-02 |
| `programming-javascript:help-04` | [Входные переменные](https://help.loginom.ru/userguide/processors/programming/java-script/input-variables.html) | 7.4 | 2026-10-02 |
| `programming-javascript:help-05` | [Выходные наборы](https://help.loginom.ru/userguide/processors/programming/java-script/output-tables.html) | 7.4 | 2026-10-02 |
| `programming-javascript:help-06` | [Глобальные функции](https://help.loginom.ru/userguide/processors/programming/java-script/global-function.html) | 7.4 | 2026-10-02 |
| `programming-javascript:help-07` | [Перечисления](https://help.loginom.ru/userguide/processors/programming/java-script/enum.html) | 7.4 | 2026-10-02 |
| `programming-javascript:help-08` | [Функции Калькулятора](https://help.loginom.ru/userguide/processors/programming/java-script/calc-functions.html) | 7.4 | 2026-10-02 |
| `programming-javascript:help-09` | [Fetch API](https://help.loginom.ru/userguide/processors/programming/java-script/fetch-api.html) | 7.4 | 2026-10-02 |
| `programming-javascript:help-10` | [File Storage API](https://help.loginom.ru/userguide/processors/programming/java-script/fileapi.html) | 7.4 | 2026-10-02 |
| `programming-javascript:help-11` | [Консоль отладки кода](https://help.loginom.ru/userguide/processors/programming/java-script/console.html) | 7.4 | 2026-10-02 |
| `programming-javascript:help-12` | [Описание API](https://help.loginom.ru/userguide/processors/programming/java-script/api-description.html) | 7.4 | 2026-10-02 |
| `programming-javascript:help-13` | [Горячие клавиши](https://help.loginom.ru/userguide/processors/programming/java-script/hotkeys.html) | 7.4 | 2026-10-02 |

### Матрица окружений/провайдеров

Матрица: Windows/Linux; table schema static/dynamic; 0/1/2 inputs и 1/2 outputs; data/variables API; ES6/CommonJS; Calc/global/Console; Fetch/FS. Это покрытие интерфейсов узла, не доказательство правильности всех возможных пользовательских JS-программ.

Обязательная File Storage API матрица (`programming-javascript:r08`, источник `programming-javascript:help-10`): appendFileSync, closeSync, copyFileSync, existsSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, truncateSync, unlinkSync, writeFileSync, writeSync (обе перегрузки); Stats/FileHandle/Dirent, flags и encodings. Для read/write сверить позицию, длину и возврат; для symlink/stat — metadata без выхода за fixture-каталог.

Fetch API матрица (`programming-javascript:r07`, источник `programming-javascript:help-09`): Headers append/delete/entries/forEach/get/has/keys/set/values; Request/Response clone, bodyUsed, text/json/arrayBuffer; Response.error/redirect; redirect follow/error/manual; AbortController/AbortSignal, abort и добавление/удаление listener. Положительный и отрицательный case каждой группы используют независимый HTTP ledger.

## Требования и независимые проверки

Ниже — функциональная матрица; ожидания проверяющий фиксирует до автономной попытки. Статус каждой строки сейчас NOT_RUN. Входы и expected не генерировать кодом будущего handler; reference package/внешний клиент допустимы только независимо квалифицированные.

| ID / этап | Требование | Проверка и ожидаемый результат | Источник |
| --- | --- | --- | --- |
| `programming-javascript:r01`<br>`programming-javascript:s1` | Код и фиксированная схема: поля/метки/типы/виды/назначения; один/несколько выходов и optional inputs. | После ввода текст кода совпадает по digest/Unicode/отступам; четыре строки дают фиксированные ожидаемые выходы. Неподключённый input не превращается в пустую подставную таблицу. | `programming-javascript:help-01`, `programming-javascript:help-13` |
| `programming-javascript:r02`<br>`programming-javascript:s1` | InputTable(s)/Columns/Get/GetColumn/IsNull, OutputTable(s)/Append/Set/Get и metadata перечисления. | Индекс/имя/итератор читают одни значения; NULL=undefined, empty string отдельно. Проверить boolean, Date, number и безопасные integer, DataType/DataKind/UsageType. | `programming-javascript:help-03`, `programming-javascript:help-05`, `programming-javascript:help-07`, `programming-javascript:help-12` |
| `programming-javascript:r03`<br>`programming-javascript:s2` | InputVariables по имени/индексу; динамические AssignColumns/AddColumn/InsertColumn/DeleteColumn/ClearColumns. | factor=3 влияет только на сумму; schema mutation разрешена до первого Append и при установленном флаге. После Append/при выключенном флаге — реальный отказ, не скрытая перестройка. На том же узле с неизменным кодом вход A/B → B/C без configure меняет схему до Append; node-specific policy разрешается только по readback флага после отдельного discovery, oracle проверяет все выходы. CrossTable PASS недостаточен. | `programming-javascript:help-04`, `programming-javascript:help-05`, `programming-javascript:help-12` |
| `programming-javascript:r04`<br>`programming-javascript:s2` | Несколько входов/выходов, пустые и разные схемы; preview не равен полному исполнению. | Полные 201 и 151 строки на двух выходах проверяет oracle; preview может остановиться после минимальных 100 на каждом и не доказывает полноту. | `programming-javascript:help-01`, `programming-javascript:help-03`, `programming-javascript:help-05` |
| `programming-javascript:r05`<br>`programming-javascript:s3` | ES6 static/dynamic import и CommonJS require; пути saved/unsaved/package/module, UTF-8/UTF-16LE+BOM. | Три допустимых способа дают x+7; missing module и CommonJS→ES6 выявляют ограничения. Reopen из другого рабочего каталога использует путь пакета, не runtime cwd. | `programming-javascript:help-02`, `programming-javascript:help-12` |
| `programming-javascript:r06`<br>`programming-javascript:s3` | builtIn/Calc, глобальные setTimeout/clearTimeout, atob/btoa, getLocale; Console. | Известные строка/дата/число проверяют Calc и кодировки UTF-8/Latin-1; отменённый timer не пишет output; locale BCP47 закреплена. Console assert/error/warn/info/log/clear проверяются отдельно в preview и с учётом уровня server log. IF/IFF и функции входных данных не объявляются доступными через Calc. | `programming-javascript:help-06`, `programming-javascript:help-08`, `programming-javascript:help-11`, `programming-javascript:help-12` |
| `programming-javascript:r07`<br>`programming-javascript:s3` | builtIn/Fetch: Headers, Request/Response, text/json/arrayBuffer, clone/bodyUsed, redirect и AbortController. | Echo fixture подтверждает method/body/headers; каждый формат тела, follow/error/manual и abort имеют собственный expected. Повторное чтение consumed body даёт отказ. | `programming-javascript:help-09`, `programming-javascript:help-12` |
| `programming-javascript:r08`<br>`programming-javascript:s3` | builtIn/FS: чтение/запись/append, дескрипторы, metadata/директории, copy/rename/truncate/delete, flags/encodings. | В собственной fixture-директории сверить bytes, metadata и итоговый список; каждый метод из матрицы ниже и обе writeSync формы имеют свой case, включая missing/permission errors. Полное покрытие не выводить из одного read/write roundtrip. | `programming-javascript:help-10`, `programming-javascript:help-12` |
| `programming-javascript:r09`<br>`programming-javascript:s4` | Синтаксис/runtime/Promise ошибки, отмена, точность IEEE754 и Linux Atomics ограничение. | Инъекция ошибки после части Append не даёт complete; rejected Promise обнаруживается по независимому marker/evidence, даже если узел активен. 2^53±1 проверяет честность точности, Linux Atomics не подменяется. | `programming-javascript:help-01`, `programming-javascript:help-11`, `programming-javascript:help-12` |

### Самостоятельные fixtures

Таблица A из 4 строк (id,amount,text,flag,date), независимая B из 2 строк, переменная factor=3; вручную рассчитанные amount×3 и второй агрегатный выход. Отдельные файлы ES6/CommonJS с функцией x+7, изолированные HTTP ledger/FS fixtures. Скрипт является частью business input; expected скрыты от модели.

Подготовить в этом каталоге `acceptance/task.md` и `acceptance/input/`; независимые `acceptance/expected/` и verifier хранить вне workspace модели. Это запланированные материалы, а не уже созданные доказательства. Для внешней системы использовать отдельный namespace/schema/topic/project на попытку. Парный обработчик импорта/экспорта не является hard dependency.

## Этапы и реализация

| ID | Результат этапа | Приоритет | Hard dependencies | Environment gates |
| --- | --- | --- | --- | --- |
| `programming-javascript:s1` | Код, фиксированные таблицы и базовый API; покрывает `programming-javascript:r01`, `programming-javascript:r02` | 2 | `foundation:oracle-tabular`, `foundation:programming` | окружение предыдущего этапа |
| `programming-javascript:s2` | Динамическая схема и typed variables; покрывает `programming-javascript:r03`, `programming-javascript:r04` | 3 | `programming-javascript:s1`, `foundation:dynamic-schema`, `foundation:typed-variables` | окружение предыдущего этапа |
| `programming-javascript:s3` | Модули, Calc, сеть и File Storage; покрывает `programming-javascript:r05`, `programming-javascript:r06`, `programming-javascript:r07`, `programming-javascript:r08` | 4 | `programming-javascript:s2`, `foundation:file-artifacts`, `foundation:external-effects` | Изолированные JS-module/HTTP/FS fixtures |
| `programming-javascript:s4` | Асинхронные отказы и platform boundaries; покрывает `programming-javascript:r09` | 4 | `programming-javascript:s3` | Проверки Windows/Linux на закреплённых движках |

Общие зависимости: [foundation:oracle-tabular](../../foundations/acceptance/plan.md), [foundation:programming](../../foundations/external-systems/plan.md), [foundation:dynamic-schema](../../foundations/dynamic-schema/plan.md), [foundation:typed-variables](../../foundations/typed-ports/plan.md), [foundation:file-artifacts](../../foundations/external-systems/plan.md), [foundation:external-effects](../../foundations/external-systems/plan.md). Приоритет задаёт рекомендуемую волну после зависимостей, не разрешение запуска. Наличие credentials/БД/ОС — environment gate, не искусственная зависимость от соседнего узла.

Использовать `node-procedure.mjs` и lifecycle существующего `calculator-node.mjs`; native code editor/многострочное изменение исследовать отдельно, а не копировать expression control. `node-output-procedure.mjs`/`table-output-pages.mjs` читают реальные выходы; multiport и динамические поля зависят от foundations.

Общие точки проверены статически: [диспетчер handler](../../../../packages/loginom-runtime/client/lib/node-support.mjs), [ownership операции](../../../../packages/loginom-runtime/client/lib/node-operation-runner.mjs), [сохранение пакета](../../../../packages/loginom-runtime/client/lib/package-persistence.mjs). В dispatcher есть 14 обработчиков; этот компонент среди них отсутствует.

В реализации предусмотреть отдельные `programming-javascript-node.mjs`, `programming-javascript-parameters.mjs` и native configure/readback по форме существующих обработчиков; это предлагаемые новые файлы в `packages/loginom-runtime/client/lib`, пока они отсутствуют. До кодирования закрепить фактический runtime type, порты, controls, поддержанные сочетания и ошибки в discovery evidence. Не придумывать data-tid и не использовать raw UI обход отсутствующего контракта. Общие изменения Host/Agent/typed ports принадлежат владельцу foundation и принимаются отдельно; публичный API не меняется этим документом.

Реализовывать stage за stage: сначала validation/target binding, затем configure/readback, исполнение, полный result reader или external/file evidence, сохранение и cold check. Existing patch сохраняет неуказанные настройки только после подтверждённого чтения. Configure-only не должен выполнять бизнес-операцию; если discovery схемы требует выполнения, это отдельный явно учитываемый эффект.

### Политика схемы и границы зависимости

В programming-javascript:s2 foundation:dynamic-schema предоставляет только базовый механизм policy/fresh read; приёмка CrossTable Sliding не разрешает relaxed policy для JavaScript. Нужны отдельное node-specific discovery и согласованное расширение контракта для native-флага «Разрешить формировать выходные столбцы из кода», с разрешением только по его наблюдённому readback. Один неизменный скрипт строит поля по входным данным до Append: вход A/B заменить на B/C и повторно выполнить тот же узел без configure; независимый oracle проверяет свежую полную схему, порядок, типы и значения каждого выхода по исходной операции. Выключенный флаг, неизвестный режим, потеря identity и изменение колонок после Append должны сохранять строгий отказ.

## Ошибки и восстановление

Preview выполняет код и активирует входы, поэтому file/network effects учитываются до preview. Не переписывать ошибочный пользовательский алгоритм ради PASS. Lost reply требует проверить effect ledger; Promise rejection без ошибки узла не считается успехом.

На каждом переходе сохранять operation/document/package/workflow/node/execution identity. Различать отказ до эффекта, подтверждённую ошибку и неизвестный результат. Повтор того же operation_id не создаёт второй узел/выполнение. Обнаружив окно ошибки, собрать причину, закрыть только принадлежащий текущей операции диалог и подтвердить возврат; не удалять исходную неуспешную попытку. Timeout ожидания клиента не является отменой на сервере. Cleanup подтверждается отдельными receipts и не превращает FAIL в PASS.

## Проверки, CLI и критерии завершения

Добавить адресные тесты `client/test/programming-javascript.test.mjs` и `client/test/programming-javascript-lifecycle.test.mjs` (пока не существуют): валидация режимов/типов, identity mismatch, ошибки до/после эффекта, lost reply, cancel, existing patch, пустой набор и сохранение. Проверять настоящую реализацию; expected не импортирует handler. Для oracle обязательны отрицательные проверки: подменённое значение, схема, mapping, execution или старый артефакт должны приводить к FAIL.

После реализации запускать из `packages/loginom-runtime/client`:

```sh
node --test test/programming-javascript.test.mjs test/programming-javascript-lifecycle.test.mjs
node --test test/node-operation-runner.test.mjs test/node-operation-failure.test.mjs test/node-read.test.mjs test/package-persistence.test.mjs
```

Это команды будущей проверки, сейчас они не запускались. Первая требует добавленных адресных тестов; вторая использует существующие source tests и не доказывает аналитическую приёмку. Проверки типов затронутых TypeScript-пакетов выполнять только через `bun typecheck` из соответствующего пакета.

CLI-задание: выполнить бизнес-задачу над подготовленными входами, получить требуемый результат узла «JavaScript» и сохранить пакет в уникальном месте. Для каждого этапа задание включает все его modes/cases, но не UI-команды, oracle, source-код verifier или готовые expected. Модель/effort берутся из назначения; допустимое время одной попытки — **7200 секунд** по RUNBOOK. Перед приёмкой закрепить чистый candidate SHA и все runtime/client/model/platform/provider pins.

Независимый проверяющий другим аккаунтом/браузерным профилем читает сохранённые настройки, все связи/порты и полный небольшой результат, затем проверяет новый execution и повторное открытие через `scripts/node-acceptance/cold-check.mjs` из того же checkout. Для sink нужен внешний/файловый oracle; существующий табличный cold-check не объявлять автоматически достаточным. Внешние destructive cases повторять только на новой fixture-цели: их долговечные настройки и результат проверяются отдельно. `package_closed=true` и `logged_out=true` обязательны; отсутствие этих receipts оставляет приёмку незавершённой.

К ревью этап готов после выполнения всех его требований и адресных проверок; к CLI-приёмке — после исправлений и фиксации SHA. Полное покрытие узла возможно только после всех stages и заявленных environment profiles. NOT_RUN, FAIL и discovery_required не подменять configure/build/HTTP200/старым SHA. Integration, merge и release остаются отдельными действиями владельца.

## Точка продолжения

- SHA основания: `5f772aea9`; результат: документированный scope, реализации и live приёмки нет.
- Открыто: Версия JS engine, фактический API/DOM редактора, механизм durable cancelled outcome и limits code/output выясняются discovery; неизвестные browser/Node APIs не обещаются.
- Следующий шаг: продолжить существующую карточку, сверив её stage/scope, pins, рабочий SHA и выполненное discovery; закрепить непокрытые controls/схемы и независимые fixtures. Не создавать повторное назначение первого этапа.
- Существенное изменение общих контрактов или критериев согласовать с владельцем; checkpoint исполнения ограничить 20 строками.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `programming-javascript:s1` | Серверный код, процессы и специальные источники | programming-javascript | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Владелец сообщил 2026-10-02: JavaScript уже разрабатывается. Точный stage/SHA не проверен; продолжать существующее назначение, не создавать дубликат. Общие изменения сверить с CrossTable и владельцем oracle. Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `programming-javascript:s2` | Серверный код, процессы и специальные источники | programming-javascript | shared-table-shell | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Владелец сообщил 2026-10-02: JavaScript уже разрабатывается. Точный stage/SHA не проверен; продолжать существующее назначение, не создавать дубликат. Общие изменения сверить с CrossTable и владельцем oracle. Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. Новая разрешённая динамическая policy требует собственного discovery и владельца; CrossTable PASS её не разрешает. |
| `programming-javascript:s3` | Серверный код, процессы и специальные источники | programming-javascript | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Владелец сообщил 2026-10-02: JavaScript уже разрабатывается. Точный stage/SHA не проверен; продолжать существующее назначение, не создавать дубликат. Общие изменения сверить с CrossTable и владельцем oracle. Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `programming-javascript:s4` | Серверный код, процессы и специальные источники | programming-javascript | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Владелец сообщил 2026-10-02: JavaScript уже разрабатывается. Точный stage/SHA не проверен; продолжать существующее назначение, не создавать дубликат. Общие изменения сверить с CrossTable и владельцем oracle. Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
