# Независимые аудиторы JavaScript для фазы 4

Продолжение утверждённого [плана](plan.md), 2026-10-02. Аудиторы читают
сохранённый native journal; не запускают Hermes, браузер или JavaScript модели.
Решение `allow_configured_output: true` остаётся отдельным контрактом чтения
контекста и не превращает `source_pending` в доказательство исполнения.

Для будущей автономной приёмки пользователь 2026-10-02 назначил
**`openai/gpt-6.1-sol`, variant `low`**. Launcher, SQLite/model delivery checks
и их адресные тесты должны использовать эту точную модель до нового запуска.
Ни прежние source tests, ни исторические model metadata не подтверждают
адаптацию; их исходные значения и evidence сохраняются. Silent fallback
на прежнюю модель не допускается. Две попытки по30 минут и Astra/medium review
остаются по плану.

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

`javascript_node_acceptance.py` реализован в child на **e5e8c9928674** как
операторский API общей writer/trial/pair композиции. Использует реальные standalone
CLI records и original controller/capture objects, не принимает serialized PASS.
Связывает candidate/knowledge, OAuth Sol/low, original prompt/file snapshots,
native import/source/Execute/full output, last Save/Close/logout и separate cold.
До fresh compiled candidate trials это source implementation, не CLI acceptance.
`ready_for_acceptance`/accepted registry не повышены. Configuration/output helpers
сами по себе не доказывают автономность, отсутствие hardcode или persistence.

## Входная проверка standalone CLI

Первый транспортный модуль — `javascript_cli_evidence.py`: собственная сессия
из `<profile>/data/loginom-ai-agent.db` читается SQLite `mode=ro`/`query_only`.
Используется фактическая v1 схема `session`/`message`/`part` и восстанавливаются
ID из колонок, как `message-v2.ts`. Наружу выходят только модель/вариант,
hash/размер/имя текстовых file snapshots и metadata/digests публичных tool parts.
Reasoning, system/developer, auth secrets, бинарные вложения и исходные payloads
не сохраняются и не печатаются. Этот модуль не экспортирует базу.

Очищенные CLI `events.jsonl` сопоставляются с metadata собственной сессии:
фактические OpenAI GPT-6.1 Sol / low, terminal tool IDs/callIDs/messageIDs/status/time,
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
иметь отдельный проверенный путь до запуска GPT-6.1 Sol / low приёмки. Source route подключён
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
Popen с обычным headed argv, сохраняя original30-minute ceiling, file bytes,
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
Наb3878d0bd1 explicit technical cold mode сохраняет одну redacted summary отдельно
от CLI events; тот же original-process loop удерживает10-minute ceiling/отказы.
Cold factory не создаёт operator evidence заранее, проверяет adjacent private
assignment/campaign/profile/account и config hashes до/после. Freeze v2 включает
committed sibling product release с exact Git/source/Node/browser pins.
75 actual Node/Linux/filesystem source tests/provenance5045 PASS; generic operator
и actual factory/live остаются после F. До F остаются lease/whole composition.
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
GPT-6.1 Sol / low CLI попытки следуют после предусмотренного same-task F review.

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


## Общая композиция и manual host lease — 2026-10-02

Source **e5e8c99286744bb4e08e325291211fb98ddb677a** добавляет
`JavascriptCliAcceptance`. `audit_writer()` читает только original factory
collection, rechecks closed capture inode/bytes/SHA и pinned worker/redactor/Node,
first prepare/native metadata/append journal, actual own SQLite OAuth model/variant
and file snapshots. Public compact request/reply связываются с native operations.
Model-authored Done → preserve Execute поддерживается; current code берётся из
последнего успешного public source-bearing operation для того же owned node.
Configuration и две fresh execution groups обязательны даже при later full read.
Полный6×4 может поступить из apply с explicit full read либо actual model
`dock_node_read`; controller-only full read и default5 preview не принимаются.

Input bytes/delivery/import/configuration/fresh execution связываются с actual
GUID edge import output0 → JavaScript input0. Native writer GUID graph берётся из
completed `node_target_checkpoint.target_state.final_graph`, не из rendered Save
graph и не из отсутствующего в normal managed runtime operator-only boundary.
Last Save/dirty/native Close/logout сверяются отдельно, вместе с model/tool/native
time order и original process absence. Source/settings/mappings/graph baseline
остаётся private в объекте. `launch_cold()` вызывает existing path-only factory
после всех writer checks. `finish(cold,capture)` сопоставляет original separate
Node PID/profile, frozen entry/candidate/QA, exact own report/journal/summary,
preserved source/settings/GUID graph, fresh Execute/full6×4 и cleanup/processes.
`verify_javascript_cli_pair([code,declared])` принимает два original terminal
объекта с одинаковым candidate/freeze, четырьмя disjoint profiles/processes и
разными CLI/runtime sessions, save paths и lease IDs. Native/capture/cold evidence
повторно читаются; ни один partial receipt сам не становится whole PASS.
На **1a8d236b76** final pair также перечитывает actual own SQLite projection
каждого writer и сравнивает её с original cleanup projection. Изменение после
первого trial не скрывается за сохранённым промежуточным verdict.

### Независимый разбор фактически авторского кода

Пункт2 фазы6 требует не только authorship, но и отсутствие подставленных ответов.
Поэтому **после actual writer terminal, до первого audit_writer/cold**, оператор
полностью читает actual model source и сохраняет private review artifact вне
model directory/profile/candidate/frozen QA. Не использовать regex как
доказательство семантики и не выдавать hash за доказательство алгоритма.

`source_review={path:ABS,sha256:SHA}` у constructor связывает физический private
JSON format `javascript-cli-source-review-v1`: owner_task_id, cli_session_id,
candidate_manifest_sha256, schema_mode, prompt_sha256 (raw UTF-8),
input={filename,bytes,sha256}, source_sha256/source_utf8_bytes, reviewed_at,
decision=`VERIFIED`, checks. Пять checks — input_rows, row_values, net_cents,
status, no_injected_answers — содержат reason, inclusive source_lines=[first,last]
и source_excerpt_sha256 точных LF/UTF-8 строк без trim. Последний check охватывает
весь source. Reason должен описывать фактически прочитанный алгоритм, NULL/order
rules и отсутствие готовой таблицы ответов. Schema отдельно проверяет native
configuration audit. Отсутствующий/другой review не даёт acceptance; его presence
не является mathematical program-equivalence proof или authentication reviewer.
Source-only fixture review проверяет format/byte binding, не бизнес-истинность.

### Привязка manual registry к original holder

`JavascriptAcceptanceLease` только читает существующий manual host registry;
не создаёт dispatcher, queue, stale-lock recovery или automatic release. В
`host-resources.json.acceptance_lease` вручную закрепляются lease_id, owner_task_id,
campaign_id=`javascript-20260926-ubuntu`, node_id=`component.programming.JavaScript`,
account=`jsteach`, worktree, cli_profile, cold_profile, candidate_manifest_sha256
и status reserved_active/running/cold_reading/cleanup_pending. Existing own
preparation lease допустим только при browser_status=closed_verified и
active_exec_session=null; busy same account или overlapping foreign profiles
отказывают. registry_owner должен совпадать.

Под existing atomic acceptance.lock original outer controller сохраняет private
owner.json с lease_id, owner_task_id, campaign_id и holder: actual Linux pid,
parent_pid, process_group, session, start_ticks, uid, boot_id. Gate создаётся
**тем же живым outer process до Popen**, проверяет own UID/private canonical
paths, immutable lock metadata inode/SHA и live holder. Каждый CLI/cold profile
потребляется один раз до запуска; failed admission остаётся отказом. Lease/lock
удерживаются до независимого native/process cleanup. Gate не выводит cleanup
из статуса реестра и не снимает чужие/устаревшие locks. Release выполняет owner
по manual workflow; whole verdict не объявляет host_lease_release verified.

### Запуск операторского API

После F и candidate build выполнить complete QA freeze. Python controller/API
должен импортироваться из этого frozen QA root, а worker — быть exact
`javascript-cli-redact-worker.mjs` из него. Запускать original outer Python
с `python3 -B -u`/`PYTHONDONTWRITEBYTECODE=1`, чтобы import не создавал
untracked __pycache__ в strict frozen inventory. Cold Node argv по-прежнему
только config/profile/browser/evidence/package; код, oracle и review туда не
передаются. Exact private campaign bootstrap invocation и original handles
записать до actual trials. Это API, не новый пользовательский CLI transport.

Source validation: composer10, lease/controller/CLI capture/cold capture59,
native13 и execution/configuration regression11 —93 addressed test methods PASS;
provenance5045. Private receipt `f-cli-composition-validation-v1.json`, SHA256
`35cacc9bac7c4f317c4eeac5d50d00ab03fd9e03f0542a938ab0bbb59f16b9e0`.
Actual compiled writer/cold factories, fresh headed native cleanup и final
CLI trials этим не подтверждены.
Дополнительная SQLite regression composer10/CLI evidence13 —23PASS,
actualexit0; методы пересекаются с основной source validation. Private receipt
`f-preparation-sqlite-revalidation-v1.json`, SHA256
`2a0088c4eac3c900c98550d709645d64f61fc3f67a7f5c5bedbcbd5ebe35c51b`.
Эта подготовительная source-проверка не засчитана как formal same-task F:
пользователь подтвердил Astra/medium, текущий незавершённый ход ещё Sol/xhigh.


## F source review — 2026-10-02

Same-task review выполнен на фактическом Astra/medium. На **e02e8fd41f**
исправлено расхождение назначения: normal launch argv/receipt, actual SQLite
model check и общий writer auditor требуют **openai/gpt-6.1-sol / low**.
Старая модель в user или assistant metadata отвергается.68 адресных tests
и provenance5045 PASS; это source проверка, actual candidate/live ещё впереди.
[Scope и receipt](checkpoint.md#f-same-task-source-review-и-модель-общего-аудитора--2026-10-02).


### Original и redacted CLI delivery — 2026-10-02

Live J21 read04 выявил различие исходной SQLite terminal projection и очищенного
CLI stdout: составной Save содержит несколько JSON text blocks. Обрабатывать
их regex как единый текст нельзя — теряются кавычки; hash очищенного ответа
также не обязан совпадать с raw SQLite. QA collector до очистки вычисляет только
SHA256 безопасной terminal projection, после очистки — SHA256 всего публичного
события. Зарезервированное `_capture_terminal` создаёт только original collector;
producer не может его передать. Whole acceptance требует эту привязку для
каждого tool event и неизменные original capture files. Metadata auditor сверяет
raw digest с новым read-only SQLite projection, sanitized digest с событием,
оставляя строгие identity/deadline/truncation guards. Без binding прежняя точная
сверка остаётся доступна изолированным unit audits; whole acceptance её не
принимает. JSON sequence чистится структурно, known secrets собираются сразу
из всех блоков. Секреты и исходный stdout никогда не сохраняются.

Это исправление существующей приёмки в согласованном плане. Повторная очистка
старой SQLite полезна для regression, но не заменяет новый original live capture.


### Actual Host identity и public catalog pins — 2026-10-02

Native collector использует SHA256(backend SessionID) для `chats/<hash>` по
HostPort.acquire; generation проверяет отдельно. Строка SessionID вместо hash
в unit fixture не соответствует standalone Host. Public session_manifest —
каталог actions/selectors и compatibility; он не обещает clientRevision.
Источник runtime identity — private own session.json clientRevision и полный
clientSourceManifest, сверенные с byte pin exact candidate. Public action digest
и private action digest обязательны; дополнительный public clientRevision, если
появится, обязан совпасть. До trials runtime/catalog pins закрепляются отдельно;
local source catalog не заменяет manifest, фактически полученный с сервера.
