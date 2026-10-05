# JavaScript: черновик требований

Component ID: `component.programming.JavaScript`. Slug: `programming-javascript`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `programming-javascript:help-01` — [JavaScript](https://help.loginom.ru/userguide/processors/programming/java-script/), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-02` — [Внешние модули](https://help.loginom.ru/userguide/processors/programming/java-script/external-modules.html), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-03` — [Входные наборы](https://help.loginom.ru/userguide/processors/programming/java-script/input-tables.html), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-04` — [Входные переменные](https://help.loginom.ru/userguide/processors/programming/java-script/input-variables.html), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-05` — [Выходные наборы](https://help.loginom.ru/userguide/processors/programming/java-script/output-tables.html), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-06` — [Глобальные функции](https://help.loginom.ru/userguide/processors/programming/java-script/global-function.html), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-07` — [Перечисления](https://help.loginom.ru/userguide/processors/programming/java-script/enum.html), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-08` — [Функции Калькулятора](https://help.loginom.ru/userguide/processors/programming/java-script/calc-functions.html), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-09` — [Fetch API](https://help.loginom.ru/userguide/processors/programming/java-script/fetch-api.html), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-10` — [File Storage API](https://help.loginom.ru/userguide/processors/programming/java-script/fileapi.html), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-11` — [Консоль отладки кода](https://help.loginom.ru/userguide/processors/programming/java-script/console.html), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-12` — [Описание API](https://help.loginom.ru/userguide/processors/programming/java-script/api-description.html), Help 7.4, прочитано 2026-10-02.
- `programming-javascript:help-13` — [Горячие клавиши](https://help.loginom.ru/userguide/processors/programming/java-script/hotkeys.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `programming-javascript:r01` | Код и фиксированная схема: поля/метки/типы/виды/назначения; один/несколько выходов и optional inputs. | После ввода текст кода совпадает по digest/Unicode/отступам; четыре строки дают фиксированные ожидаемые выходы. Неподключённый input не превращается в пустую подставную таблицу. | `programming-javascript:help-01`, `programming-javascript:help-13` |
| `programming-javascript:r02` | InputTable(s)/Columns/Get/GetColumn/IsNull, OutputTable(s)/Append/Set/Get и metadata перечисления. | Индекс/имя/итератор читают одни значения; NULL=undefined, empty string отдельно. Проверить boolean, Date, number и безопасные integer, DataType/DataKind/UsageType. | `programming-javascript:help-03`, `programming-javascript:help-05`, `programming-javascript:help-07`, `programming-javascript:help-12` |
| `programming-javascript:r03` | InputVariables по имени/индексу; динамические AssignColumns/AddColumn/InsertColumn/DeleteColumn/ClearColumns. | factor=3 влияет только на сумму; schema mutation разрешена до первого Append и при установленном флаге. После Append/при выключенном флаге — реальный отказ, не скрытая перестройка. На том же узле с неизменным кодом вход A/B → B/C без configure меняет схему до Append; node-specific policy разрешается только по readback флага после отдельного discovery, oracle проверяет все выходы. CrossTable PASS недостаточен. | `programming-javascript:help-04`, `programming-javascript:help-05`, `programming-javascript:help-12` |
| `programming-javascript:r04` | Несколько входов/выходов, пустые и разные схемы; preview не равен полному исполнению. | Полные 201 и 151 строки на двух выходах проверяет oracle; preview может остановиться после минимальных 100 на каждом и не доказывает полноту. | `programming-javascript:help-01`, `programming-javascript:help-03`, `programming-javascript:help-05` |
| `programming-javascript:r05` | ES6 static/dynamic import и CommonJS require; пути saved/unsaved/package/module, UTF-8/UTF-16LE+BOM. | Три допустимых способа дают x+7; missing module и CommonJS→ES6 выявляют ограничения. Reopen из другого рабочего каталога использует путь пакета, не runtime cwd. | `programming-javascript:help-02`, `programming-javascript:help-12` |
| `programming-javascript:r06` | builtIn/Calc, глобальные setTimeout/clearTimeout, atob/btoa, getLocale; Console. | Известные строка/дата/число проверяют Calc и кодировки UTF-8/Latin-1; отменённый timer не пишет output; locale BCP47 закреплена. Console assert/error/warn/info/log/clear проверяются отдельно в preview и с учётом уровня server log. IF/IFF и функции входных данных не объявляются доступными через Calc. | `programming-javascript:help-06`, `programming-javascript:help-08`, `programming-javascript:help-11`, `programming-javascript:help-12` |
| `programming-javascript:r07` | builtIn/Fetch: Headers, Request/Response, text/json/arrayBuffer, clone/bodyUsed, redirect и AbortController. | Echo fixture подтверждает method/body/headers; каждый формат тела, follow/error/manual и abort имеют собственный expected. Повторное чтение consumed body даёт отказ. | `programming-javascript:help-09`, `programming-javascript:help-12` |
| `programming-javascript:r08` | builtIn/FS: чтение/запись/append, дескрипторы, metadata/директории, copy/rename/truncate/delete, flags/encodings. | В собственной fixture-директории сверить bytes, metadata и итоговый список; каждый метод из матрицы ниже и обе writeSync формы имеют свой case, включая missing/permission errors. Полное покрытие не выводить из одного read/write roundtrip. | `programming-javascript:help-10`, `programming-javascript:help-12` |
| `programming-javascript:r09` | Синтаксис/runtime/Promise ошибки, отмена, точность IEEE754 и Linux Atomics ограничение. | Инъекция ошибки после части Append не даёт complete; rejected Promise обнаруживается по независимому marker/evidence, даже если узел активен. 2^53±1 проверяет честность точности, Linux Atomics не подменяется. | `programming-javascript:help-01`, `programming-javascript:help-11`, `programming-javascript:help-12` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `programming-javascript:s1` — Код, фиксированные таблицы и базовый API. Требования: `programming-javascript:r01`, `programming-javascript:r02`.
- `programming-javascript:s2` — Динамическая схема и typed variables. Требования: `programming-javascript:r03`, `programming-javascript:r04`. После: `programming-javascript:s1`.
- `programming-javascript:s3` — Модули, Calc, сеть и File Storage. Требования: `programming-javascript:r05`, `programming-javascript:r06`, `programming-javascript:r07`, `programming-javascript:r08`. После: `programming-javascript:s2`. Среда: Изолированные JS-module/HTTP/FS fixtures.
- `programming-javascript:s4` — Асинхронные отказы и platform boundaries. Требования: `programming-javascript:r09`. После: `programming-javascript:s3`. Среда: Проверки Windows/Linux на закреплённых движках.

## Заметки черновика

Оперативное уточнение владельца от 2026-10-02: этот узел **уже разрабатывается**. Продолжать существующую карточку; указанный выше SHA описывает базу исследования, а не HEAD активного исполнителя. ID карточки, текущий stage, рабочий SHA и evidence пока не сверены. Перед отдельным назначением общего редактора, oracle или других prerequisites проверить, что уже входит в текущую разработку JavaScript. Начало работы не меняет readiness и не доказывает реализацию всей матрицы.

Необязательные несколько табличных входов и переменные → один/несколько табличных выходов. Код исполняется движком Loginom; backend Node.js и runtime handler не должны вычислять результат вместо узла.

Матрица: Windows/Linux; table schema static/dynamic; 0/1/2 inputs и 1/2 outputs; data/variables API; ES6/CommonJS; Calc/global/Console; Fetch/FS. Это покрытие интерфейсов узла, не доказательство правильности всех возможных пользовательских JS-программ.

Таблица A из 4 строк (id,amount,text,flag,date), независимая B из 2 строк, переменная factor=3; вручную рассчитанные amount×3 и второй агрегатный выход. Отдельные файлы ES6/CommonJS с функцией x+7, изолированные HTTP ledger/FS fixtures. Скрипт является частью business input; expected скрыты от модели.

Preview выполняет код и активирует входы, поэтому file/network effects учитываются до preview. Не переписывать ошибочный пользовательский алгоритм ради PASS. Lost reply требует проверить effect ledger; Promise rejection без ошибки узла не считается успехом.
