# Fetch/FS: нативная матрица LAB-1549 и план реализации

13.11.2026, mas3; база `v040@8b6462aaf26bb7767089f77a6203a8e224ac5d58`.
Продолжение после принятой владельцем [LAN-пробы](fetch-fs-lab1549.md).
Исследование только `https://app.loginom.ai/app/?testable=true`, своей
worker/reviewer пары. Дополнительные пробы — worker в новом профиле и новом
каталоге `lab1549-fs-20261113-b` внутри назначенного хранилища.
Chromium 1246 / Node 24.19.0, headless: DISPLAY отсутствует. Runtime/skill
не изменены, CLI не собирался. Это наблюдение 7.4.2, не автономная приёмка.

## UI, схема и отсутствие табличного входа

Палитра `MF;TF-N;ModelForm;colVendors_Компоненты>Программирование>JavaScript;TreeText`.
Нативный узел имеет `Graph;JavaScript;Input_Data-0`, `Input_Var-1`,
`Output_Data-0`; никаких связей к входам не создавалось. Мастер:
`WizrdMCF;TuneDataSourceInputPortWizard` (пустой) → JavaScriptColumnsWizard →
JavaScriptCodeWizard. Code schema задаётся
`JavaScriptColumnsWizard;BooleanPropEdit;ValueControl;DisplayEl`, редактор имеет
собственный `JavaScriptCodeWizard;cmpCodeCM`. Fetch/FS задаются импортами:
новых HTTP/FS полей или портов не появляется.

Все пробы использовали code schema `Case:String, Value:String`; InputTable
без соединения — undefined. Выход обычный табличный, без автоматически
созданных status/error-портов. Declared+Fetch/FS отдельно не сертифицирован.
DOM результата Preview — `JavaScriptOutputPreviewForm;normalHeaderCt;0_N` и
`1_N`; Quick View после Execute — `ModelForm;PreviewWindow;PreviewForm;DataSetForm`.
Префикс вкладки меняется; MF;TF-1 нельзя переносить на другую вкладку вслепую.

## Fetch: что выполнил сервер Loginom

Источник пробы `10-fetch-source.txt`, данные `11-fetch-preview.json`,
консоль `12-fetch-console.json` — во вложении карточки. API импортируется
из builtIn/Fetch; сетевой запрос выполнен JS-узлом, не Node/Chromium fetch.
URL ниже — только public discovery, не источник приёмочных expected.

| Case / строка результата | Наблюдение |
|---|---|
| headers / 0 | append дал `A, B`, get нечувствителен к регистру; set/delete/has и entries отработали |
| request / 1 | Request POST с Headers/JSON body; clone до чтения, text оригинала и json копии совпали; bodyUsed false→true |
| response / 2 | Response status=201/ok=true; json.value=7, clone.arrayBuffer hex `7b2276616c7565223a377d`; повторное text → TypeError `Failed to read body: body already used` |
| get-json / 3 | httpbin `/json`: 200/ok=true, `Sample Slide Show`, bodyUsed=true |
| get-404 / 4; get-500 / 5 | `/status/404`, `/status/500`: fulfilled, соответствующий status, ok=false, text пуст |
| malformed-json / 6 | `/html` + json(): SyntaxError `JSON.parse Error: Invalid character at position:1` |
| redirect-2 / 7 | `/redirect/2` → `/get`, 200, redirected=true; серверный User-Agent `Loginom/7.4.2` |
| redirect-307 / 8 | `/redirect-to?url=%2Fjson&status_code=307` → `/json`, 200, redirected=true |
| redirect-manual / 9 | `/redirect/2`, manual → status=302, redirected=false, Location `/relative-redirect/1` |
| redirect-error / 10 | тот же URL, error → Error `Failed to fetch: redirect` |
| binary-clone / 11 | `/bytes/5?seed=1549`: ArrayBuffer 5 байт, hex `583d0955ed`; clone.text — string, оба bodyUsed=true |
| post-anything / 12 | разрешённый владельцем POST `/anything`: 200, echo method=POST, точное JSON body и X-Lab-Case=`LAB1549` |
| abort-delay / 13 | `/delay/5?lab=1549`, timer=100 мс → AbortError `signal is aborted without reason`, aborted=true, фактически 243 мс |
| already-aborted / 14 | заранее отменённый signal: тот же AbortError, 0 мс |
| tls-self-signed / 15 | self-signed.badssl.com: Error `Ошибка при выполнении HTTP запроса. TCP/IP Socket error -2: No such file or directory`, 6895 мс; причина сертификата не доказана |
| tls-expired / 16 | expired.badssl.com: Error `Ошибка при выполнении HTTP запроса. TCP/IP Socket error -2: Failed to verify SSL connection, X509_v error: certificate has expired`, 726 мс |
| promise-resolve / 17 | await Promise.resolve → settled |
| promise-reject-caught / 18 | catch получил Error/LAB1549_REJECT, исполнение продолжилось |
| finished / 19 | true после всех await; console.error остался сообщением консоли, не отменил таблицу |

Это покрывает указанные методы/формы, не все перегрузки Fetch. POST через 307,
транспорт тела ArrayBuffer и корректность callbacks после Stop требуют
отдельных адресных сценариев этапа 1. Public echo не доказывает отсутствие
дубликатов запросов; случайные bytes/время/IP/httpbin headers не входят в oracle.
Задержка abort в первой LAN-пробе была 134960 мс при timer=15000: нельзя
обещать строгую границу wall-clock connect по одному AbortController.

## Наблюдаемый async исход

Всё await выполнялось внутри async IIFE, top-level await не проверялся.
`console.error("LAB1549_CONSOLE_ERROR")` + finished=true отдельно выполнен
через Code → Next → Execute: выходной порт остался active. DOM/граф и снимок —
`13-console-error-source.txt`, `14-console-error-executed.json`,
`14-console-error-graph.json`. Active-порт — факт UI, не доказательство
отсутствия диагностических ошибок.

Необработанный Promise.reject отдельно дал Preview с ошибкой и toast
«Не обработанная ошибка Promise», `LAB1549_UNHANDLED`, `<preview>:3:1`
(`15-unhandled-source.txt`, `16-unhandled-preview.json`). После явного Execute
`Graph;JavaScript;Status` сохранил диагностику: click открыл
`msgbox-1;cnt;cnt;MessagesView` с тем же сообщением и `<main>:3:1`
(`19-unhandled-main-details.json`). Поэтому итог должен учитывать собственную
async-диагностику, а не только заполненные ячейки/цвет узла/порта.
Потерянный ответ, server Stop и поздние callbacks в этой части не принимались;
это обязательные критерии [контракта](fetch-fs-contract.md) на этапе 1.

## FS: данные, дескрипторы, метаданные и ошибки

Все изменения ограничены собственным каталогом. Первый source отказался бы
работать при существующем корне; повторных запусков создающего source не было.
`01-fs-source.txt` → `02-fs-preview.json`, строки 0–36; добавочные формы —
`08-fs-extra-source.txt` → `09-fs-extra-preview.json`, строки 0–34.

| Группа | Подтверждённые операции и фактический результат |
|---|---|
| path read/write/append | UTF-8 `Привет, Ёж\n42`, затем LF/€; readFileSync строковой/object encoding вернул точный текст, без encoding — ArrayBuffer, 25 байт |
| binary | writeFileSync ArrayBuffer и Uint8Array → `00017f80ff`; appendFileSync view/buffer → `0001020304` |
| descriptor | openSync w+ → FileHandle object, valueOf number; writeSync string=3, binary buffer range=3; readSync offset=2/length=3/position=1 → `0000017f80000000`, count=3 |
| descriptor forms | writeSync Uint8Array=3, readSync ArrayBuffer=5; options-form readSync дала `00017f800000`; writeFileSync(fd, view), appendFileSync(fd, string), readFileSync(fd, encoding) отработали |
| truncation | ftruncate 4→2→5 → `4101000000`; truncate(path,3) → `00017f`; truncate/ftruncate без len → 0 |
| string position | patch `abc` в позиции 1 + append → `aZc!`; writeSync `abcd`, затем Z с position=-2 → `abcdZ`, size=5 (не предполагать относительный offset от EOF) |
| lifetime | close в finally; fstat закрытого FileHandle → `Specified FileHandle is not valid` |
| metadata | stat/fstat/lstat: size, file/dir/link, mode, atime/mtime/ctime/birthtime валидные Date; отсутствующий stat/lstat с throwIfNoEntry=false → undefined |
| listing/dirs | mkdir recursive, readdir строками и Dirent, isFile/isDirectory/isSymbolicLink; rmdir пустого и recursive, rm recursive и force для missing |
| copy/rename/delete | copyFileSync, переименование, truncate, unlink; COPYFILE_EXCL по существующему назначению → `File exists`; обычный copy перезаписал назначение точными исходными байтами |
| clone modes | COPYFILE_FICLONE дал копию; COPYFILE_FICLONE_FORCE → `Operation not supported on transport endpoint`, но **оставил clone-force.bin**; ошибочный эффект не следует автоматически повторять |
| encoding | utf8/utf-8 → `d081d0b6`; utf16le/ucs2/ucs-2 → `01043604`; cp1251 → `a8e6`; latin1/binary/iso-8859-1 для Aé → `41e9` |
| BOM | UTF-16LE → `fffe01043604`, UTF-8 → `efbbbfd081d0b6`; writeBOM=false — без префикса |
| invalid encoding | win1251 и not-an-encoding → `Unsupported encoding`; правильное имя — cp1251 |
| flags | r/r+/rs/rs+ сохранили ABC; w/w+ обнулили перед записью Z; a/a+/as/as+ дали ABCZ; wx/wx+/ax/ax+ создали отсутствующий файл и отказали при повторном exclusive open |
| numeric flags/mode | O_CREAT\|O_RDWR с 0o600, запись через FileHandle и fstat; constants доступны по именам, Object.keys(constants) пуст |
| errors | missing → `No such file or directory`; write через r-дескриптор → `Failed to write file: Bad file number`; wx не заменил прежние байты |
| permission | свой новый файл mode=0 дал stat.mode=32768 и `Permission denied`; затем удалён создавшим кодом. Чужие пути не проверялись |

Принудительный clone не поддержан на исследованном storage. Это ожидаемый
нативный отказ конкретной операции, не отсутствие модуля FS. Изоляция от чужих
путей и ссылки не исследовались; произвольные корни ОС не разрешаются.

## Saved, unsaved, Save As и физический перенос

Один readonly source (`03-path-source.txt`) читал `sidecar.txt` по относительному
имени, выводил realpath("."), exists и текст/ошибку. Результаты:

| Пакет | База пути / sidecar | Evidence |
|---|---|---|
| Несохранённый | личный корень; собственного sidecar.txt там нет, missing | 04-path-unsaved.json |
| Save в собственный тестовый каталог | каталог пакета; exists=true, LAB1549_SIDE | 05-path-saved.json |
| Save As в moved/ без sidecar | moved/; exists=false, missing; source не переписан | 06-moved-code.json, 07-path-moved-saveas.json |
| Реальное rename копии | paths-moved.lgp → paths-renamed.lgp, тот же каталог; native before/after list | 20-move-source.txt, 21-move-preview.json |
| Физический move оригинала через Files Cut/Paste | из тестового корня в moved/paths.lgp, пакет был закрыт; после открытия с диска в новом профиле явный Launch → Quick View: moved/, false/missing | 22-fs-files-inventory.json, 23-physical-move-files.json, 24-physical-move-cold-output.json |
| Отдельно Copy/Paste sidecar в moved/ | прежний LGP/source, явная deactivation→Launch: moved/, true/LAB1549_SIDE | 25-sidecar-delivered-files.json, 26-path-with-sidecar-output.json |

Новый профиль был создан до физического move; сохранённый LGP открывался с диска,
исходник не вводился заново. Это нативная cold-проба путей, не штатный cold-check
автономной приёмки. Save/Save As создавали также собственные `.~lgp` backup;
их учитывать в cleanup и не выдавать за автоматически упакованный sidecar.

## Независимая проверка файлов

Собственный каталог скачан штатной командой Files → «Скачать ZIP».
Для download-профиля применён существующий runtime `browserDownloadScript`
до загрузки приложения: его стандартный fallback выключает File System Access
picker в пользу обычной браузерной загрузки, внутренний JS Loginom не менялся.
Архив `native-fs-download.zip` содержит 44 файла: 41 материал с отдельно
вычисленными Python codec/byte-ожиданиями и три собственных LGP/backup.
Все 41 байтовых сравнения совпали; лишних файлов нет. Ошибочный
clone-force.bin действительно имеет длину 0, это проверено независимо от
самоотчёта JS. В двух сохранённых LGP стандартные ZIP/Unit.xml `Engine.Code`
точно совпали с `03-path-source.txt`, без нормализации/замены исходника.
Результат — `27-independent-byte-audit.json` во вложении карточки.
Это операторская независимая сверка артефактов, не автономная CLI-приёмка.
После скачивания собственный тестовый каталог целиком удалён штатным Files UI;
отсутствие строки каталога подтверждено в `29-cleanup-files-ui.json`. Все
собственные Chromium-контексты закрыты. Ни файлов, ни пакетов вне этого
созданного каталога уборка не затрагивала.

## Приёмочный комплект и границы

[fetch-fs-full](acceptance/fetch-fs-full/README.md): 13 бизнес-задач,
14 полных табличных expected и 14 отдельных внешних контрактов; исходные
UTF-8/UTF-16LE/cp1251/binary, orders/submissions; независимый Python oracle
с проверками таблиц, SHA-256/байт HTTP ledger, скачанных файлов и inventory.
Базовые HTTP/TLS URL — параметры. Ни oracle, ни expected, ни исходники проб
не передаются модели. Native-пробы не заменяют 2/3 + 2/3 на будущей реализации.

Спецификация управляемого fixture сохранена, добавлены параметризованные base URL,
/reports для совместного сценария и run-specific TLS listener: handshake нельзя
связать с HTTP path до завершения TLS. Владелец предварительно выбрал localhost
в VM сервера Loginom; доступа к VM пока нет. Public источники не используются
для приёмки и не являются ledger.

## Этап 1: минимальные циклы после утверждения

Один цикл — локальный red→green → обязательные path checks → живой бизнес-прогон
через существующий run-check. Числа — оценка, не обещание реализации за один turn.
FS module содержит все эффекты; не публиковать общий допуск FS до покрытия
записи/ошибок/lifecycle, даже если чтение реализовано раньше.

Это логические срезы, не требование откладывать зависимости: минимальные
zero-input guards и однократный Execute нужны для первой source-задачи.
Их локальные правки переносятся в первый цикл из соответствующих строк ниже
без двойного подсчёта оценки. Фиктивной входной таблицей пробел не обходить.

| Срез | Циклы / строки с тестами | Основные существующие файлы |
|---|---|---|
| GET + policy | 2 / 150–250 | javascript-module-policy, source-admission, source-read, knowledge; полный effective source и прежние отказы |
| Async/errors/diagnostics | 2–3 / 180–300 | javascript-execution-continuation, wizard-error-details, output-preview; собственная unhandled diagnostic, abort/late callback |
| POST и методы, effects | 2–3 / 200–350 | javascript-code-node, managed-source-adapter, managed-done; устранить второй скрытый Execute, ledger всех фаз и unknown outcome |
| FS read/write/bytes | 2–3 / 180–300 | module-policy, source-admission, knowledge; own paths, codecs/flags/descriptors, independent downloads |
| FS directories/operations | 2 / 120–220 | локальные JS lifecycle/diagnostics и tests; partial files, inventory/cleanup, permission |
| Zero-input new/existing | 1–2 / 100–180 | javascript-parameters, javascript-code-node, context-read, managed-source-adapter; отсутствие mapping отличается от пустого input |
| Combined + CLI acceptance | 2–3 / 100–200 | существующие acceptance case data/integration после согласования, regression code/declared/Data; Save/cold/2×2/3 |

Всего **13–18 циклов, ориентир 1030–1800 строк с тестами**. Возможный
аддитивный общий diff — существующие node-contracts/read-result описания
zero-input только для JS; общие execution/cancellation не менять. Если без
неаддитивного изменения общего контракта нельзя — отдельный stop до него.
Основное наблюдённое препятствие кроме allowlist: code lifecycle требует два
различных completed Execute (`javascript-code-node.mjs:71–78,338–363`), что
опасно для POST/append. Простое разрешение импортов полный #69 не закрывает.

## Бюджеты модели по шагам

База: `node --test test/model-schema-budget.test.mjs`, exit 0, 195 PASS:
model_tool_bytes=8051, full_input_schema_bytes=83935 (не отправляется модели).
Карточка JS без mode=14007 Б, с script=17527 Б; старый test exception 20000
не отменяет лимит владельца 12000.

| Артефакт | База, UTF-8 Б | Предложение полного расширения, Б | Предел, Б |
|---|---:|---:|---:|
| compact dock_node_apply | 8051 | 8051, прогноз при прежнем carrier | 20000 |
| full schema, только диагностика | 83935 | 83935, тот же прогноз | нет |
| JS card, script | 17527 | 19225 | 12000 |
| SKILL.md | 33031 | 32989 | 40000 |
| routing без LF | 156 | 114 | около 200 |
| node reference | 3558 | 5077 | 6000 |

Точная предложенная карточка — `acceptance/fetch-fs-full/proposed-node-card.json`,
все hash-поля — 64 нуля. `proposed-sizes.json`, routing и добавляемый текст
reference позволяют повторить текстовый замер. Карточка остаётся выше лимита
на 7225 Б; это пункт этапа 1, не разрешение поднять общий бюджет.

| Шаг | Проверка видимого модели бюджета перед его выпуском |
|---|---|
| GET/policy | сократить JS-specific card до ≤12000; повторить фактические model_tool_bytes ≤20000 |
| Async/errors | повторить тот же wire/card тест после diagnostics knowledge; SKILL ≤40000, reference ≤6000 |
| POST/методы | проверить, что тексты effects не увеличили card сверх 12000; повторить wire measurement |
| FS read/write | измерить card/guide с кодировками и путями, в тех же пределах |
| FS operations | измерить добавку partial-file/cleanup guidance, в тех же пределах |
| Zero-input | carrier уже допускает inputs=[], прогноз apply 8051; перепроверить реальную схему после локальных guards |
| Combined/CLI | финальный фактический wire замер всего расширения, ни один промежуточный PASS его не заменяет |

Ни одна стадия не получает повышенный лимит. Оценки compact/full schema —
прогноз формы, а не измерение будущей runtime-реализации. Здесь измерены только
неустановленные тексты предложения; текущий продуктовый skill не изменён.
