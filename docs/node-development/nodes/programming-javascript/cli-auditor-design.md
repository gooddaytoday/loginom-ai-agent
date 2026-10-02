# Независимые аудиторы JavaScript для фазы 4

Продолжение утверждённого [плана](plan.md), 2026-10-02. Аудиторы читают
сохранённый native journal; не запускают Hermes, браузер или JavaScript модели.
Решение `allow_configured_output: true` остаётся отдельным контрактом чтения
контекста и не превращает `source_pending` в доказательство исполнения.

## Разделение проверок

`javascript_configuration_evidence.py` проверяет admitted request, порядок
фаз, принадлежность нативных observations/actions, source delivery receipts
и настройки/сопоставления независимо от публичного readback. Ожидаемый исходный
код задаётся оператором после получения фактически авторского кода; его hash
не берётся из проверяемого результата. Обязательны совпадение UTF-8/LF,
подтверждённые Setting/Close для source-read, observed generation/declared grids
и полные reciprocal mapping stores. Это проверка конфигурации Execute;
Done/Close и opt-in context сохраняют собственные уже проверенные аудиторы.

`javascript_output_evidence.py` проверяет две отдельные свежие execution groups:
materialization и итоговое исполнение. Использует существующие независимые
Python-проверки history/owner/Table, выделяя последовательности по записанным
границам фаз. Полный выход сравнивается с отдельно переданным oracle, включая
каждую ячейку, тип, NULL, порядок, схему и execution identity. Сумма не заменяет
эту проверку. Первая версия поддерживает бизнес-oracle integer/string/NULL;
прочие scalar/native-byte доказательства остаются отдельными проверками G5.

Общий procedure auditor получает узкую поддержку существующего runtime-ожидания
Table после единственного Add: только свой port/views/node, исходный deadline
из admission, два устойчивых подтверждения новой карточки, отсутствие посторонних
масок и действий во время ожидания. Лимит остальных ожиданий остаётся 15000 ms.
Нативный журнал не переписывается и не нормализуется под старый аудитор.

`javascript_node_acceptance.py` объединит эти проверки с фактическими candidate,
model/variant, доставкой входных файлов, Save/cold и cleanup evidence. Его
окончательный транспорт определяется реальными standalone CLI записями,
а не историческим Hermes envelope. До реализации этой проверки узел не получает
`ready_for_acceptance`. Проверки конфигурации/выхода сами по себе не доказывают
автономность модели, отсутствие hardcode, persistence или готовность продукта.

## Входная проверка standalone CLI

Первый транспортный модуль — `javascript_cli_evidence.py`: собственная сессия
из `<profile>/data/loginom-ai-agent.db` читается SQLite `mode=ro`/`query_only`.
Используется фактическая v1 схема `session`/`message`/`part` и восстанавливаются
ID из колонок, как `message-v2.ts`. Наружу выходят только модель/вариант,
hash/размер/имя текстовых file snapshots и metadata/digests публичных tool parts.
Reasoning, system/developer, auth secrets, бинарные вложения и исходные payloads
не сохраняются и не печатаются. Этот модуль не экспортирует базу.

Очищенные CLI `events.jsonl` сопоставляются с metadata собственной сессии:
фактические OpenAI Sol/low, terminal tool IDs/callIDs/messageIDs/status/time,
input/output digests, полнота завершённых вызовов, отсутствие truncation и
соблюдение исходных30 минут. Повтор идентичного terminal event допускается
как повтор доставки; изменённый terminal part с тем же ID refused. Все события
сохраняются у controller до проверки, а не заменяются последним статусом.

Проверка file snapshots не заменяет native admission/upload: следующий слой
итогового аудитора отдельно связывает prepare/input_artifacts, delivery/import,
свежую JS операцию, Save/cold/cleanup и candidate/knowledge pins. Пока эти слои
не реализованы, успешный транспортный тест не получает acceptance PASS.
Первый модуль проверяется на SQLite fixtures фактической структуры и
самостоятельных негативных случаях, без запуска candidate до F review.

## Проверки и воспроизводимость

Связка публичного node call с native admission проверяет реальный compact
profile. Agent `session/tools.ts` соединяет MCP text blocks через `\n\n`;
первый JSON block — receipt, следующие blocks могут содержать advice. Runtime
`user-workflow.mjs` восстанавливает полный ранее выданный workflow_ref, добавляет
read/mapping/budget defaults, а для нового text import — source/format/column
defaults и путь из подтверждённой delivery. Поэтому raw compact arguments не
обязаны равняться expanded journal request. Аудитор проверяет точное ожидаемое
расширение и сохранение всех явно заданных параметров/source_text, original ID,
public polling/retry, final checkpoint/outcome и public execution/node identities.
Это отдельная связка; она не доказывает бизнес-правильность или отсутствие hardcode.
Текущий normal-worker binding охватывает attempt1, status/wait и SAME-ID apply
retry без повторного native admission. Resume/multiple terminal outcomes требуют
отдельной проверки reconciliation; не игнорируются и не объявляются этим helper
принятыми. Общий acceptance verdict до добавления всех обязательных слоёв отсутствует.

Итоговая задача требует Save последней редакции по unique path, а не два Save
из исторического calculator сценария. Проверка не вводит искусственное требование
`package.save_as` или модельного reopen: обычный `package.save_checkpoint` и
последующий независимый cold reader должны закрывать persistence. Full small
result может быть прочитан поздним `dock_node_read`; сам default apply preview
на5 строк не является полным6-row proof и не заменяется controller-only read.

Late output-read binding реализован отдельным явным режимом
`verify_cli_node_binding(..., source_operation_id=<original JS Execute>)`.
Он проверяет actual `dock_node_read` compact expansion, retained source/schema/
verified phase receipts, fresh execution identity и public/native checkpoint
и cell equality; ordinary apply default остаётся строгим. Native слой реализован
в `javascript_read_output_evidence.py`:6 точных фаз, externally derived parent
source/settings/node, четыре полных owned closed source-read группы и две preserve
admissions, новый Execute, Table/restoration/workflow-return с независимым6×4 oracle.
Каждый UTF-8 chunk требует собственного reader step/open/discard; четвёртая группа
свежести идёт после dispatch ACK до actual Execute. Semantic retained schema
не содержит наблюдаемый Table `header_tid`, который отдельно связывает Table audit.
Исторический parent baseline не сертифицирует нынешний writer lifecycle. Итоговый
аудитор должен объединить native proof с отдельным public CLI read binding.
Controller-only read и совпавшие metadata без этих фактов не дают acceptance PASS.

Обычный standalone CLI не принимает `acceptanceCleanupPackage`, как закреплено
в [регламенте](../../workflow/acceptance-cli.md). `host.ts` не передаёт этот флаг;
special supervised technical startup не заменяет normal model run. Штатное
завершение backend/host/runtime и браузера само не доказывает закрытие пакета
и Loginom logout. Их собственные native evidence и process termination должны
иметь отдельный проверенный путь до запуска Sol-приёмки. Source route подключён
на49dcfa0d99 через private normal boolean и отдельный receipt/event; fresh native
proof и whole controller binding остаются открытыми. `javascript_cli_cleanup.py`
наeb051/948bc сам сверяет последний own Save и final normal native receipt/event,
owner/pins/guards и actual SQLite model terminal→dirty/tool/native time order;
13 tests используют actual compact Save/advice producers/SQLite и synthetic
close data. Он не выводит process cleanup или whole acceptance из SUCCEEDED.
`LinuxProcessOwner` наec73da наблюдает original fresh-session Popen и `/proc`
PID/start/UID/boot, session/known descendants, actual exit0 и guard absence;
9 actual process tests не являются CLI/browser/candidate evidence. Нужна
controller binding всех известных own runtime/browser identities; escaped до
first observation descendants этим observer не подтверждены. Observer не
посылает signals; first terminal failure сохраняется.
На9b8e40b418 `JavascriptProcessController` создаёт actual original standalone
Popen с обычным Sol/low/headed argv, сохраняя original30-minute ceiling, file bytes,
candidate before/after и OS executable/entry identities. Detached browser от
Playwright обнаруживается отдельно по exact pinned executable и own user-data-dir;
его session и известные PID/start сохраняются после root exit. Headed/sandbox/
direct policy, inode/ctime и observation failures проверяются без raw argv export.
Cold factory повторно читает own writer SQLite и original delivery, требует
last-native-Save/Close/logout plus original process finish, затем запускает только
exact-path reader в отдельном fresh profile с10-minute ceiling и frozen file pins.
Process-only или чужой serialized receipt такого запуска не разрешает.
Source tests15/9/11 и Host25+6 не являются candidate factory/native live proof.
Наc664f40c61 original controller `create_capture` выводит Node/redactor из
своего проверенного candidate и credential values из own private Linux profile.
`collect` получает actual controller/capture objects; raw stdout/stderr не
пишутся в предварительный файл. Worker через private pipe фильтрует hidden
content/binary, включая вложенный JSON и multiline PEM, и применяет существующий
canonical redactor до записи0600 evidence. Complete public payload сохраняется;
invalid/oversized/unredactable/unknown lines отказывают, never silently truncate.
Финал сверяет source/file identity/hash и clean redactor ACK/exit.
Expiry original30-minute ceiling вызывает SIGINT только original PID-fd root,
bounded cleanup grace до90000ms и при необходимости own-root SIGTERM.
Неизменный исходный deadline и отказ остаются в controller finish даже после
clean exit; поздняя уборка не открывает cold gate. Live inherited pipe/child
после root exit — отказ, не process PASS. Source21/15/9 tests/provenance5045
не являются compiled candidate/model/native proof.
До F остаются authenticated native journal, campaign lease orchestration,
complete cold imports freeze к candidate runtime и whole composition.
На17c994f042 source freeze копирует весь committed QA tree из проверенных Git
blobs matching candidate source SHA; untracked files/checkout runtime не копирует.
Private readonly files и separately pinned manifest содержат complete QA inventory;
overlay `client/src/executor/examples` связан только с exact candidate resources.
Cold factory требует этот descriptor и повторяет integrity check после exit,
наблюдает original Node entry identity, не принимает flat file-list receipt.
Source10 Git/filesystem/actual external Node inert-loader tests и15/22 regressions
не являются generic cold imports/compiled candidate execution proof; эта проверка
входит в fresh candidate после F. На том же source capture после первого transport
timeout прекращает повторные RPC ожидания на следующих строках; hung worker
отказывает окончательно. До F остаются fresh native journal ownership,
campaign lease/technical cold collection и whole composition.
На15c0fb4f3c `NativeJournalWatch` наблюдает новый own managed attempt и append
journal, связывает его с actual process/profile/public prepare/source metadata.
После terminal исходного controller фиксирует private normal artifacts
inode/bytes/SHA, timestamps и последний cleanup event; перед cold повторяет сверку.
Изменение, alias, old attempt или незавершённый процесс отказывают, отказ sticky.
Это observed origin binding, без exclusive-writer claim и без Close/logout PASS.
Production URL разрешён только в точных plain/testable формах, raw data сохранены.
75 source/process tests/provenance5045 PASS; actual native CLI ещё впереди.
До F остаются technical cold collection, campaign lease и whole composition.
CLI Node Host передаёт explicit visibility и в preflightHeadless наab721a703e;
Desktop direct-host default сохранён, cleanup flag от visibility независим.
`managed-resources-close.mjs` уже проверяет реальный bridge result перед success
resource ACK; absent/rejected/false result или retained leases не подтверждают
shutdown. Actual IPC/socket/profile tests не являются native package/logout proof.

`javascript_cli_persistence.py` реализует только normal-worker last Save/dirty-state
binding. Выбранный JS Execute должен иметь public/native node binding; финальный Save
идёт после него по externally allocated own path с pinned action revisions.
Все public Save IDs должны иметь единственный native admission/completion;
SAME-ID retry связывается с той же mutation и новым bridge dirty read. Новый source
или admitted mutation после Save требуют последнего checkpoint. Первый путь нельзя
перезаписывать; `replace` относится только к подтверждённому собственному Save.
Public compact Save output, continuation и JSON advice сверяются с native facts.
Последний read обязан подтвердить `modified:false`, read_only и собственные
session/document/account/path, без заявления о persisted calculations.
Предыдущий dirty Save может завершиться новым checkpoint; два Save не обязательны.

Helper сверяет rendered graph между native Save preflight/trace, но не объявляет
это независимым доказательством GUIDs/topology/positions. Его cold persistence,
settings persistence, native GUID graph, process cleanup и CLI acceptance flags
остаются false. Отдельное path-only cold чтение должно связать actual source bytes,
settings/mappings, GUID graph и fresh полный результат с writer, после нормального
закрытия writer. Ни runtime-produced unit fixtures, ни старый immutable trace
не заменяют свежую headed candidate/CLI проверку.

Cold evidence связывается с фактическим отдельным path-only technical reader,
без фиксированных writer source revisions и6×2 oracle. Его original10-minute
process deadline и owner задают внешний ceiling только для bounded Table-card
settlement: у этого reader нет `node.apply` admission. По умолчанию procedure
auditor по-прежнему требует original apply/read phase; journal rows не добавляются
и не переписываются. Наблюдения Table проверяются до restoration отдельно от
последующего cleanup: format/filter controls, native pages и все typed клетки
должны совпасть с независимым6×4 oracle. Fresh group связывается с отдельной
подтверждённой Execute procedure и actual terminal, не с общим status отчёта.

Writer baseline содержит actual source, native settings digest, обе mappings,
GUID/indexed-port graph и execution identities. `javascript_source_evidence.py`
общий для configuration/read/cold: каждый fragment имеет свой step и четыре
ordered open/discard dispatch/settled receipts перед delivery; owner/epoch/deadline,
UTF-8 offset/digest/cursor и весь source проверяются для каждой full-read группы.
Configuration связывает original ceiling с `node_apply_prepared`; cold сохраняет
три fresh full-read группы даже для32KiB/8 fragments каждая.
Сравнение нормализует только
document/workflow/DOM epoch, wizard prefix и уже принятый `ConnectedRecord:null`
как отсутствие; любое non-null значение и остальные настройки сохраняются.
Первые cold output caches могут быть пустыми для code или configured/source_pending
для declared; после Execute требуется полный reciprocal mapping. Caller отдельно
связывает baseline с writer lifecycle/Save, исходники reader с freeze и реальный
launch argv/процессы с controller evidence. Cold report/journal helper сам не
выставляет whole CLI, model authorship, authenticated journal или process PASS.

Native admission связывается с фактическим standalone Host, без Codex/Hermes
ticket envelope. `packages/loginom-host/src/host.ts` передаёт в `inputStore`
chat `${generation}:${cliSessionID}` и исходный user message ID. `inputs.ts`
формирует имя `${SHA256(JSON.stringify([chat,userMessage]))}-${index}-${name.slice(-120)}`;
`name` — basename, `slice` использует UTF-16. Поэтому `input_artifacts.name`
нельзя сравнивать с простым исходным именем вложения. Индекс берётся из фактического
порядка file parts; имя, bytes и digest связываются с original user snapshot.
Первый успешный `loginom_dock_prepare` должен подтвердить fresh owned draft,
runtime/catalog pins и точный native workspace journal. Upload grants должны
иметь уникальные IDs, папку своего аккаунта, точный destination и overwrite=reject.
Это admission proof, а не загрузка/импорт/исполнение или итоговая приёмка.

Production `execution-journal.mjs` пишет в `target` фактический
`metadata.targetIdentity` из workspace: profile_id/loginom_build/platform/browser.
В isolated fixed captures использовался origin/build. Configuration/output
аудиторы сохраняют прежний строгий default, а для production получают отдельно
закреплённые target/origin: весь journal target должен совпадать с внешним pin,
origin/build всех native observations — с известным стендом. Переписывать
production journal под старый origin-header нельзя. Тестовая проекция header
старого capture проверяет лишь совместимость формы; fresh CLI proof ею не заменяется.
Для origin допустимы только URL.origin и эквивалентный root URL.href с `/`;
пути, query/fragment и другой сервер не принимаются. Исходные bytes/digests сохранены.

`javascript_cli_candidate.py` отдельно сверяет Linux x64 bundle с внешними
immutable pins: исходный commit/tree, manifest, Node/browser и модуль JS knowledge.
Проверка читает полный inventory, права и symlinks по контракту `cli-manifest.ts`,
а вложенный resource manifest связывает с фактическими файлами и ограничивает
ссылки своим resource root по `resources.mjs`. `sourceDirty` сохраняется как
факт manifest; clean tree не вводится как дополнительное условие. Файловые
fixtures проверяют также согласованные изменения inventory/resource manifests,
чтобы отказ не ограничивался внешним hash manifest. Этот модуль не исполняет
бинарники и не доказывает доставку knowledge или использование candidate моделью.

Unit/regression tests проверяют настоящие Python функции и отказ при изменениях
owner/deadline/sequence/source/settings/mapping/value/type/NULL/row/schema/freshness.
Санитизированные минимальные fixtures не содержат secrets, полных логов,
готового JavaScript или бизнес-oracle в каталоге, доступном модели. Приватные
неизменённые headed-журналы Code449/declared450 используются дополнительно;
их hashes и команды записываются в checkpoint. Это повторный анализ имеющихся
наблюдений, не новый live run. Свежая product/candidate headed-проверка и две
Sol/low CLI попытки следуют после предусмотренного same-task F review.

## Предложение штатного CLI package teardown

**Принято пользователем 2026-10-02; source реализован на49dcfa0d99.** Это отдельное изменение
обычного standalone CLI lifecycle, а не включение special acceptance флага.
Для JS-приёмки необходимы подтверждённые собственные package/session closure
до независимого cold reader; нынешний product закрывает только ресурсы.

Принятый вариант — host-owned `closeSavedPackageOnShutdown:boolean`,
включённый только standalone `run`, отключённый для validation/readiness и
Desktop. Boolean идёт по private Host→runtime start, не в public MCP/model API;
caller не передаёт Loginom owner или package path. Bridge сохраняет **последний**
подтверждённый собственный Save/path/operation независимо от порядка Map keys.
На shutdown после drain проверяет отсутствие active/unsettled work и вызывает
существующий `makePackageCleanupCode` в исходном authenticated context.
Native guard заново подтверждает document/preparation session/account/path,
один собственный package, не-running и fresh `IsPackageModified:false`, затем
ровно один guarded native Close и собственный UI logout. Ни automatic Save,
ни discard, Stop, foreign-session close, второй CDP context не добавляются.

Нормальный receipt `saved-package-cleanup.json` и event
`managed_saved_package_cleanup` отдельно связывают последние Save ID/path,
native close/logout outcome и actual actor/runtime/candidate pins. Они не
называются special `package-cleanup.json`/`isolated_package_cleanup`. Unprepared
runtime без workspace может пропустить package step, но это не acceptance PASS.
Owned workspace без confirmed Save, dirty/foreign/ambiguous state или refusal
даёт BLOCKED cleanup и ошибку ресурса; неизвестный эффект не повторяется.
Приёмочный аудитор требует SUCCEEDED native receipt плюс отдельно clean Host,
runtime/browser process termination и сохранённый cold readback.

Альтернатива — отдельная private lifecycle операция собственных Host/runtime,
которую `standalone-run` вызывает после terminal модели и до Host close. Она
использует тот же internally derived last Save и native guards, не доступна
модели, не принимает scripts/foreign identities. Resource close остаётся
самостоятельным шагом. Вариант требует дополнительной private маршрутизации и
receipt binding; даёт явную границу terminal→package cleanup→resource close.

Оба варианта сохраняют обычную автономную модельную попытку: controller не
подменяет инструментальные вызовы/код/вычисления, teardown идёт только после
её terminal. Native cleanup, failure→retained profile, scalar settings unchanged,
compiled headed candidate и независимый path-only cold проверяются отдельно.
Пользователь поручил подключить существующий механизм к обычному CLI после
представления вариантов; реализуем рекомендованный automatic shutdown.
Альтернативный private step не нужен. Текущая source JS implementation и
resource ACK fix сохраняются. Native cleanup имеет собственный bounded shutdown
budget: private runtime close 45000 ms и outer Host close 60000 ms в новом режиме;
это не продление model/node operation deadlines и не повтор неизвестного эффекта.
