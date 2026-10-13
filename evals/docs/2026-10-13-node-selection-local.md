# Локальная приёмка выбора узлов

Источник требований — согласованные spec и plan в `docs/superpowers/`.
Этот запуск выполняется в текущей системе без общего isolated runner.
Продуктовый baseline фиксируется до изменения `loginom-automation`.

## Модель и окружение

Пользователь выбрал `gpt-6-sol`, reasoning `medium`, fast. CLI принимает
`--model openai/gpt-6-sol-fast --variant medium`: alias сохраняет API model
`gpt-6-sol` и запрашивает `serviceTier:priority`. Фактически обслуженный tier
не предполагается по имени alias.

Публичный каталог модели копируется в `frozen-models.json`, его SHA закреплён
в pins обеих серий. Дочернему CLI передаётся `LOGINOM_AI_AGENT_MODELS_PATH`.
Пользовательская конфигурация моделей не меняется.

Текущая локальная серия использует существующий профиль `analytic-evals`:
status/check подтвердили `http://localhost/app/`, user, /user. Client на порту 80
проксирует WebSocket на существующий `loginom-server-7.4.2-test:8080/ws/`.
Container ID, сеть и UserStorage проверены read-only, public routing evidence
сохранён в приватном каталоге серии. Профили и настройки не перенастраивались.

Серия: 18 baseline и 25 candidate (18 standard, 3 explicit-js, 3 tags,
1 recovery). Первые 9 candidate входят в эти 25; повторы разрешены только
после чистой первой волны. При нарушении политики следующие слоты этой
 версии skill не запускаются. До model dispatch инцидент не занимает слот;
после dispatch провал сохраняется в знаменателе.

Текущая серия `20261013T192418Z-c71363` остановлена после2baseline/0candidate.
Sales1 полный machinePASS; ABC1 CLI1/wrapper3/cleanupfalse на стандартном Group
после successfulJS. Exactgeneric script output click deny конфликтует с Group/
newSort preview. План требует private owned-preview fix без общегоJSallow, новую
matchedпару/native proof и полный18+25; старые outcomes не переносятся.

Private JS output preview для Group/newSort исправлен в `dd8d480706` по TDD:
3810PASS/0FAIL/10SKIP Node24.19 upstream, independent review Approved.
PublicJS guards/skill не менялись. Новый run203142 готовится; его native proofs,
immutablepins/admission и модельные18+25 ещёpending. Старый current-run192418
не является разрешением продолжать остановленные model slots.

Новая пара203142 построена/verify0 на общемdd8d480706, runtime47b871…/288 equal,
baseline exactold2skills/candidate current2skills. Wholepair/pins independent
Approved (47f9f35b…/305a8573…); новый immutable locke6eedea2…,
43unique18+25slots/unchanged72+2/model/seed/tasks/0oldoutcomes. Native prerequisites
и admissionpending: пока не запускать ни baseline, ни candidate этой пары.

PrivateJoin203142/1 остановился до создания import0: initial emptySave прошёл,
workflow_continuations:[], затем stalePackage1 navigation/NOT_APPLIED. Реальные
ownpackageclose/logout/ACKexit0 подтверждены, исходныйexit1 сохранён. Отдельный
corefixture использует Save послеcompletedimports, без emptySave/standalone
stale inputrereads; обязательные hiddenroles/output/Save/cleanup сохраняются.

PrivateJS203142/1 остановился до Group/Sort: fixture не прочитал roots cursor
после первой страницы32/92. Import/JS/Save/beforefullXML verified, actualclose/
logout/ACKexit0 complete; originalexit1 сохранён. Separateproof-2 paginates roots
и details independently с sameID/revision/bounded16; staticApproved0da15709…,
mandatorynative branches pending. Не менять frozenпару/pins или старыеoutcomes.

Joinproof-2 actualcorePASS/independent2bbc5532…:обаhiddenroles/freshoutput/
3nodes2linksnoJS/Save/close/logout/ACKexit0; standaloneInputReread=false.
JSproof-2 stopped доbranches на genericUI с LOGINOM_RUNTIME_FAILED;
owncleanup confirmed/stopreviewe2cebed0… . Первоначальная validator-гипотеза
опровергнута: user profile не предоставляет dock_ui_action, bridge отклоняет
Unknown Dock tool (-32602) до uiAct. Instrumentedproof-3 тоже exit1 до branches,
его wrapper ожидал -32603; original failure/close/logout/ACKexit0 сохранены.
Privateproof-4 использует обычный managed-entry: actual catalog без genericUI,
live JS allowed_actions:[] и отдельный actual pure guard check на live snapshot.
Не объявлять pure guard live UI receipt. Group/directSort проверять штатными
node calls; Product/runtime/pins unchanged.

Privateproof-4 впервые вызвал Group на actualJSoutput: import/JS/Save SUCCEEDED,
nativeclick ACKreturned; nextinspect остановился на Managed preview native port
changed до F3/Groupcreation, Sort не вызван. Originalexit3/cleanupfalse сохраняется.
Ownuser90 initialization21:39:48.808Z/nativeGUID bound, rootclosed/admin2freshabsence/
logout/MCPexit0, writerabsent. Exactcompoundpredicate требует отдельного bounded
diagnostic tuple из того же failing inspect; privateproof-5 явноinstrumented,
guard/controlflow/Product/pins неизменны. Не запускать модельные18+25 до gatePASS.
Independentrecovery f81ff164… подтвердил exactuser90close/noReinit/adminlogout/
сохранностьotherrows/raw/source и отсутствие PID/.writer; originalcleanupfalse
остаётся исходным failed outcome.

Instrumentedproof-5 isolated actualDOMredraw: sameElement=false/oldDisconnected/
currentConnected при sameNativeShape/Port/Data/Cell и selectedownport. Original
exit3/cleanupfalse preserved, F3/Group/Sort не выполнялись; это не gatePASS.
SourceTDDfix сохраняет native/owner/pre-gesture guards и должен обновить verified
privateDOMticket после select для F3. Сначала отдельный privatecandidate native
probe; после успешного sourcefix нужна новая immutablematchedпара и её finalgate.
Rootownuser92closed/admin2freshabsence/logout/MCPexit0; postreviewpending.
Postreview2e649a27… completed: exactuser92close/noReinit/adminlogout,37raw/
56sourceClosure/4397immutableRuntime paths unchanged; currentallowedsourcefix
отдельно отмечен. SourceDOMfix bf5dd674…/218relevant tests frozen; independent
source review/privateproof6 готовятся, fullupstream после clean nativeprobe.
SourceDOMreview Approvedf2a80fb9… . Privateproof6 Group+Save SUCCEEDED,
originalexit1 — privateintegerreader отказал на nativeSUM Totaltype real с
verifiedbinary64 values17/21/decimal1.7E+01/2.1E+01. Sortnever; ownclose/logout/
ACKexit0 verified. Separateproof7 actual028TDD exactrealassertion only; sourcebf5/
pair47/expectedvalues не меняются, fullnative+upstream ещёpending.
Privateproof7 Group/directSort+Save PASS, fullJS component/source/schema after
both unchanged; DOM sourcefix fullupstream3828/3818PASS/0FAIL/10SKIP/exit0,
verification98cdb115… completed. Firstexport-group input_mapping refused:
Done enabled без finish_wizard из-за unobserved input_port_context. Request/schema/
mapping valid, exactnativepredicate UNKNOWN; boundedreadonlycapture next.
Originalexit3/cleanupfalse сохранён. Ownuser95closed/admin2freshabsence/logout/
MCPexit0; postreviewpending. Ordinarynewpair/nativeCSV/model18+25 pending.
Recovery/component review cf1fbfc8… completed: exactuser95/admin96 closed,
noReinit/others/raw/payload preserved; full JS component before/afterSort equal.
Minimalprivateproof8 Import→Group→Export сохраняет source type/schema/breadcrumb
layout для bounded readonly input-port/navigation capture. No guardfix до actual
predicate; non-reproduction не подтверждает необходимость Product changes.

Серия `20261013T192418Z-c71363` использует общий source05b645eec9. Обе сборки
sourceverify0, independent pair/pins Approved; native canonical Join core
подтвердил оба hiddeninputs/output/Save/cleanup/logout. Full private driverexit1
на дополнительном stale retained import reread сохранён, inputsUnchanged не
подтверждено. Review SHA0e622b9d…; actual newprepare/15schema gap attestation
SHAc485ce08… . Новый полный denominator18+25, прежние исходы не переносятся.

Историческая серия `20261013T142936Z-072953` дала baseline18 oracle/calculation,
policy12/18 старого skill, JS9; candidate2 начаты, sales PASS/ABC Join blocked.
`20261013T132356Z-0a3983` остановлена
после двух baseline и сохранена отдельно. Исходная `20261013T093809Z-f5d429`
остановлена после трёх baseline и сохранена отдельно. Пользователь поручил
самостоятельно устранять блокеры; необходимый общий runtime-дефект
`imports.text.date_format` исправлен по TDD в `263df9620`. Обе новые сборки
на `1bfc135430` выполнены в одном worktree и проверены против owning source;
runtime/dependencies/compiled CLI побайтно совпадают. Native Host proof дат,
Save/cleanup/logout прошёл без LLM. Smoke не входит в 43 модельных слота.
Новая пара также включает dataset output overflow fix `c2c898aca5`; exact native
overflow/Close/output/Save/cleanup подтверждены отдельно без LLM.
Новые pins immutable; inputs/oracle/model/reviewSeed прежние. Исторический
acceptance lock сохранён побайтно, новые hashes привязаны отдельным
`pins-preparation-review.json`, 72/72 current source hashes PASS.

## Одна попытка

Из `evals/`:

```bash
bun script/run-node-selection-attempt.ts --pins /absolute/baseline-pins.json \
  --task sales-by-category --attempt 1
```

Pins закрепляют payload/profile, manifest SHA, skill digest, каталог модели,
model/variant, task prompt/input/oracle hashes, публичное подключение и
подтверждённый server container/storage. Пароли, OAuth и API keys не включаются.
Один вызов запускает одну модельную попытку. Каталог существующего слота не
перезаписывается. Для повторной оценки сохранённых данных вызывается только
offline-аудит; он не запускает модель или Loginom.

У ABC/1 третьей серии CLI0/cleanup true, но исходный wrapper2 остановился на
Help в receipt parser. Повтор модели не выполняется. Exact copyout и offline
аудит сохранены в отдельной явной проекции `evidence/abc-collector-recovery`:
только receipt paths добавлены к копии attempt metadata, original outcomes
и hashes неизменны. Итог этой попытки читать вместе с исходным attempt.json,
`forensic/{receipt-recovery,copyout-recovery,copyout-recovery-review}.json` и
audit проекции. Baseline policy failed из-за двух JS, oracle/calculation true.
Collector `f5eb5373e2` ограничивает только receipt projection по `loginom_dock_*`;
полные parts/Help сохраняются. RED/GREEN, 88 целевых tests, typecheck и independent
review PASS. Historical lock сохранён; `collector-fix-lock.json` закрепляет новый
runner hash, 71 прежний hash и неизменные runtime/pins/auditVersion. Та же текущая
серия продолжается без пересборки matched payload и без повторения ABC модели.

Второй audit fix `e871bf81d2` распознаёт успешный retained node.apply outcome в
resolved/verified operation_inspect после USER_RESPONSE_BUDGET. Identity/cleanup/
execution/runtime gates сохранены; 106 tests/typecheck/independent review PASS.
`settlement-fix-lock.json` закрепляет новый auditVersion `2654bfc1…`, прежние pins
и historical locks. Для первых восьми baseline текущие оценки находятся в
`evidence/settlement-reassessment-e871bf81d2`; original attempts и прежние audits
читать вместе с `audit-reassessment-originals.json`/`settlement-reassessment.json`.
Дальнейшие слоты используют тот же финальный audit напрямую. Новые модельные
попытки вместо этих восьми не запускались; runtime/payload не пересобирались.

## Доказательства

`<resultsRoot>/<phase>/<taskID>/<attemptNo>/` содержит:

- `attempt.json`: `sessionID`, `cliExitCode`, `mode`, `taskID`, `model`, `variant`,
  `expectedSkillDigest`, `packagePath`, `resultPath`, `startedAt`, `finishedAt`,
  `binaryManifestSha256`, `modelStarted`, `timedOut`, `interruptSentAt`.
  Неизвестные значения — null; unknown dispatch не разрешает новый запуск слота.
- `prompt.txt`, `events.jsonl`, `stderr.txt`, PID и supervisor deadline/exit.
- `parts.json`: read-only snapshot `{sessionID,parentID,childSessionIDs,messages,parts}`
  только своей Session; сохраняются все parts и сообщения.
- Runtime journals только из
  `generations/*/chats/<sha256(agent SessionID)>/attempts/*/`.
  `session.json.sessionId` и journal `session_id` — внутренний Dock UUID.
- `artifact/package.lgp`, `artifact/unpacked/`, `artifact/results/*.result.csv`:
  точные собственные пути определяются save/export receipts. Copy-out read-only.
- `selection-audit.json`: JS counts, `policyStatus:passed|failed|incomplete`,
  `oraclePassed:true|false|null`, `calculationPassed`, `historyComplete`,
  `runtimeSettled`, failures и версия аудита. Последние два поля вычисляются
  из evidence, а не принимаются входными флагами.
- `graph-review.json` для всех исключений/аномалий и трёх заранее воспроизводимо
  выбранных standard-успехов. Seed закрепляется до пилота.

Содержательное review записывает отдельный reviewer после чтения кода и трассы:
`{verdict:"passed"|"failed", reviewer, sessionID, packageSha256, evidence, notes}`.
`evidence` — непустой список существующих относительных путей внутри попытки;
`notes` объясняет verdict. Session и SHA связывают review с фактическим пакетом.
Для explicit-js обязателен `javascriptRole:"requested-aggregation"`, для tags —
`javascriptRole:"variable-unpack-only"`, для recovery — `recoveryObserved:true`.
Без обязательного review машинные оси сохраняются, общий PASS исключения закрыт.

`modelStarted:false` подтверждается только до запуска CLI либо явным отсутствием
dispatch при подтверждённом завершении. Preflight incident хранится отдельно
в новом `incidents/<task>/<attempt>/<timestamp-uuid>/`; исходные квитанции не удаляются.

CLI exit и код wrapper — разные значения. Код 0 wrapper подтверждает машинные
проверки; обязательное review исключения остаётся отдельным условием. Код 130
CLI означает отмену; timeout требует записанного deadline и собственного SIGINT.
90 секунд после SIGINT — предел ожидания для фиксации блокера, не гарантия выхода.
Неподтверждённые exit/cleanup запрещают следующий CLI run. Чужой writer не удаляется.

## TDD и пилот

Task 1B завершён на реальном пилоте: история, settlement, модель/digest/catalog,
импорт из закреплённых inputs, export identity, XML lineage, oracle и review gates.
Первый baseline входит в 18 и перепроверен offline без нового model run.
Финальный auditVersion:
`1f1e63ba844350aa21b9722ced44579050d12eaade0b78217085d5ae797eb34d`.
Root checks: 95 tests/219 assertions, typecheck и diff-check PASS. Независимый
review подтвердил закрытие export/context identity дефектов пятью регрессиями.
`acceptance-lock.json` в приватном run-каталоге закрепляет auditor/runner,
существующие loader/oracle/XML dependencies и все task/fixture hashes.
Исторический pilot wrapper exit 2 отражает минимальный Task 1A; текущий
`selection-audit.json` после offline-проверки является источником текущих осей.
Не переписывать исторический CLI/wrapper exit ради нового verdict.

Initial TDD evidence: `36cf3558f`, `e60abc34f`, `9beee7cbf`, `312ff3872`,
`86618a093`. Каждый новый сценарий сначала дал RED, затем GREEN. Fixtures
созданы циклами `81c4a14e7`, `2de55ec10`, `3de3526f9`; Python oracle tags
даёт blue=3, green=1, red=153, recovery — B=62, A=55.

## Границы

Общий benchmark, судья и аналитический корпус не меняются. Baseline получает
машинную проверку, candidate — полный policy/oracle audit и ограниченный semantic
review. Tags не проверяется отдельной Session на изменённом входе. Targeted
recovery покрывает один наблюдённый отказ; естественные ошибки учитываются
дополнительно только если возникли. Desktop и natural activation не проверяются.


## Checkpoint: private artifact delivery и обязательная Sort-ветвь

Proof8 остановился до Import/Group/Export: original result45f825bc…/exit3/
cleanupfalse сохранён. CSV prepared/upload/checkpoint совпадают (27bytes/
SHA c5235fe2…); private navigation shim ошибочно требует standalone frame
у artifact download wrapper. Offline pinned generator воспроизводит
PINNED_WORKSPACE_CODE_MISMATCH до browser send; непосредственно записан
BROWSER_CALL_UNCERTAIN. Это не доказательство Product Export regression.
Proof9 сохраняет обязательные JS→Group и прямой JS→Sort→ExportSort,
full JS before/after, afterproducer read и CSV/5nodes4links. Дополнительный
ExportGroup для этого gate не требуется; его прежний failure остаётся аномалией.
Independent proof9 review8e2d847c… Approved, preview-only override byteequal7,
60source/32fixtures/104protected match; ошибочного navigation shim здесь нет.
Обе private fixtures diagnostic/nonacceptance; обычная rebuilt проверка обязательна.
Independent delivery review7030b977… подтвердил private shim failure; source
правка не нужна. Strict ownership user97 не установлена, сессия сохранена;
ownadmin98 logout/MCPexit0 подтверждены. Это не recoveryPASS: originalfalse
остаётся. Root proof9 запущен отдельно после fresh no.writer/deadoldruntime/
60+32hash checks/newstate+chat+browser; independent review разрешает эту
изоляцию без изменения user97. Model calls по паре203142 остаются0.
Условная новая matched пара225648-cc76ca собирается параллельно на общем
committed source3a33edcae8; текущий stopped pointer192418 не меняется.

Proof9 original0547cd7e…/root7470exit3: Group/directSort/Save прошли,
обязательный ExportSort AMBIGUOUS/input_mapping до CSV. Cleanup/logout/ACKfalse
сохранены. LastSave036 readback f4313494… подтвердил полное равенство JS
component/source/declaredschema после обеих ветвей; это не CSV/finalgate.
Теперь Export blocker воспроизведён на обязательной ветви; нужен bounded readonly
capture точного native predicate перед surgical TDD fix. Product guards/skill
не менять по предположениям. Пара225648 source3a33/runtimef262e52c… собрана/
bothverify0, но остаётся условной: commonruntime fix потребует следующую пару
и полные18+25. Ownproof9 recovery independently48163591… подтверждён:
строго bound user99 closed/admin100logout/MCPexit0, unknownuser97 сохранён.
44raw/60source/4397runtime unchanged; full savedJS before/after равен.
Pair225648 independent43b494ad…/pins3b56a9b3… Approved после mode0400 freeze,
0models/0outcomes. Static Product/primaryaudit783c7650… Approved; runner/graph
в этом review имеют self-review limitation и проверяются отдельно.
Proof10 readonly capture дополнен exact rawcrumbset/effective labels/полным
predicate и bounded projection; verification4957c301…/review9f466a29… Approved,
62source/37fixtures/132historical hashes match,19tests/typecheck/syntax PASS.
Root81926 live запущен после ready/status-only activation72c602c4…;
моделей0, guards/source/pins unchanged. Это diagnosis, не ordinary acceptance.


Proof10 original468c4235…/root81926exit3 изолировал exact caption conjunct:
final export-sort:n5 имеет verified own native input logical0/native_index1;
unique/bounded/chain/icons=true, exact=false. Hidden crumb7 raw «Источник данных»
получил effectiveLabel пустую/hiddenCaption=false, а crumb8 «Настройка» распознан.
Old workspaceUI80d27… принимает длинную «Входной источник данных», но не actual
короткую подпись. Surgical TDD fix ограничен этой подписью verified prepared port0;
owner/native/chain/icons/sensitivity/uniqueness и publicJSdeny сохраняются.
Rootownuser101 строго bound41b9b3a8… и адресноclosed/admin102logout/MCPexit0;
originalcleanupfalse сохранён. Неизвестный user97 завершил сам сервер по timeout
23:19:16Z; root его не закрывал и ownership не утверждает. LastSave036 readback
7f377888… подтвердил full savedJScomponent/source/schema equal после Group/Sort.
Sourcefix ещё не завершён; commonruntime change потребует новой matched пары и18+25.

Source Export caption fix завершён: workspaceUI1d7f27a7… содержит один alias
для verified logical input0; actualfixturea2f562ad…/test994249ab… дали RED→GREEN
и15negativevariants.350focusedPASS/verificationa8fc54e1…, independent09e5c7f9…
Approved. Root pinnedNode24.19 fullupstream3830tests/3820PASS/0FAIL/10SKIP/exit0,
verificationc67cde34…; три source hashes проверены повторно после suite.
Proof10 recovery independentlyf85a02cf… подтверждён,1993raw/4729resources unchanged,
full savedJScomponent equal; currentworkspaceUI изменён только намеренной правкой,
old80d27immutable цел. Ordinary rebuilt nativeExport/CSV и новая matched18+25
по-прежнему обязательны. Sourcefix не меняет skill/policy/Protocol/publicJSdeny.
