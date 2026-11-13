# Полный Fetch/FS: предложение приёмки LAB-1549

Этап 0, не автономный PASS. Нативные пробы выполняются в обычном UI своей пары;
обработчик по-прежнему отклоняет Fetch/FS. Runtime, каталог run-check и его
транспорты не менялись. Владелец утверждает критерии до реализации.
Предыдущий комплект `../fetch-fs` остаётся историческим; этот комплект использует
управляемый fixture и расширенную FS-матрицу вместо httpbin в приёмке.

## Параметры и разделение данных

Проверяющий назначает каждому прогону новые профиль, чат, пакет, собственный
FS_ROOT и namespace fixture. `FIXTURE_BASE_URL` — полный data prefix
`http://<назначенный-host>:<port>/runs/<уникальный-run-id>`; TLS-вариант —
`FIXTURE_TLS_BASE_URL`. Ни адрес LAN, ни httpbin в ожидаемые результаты не зашиты.
До запуска подставляются фактические URL, `FS_ROOT`, `PACKAGE_PATH`.
Назначение localhost допустимо только внутри VM самого сервера Loginom, а не
на машине CLI. Развёртывание выполняет владелец по [спецификации](../../fetch-fs-http-fixture.md).

Модель получает только task, назначенные пути/URL и явно указанные ниже
пользовательские файлы. Не передавать ей README, oracle.py, expected/external,
proposed-node-card, errors.json, orders.json, документы исследования или JS проб.
orders.json/errors.json — независимые данные проверяющего для настройки службы,
не ответы для подстановки в программу. Весь каталог fixtures не прикладывать.

| Случай oracle | Задание в acceptance/ | Данные модели / подготовка проверяющего |
|---|---|---|
| fetch-get | task-fetch-controlled.md | только адрес; служба отвечает orders.json |
| fetch-update | task-fetch-controlled-update.md | продолжение того же узла, скидка 10%, новый ledger namespace для явного Execute |
| fetch-content | task-fetch-content.md | служба отдаёт байты input/utf8.txt и input/bytes.bin |
| fetch-errors | task-fetch-controlled-errors.md | HTTP/TLS base, slow=3000 мс, abort target=100 мс |
| fetch-submit | task-fetch-submit.md | только submissions.json, три исходные JSON-строки без изменения байтов |
| fetch-methods | task-fetch-methods.md | только адрес; сообщения заданы в пользовательской задаче |
| fetch-redirects | task-fetch-redirects.md | три перехода на /orders, ledger содержит все шесть hop |
| fs-read | task-fs-read-full.md | input/ заранее доставлен в FS_ROOT/input, исходные файлы не менять |
| fs-write | task-fs-write-full.md | новый пустой FS_ROOT/output |
| fs-operations | task-fs-operations-full.md | новый пустой FS_ROOT/operations |
| fs-errors | task-fs-errors-full.md | собственные keep.txt=KEEP и denied.txt с mode=0, missing.txt отсутствует |
| fs-path-present / fs-path-missing | task-fs-paths-full.md | saved → физический move без sidecar → отдельная доставка sidecar; один исходник |
| combined | task-fetch-fs.md | FS_ROOT/output и свежий namespace, /reports принимает точные CSV-байты |

`denied.txt` создаётся только проверяющим в собственном тестовом каталоге через
наблюдённый FileHandle с mode=0; подтвердить отказ чтения перед приёмкой.
Его удаляет создавший проверяющий, не меняя права чужих объектов. Если права
стенда дают читать mode=0, fixture непригоден для этого случая, а expected не
меняется. Отказ на собственном файле не является доказательством изоляции от
чужого хранилища или обходов через ссылки.

## Oracle и независимые свидетельства

`expected-*.json` имеют прежнюю форму nodes/outputs, label_any и полный
упорядоченный результат. Дополнительные HTTP/FS условия находятся отдельно
в `external-*.json`: штатный matcher не должен молча игнорировать новые поля.
`oracle.py` использует Python stdlib, Decimal, codecs и байтовые операции,
не исполняет Loginom, JS или HTTP. Для FS read исходные файлы вычисляют ожидаемые
таблицы; для FS write/operations и отчёта байты получаются из независимого
пользовательского условия. Actual не используется при построении expected.

```sh
python3 oracle.py --check --self-check
python3 oracle.py --case fs-write --downloaded-files DOWNLOADED --inventory SERVER_INVENTORY.json
python3 oracle.py --case combined --base-url http://fixture:18080/runs/RUN --ledger LEDGER.json --downloaded-files DOWNLOADED --actual-table TABLE.json
python3 oracle.py --case fetch-errors --base-url http://fixture:18080/runs/RUN --ledger LEDGER.json --actual-table TABLE.json --tls-handshakes TLS_HANDSHAKES.json
```

Примеры выполняются проверяющим из этого каталога, не моделью. `--check`
пересчитывает все 14 таблиц и 14 внешних контрактов; `--self-check` проверяет
отказ на лишнем POST, пропавшем запросе, неверном теле, испорченных байтах и
подмене NULL/Boolean. `--write-expected` — только авторский пересчёт предложений
после изменения пользовательских данных, не способ исправить провал actual.

TABLE.json — нормализованный полный typed результат уже существующего чтения:
`{"columns":[{"name":"ID","type":"string"},{"name":"Amount","type":"real"}],"rows":[{"ID":"A","Amount":37.5},...]}`.
Схема и порядок точные; real abs=1e-9/rel=1e-10, NULL отличается от пустой
строки, Boolean от Integer. Это offline oracle для предоставленного артефакта,
не новый reader или гарантия подлинности выгрузки.

DOWNLOADED содержит только перечисленные в external файлы со структурой
подкаталогов; лишние файлы/папки и ссылки отклоняются. Файлы скачиваются отдельно
через штатный Files UI, до и после cold. Для fs-errors скачивается только
keep.txt, содержимое закрытого denied.txt не требуется. SERVER_INVENTORY.json —
независимо снятый полный список собственного каталога, строки
`{"path":"archive/final.bin","kind":"file"}`; он учитывает также denied.txt
и пустые/лишние папки. Наличие локальных скачанных файлов не доказывает
отсутствия серверного мусора: inventory и cleanup нужны отдельно.

LEDGER.json — полный admin ledger данного run в порядке sequence. Oracle
проверяет число, метод, path/query, SHA-256 и длину сырых тел, Content-Type и
allowlist заголовков. Digest вычисляется при проверке из body_hex, а не хранится
как похожий на секрет литерал. Redirect hops — отдельные запросы. TLS происходит
до HTTP и проверяется отдельным admin handshake-журналом выделенного listener;
нужны и нативный отказ сертификата, и независимое событие fixture.

Для каждого явного Execute используются отдельные ledger snapshot/reset и
ожидаемая дельта. configure/source-read/Next/Done должны иметь пустую дельту
эффектов. Cold Execute с POST назначается явно на свежем namespace; исходник
и бизнес-параметры пакета при этом не переписываются — namespace fixture можно
сбросить на том же URL после завершения прошлой операции. Идентичные итоговые
байты файла сами по себе не доказывают отсутствие повторной записи: нужны
наблюдения фаз и отсутствие повторного Execute в журнале обработчика.

## Матрица технических критериев этапа 1

Бизнес-сценарии не диктуют модельному коду конкретные API. Адресные тесты и
нативные пробы дополнительно обязаны покрыть следующие формы реализации:

| Область | Проверки |
|---|---|
| Module policy | только три built-ins; полный effective source new/existing/change/read/continuation; прежние отказы dynamic import/require/Calc/прочим specifier |
| Fetch API | Headers get/set/append/delete/iteration; Request/Response constructors; text/json/arrayBuffer, clone до чтения, bodyUsed и отказ повторного чтения |
| Fetch lifecycle | fulfilled 404/500, malformed JSON, caught/unhandled rejection, console.error без false success, delayed connect abort, ручной Stop и late callback |
| HTTP effects | GET/POST/PUT/PATCH/DELETE/HEAD, redirects 301/302/307 follow/manual/error; отдельная проверка сохранения тела POST при 307; ledger всех hops |
| FS data | path/FileHandle, string/ArrayBuffer/ArrayBufferView, read/write/append; readSync positional/options, writeSync string/binary, offset/length/position, EOF, close/finally/closed handle |
| FS metadata/dirs | stat/fstat/lstat, size/types/валидные Date, readdir строками/Dirent, mkdir/rmdir/rm recursive/force; без предположений о порядке listing |
| FS operations | copy overwrite/exclusive/FICLONE/FICLONE_FORCE, rename, truncate/ftruncate shrink/extend/default, unlink; partial destination после ошибки |
| FS flags/encoding | r/r+/rs/rs+/w/wx/w+/wx+/a/ax/a+/ax+/as/as+, numeric flags/mode; utf8/utf-8/utf16le/ucs2/ucs-2/latin1/binary/cp1251/iso-8859-1, BOM, invalid encoding, missing/permission/exclusive errors |
| Paths/zero-input | source без входа, saved/unsaved, Save As и физический move, missing sidecar и отдельная доставка; без source replacement при cold |
| Regression | прежние builtIn/Data, code/declared, new/existing, исходник/связи/mappings; соседние узлы не меняются |

Native COPYFILE_FICLONE_FORCE отказал на исследованном сервере: требуется
корректно сохранить этот отказ и частичный файл, а не обещать поддержку
принудительного clone. Аналогично timer abort — цель отмены запроса, не
доказательство строгого срока сетевого connect.

После реализации: обязательные path-based проверки, полные затронутые пакеты,
run-check start→wait одним foreground вызовом, полный CSV/Save/cold/cleanup,
≥2/3 исполнителя и 2/3 независимой пары на одном SHA. Oracle/план не отправляются
модели. Public httpbin/badssl остаются только discovery; они не дают ledger,
контроль TLS и воспроизводимые управляемые данные для приёмки полного #69.
