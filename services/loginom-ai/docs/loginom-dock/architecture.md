## RC7 опубликован и установлен — 15 сентября 2026

Исправлена изоляция чатов Hermes и передача вложений. Клиент c63b3b36 / RC7
опубликован, main отправлен после отдельного разрешения; оба Mac-плагина
обновлены, Codex hooks6/6trusted. Desktop и messaging Hermes штатно перезапущены,
оба загрузили native router RC7. Настройки модели и рабочие каталоги сохранены.
Source/Mac1843PASS+1SKIP, Python10PASS, Linux102PASS; живая проверка двух задач
подтвердила изоляцию и доставку. GUI composer после установки ещё не воспроизведён.
Сайт8ad84954/current20260915-rc7-8ad84954 переключён, backend сохранён.
[Полный отчёт, границы и откат](releases/rc7-release-2026-09-15.md).
Ниже сохраняются исторические checkpoints; ожидание выпуска RC7 завершено.

---

## Пользовательский профиль Hermes и локальная диагностика — 10 сентября 2026

Согласованный контракт: [план](../plans/loginom-dock/09-hermes-user-diagnostics.md).
Основной Hermes получает отдельный файл `profiles/hermes-user.json` в Dock home;
диспетчер выбирает его только для `agent=hermes`. Общий `config.json` и настройки
Codex остаются прежними. Профиль закрепляет candidate-каталог, четыре обработчика,
Loginom 7.4.2 и краткие ответы `user-v1`; это не расширение матрицы поддержки.

Первый prepare выдаёт компактный набор схем и правил; повторный использует те же
пины и кеш. Поиск при исправлении ошибки параметров не обязателен. Пользовательский
ответ содержит ссылки, статус, схему, до трёх строк и ограничения точности;
полные результаты остаются локально. Квитанции выполнения не заменяются проекцией.

Native pre-tool hook передаёт непрозрачный билет из явно указанного пользователем
пути. Путь не является параметром MCP: сервер принимает только билет из приватного
host-хранилища, закрепляет его за сессией и проверяет байты существующим artifact
store. Каждая задача получает отдельное имя загрузки и conflict policy reject.

Штатные request hooks измеряют время и токены. Узкий адаптер присутствия счётчиков
добавляет к нормализованной статистике Hermes только два boolean-признака; исходный
ответ провайдера не покидает адаптер и не записывается. Неизвестное значение не
превращается в ноль. Повторные request IDs не увеличивают сумму. Числовой список
метрик проходит redaction, авторизация и системные промпты удаляются.

Новые журналы находятся в `diagnostics/`, не отправляются на сервер, имеют пределы
30 дней / 2 ГБ и 256 МБ на сессию. Активные процессы защищены от очистки; потеря,
обрезка, незавершённый инструмент/запрос отражаются в локальном отчёте. Старые
квитанции `sessions/*/execution-events.jsonl` и очередь архива не очищаются.

Обычный Hermes сохраняет готовый пакет один раз в конце через save_checkpoint;
save_as с переоткрытием остаётся для соответствующего запроса. Точное чтение Table
временно меняет формат и восстанавливает его; обычное чтение сохраняет формат и
явно ограничивает точность. Codex выполняет независимую проверку сохранённого
результата отдельно. Старые правила ниже относятся к исторической приёмке.

---

## Итоговая схема и сокращённое чтение мастера — 10 сентября 2026

Native skill Hermes закрепляет полный выходной mapping с `autosync:false` для
итоговой аналитической таблицы с фиксированным составом полей. При автоматической
синхронизации Loginom может добавить сквозной ключ после переименованного
показателя; полный mapping сохраняет порядок выхода после открытия и выполнения.
Для переменной схемы автоматическая синхронизация остаётся доступна.
Границы package checkpoints — принятый импорт и каждая завершённая ветвь;
локальная квитанция узла не заменяет сохранение пакета.

Сокращённое наблюдение определения узла не обходит всю сетку импорта, но включает
вложенный INPUT активного текстового редактора внутри этой сетки. Он не имеет
собственного `data-tid`, поэтому выбирается через точного владельца редактора.
Ссылка на элемент проходит прежние проверки доступности fill/press; guards
и лимиты не изменены. Runtime
`d1f4e7fe4f9384a885352005591d4bd68e87eca2610b1827080d1de3f458d207`.
[UI-диагностика, автономный опыт и границы поставки](sales-followups-2026-09-10.md).

## Чтение подписи и восстановление графовой фазы — 10 сентября 2026

В source runtime `d023c3ab75c66f2c1ef343a9c87e264d6885f9cdfce3e66a9debc13337daaad9`
имя узла читается из локального `FLabel.FRawValue`, связанного с GUID, ячейкой
и видимым DOM-элементом. Перенос `<br>` и `&nbsp;` относятся к отображению;
`textContent` и обратное преобразование data-tid не восстанавливают точную метку.

`node.apply` подключает фазу target к существующему read-only inspect графа.
После проверки исходной квитанции и графового эффекта журнал подтверждает
`node_target_reconciled`; блокировка остаётся за исходным operation_id.
Только явный resume продолжает узел, повторно проверяя граф/источник и исходный
deadline. Неизвестный эффект или неподтверждённый cleanup не разрешают жесты.
Новых публичных инструментов и схем хранения не добавлено. Восстановление
применяется внутри той же живой сессии; утраченный черновик не воссоздаётся.

[Разбор, живая диагностика, автономная проверка и ограничения](rename-recovery-fix-2026-09-10.md).

## Runtime source identity — 8 September 2026

The client revision now includes every `.mjs` and `.d.ts` file recursively under
`client/lib`, plus explicitly listed CLI/package/plugin inputs. `runtime-pin.mjs`
produces a sorted, deduplicated inventory and rejects source symlinks. Session
metadata retains `clientSourceManifest` with per-file SHA256, in addition to
`clientRevision`. The independent acceptance audit compares this inventory and
its aggregate revision against the checkout. Historical manual inventories omitted
some new delivery/lifecycle modules and do not prove complete source binding;
see the current text-import checkpoint for replacement evidence.

# Loginom Dock: существующие механизмы и целевая архитектура

## Наблюдённые настройки в результате node.apply — 8 сентября 2026

Source-кандидат импорта возвращает `configuration.readback` из принятых квитанций
configure/output_mapping/finish. Это компактная проекция наблюдений источника,
формата, всех настроенных полей и native source→target mapping; входные параметры
не используются для заполнения readback. Общая оболочка вызывает чистую функцию
обработчика после проверенного завершения и сохраняет её результат в checkpoint.
При Close readback применённых настроек отсутствует. Повтор operation ID возвращает
тот же результат без чтения UI или повторного запуска функции проекции.

Значения кодировки и разделителей сохраняют наблюдённое UI-представление. Node ref,
receipt_ids и scope связывают readback с конкретной операцией. Он не содержит DOM
или UI-ref и не доказывает сохранение пакета. Независимый
`node_configuration_evidence.py` сравнивает проекцию с исходными наблюдениями,
проверяет полный проход по страницам полей и native mapping; сохранность пакета
проверяется отдельным save/reopen/reexecute-аудитом. Полный MCP-цикл этой версии
принят в `remote-readback-20260908-222113-70a0533e`; автономный Hermes222819
прошёл30/30. [Полный аудит03](../plans/loginom-dock/03-completion-audit.md).

## Решение 7 сентября 2026 — первый аналитический выпуск

Действующая целевая схема определена в
[каноническом плане](../plans/2026-09-02-loginom-dock-implementation-plan.md#node-level-operations):
агент планирует граф и параметры; локальный клиент выполняет полный цикл одного
узла и возвращает выход; сервер предоставляет знания. Единая операция node.apply
выбирает отдельный обработчик типа на общих UI-драйверах. Массовое предварительное
создание графа и общий recipe interpreter не требуются.

Первый выпуск — восемь аналитических типов. Первый вход в мастер и техническое
recovery включены в локальный цикл. В обычном пути агент проверяет выход без
повторного открытия мастера; roundtrip обработчика и финальная проверка пакета
являются отдельными проверками. Контракты типов загружаются пакетно и кешируются;
неподдержанные режимы используют ограниченный UI-резерв внутри executor.
Сохранение пакета — после импорта, готовой ветви и в конце, локальный checkpoint
— после каждого принятого узла.

Все будущие Hermes-прогоны — openai-codex / gpt-5.6-sol / low.
Локальный контракт подготовки 01 реализован и описан в
[workspace-preparation.md](workspace-preparation.md). Полный node.apply и обработчик
импорта реализованы в source-кандидате подплана 03; текущие независимые проверки
и границы приведены в [checkpoint](resume-checkpoint.md).
Эта целевая схема **ещё не реализована целиком**: ниже описаны существующие
механизмы и датированные итерации. Прежний импортный handler остаётся пилотом
с уже открытым мастером и обязательным Done/reopen/readback. Профиль запуска,
аудит и admission переведены на Sol/low при реализации 01. Приёмка нового черновика
17/17 относится к полному рабочему дереву указанного в контракте runtime,
не автоматически к выделенному коммиту. Драйвер 02 принят отдельно; общая основа03 принята как source runtime, Hermes30/30 PASS.
Весь V1 и первый аналитический выпуск ещё не приняты. Ниже сохранены датированные
сведения о прежних механизмах, которые не заменяют текущий checkpoint.

### Intermediate package persistence (source candidate, 2026-09-08)

`package.save_checkpoint` is a separate local capability. It uses the native
awaited Save As flow with an explicit destination and conflict policy, then
verifies that the same workflow and graph remain open at the exact cached path.
The receipt also exposes bounded `workflow_continuations`, matching the old
and new navigation to the same native package/workflow objects and active tab.
Save As can leave old breadcrumb data-tid values under new captions. A bounded
native parent-module/workflow navigation refreshes these before the next node
operation; old request navigation guards remain strict. File replacement requires
the exact full-path confirmation, and conflict cleanup must be observed complete.
The new `persist` effect contract describes this completed save flow; the existing
`save` effect and `package.save_as` retain their close/reopen obligations.
Unknown saves require the completed browser receipt and are never automatically
repeated. Neither an open-package cache nor a completed menu alone proves saved
settings: dedicated QA closes/opens without resaving, checks the graph and complete
settings baseline, and verifies fresh execution/output. This QA is separate from
the normal intermediate save. See [the source acceptance checkpoint](text-import-node.md).

### Bounded text-import operation and explicit readiness (2026-09-07)

`node.configure_text_import` runs a fixed local procedure under the existing
mutation gate. Hermes supplies one node reference, a resolved verified upload
operation and typed source/format/column settings. Private steps have durable
preparation/receipts and fresh document-bound observations; they are not model
tool calls. Unknown effects stay pending without automatic replay.

Every read requires a named predicate and a bounded deadline. Polling ends on
semantic readiness; repeated whole-DOM quiet samples are not required. The saved
node incarnation is checked twice after Done, and the normal pre-gesture epoch,
identity and interaction guards remain mandatory. The independent auditor binds
the external operation, upload, internal journal and Done/reopen/readback sequence.
The bounded import goal passed autonomous Hermes acceptance (54/54); execution,
package persistence and the remaining P3 nodes are outside this pilot.

### Import settings acceptance binding (2026-09-06)

The independent P3 `wizard_settings_readback` verifier binds the pinned CSV and
its verified destination bytes to the same-session/document import source read.
A successful resolved upload inspection must precede that read. Admission of this
one gate requires journal-bound finish/open readback with complete configured
column and mapping bounds on both sides. It does not prove source-field machine
identity, execution results or package persistence. Six remaining domain verifiers
are still unimplemented, and full P3 acceptance remains disabled. Live acceptance
of this first implemented gate is still pending.

### Rendered table evidence (2026-09-05)

Existing table_cells records may carry data_column (view/field key and observed
CSS type) or data_cell (view/field/zero-based row key, bounded untrimmed display
text, completeness, redaction and observed CSS null marker). This recognizes
DataSet Preview and Table/BrowseView and preserves empty versus marked-null
observations. Missing/ambiguous headers suppress text. Fixed data view roots
are discoverable; traversal and record limits still apply. These are rendered
observations, not parsed numeric truth or execution/result completeness proof.
Quick Preview rounds real values; exact comparison needs verified full-precision
Table formatting. The independent auditor compares these metadata exactly
against immutable records; wizard metadata is also part of that comparison.

### Current wizard observation context (2026-09-05)

Workspace observations include a read-only wizard summary: visible form identity,
bounded title, known P3 page marker and lifecycle button visibility/enablement.
Fixed native queries retain this context in root discovery and narrow reads;
hidden/inactive forms are excluded, multiple forms/pages are ambiguous. Input
mapping may precede a component page, and does not establish node ownership.
The summary is carried across observation pages and included in their revision.
It does not prove applied settings, execution or typed results. Source-backed
opening uses one click on the node's Setting affordance; the current full P3
run remains diagnostic until independent domain verifiers are implemented.

### Candidate server-copy verification (2026-09-05)

dock_artifact_verify is available alongside upload in candidate sessions. Its
strict request accepts original operation_id, new verification_id, observation_id
and file_ref only. The runtime requires the pending upload's confirmed browser
completion/cleanup, checks assertIssued and exact CSV identity, then allocates
a private stageDownload lease. Upload checkpoints retain the storage root ref
so scoped navigation can be rechecked without traversing a large file table.

The download uses the existing browserReceipt ledger with its own verification
ID and the original upload owner. The native artifact.download outcome is
journaled as download_completed; host name/size/SHA validation produces a separate
artifact.verify outcome in download_verified. Exact metadata must match the
original artifact, grant, path, observation and ref. Private paths/bytes/native
errors do not enter those records. A same-size wrong file produces FAILED /
DOWNLOADED_ARTIFACT_MISMATCH. A successful byte proof sets bytes_verified=true
and upload_completion_verified=false in this intermediate receipt. With confirmed
native upload submission, browser completion, matching destination bytes and both
leases released, the runtime writes transfer_completed and verification_completed
before publishing SUCCEEDED and clearing pending. The final verification reply
sets upload_completion_verified=true. Unconfirmed submission, mismatched bytes,
cleanup failure or journal failure keeps the gate closed.

Repeated verification IDs return the stored result. After a lost response,
inspect(original upload ID) reads the existing browser receipt and hashes the
existing private downloaded copy without another download or upload. Different
IDs are blocked while the request/transport/cleanup is uncertain. Host journal
failures leave the raw receipt for reconciliation, rather than resubmission.
Verified byte proof is cached before lease cleanup so journal recovery does not
rehash a released copy. NOT_APPLIED releases its empty lease after browser
completion; shutdown drains retained files. Network/disk download limits and
reject remain unfinished. A live download-and-hash run passed on the earlier
pending-only implementation. Current completion passed the frozen live run
20260905-225713-f00430f8 (48/48); exact pins and limitations are in implementation-status.md.

### Private CSV download primitive (2026-09-05)

makeArtifactDownloadCode is a host-only browser primitive used by artifact.verify.
It requires an exact CSV label and FileStorageForm;colName_<Format(name)> tid
from the supplied detailed observation. Its future runtime caller must also
assertIssued for the file_ref. Package files are rejected: double-clicking an
LGP would open a scenario, so those need a separate explicit download command.

The primitive rereads the storage navigation region and verifies origin/build,
authenticated workflow, directory, DOM epoch and absence of dialogs/masks.
It registers this Page's download listener before running the existing checked
UI double-click capability, preserving ref/incarnation/geometry/hit guards.
It requires the expected suggested filename and a URL at the expected origin
(including same-origin blob URLs); the raw URL is never returned or journaled.
Download.saveAs writes only the private adapter-supplied path. A second storage
read binds the completed download to the same destination/context. The result
explicitly requires host byte verification and does not resolve an upload.

Unexpected filenames/origins and captured downloads after a failed gesture are
cancelled. A missing event after a gesture remains ambiguous with unconfirmed
cleanup. Exceptions drain the bounded event listener and attempt cancellation;
native errors and paths are omitted. The 15-second event wait does not bound
Download.saveAs or browser network/disk usage. The future runtime must retain its
lease and reconcile the browser receipt after transport uncertainty, validate
host bytes with stageDownload.verify, and establish upload transfer completion.
No live download acceptance is claimed for this primitive yet.

### Candidate upload submission (2026-09-05)

Replay sessions with an artifact store expose dock_artifact_upload. Its strict
request schema accepts four opaque IDs only: artifact, upload grant, observation,
operation. The runtime resolves the host grant, validates observed storage,
stages/verifies the original bytes, and journals public parameters before calling
the browser. The browser rereads context/DOM epoch/directory, refuses masks and
dialogs, checks the active FileStorageForm toolbar and its unique enabled hidden
file input (E2E UploadFiles), rechecks epoch, then calls native setInputFiles on
the retained handle. No generic UI file-input action is exposed.

Only explicit replace grants are currently executable. reject is refused before
staging and is never converted to replace. This is a candidate submission path,
not completed P3 upload support. A completed native input call returns AMBIGUOUS /
UPLOAD_SERVER_VERIFICATION_REQUIRED because Loginom's server transfer can still
be running. The existing executor pending gate, browserReceipt and journal hold
that operation: repeated/concurrent IDs do not submit again; inspect recovers a
lost receipt without resubmission. Pending upload prohibits new mutation, UI
repair, preparation and abandonment. Only observation/inspection remain enabled.
NOT_APPLIED releases the source after known browser completion, including when
that proof was recovered from a lost response. Otherwise the lease stays until
verified transfer completion or browser shutdown. Server verification/recovery,
download binding/budget and enforceable reject semantics remain to be added.

### Private file-transfer leases (2026-09-05)

stageUpload validates an admitted artifact again and creates a private named copy
for native browser setInputFiles. The immutable lease exposes path only to trusted
host code, not the model. File/directory permissions prevent routine accidental
writes; verify still checks bytes/SHA and directory identity. This is not protection
against a hostile same-user process with permission to change those modes.
A timeout retains the source; release is explicit after confirmed completion.
Shutdown drains pending staging and attempts cleanup only after browser closure.
The original admitted snapshot is retained. Concurrent/pending transfer count is
bounded to eight; model callers have no file path or staging API.

stageDownload reserves a separate private directory for Download.saveAs. Its
target file initially does not exist; it never reuses the admitted/upload copy.
verify requires the event's exact suggested filename, then checks size/SHA of
the new regular file against the admission descriptor. Upload and download
leases share the eight-transfer limit and shutdown drain. Cleanup removes a
symlink itself without following/chmodding its target. Missing download files
can be cleaned after browser shutdown. The trusted adapter must still bind the
download event to the exact observed Loginom destination and operation. Byte
verification alone proves neither origin nor overwrite policy. maxBytes bounds
host verification reads, not the browser's network/disk download; that transport
budget remains to be enforced by the future adapter.

The pinned MCP/Chromium transport was tested on a synthetic local file input,
including filename/size/SHA and Download.saveAs roundtrip checked on the host.
No payload is embedded in browser code. No Loginom
upload dispatcher, no-overwrite contract or server postcondition is established
by this local transport test. These remain the next P3 integration requirements.

### Explicit accounts and bounded storage reads (2026-09-05)

Replay bootstrap requires an explicit replayLoginUser; no Loginom/OS/SSH
username is inferred. New acceptance schema 2 requires independently selected
loginom-user and storage-directory; schema 1 audit support is historical only.
User-authorized test account was exercised with destination /test in live run
20260905-211038-3cd006d8 (24/24 PASS).

Roots storage_name uses a fixed CSS-escaped query over formatted name tids,
not a full table walk. Candidates require detailed root reads; formatted IDs
can collide and missing rendered rows never prove absence. Filter metadata is
cursor-bound. Navigation reads distinguish display_path and directory by removing
only the first recognized virtual Files root. Empty navigation decorations are
skipped; hidden nonempty/ambiguous segments fail explicitly. Every observe has
a fresh operation UUID and an immutable raw observation_completed journal event
before context and page projection. File storage acceptance binds these receipts.
Upload, no-overwrite and server byte verification are still separate pending work.

### Live storage scan limits and navigation roots (2026-09-05)

FileStorageForm;colName_* cells now issue guarded refs using the E2E navigation
identity. A live transition into user triggered UI_SCAN_LIMIT. Browser-origin
observation errors cross page.evaluate as a fixed data envelope; exception
messages are not exported, known codes survive Playwright Error serialization.
NavigationBar;NavigationPanel joins root discovery; a fixed global query reads
the storage table container marker only. Navigation-root details can therefore
read destination breadcrumbs without walking a large table. This is locally
verified with 6500 background elements; the new navigation-root path still needs
live acceptance. Specific rows in large tables still need bounded lookup, and
listing_complete remains false. No upload/no-overwrite or remote SHA claim.

### Host startup input admission (2026-09-05)

Executor preview/replay CLI accepts repeated `--input-artifact` arguments, each
an explicit JSON object with `sourcePath` (absolute host path), `name`,
`bytes`, `sha256` and an optional `upload` authorization; other keys are rejected.
`upload` has exactly `directory` (absolute Loginom virtual directory) and
`overwrite` (`reject` or `replace`, required, no default). Directory segments
cannot be empty/dot/dotdot, padded with whitespace, contain backslashes/control
characters, or exceed the harness's depth/length bounds. No username is inferred.
This is a trusted launcher interface, not an MCP tool. The
whole batch is validated before file reads: at most 8 files, 16 MiB per file,
64 MiB total, distinct NFC/case-folded display names. Each argument is bounded
at 8192 characters. Admission failure aborts startup before bridge connection;
any partial local staging remains private and is never delivered to an agent.
The existing store verifies and snapshots bytes before browser connection.
`dock_prepare` returns public `input_artifacts` descriptors in executor modes;
source paths and byte buffers are not included. Classic/research reject input
arguments. Admission is session-local; reconnect creates new artifact IDs.

An authorized descriptor additionally exposes `upload` with a fresh opaque
grant_id, directory, exact destination (directory + admitted display name), and
overwrite policy. `getUploadGrant(artifact_id, grant_id)` resolves both IDs in
this store; it accepts no replacement path or policy. Returned descriptors are
copies and transfer lease authorization metadata is frozen. File admission
without `upload` never implicitly grants an upload destination. An authorization
does not prove ownership, absence of an existing file, or an enforceable reject
policy; the future dispatcher must establish those effects separately.

This does not upload anything to Loginom. No remote destination ownership,
overwrite handling, upload receipt or server byte verification is claimed.
The acceptance harness still needs fixture/task pinning and explicit startup
arguments when the full data-pipeline goal is connected.

### P3 destination observation (2026-09-05)

Detailed workspace observation exposes `file_storage` as destination evidence:
active tab's storage table and unique navigation bar, bounded visible breadcrumb
segments without lossy normalization. Missing/ambiguous/hidden/sensitive segments
produce `unobserved`. Pages retain this metadata and bind it into the revision.
`listing_complete:false` is unconditional; rendered rows never establish remote
filename absence. This observer is not an upload capability or a server byte
verification. Future upload must establish its own fresh guards and reconcile
uncertain effects. Root discovery intentionally does not read directory contents.

# Архитектура Loginom Dock

Канонический проектный URI: `viking://resources/loginom-dock`.
Этот документ сохраняет архитектуру уже реализованной системы. Текущая доработка
E2E-исполнителя описана в [активном плане](../plans/2026-09-02-loginom-dock-implementation-plan.md),
статус и история реализации — в [отдельном журнале](implementation-status.md).

## Основа и совместимость

Loginom Dock — продуктовый форк OpenViking. Сервер сохраняет штатные API, MCP,
Resources, Assets, Skills, Watches, поиск, сессии, память и Studio. Внутренние
Python-пакеты `openviking` и `openviking_cli`, CLI `ov`, заголовки
`X-OpenViking-*`, схема хранения и URI `viking://` остаются совместимыми.
Брендирование касается пользовательского интерфейса, метаданных API/MCP,
документации и контейнера. Исходный README сохранён как `README_UPSTREAM.md`.
Лицензия AGPL-3.0 и copyright исходных файлов сохраняются.

## Сервер и источники

Dock собирается из этого checkout. Compose использует собственный образ и отдельный
том `dock_data`; существующий `~/.openviking` не подключается. Внутренний путь
`/app/.openviking` сохранён для совместимости entrypoint. Параметры моделей задаются
в отдельном конфиге Dock. Персональное хранилище OpenViking не мигрирует.

Git-источники `ai-skills`, `e2e-tests`, `loginom-help` импортируются через OpenViking
Assets и `add_resource`. Стабильные URI:

| Источник | URI |
| --- | --- |
| ai-skills | `viking://resources/loginom-dock/sources/ai-skills` |
| e2e-tests | `viking://resources/loginom-dock/sources/e2e-tests` |
| loginom-help | `viking://resources/loginom-dock/sources/loginom-help` |

При импорте проверяются реальные контрольные файлы, LFS hydration,
изображения и fixtures. Штатные фильтры parser не гарантируют полноту: пропуски
фиксируются отдельно, необходимые файлы сохраняются через существующие службы.
Бинарный файл в хранилище не означает семантический разбор его содержимого.

Опция `code.preserve_source_files` (по умолчанию выключена) добавляет к штатному
поисковому представлению Git-ресурса скрытый каталог `.source/`. В нём сохраняются
байт-в-байт все обычные файлы Git-ревизии, включая dotfiles, пустые и большие файлы,
изображения и LFS fixtures. `.source-manifest.json` содержит commit, относительные
пути, режимы, размеры и SHA-256, а также пути и commit внешних Git submodules.
Содержимое внешних репозиториев не входит в обычные файлы выбранной ревизии;
оно не загружается автоматически. Необработанные LFS pointers и символические
ссылки прерывают такой импорт. Используются существующие uploader и VikingFS; отдельного
импортёра или хранилища нет. При обновлении скрытое поддерево синхронизируется явно,
а семантическая обработка работает с обычным поисковым представлением.
В этом режиме GitAccessor выбирает checkout вместо ZIP и использует нативный
каталог Git LFS. Для оставшихся pointers временно уточняет `.git/info/attributes`
и запускает `git lfs pull`, затем возвращает временные attributes в исходное
состояние. Это покрывает неполные правила `.gitattributes`, не изменяя Git-источник
и не создавая отдельного загрузчика LFS.
При включённом сохранении список `code.source_only_extensions` исключает выбранные
расширения только из поискового представления. В Dock это `.lgp`, `.lgd`, `.svg`,
`.ai`, `.sketch`: оригиналы и ссылки из кода/справки сохраняются, двоичные пакеты
и коллекции иконок не отправляются на текстовый разбор. По умолчанию список пуст.

В серверной конфигурации закрытый HTTPS-вход `git.basegroup.ru` доступен только
внутри Docker-сети. Он доверяет собственной CA и пересылает запросы через Unix
socket reverse SSH. Разрешены только три репозитория; операции push запрещены.
Небольшой LFS-адаптер исправляет HTTP origin в download-ссылках старого GitLab на
тот же HTTPS origin. Чужие хосты и пути отклоняются; проверка TLS сохраняется.
Credentials и Assets State находятся только в защищённых каталогах Dock.

Доступ к внутреннему GitLab временно проходит через закрытый reverse SSH-маршрут.
Для PAT нужен HTTPS-вход и точный allowlist хоста. Маршрут, TLS и LFS проверяются
из контейнера. После импорта чтение и поиск не зависят от GitLab. Обновления первого
выпуска запускаются явно. При смене GitLab на GitHub сохраняются URI, переоформляется
Assets State и останавливаются прежние Watches.

## Клиент

Codex или Hermes подключает один локальный MCP `loginom-dock`. Общий Node.js
компонент объединяет удалённые tools Dock и закреплённый Playwright MCP, сохраняя
штатные инструменты; коллизии имён завершаются явной ошибкой. Каталог tools фиксируется
на сессию. Браузер работает на машине агента, macOS/Linux, в отдельном профиле.
Итоговая вкладка остаётся доступной до завершения клиентской среды. В Linux видимое
окно требует графической сессии. Общий системный clipboard защищается блокировкой
между copy и подтверждённым paste, включая аварийное освобождение.
Локальный `dock_clipboard_transfer` держит эксклюзивный loopback-порт 46419 до
подтверждения результата. Это блокировка ОС без сетевого протокола и файлов PID;
таймер не вытесняет живого владельца. При неопределённом результате блокировка
остаётся до завершения браузера/клиентской среды. Разные операции одного браузера
также выполняются последовательно. Сторонние программы в этой блокировке не участвуют.

`dock_prepare` проверяет сервер и клиент, выдаёт инструкции в текущий контекст и
атомарно активирует опубликованный skill по manifest/revision/SHA-256. Skill и runtime
не меняются посреди сессии. Agent type и версия адаптера передаются явно.
Источники и live DOM имеют приоритет над памятью. Клиенту не нужны локальные
репозитории, Context7 или самостоятельно установленный browser MCP.

Native-пакеты Codex и Hermes создаются отдельно от сохранённых upstream-примеров.
Существующие memory plugins не переименовываются в Dock: у них другое поведение
capture и разрешён fallback в личную конфигурацию. Dock такой fallback запрещает.
Hermes сохраняет активный профиль `HERMES_HOME` и личный `memory.provider`.

## Локальный исполнитель и агентский цикл

Локальные входные файлы принимает host-only artifactStore сессии. Trusted caller
передаёт sourcePath и заранее известные SHA/bytes/name; модель не получает API
admit или filesystem path. Проверенная копия записывается exclusive/0600 в
session artifacts/input, дескриптор содержит только artifact_id/name/bytes/SHA.
Перед передачей upload adapter повторно проверяет staged bytes и получает Buffer,
а не изменяемый исходный путь. Symlink/non-regular/size/hash mismatch отвергаются;
чтение ограничено ожидаемым размером + 1, default limit 16 MiB. Registry живёт
только в текущей сессии: restart-resume ещё не реализован. Store сам ничего не
загружает и не выдаёт источники модели; browser upload и destination proof
реализуются отдельно, generic file input остаётся закрытым.

Новый исполнитель добавляется как изолированный режим запуска
`executor-preview`; существующий режим клиента остаётся режимом по умолчанию для
сценариев, ещё не покрытых каталогом. Режим выбирает пользователь или администратор
только при запуске процесса. Action definition, удалённый сервер и модель не могут
изменить его в активной сессии. В `executor-preview` клиент не публикует raw browser
tools и `dock_clipboard_transfer`. В принятом кандидате `rc.3` UI изменяет
`dock_action_run`; расширение от 5 сентября добавляет ограниченные UI-жесты и
восстановление через то же локальное capability-ядро. Отдельный явно выбранный `research`-запуск
сохраняет браузерные инструменты для исследования и не публикует action tools.
До активации production оператор может выбрать `executor-replay` и передать при
старте точные URI и SHA-256 immutable candidate manifest. Этот режим принимает
`candidate`, но не `stale`, и сохраняет тот же запрет raw browser/clipboard tools;
модель не может выбрать candidate или включить replay внутри сессии.

Каталог хранится под
`viking://resources/loginom-dock/catalogs/executor-preview`. Публикация сначала
создаёт неизменяемый release с action definitions, selector symbols, E2E dependency
index и manifest, а затем отдельной операцией заменяет `current.json`. Указатель
содержит URI и SHA-256 manifest. Production-клиент читает указатель один раз при старте,
проверяет digests всех файлов, E2E commit, status, capability ABI и минимальную
ревизию executor, после чего закрепляет эти значения в session manifest. Изменение
`current.json` не влияет на уже запущенную сессию.

Action definition является данными: она выбирает одну встроенную capability,
объявляет типизированные входы/выходы, selector symbols, evidence, эффекты,
идемпотентность, deadline, retry budget и cleanup. В ней запрещены JavaScript,
raw CSS/XPath, callbacks, рекурсия и произвольные циклы. Selector catalog хранит
только типизированные операции над `data-tid`, scope, cardinality, visibility,
state probes, provenance и безопасные encoders параметров. Локальный resolver
заново определяет активную вкладку по выбранной workspace tab и создаёт свежий
Playwright Locator для каждого обращения.

Первый capability ABI содержит только `node.add.v1`, `link.create.v1` и
`package.save_as.v1`. Executor валидирует запрос и весь закреплённый release до
первого browser call. Отсутствующее, `stale`, повреждённое или несовместимое
действие завершается fail-closed без изменения UI. Каждая операция возвращает
`SUCCEEDED`, `NOT_APPLIED`, `FAILED` или `AMBIGUOUS` и semantic trace; повтор
неидемпотентного действия разрешён только после reconciliation наблюдаемого DOM.

### Уточнение MVP после разбора 4 сентября

Для точной проверки пути пакета и преобразования координат используются
[фиксированные read-only UI probes](pinned-ui-probes.md), проверенные по исходникам
frontend build `7.5.0-alpha+build.49202`. Это ограниченные адаптеры клиента к cached
UI state, а не универсальный DOM API и не вызовы RPC. Их исходники, SHA, допустимые
поля и границы приёмки перечислены в отдельном checkpoint.

Первый MVP содержит встроенные доменные обработчики; интерпретатор серверных
последовательностей и ветвлений в него не входит. Preconditions/postconditions и
cleanup в definitions описывают контракт. Исполняемые проверки находятся в коде
клиента. Изменение алгоритма и добавление действия требуют нового runtime;
сервером обновляются совместимые селекторы и поддержанные настройки. Общие
драйверы и композиция серверных definitions планируются после проверки повторяющихся
UI-паттернов. Это уточнение заменяет обещание добавлять произвольные новые готовые
операции в первом MVP одним обновлением данных. Ограниченные UI-жесты следующего
раздела являются отдельными инструментами агента и поставляются в runtime.

7 сентября пользователь согласовал полный локальный цикл одного узла:
добавление/поиск → связи → первое открытие → настройка портов и узла →
завершение → выполнение → чтение выхода. Агент выбирает граф и параметры,
затем оценивает выход. Штатного повторного открытия мастера нет; специальные
roundtrip-тесты обработчика и финальная проверка пакета остаются отдельными.
Первый выпуск охватывает восемь аналитических типов; остальные режимы доступны
через ограниченный UI-резерв и остаются в дорожной карте. Общий interpreter
сценария не является зависимостью выпуска. Это целевая архитектура: реализованный
импортный пилот пока сохраняет прежний контракт. Точные границы:
[канонический план](../plans/2026-09-02-loginom-dock-implementation-plan.md#node-level-operations).

При продолжении реализации вводятся следующие обязательные границы. Candidate
manifest и содержимое остаются неизменяемыми после replay. Допуск в production —
отдельная attestation, связывающая точный manifest SHA с runtime, сборкой Loginom,
Hermes/openai-codex/gpt-5.6-sol/low и обязательными проверками нового выпуска.
Старые MiMo/Luna attestations сохраняют прежние pins. Повышение `stale` при повторной
сборке запрещено; pointer переключается после проверки и readback. Provenance
проверяется вместе с полнотой зависимостей используемых селекторов/helpers.

Обычная сессия и replay проходят общую подготовку workspace через `dock_prepare`.
До завершения подготовки изменение графа запрещено. Типизированное наблюдение
workspace не раскрывает raw browser API. Node refs включают workflow identity.
Каждая операция получает operation ID и очищенный журнал фаз; неизвестный эффект
требует reconciliation до следующей мутации. Положительная приёмка этих границ
фиксируется отдельно в журнале реализации, а не выводится из этого описания.

### Наблюдение, выбор действия и восстановление — расширение 5 сентября

workspace.observe принимает optional root_ref + observation_id: root должен быть
доставленным UI ref сессии. Browser фильтрует controls/cells выбранным element/
subtree, сохраняя глобальные auth/build/active-tab, dialogs/masks/messages и граф.
observation_root явно указывает detail_scope=elements_and_cells, global_scan=false.
Курсор хранит тот же root; UI action повторно читает эту область. Detached/hidden/
inactive root отвергается. TreeWalker ограничен выбранным subtree; fixed native
queries отдельно находят глобальные active tab/auth/dialogs/masks/messages.
Их результаты ограничены общим бюджетом элементов, время проверяется сразу
после native query; синхронная стоимость querySelectorAll не прерывается.
Graph completeness при root read всегда false, внешние тексты не обходятся
подробно. Root хранится в bounded Map из 4096 WeakRef; потеря записи — stale.
Первичное обнаружение выполняет scope=roots: fixed native queries возвращают
видимые nonsensitive окна, формы, таблицы/grids, WizrdMCF и основные контейнеры
графа без обхода потомков и чтения содержимого. Region refs имеют пустой
allowed_actions: сначала нужен detailed root read. Roots-mode сохраняется в
cursor; пустые masks/dialogs/graph помечены неполными и не доказывают отсутствие
блокировки. Native query cost проверяется после вызова, но не прерывается внутри.
Глобальный locator.count по-прежнему отвергает
дублированную identity перед жестом, даже если дубль вне selected subtree.

DOM snapshot содержит `dom_epoch`: document identity и монотонный счётчик
MutationObserver (childList/attributes/characterData, subtree). Observer не
сохраняет тексты или targets; перед чтением учитываются pending records через
takeRecords. Epoch включён в digest страниц и проверяется до жеста, в том числе
после асинхронных проверок target. Возврат DOM A→B→A не оживляет старую страницу.
Это консервативная document-wide защита: анимации тоже инвалидируют наблюдение.
Она не отслеживает изменения JS-свойств без DOM mutation, canvas и состояние
сервера; обычные проверки значений, геометрии, identity и результата сохраняются.
Read/action всё ещё разделены browser IPC: атомарность между последней проверкой
и отправкой жеста не заявляется. Root/filter и полный semantic epoch ещё нужны.

Статус расширения — реализация и проверка. Прежняя приёмка внутреннего `rc.3`
подтверждает три готовые операции и защитные ветки; она не подтверждает возможности
нового агентского цикла. Подробные критерии находятся в разделе 0.3 активного плана.

Hermes/Codex самостоятельно строит и меняет план по цели пользователя. Исполнитель
предоставляет готовые операции, наблюдение и один ограниченный UI-жест за вызов.
После каждого значимого изменения агент сравнивает фактическое состояние с целью,
выбирает исправление при ошибке и продолжает. Сервер Dock остаётся поставщиком
знаний; отдельная серверная модель не исполняет этот цикл.

`dock_action_describe({})` возвращает `available_actions` с точными именами
`node.add`, `link.create`, `package.save_as`; затем агент запрашивает definition
по выбранному `action_key`. Неизвестное имя и неверные аргументы возвращаются
типизированным `FAILED` в обычном MCP-content, либо `AMBIGUOUS` при существующей
pending-операции. Эти прикладные результаты не выдаются за транспортный отказ
сервера. `dock_prepare` явно возвращает capabilities и инструкции текущего
локального клиента, уточняющие ограничения устаревшего серверного skill.
Фактический каталог и схема текущей сессии определяют доступные возможности.

Автоматическое соединение при добавлении узлов рядом — штатное поведение Loginom,
уточнённое пользователем. Обновлённый `node.add` проверяет ровно один новый узел,
его имя и положение, неизменность прежних узлов, портов и связей. Если добавленные
связи относятся только к новому узлу, возвращаются `SUCCEEDED`,
`output.auto_created_links` и `goal_verified: false`, без глобального pending лишь
из-за автосвязей. Агент сопоставляет наблюдаемые связи с целью, сохраняет полезные
и удаляет ненужные через обычные UI-действия. Посторонний diff остаётся
`AMBIGUOUS`; автоматическая связь не разрешает игнорировать изменения других
объектов или объявлять задачу выполненной.

`dock_workspace_observe` расширяется от графа до доступного UI: настройки,
диалоги, сообщения, маски, ячейки таблиц и ссылки на элементы. `observation_id`
связывает эти ссылки с наблюдением текущей сессии. Следующее изменение требует
нового наблюдения; клиент отвергает устаревшие и чужие refs. Чтение UI при ошибке
должно позволять агенту увидеть препятствие, а не требовать уже исправленного
состояния графа.

`dock_ui_action` принимает `observation_id`, `operation_id` и `action` с одним
`verb` из `click`, `double_click`, `fill`, `press`, `drag`. Поля `ref`, `text`,
`key`, `source_ref`, `target_ref` ограничены схемой. Исполняется фиксированный
локальный код с проверкой владения ссылками, доступности элементов, deadline и
cleanup. JavaScript, CSS/XPath, пользовательский selector и clipboard отсутствуют
в этом контракте. `SUCCEEDED` у жеста удостоверяет его выполнение; доменный
результат — настройку, граф, данные или пакет — агент проверяет отдельно.

Восстановление использует исходную операцию и наблюдаемые доказательства:

- `dock_operation_inspect({operation_id?})` проверяет заданную либо текущую
  pending-операцию по фактической браузерной квитанции и reconciliation состояния.
- Локальный реестр квитанций Playwright для страницы связывает результат и cleanup
  с operation ID. При потере ответа завершённую квитанцию можно получить повторно
  без повторения воздействия. Если вызов ещё может выполняться, мутации запрещены.
- `dock_operation_recover({operation_id, recovery_operation_id, strategy, observation_id?})`
  принимает стратегии `complete_link`, `restore_control`, `accept_observed_state`
  и `abandon_operation`.
  Первая завершает связь с единственным уже созданным add-port; вторая исправляет
  только cleanup после проверки окончания вызова. Ни одна не разрешает
  безусловно очистить pending.
- Для другого доступного исправления `dock_ui_action` получает
  `recovery_operation_id`, равный ID исходной pending-операции, и свежие refs.
  Это ограниченное исправление известного состояния; неподтверждённый вызов и
  чужие объекты остаются закрыты. Затем inspect повторно проверяет исходный итог.
- `accept_observed_state` применима только к pending-жесту `ui.act`, чей вызов
  завершён и cleanup подтверждён. Агент анализирует свежее наблюдение и передаёт
  `observation_id`; runtime заново читает UI и требует точного совпадения. В журнал
  записываются `resolution: accepted_observed_state` и `goal_verified: false`.
  После этого разрешено продолжение, но исходный жест остаётся `AMBIGUOUS`.
  Это явный checkpoint наблюдаемого состояния, а не доказательство выполнения
  жеста или доменной цели и не обход неопределённости через новый ID.
- `abandon_operation` позволяет агенту после анализа отказаться от исходного
  результата pending-операции и изменить цель шага либо переделать ошибочный запрос.
  Требуются фактически завершённый вызов, подтверждённый cleanup и
  `observation_id` свежего наблюдения. Runtime повторно сверяет тот же UI и
  идентичность пакета. Исходная операция сохраняет `AMBIGUOUS`,
  `resolution: abandoned_after_observation`, `goal_verified: false`; `SUCCEEDED`
  квитанции recover означает лишь фиксацию отказа. Pending снимается, исходный ID
  больше не исполняется, автоматического повтора нет. Неподтверждённый выполняющийся
  вызов нельзя abandon; успешность доменной операции не подменяется. В отличие
  от этого явного отказа, `accept_observed_state` остаётся только для `ui.act`.

Известный частичный эффект отличается от неизвестного исхода ещё выполняющегося
вызова. `FAILED` допускает анализ и устранение доступной причины, а не автоматическое
завершение задачи. Повтор доставки сохраняет ID и параметры; новый ID не является
обходом неопределённого действия. Если новое действие покрывается ограниченным UI,
агент выполняет его в той же сессии. При отсутствии этих инструментов в старом
runtime сохраняются прежние ограничения; обновление skill не расширяет код клиента.

Живая приёмка проверяет способность агента достичь цели при непредупреждённом
частичном эффекте. Например, один вход создаётся без связи: Hermes должен сам
обнаружить отклонение и восстановить связь без лишнего порта. Программная инъекция
условия, mocks и текстовый отчёт модели не заменяют независимую проверку фактических
tools, графа и итогового результата.
Production admission нового runtime требует трёх дополнительных результатов:
`agent_partial_link_recovery`, `agent_ui_recovery`, `transport_receipt_recovery`.
Они дополняют восемь прежних обязательных проверок и привязаны к точной ревизии;
прежний отчёт приёмки `rc.3` не подтверждает новые возможности.

## Общая история

Сервер использует общий аккаунт и identity `loginom-dock`; архив доступен участникам.
Ключ клиента не является root/admin key. Архив активируется успешным `dock_prepare`,
начиная с вызвавшего его пользовательского сообщения. Resume сохраняет активацию,
новый разговор требует своей активации. Посторонние разговоры не отправляются.

Записываются видимые сообщения, tool calls/results, статусы, ревизии и ссылки на
локальные артефакты. Секреты очищаются до очереди и HTTP; при ошибке redaction
сохраняется только диагностическая отметка. Скрытые рассуждения, системные инструкции,
изображения, бинарники и browser profile не отправляются. Доставка использует
устойчивую очередь и уникальные installation/session/turn/tool-call IDs; повторы и
resume не дублируют события. Capture не захватывает собственную доставку архива.
Неполнота при обрывах явно отмечается; неподтверждённые streaming fragments не
считаются восстановленными. Из истории извлекается опыт Loginom без смешанного
персонального профиля участников.

Локальная очередь находится в собственном `archive/queue.sqlite` (0600, WAL/FULL).
Hook подтверждает результат подготовки по локальному session manifest, затем
сверяет видимую историю. Credentials из полей всей активированной истории известны
очистителю до первой записи. Worker повторяет доставку с ограниченным backoff;
следующий hook возобновляет оставшуюся работу после завершения worker или сбоя.
На завершении хода durable watermark очереди вызывает штатный session commit.

Необязательный `deduplication_key` API сообщений отображается в существующий
Message.id. Существующая блокировка append/commit охватывает проверку живых и
архивных сообщений. Первый payload ключа сохраняется; повтор не дополняет его
другим числом split tool parts. Отдельная серверная таблица дедупликации не нужна.
Клиентская политика извлечения допускает events/experiences, выключает peer и
рабочую память. Завершённый архив без рабочей сводки остаётся доступен через API.

## Доставка

GitHub releases содержат совместимые закреплённые runtime, браузер и native-пакеты.
Русскоязычный лендинг `https://loginom-dock.duckdns.org/` содержит описание продукта,
выбор Codex/Hermes и Windows/macOS/Linux, ссылки на опубликованные артефакты, команды
установки, примеры задач и ответы на вопросы. Метаданные выпуска и SHA-256 находятся
в `landing/release.json`; команды и ссылки меняются вместе с выбранной платформой.
Прежняя страница `/studio/connect` на `loginom.duckdns.org` перенаправляет на
лендинг и при прямом открытии, и при переходе внутри Studio.

Лендинг собирается на VPS из `landing/` и входит в закреплённый образ Caddy
(`deploy/loginom-dock/Dockerfile.landing`). Отдельных серверных зависимостей,
хранилищ и обработчиков форм нет. Существующая резервная копия сохраняет весь
образ Caddy вместе с файлами сайта и TLS-томами. API, MCP и Studio остаются на
`loginom.duckdns.org`; новый домен обслуживает только статические файлы.
Цвета и локальные шрифты взяты из официального брендбука Loginom, лицензия
шрифта включена в сайт. Ключ вводится только в локальном мастере установки.

Каталог продукта носит имя `loginom-dock`, отличное от установленного upstream
marketplace `openviking`. Запись исходного плагина и его атрибуция сохраняются.
Кандидаты комплектов содержат полный файловый manifest с SHA-256 и признак
незакоммиченных исходников. Такой кандидат не выдаётся за опубликованный GitHub
релиз и не используется для pinned-установки Hermes из публичного репозитория.

Установщик работает только в каталогах Dock и его записях конфигурации. Endpoint
по умолчанию — `https://loginom.duckdns.org/mcp`; ключ вводится локально. Системные
Node.js/Python не заменяются. Обновление применяется в новой сессии с откатом на
совместимый комплект. Удаление убирает только Dock; локальные профили и артефакты
удаляются по отдельному выбору, общая история сохраняется.

## Проверяемость извлечённого опыта

Dock задаёт собственный `memory.custom_templates_dir` через штатную конфигурацию
OpenViking. Шаблон `deploy/loginom-dock/memory-templates/events.yaml` сохраняет тип,
поля и пути upstream events, но требует различать запрос, план, ход работы,
наблюдаемый блокер и подтверждённый результат. Ожидаемые значения и требования
пользователя не считаются выполненными действиями; результаты разных агентов и
пакетов не смешиваются. В текст автоматически добавляются ID выбранных исходных
сообщений. Сами сообщения остаются в обычном session archive.

Шаблон уточняет извлечение, но не превращает вывод модели в независимое
доказательство. Клиенты по-прежнему сверяют память с исходниками и наблюдаемым UI.
В сервере шаблон находится в `/opt/loginom-dock/assets/memory-templates`, попадает
в полную копию assets; конфиг указывает этот путь внутри контейнера. API и schema
memory subsystem не меняются.

## Контекст при сбоях исполнителя

Клиентский `recovery-context.mjs` использует существующие OpenViking MCP tools:
при FAILED/AMBIGUOUS готовой операции читает `.source/` E2E-helper из pinned
каталога, сверяет полные байты по SHA и возвращает ограниченный фрагмент строк.
Help находится scoped grep/find и читается штатным read. Для Help сохраняется
SHA прочитанного текста, но совместимость его версии с Loginom не объявляется.
В запросы поиска попадают только встроенные темы операций, без пользовательских
меток, содержимого UI и текста ошибки. Исходники проходят redaction до передачи
и записи. Сервер не выбирает и не исполняет исправление.

Контекст приходит отдельным MCP-блоком `dock_recovery_context` с признаком
`delivery: client_automatic`; исходная квитанция действия не меняется. Журнал
сохраняет тот же блок в `knowledge_context_delivered`. Это автоматическая доставка,
а не вымышленный вызов поиска от имени модели. Агент выбирает исправление по
источникам и наблюдению, существующие pending/cleanup guards сохраняются.

Доставка ограничена 45 секундами, двумя источниками/12 тысячами символов каждого
и восемью операциями на сессию; повторные обращения одного operation ID используют
кэш. Недоступный источник или несовпадающий E2E hash не выдаётся за подтверждённый
контекст. Для UI-жеста без pinned helper возможен частичный результат; обычные
read-only tools остаются доступными. Ошибка поиска/записи контекста не стирает
квитанцию браузера. Этот адаптер не добавляет API, импортёр или поисковый движок.

В user-v1 `dock_node_apply`/`dock_node_resume` принимают короткий
`workflow_ref: {workflow_id}`. Bridge раскрывает его только по локальному
соответствию пары document_id/workflow_id, полученному при успешной подготовке
или проверенном сохранении. Полный внутренний node contract и проверки текущего
документа, вкладки, пути и состояния операции сохраняются. Это адаптер ссылок,
не интерпретатор плана сценария. Ссылки публикуются до освобождения очереди
подготовки; неизвестная пара и повреждённая повторная подготовка не запускают UI.
