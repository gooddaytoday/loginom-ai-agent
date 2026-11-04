# Fetch и FS: этап 0 для v0.4.1

Исследование LAB-842, 04.11.2026. База и исследуемый runtime:
`origin/v040@a90dcb82dec0c09c0e4835a567268a1db8447216`.
Это предложение объёма и приёмки по [issue #69](https://github.com/gooddaytoday/loginom-ai-agent/issues/69),
не поддержка режима продуктом и не PASS автономной приёмки. Runtime не изменён.
Полный issue, включая материалы и условия закрытия, прочитан; GET не закрывает FS,
отмену, ledger, TLS и весь перечень методов.

## Стенд и границы доказательства

Только `https://app.loginom.ai/app/?testable=true`, Chromium 1246 / Node 24.19.0,
хост mas, worker пары из назначения LAB-842. Готовые pinned ресурсы взяты из
кэша того же SHA; CLI не собирался. Наблюдены Loginom 7.4.2, Enterprise, Linux
(`Session.Version.IsWindows=false`). Чужие пакеты и аккаунты не использовались.
Исследовательский пакет и файлы созданы в собственном `lab842-fetch-fs/`.
Сырые DOM, исходники проб и снимки — во вложении карточки, не в Git.

Это операторское исследование штатного UI. Исходники введены клавиатурой в
редактор, исполнялись сервером Loginom; HTTP из Node/браузера не подменяет
наблюдения. `run-check` с моделью и штатный `cold-check` не запускались:
текущая политика отвергает эти импорты, критерии нового поведения ещё не утверждены.
Cold ниже означает отдельный профиль браузера, открытие сохранённого пакета,
Execute и чтение выхода, без повторной вставки кода; это исследование, не
регламентные 2/3 + 2/3 на будущем SHA.

## Где выбирается и что меняется

Палитра: `MF;TF-1;ModelForm;colVendors_Компоненты>Программирование>JavaScript;TreeText`.
Перетаскивание создаёт обычный JavaScript. На графе наблюдены
`Graph;JavaScript;Input_Data-0`, `Input_Var-1`, `Input_Add`,
`Output_Data-0`, `Output_Add`. Вход Data оставлен неподключённым.

Мастер открывается через `Graph;JavaScript;Setting`:

1. `WizrdMCF;TuneDataSourceInputPortWizard` — пустые входные столбцы.
2. `WizrdMCF;JavaScriptColumnsWizard;BooleanPropEdit;ValueControl;DisplayEl` —
   «Разрешить формировать выходные столбцы из кода».
3. `WizrdMCF;JavaScriptCodeWizard;pnl` — исходник; Fetch/FS выбираются импортом,
   отдельного переключателя или HTTP/FS-полей нет.
4. После Code Next в исследованном code-режиме — «Описание узла», Done/Execute.

Для проб включён code-режим; столбцы задавались `OutputTable.AssignColumns`.
Выход остаётся обычной таблицей, здесь `Case:String, Value:String`, без
автоматического ErrorCode/HttpStatusCode-порта REST-запроса. И HTTP-коды, и
диагностику программа должна явно обрабатывать. Declared+Fetch/FS отдельно не
проверялся; существующая поддержка declared не доказывает его расширение.

`JavaScriptCodeWizard;btnPreview` открывает `JavaScriptOutputPreviewForm`.
Строки прочитаны по `normalHeaderCt;0_N` / `1_N`. У редактора CodeMirror нет
собственного `data-tid`: наблюдён `.CodeMirror` внутри точного `pnl`; это пробел
разметки, не основание обходить публичную политику.

## Что действительно выполнил сервер

| Проба | Наблюдено | Доказательство во вложении |
|---|---|---|
| Импорт Fetch | `fetch`, `Headers`, `Request`, `Response`, `AbortController` — функции | `02-fetch-zero-input.txt:10` |
| GET JSON без входа | `/anything?RequestId=lab842-discovery&Key=Alpha`: status=200, ok=true, args совпали, method=GET, User-Agent=`Loginom/7.4.2`, bodyUsed=true | `02-fetch-zero-input.txt:18` |
| Асинхронное завершение | строка `get` записана после `await fetch` и `await json` внутри async IIFE; Preview показал её в результате | тот же DOM |
| HTTP 404 / 500 | Promise fulfilled, `ok=false`, status=404/500, пустой `text()` | `03-fetch-errors.txt`, строки `http-404`, `http-500` |
| Malformed JSON | `/html` + `json()` → `SyntaxError`, `JSON.parse Error: Invalid character at position:1` | там же, `malformed` |
| Caught rejected Promise | `Error: LAB842_REJECT`, обработчик catch продолжил выполнение | там же, `rejected`, последняя строка `finished=true` |
| Timeout через abort | таймер 100 мс, `/delay/3`: `AbortError`, `signal is aborted without reason`, signal.aborted=true; clearTimeout в finally | там же, `abort` |
| Redirect follow | `/redirect-to` → `/anything`: status=200, redirected=true, args.RequestId=`lab842-redirect` | там же, `redirect` |
| clone / binary / consumed | clone.arrayBuffer — непустой ArrayBuffer; оба bodyUsed=true; повторное чтение → TypeError `body already used` | там же, `redirect`, `consumed` |
| Unhandled rejection | Preview: «Не обработанная ошибка Promise», `LAB842_UNHANDLED`; после явного Execute такой же toast с `<main>:7:43` | `05-unhandled.txt`, `06-execute-unhandled-dom.json` |

Все async-пробы использовали функцию `async`, не top-level await. Наличие
импортированного конструктора не доказывает все его перегрузки. Отмена запроса
таймером не доказывает отмену узла пользователем, остановку удалённого запроса
или отсутствие позднего callback. Встроенный сетевой timeout, TLS-ошибка,
redirect manual/error, отмена узла и потерянный ответ пока не проверены.
Текст класса ошибки наблюдён, но будущая приёмка не должна привязываться к
локализованному сообщению или номеру позиции JSON-парсера.

## FS: реальные операции и пути

Все операции — только в собственном `lab842-fetch-fs/`. Импортированные функции
синхронны; браузерные/Node API не использовались. `04-fs.txt`:

| Операции | Результат |
|---|---|
| mkdir / exists / realpath / readdir | собственный каталог создан; список собственных файлов прочитан |
| writeFile / appendFile / readFile, utf8 | `Привет, Ёж\n42`, stat.size=21 байт |
| binary writeFile / readFile | readFile без encoding вернул ArrayBuffer; точные байты `[0,1,127,128,255]` |
| open / writeSync / close | бинарная запись через дескриптор вернула 5; закрытие в finally |
| copy / rename / truncate / unlink | копия переименована, усечена до `[0,1,127]`, удалена |
| missing read | `Error: No such file or directory` в собственном каталоге |
| обе формы writeSync / readSync / fstat / ftruncate | строковая запись `ABC` вернула 3; дескриптор — object; чтение 3 байт `[65,66,67]`, усечение до 2 |
| lstat / Dirent / utf16le / rm / rmdir | isFile=true, isSymbolicLink=false; UTF-16LE `Ёж` без BOM — `[1,4,54,4]`; созданные scratch-файлы и каталог удалены |

Дополнительные формы наблюдены в `12-extra-fs.txt`; закрытие несохранённой
исследовательской правки восстановило точный прежний source (`13-source-restored.json`).
Это покрытие перечисленных форм, не всех overload/flags/encodings.
Каждая форма, флаги, ошибки и кодировки всё равно должны получить самостоятельный
бизнес-случай до полного r08; операторская проба не заменяет приёмку.
Permission denied не проверялся: назначенная пара не даёт изолированного
каталога с гарантированным отказом. Заходить в чужие папки ради этого нельзя.

Пути (`07-unsaved-paths.txt`, `08-saved-paths.txt`, `11-cold-execute-output.txt`):

- В несохранённом пакете `realpathSync(".")` — личный корень пользователя;
  `./utf8.txt` отсутствует, чтение даёт missing.
- После Save As в `lab842-fetch-fs/lab842-paths.lgp` тот же исходник без правки
  разрешает `.` в каталог пакета; `./utf8.txt` найден, строка прочитана точно.
- После logout, закрытия Chromium и входа с новым профилем пакет открыт с диска,
  запущен через `Graph;JavaScript;Launch`; выход прочитан через
  `ModelForm;PreviewWindow;PreviewForm;DataSetForm`. Значения и база пути совпали.
- Затем сохранена копия через Save As в собственный подкаталог `relocated/`,
  без изменения source и без копирования sidecar. Execute: `.` указывает уже
  на `relocated/.`, relativeExists=false, чтение даёт missing
  (`14-relocated-without-sidecar.txt`). Это перенос расположения через Save As,
  не файловый move и не отдельный cold-круг перемещённой копии.

Подтверждён только доступ к собственным путям. Серверный абсолютный путь
относится к UserStorage, а не произвольному пути ОС — это контракт
[File Storage API](https://help.loginom.ru/userguide/processors/programming/java-script/fileapi.html)
и справочника узла; полный набор разрешённых корней и permission-границы
экспериментом не установлен. Сохранение пакета не делает внешний файл доступным
в другом каталоге: в наблюдённой копии sidecar не обнаружился автоматически.
Cold-круг перемещённой копии, её перенос файловой операцией и восстановление
с отдельно доставленным sidecar остаются отдельными случаями этапа 1.

## HTTP-источник и ограничение ledger

Используем существующий `https://httpbin.org`: `/anything` (стабильные args),
`/status/404`, `/status/500`, `/html` (не JSON), `/delay/3`, `/redirect-to`.
Запросы идут последовательно, только искусственные значения, без секретов.
Из expected исключены origin, Date, полный набор headers и форматирование тела.

Это тот же echo-подход, который утверждён в LAB-820, решение от 04.11
(`01a1a6b0-88f3-77b5-a929-d4d13bd53ce0`): проверять фактические args, без нового
сервиса. `/anything` управляет содержимым ответа, но не даёт серверный ledger
запросов. RequestId позволяет связать ответ с попыткой, не доказать отсутствие
дублей. Issue #69 требует ledger и TLS; они остаются открытыми. Нельзя выдавать
echo за ledger или объявлять весь #69 выполненным по первому GET.

## Причина ограничения и минимальные срезы

Наблюдение UI выше отделено от анализа кода той же базы:

- `javascript-module-policy.mjs`: только `builtIn/Data`; Fetch/FS отвергаются с
  `module_specifier`. Полный effective source должен проверяться и после
  повторного чтения existing, а не только при передаче нового кода.
- `javascript-parameters.mjs:20`: для new обязательно ровно одно табличное
  соединение. Источник без входа требует отдельного допуска.
- `javascript-code-node.mjs:144–159,235`: input mapping обязан иметь непустые
  source/target fields; openWizard требует inputMapping.
- `javascript-code-node.mjs:68–83`: readback требует input mapping и ДВА разных
  completed execution — materialization и final. Это реальная потенциальная
  причина повторных HTTP/FS-эффектов, не просто ошибка allowlist.

Один цикл ниже — минимальная правка → проверки затронутых путей → бизнес-прогон
по регламенту; независимая приёмка и её повторы добавляются отдельно.

| Срез v0.4.1 | Минимальный результат | Циклы / ориентир строк с тестами | Можно принять отдельно |
|---|---|---|---|
| F1 GET JSON → таблица, 0 inputs | один источник, code schema, stable args; existing patch; CSV/Save/cold | 2–3 / 180–320 | да, после утверждения zero-input и допустимых повторов GET; не закрывает #69 |
| F2 errors / abort | статус не равен rejection; явный результат ошибок, native unhandled failure; abort без поздней записи; redirect/body API | 2–3 / 150–280 | после F1; отмена узла/unknown effects отдельно, если потребуют общих изменений |
| R1 FS чтение | только заранее доставленные собственные файлы; UTF-8/binary, missing, saved/cold paths | 2–3 / 160–280 | да, без допуска FS записи; одно разрешение всего FS не обеспечивает такое разделение |
| W1 FS запись | явные разрешённые эффекты, byte audit, повтор/unknown outcome, cleanup; append/descriptor/metadata/каталоги | 3–5 / 250–500 | после утверждения file-byte приёмки и lifecycle, независимо от остальных FS методов |

FS module namespace содержит запись и удаление: импорт readFileSync сам по
себе не делает произвольный код read-only. Если R1 публикуется раньше W1, нужно
явно ограничить разрешённый синтаксис/экспорты и сформулировать границу такой
политики; AST-фильтр не является security sandbox. Иначе R1+W1 выпускать вместе.

Кандидаты файлов этапа 1: `client/lib/javascript-module-policy.mjs`,
`javascript-parameters.mjs`, `javascript-code-node.mjs`,
`javascript-managed-source-adapter.mjs`, `javascript-source-admission.mjs`,
`javascript-execution-continuation.mjs`, тесты `javascript-*.test.mjs`;
знания `packages/product/skills/loginom-automation/references/nodes/programming.javascript.md`.
По необходимости — существующие `node-api.mjs`, `node-result-schema.mjs`,
`node-contracts.mjs` для аддитивного описания zero-input/readback.
Новых модулей runtime пока не предлагается. Одной правки allowlist недостаточно.

Общие execution/cancellation, публичный контракт и бюджеты в этом PR не меняются.
Если zero-input невозможно добавить в локальной ветке JS, либо требуется
изменить общую обработку неизвестного эффекта, это отдельный stop с вопросом.

## Предлагаемая приёмка и точки решения владельца

Комплект: `acceptance/task-fetch-get.md`, `task-fetch-errors.md`,
`task-fs-read.md`, `task-fs-write.md`; маленькие `fixtures/fetch-fs/`;
`acceptance/fetch-fs/oracle.py` и раздельные expected. Oracle использует только
Python stdlib и fixtures, не исполняет Loginom JS и не читает actual для
построения expected. Oracle/expected/план никогда не передаются модели.

F1 и R1 используют прежний полный CSV/typed cold путь. Задача, исходные файлы
и разрешённый путь пакета — единственный модельный вход. Схема, каждая клетка,
порядок, типы, Save, cold rerun без reconfigure, cleanup; ≥2/3 исполнителя и
2/3 независимой проверки на одном SHA. `label_any` для незаданных меток.
Создание и изменение existing должны иметь отдельные бизнес-прогоны.

F2 table expected проверяет обработанные статусы/ошибки. Отдельно обязательны
необработанный rejection как failed execution, отмена узла, отсутствие поздних
записей и запрет автоматического retry неизвестного эффекта: CSV сам этого не
доказывает. В W1 полная таблица-квитанция не заменяет независимые скачанные
байты файлов, остаточный список каталога и закрытые дескрипторы. Функция
`verify_written_files` — предложение oracle для уже скачанных файлов; она не
добавляет новый downloader или путь cold в runtime.

Нужно решение владельца до handler: принять F1 отдельно с echo вместо ledger,
согласовать zero-input/readback и правила materialization для внешних эффектов;
утвердить независимую FS byte-проверку и lifecycle-критерии F2/W1 сверх
стандартного табличного matcher. Пока это не утверждено, этап реализации
заблокирован. Сервис с ledger не разворачивать.

## Модельные бюджеты

Замер базы: `node --test test/model-schema-budget.test.mjs` из client, 45 тестов,
exit 0. Старый тест разрешает JS-исключение 20 000 Б; это не отменяет заданные
в LAB-842 **12 000 Б** для карточки типа.

| Объект | Реально сейчас, UTF-8 Б | Лимит назначения |
|---|---:|---:|
| compact apply (`model_tool_bytes`) | 13 331 | 20 000 |
| полный input schema, модели не передаётся | 53 748 | нет |
| карточка `programming.javascript` | 16 318 | 12 000 |
| SKILL.md | 38 215 | 40 000 |
| строка маршрутизации JS | 156 | около 200 |
| reference узла | 1 769 | 6 000 |

Для режима предложено не добавлять ветку параметров, а расширить семантику
существующего script и ссылочный файл. Точный текст и воспроизводимый замер
предложения — `knowledge-proposal.md`. Реальные post-change байты можно
утверждать только после реализации и повторного schema-budget теста. Уже сейчас
карточке требуется сокращение минимум на 4 318 Б; это работа этапа 1,
не причина останавливать docs-этап 0 и не разрешение поднять бюджет.

Источники API:
[Fetch API](https://help.loginom.ru/userguide/processors/programming/java-script/fetch-api.html),
[File API](https://help.loginom.ru/userguide/processors/programming/java-script/fileapi.html),
локальный `references/js_node_loginom_system_prompt.md`, исторические
`research.md`, `module-policy-design.md`, `execution-effects.md`.
Справка задаёт дальнейшую матрицу, живые наблюдения выше подтверждают только
названные формы на указанном стенде.
