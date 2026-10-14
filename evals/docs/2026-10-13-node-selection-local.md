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


Новая matched пара233119-4699a5 source41101ae0b2/runtimebf2fd06b… собрана/
bothverify0 и independently Approved pair130d7d7f…/pins791829db… . Pins6944fa22…/
8ceb74b8…/locke2776d98…/provenancefd1ec5a5… frozen0400;72+2/model/seed/tasks/
43slots unchanged,0models/0oldoutcome transfers. OrdinaryJS root72815exit0,
result507286da…: оба native Group/directSort, ExportSortCSV/5nodes4links,
fullsavedJSsource/component/schema unchanged, publicgenericJSdeny и actual
packageclose/logout/shutdown confirmed. Независимый live review ещёpending.
OrdinaryJoin root22971 running после e6d39d2a… preflight; newrawhiddenDOM capture
не заявляется — проверяются nativeopening ACK/preparedrole context/граф/oracle.
Freshschema probe67472exit0/15standard schemas,0c2166c3… result; actualprepare16
изordinaryJS связан в gap prerequisitef958175b… разныхSession той же immutable
сборки. ProbeexplicitLogout=false сохранён, не подменяется ACK; gapreviewpending.
Current-run192418 остаётся stopped доordinarygates; полные18+25 не запускались.

Все ordinarynative prerequisites завершены независимо: Join root22971exit0/
result8cc5a138…/review7c59cfeb… подтверждает оба native roleopening/context,
fresh[[1,5,15],[1,10,15]], saved3nodes2linksnoJS, actual ownclose/logout/ACKexit0.
Standalone postSaveinputreread/newrawhiddenDOM capture не заявлены; прошлое
hiddenDOM evidence только supporting. JSgate independentlyc2376fff… PASS.
Fresh gap prerequisite independentlyaec86a27… Approved на actual15schemas+
16prepare/31cachekeys той же immutable233119; probeexplicitLogout=false остаётся.
Rootseriesadmission411b35ae… активировал current-run233119, oldpointer сохранён
0400. Новый denominator18baseline+25candidate/first9+16repeats, старые outcomes
не переносились; все прежние policy/math/review gates и предел2коррекций сохраняются.
Ordinary source/build/native prerequisite закрыт отдельно; полные43 ещёне выполнены.

Fresh baseline233119 sales-by-category/1 completed CLI0/wrapper0/cleanuptrue:
policy/oracle/calculation/history/identity/graph/export PASS, JS0; attempta01a1c0e…/
audit8a6ea80e…/Session ses_ec847ba38ffeWd3bMWkvwHlctf,327s. Model responses
получены, прежнийOAuth401 не повторился. Sales/2 также completed CLI0/wrapper0/
cleanuptrue: policy/oracle/calculation/history/identity/graph/export PASS, JS0;
Session ses_ec841c075ffe63Lv3f42lwlzZ3. Baseline completed2/18/candidate0/25;
ABC/Pareto1 сейчасactive root85644. Все18baseline обязательны доcandidatefirst9;
baseline semanticmanualreview не добавляется.


На 2026-10-14 00:27 UTC в итоговой серии `20261013T233119Z-4699a5`
завершены 3/18 baseline и 0/25 candidate. `abc-pareto-groups/1`
(Session `ses_ec83bda4cffeSynVwFH3wCzQvZ`) завершился с CLI exit 0,
wrapper exit 1, oracle и полным расчётом PASS, cleanup подтверждён.
Два JS-узла дали policy failure `JAVASCRIPT_NOT_ALLOWED`: этот исход baseline
сохранён как замер исходного skill, без повторного запуска или исключения
из denominator. SHA attempt `793a8112…`, audit `371e128f…`.
После завершения root85644 и проверки отсутствия `.writer` запущен
`monthly-demand/1` (root2256). Следующий плановый слот —
`risky-approved-claims/1`. Полная серия и приёмка ещё не завершены.


На 2026-10-14 00:35 UTC `monthly-demand/1` завершился успешно:
CLI/wrapper exit 0, oracle, полный расчёт и policy PASS, JS-узлов 0,
cleanup подтверждён. Session `ses_ec83209c8ffe7IlsZil6VEzyop`,
SHA attempt `ead66583…`, audit `0d683b46…`. Завершены 4/18 baseline,
0/25 candidate. После завершения root2256 и проверки отсутствия `.writer`
запущен `risky-approved-claims/1` (root97266); далее планируется
`campaign-roi-by-channel/1`. Итоговая приёмка остаётся незавершённой.


На 2026-10-14 00:43 UTC завершены 5/18 baseline, 0/25 candidate.
`risky-approved-claims/1` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup подтверждён. Session `ses_ec82a8030ffeJirBk4gJptkkLo`,
SHA attempt `0d9e0e8c…`, audit `a221aa9c…`. Наблюдённый `REQUEST_REJECTED`
из-за неподдерживаемой подписи Filter исправлен новым запросом к стандартному
Filter, который затем получил `SUCCEEDED`; это baseline evidence, а не
candidate recovery PASS. Root97266 завершён, `.writer` отсутствовал перед
запуском `campaign-roi-by-channel/1` (root29101). Следующий плановый слот —
`first-last-touch/1`; итоговая приёмка ещё не завершена.


На 2026-10-14 00:50 UTC завершены 6/18 baseline, 0/25 candidate.
`campaign-roi-by-channel/1` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup подтверждён. Session `ses_ec82324e8ffe4370QyZIlzph7o`,
SHA attempt `08df55f5…`, audit `49ba77dc…`. Root29101 завершён, `.writer`
отсутствовал перед запуском `first-last-touch/1` (root82747). После него
остаются 11 предусмотренных baseline повторов: sales/3, остальные пять
сценариев/2–3. Candidate first9 разрешён только после всех 18 baseline.
Все шесть завершённых попыток дали oracle и полный расчёт PASS;
policy PASS у пяти, ABC/Pareto использовал два JS-узла. Приёмка ещё не завершена.


На 2026-10-14 00:54 UTC завершены 7/18 baseline, 0/25 candidate.
`first-last-touch/1` прошёл oracle и полный расчёт, CLI exit 0, wrapper exit 1,
cleanup подтверждён; один JS-узел дал `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec81ccd64ffeAxnGWvlWW7Q8rB`, SHA attempt `5d97c4d8…`,
audit `8ca3380d…`. Во всех семи завершённых baseline oracle/расчёт PASS;
policy PASS у пяти, JS встретился в ABC/Pareto и first/last touch.
Root82747 завершён, `.writer` отсутствовал, оставшиеся 11 слотов и их root logs
не существовали. Root17410 последовательно запускает отдельные процессы
проверенного `run-node-selection-attempt.ts`: sales/3; ABC/2; monthly/2;
claims/2; ROI/2; first-last/2; ABC/3; monthly/3; claims/3; ROI/3; first-last/3.
Каждый следующий процесс допускается только после CLI exit 0, modelStarted,
finishedAt, cleanup true, отсутствия blocker/collection failures/timeout и
wrapper exit 0 или 1. Baseline policy failure остаётся измерением; техническая
аномалия останавливает очередь для разбора. Candidate в очередь не включён.
Текущий слот — sales/3; полная серия и итоговая приёмка ещё не завершены.


На 2026-10-14 01:00 UTC завершены 8/18 baseline, 0/25 candidate.
`sales-by-category/3` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup подтверждён. Session `ses_ec818eb1cffeXh48iCuXH9H55q`,
SHA attempt `7fe5ccbf…`. Все три sales-прогона успешны. Root17410 продолжает
ту же последовательную очередь; текущий слот — `abc-pareto-groups/2`.
Новые результаты не переносятся из прежних серий; приёмка ещё не завершена.


На 2026-10-14 01:07 UTC завершены 9/18 baseline, 0/25 candidate.
`abc-pareto-groups/2`: oracle/полный расчёт PASS, CLI exit 0, wrapper exit 1,
cleanup true, два JS-узла и policy failure `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec813c7c4ffel3RV1nTZWRsmwf`, SHA attempt `260d6b1b…`,
audit `e061eec9…`. Во всех девяти baseline oracle/расчёт PASS, policy PASS
у шести. Root17410 активен и последовательно перешёл к `monthly-demand/2`;
следующий слот — `risky-approved-claims/2`. Приёмка ещё не завершена.


На 2026-10-14 01:15 UTC завершены 10/18 baseline, 0/25 candidate.
`monthly-demand/2` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup true. Session `ses_ec80d497bffeCpBAzDR1JtjJ1u`,
SHA attempt `a76ae1f3…`. Во всех десяти baseline oracle/расчёт PASS,
policy PASS у семи. Root17410 продолжает очередь, следующий слот —
`risky-approved-claims/2`. Полная серия и приёмка ещё не завершены.


На 2026-10-14 01:23 UTC завершены 11/18 baseline, 0/25 candidate.
`risky-approved-claims/2`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec805bdc6ffeJ43aeVqcT3HBbP`,
SHA attempt `13ec8ec2…`, audit `efa96085…`.
Во всех 11 baseline oracle/расчёт PASS, policy PASS у восьми. Root17410
активен; текущий слот — `campaign-roi-by-channel/2`, далее first-last/2
и пять третьих прогонов. Итоговая приёмка ещё не завершена.


На 2026-10-14 01:30 UTC завершены 12/18 baseline, 0/25 candidate.
`campaign-roi-by-channel/2`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec7feeac4ffeTlnFgqeXYj1gOS`,
SHA attempt `335b6403…`, audit `2689a4a1…`.
Во всех 12 baseline oracle/расчёт PASS, policy PASS у девяти. Root17410
активен; текущий слот — `first-last-touch/2`, далее пять третьих прогонов.
Итоговая приёмка ещё не завершена.


На 2026-10-14 01:34 UTC завершены 13/18 baseline, 0/25 candidate.
`first-last-touch/2`: oracle/полный расчёт PASS, CLI exit 0, wrapper exit 1,
cleanup true, один JS-узел и `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec7f82e21ffe0w2dxt3HwdHP5M`, SHA attempt `b0ac60e4…`,
audit `73f42f65…`. Во всех 13 baseline oracle/расчёт PASS, policy PASS
у девяти. Root17410 активен; текущий слот — `abc-pareto-groups/3`,
далее monthly/3, claims/3, ROI/3, first-last/3. Приёмка ещё не завершена.


На 2026-10-14 01:43 UTC завершены 14/18 baseline, 0/25 candidate.
`abc-pareto-groups/3`: oracle/полный расчёт PASS, CLI exit 0, wrapper exit 1,
cleanup true, два JS-узла и `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec7f48e58ffeP9ePIP2eZTP9vd`, SHA attempt `817532d9…`,
audit `59dd4627…`. Все три ABC baseline прошли oracle/расчёт с двумя JS-узлами
каждый. Во всех 14 baseline oracle/расчёт PASS, policy PASS у девяти.
Root17410 активен; текущий слот — `monthly-demand/3`, далее claims/3,
ROI/3 и first-last/3. Итоговая приёмка ещё не завершена.


На 2026-10-14 01:51 UTC завершены 15/18 baseline, 0/25 candidate.
`monthly-demand/3`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec7ec4d32ffe1AENYSp2CqOFv4`,
SHA attempt `5cb62388…`, audit `727c8d9e…`.
Все три monthly baseline успешны без JS. Во всех 15 baseline oracle/расчёт
PASS, policy PASS у десяти. Root17410 активен; текущий слот —
`risky-approved-claims/3`, далее ROI/3 и first-last/3. Приёмка ещё не завершена.


На 2026-10-14 02:03 UTC очередь root17410 остановлена на технической аномалии
`risky-approved-claims/3`: Session `ses_ec7e51480ffevfxBR9hkm10mSb`,
CLI exit 1, wrapper exit 3, cleanup false,
`SELECTION_CLEANUP_UNCONFIRMED`, SHA attempt `596780a5…`.
Начатый слот сохранён в denominator: завершены 16/18 baseline,
15 oracle/полных расчётов PASS, 10 policy PASS; ROI/3 и first-last/3 не запускались.
Экспорт реально выполнился, но чтение файла остановилось с
`NODE_APPLY_STOPPED: Export file search scroll budget exhausted`:
12 успешных прокруток достигли top12000, max_top14089, целевой файл не найден.
Полного Save нет; Package1 остался несохранённым, full calculation PASS
этого слота не заявляется. CLI649907 умер; `.writer` намеренно сохранён.
Независимая read-only проверка связала user137/init01:50:59.405Z с пятью
фактическими native GUID этой попытки; fresh admin inventory видит эту же
сессию с CreateTime01:50AM (UI точность до минуты, не soleidentity).
Root PlaywrightMCP84741/admin138 открыт для адресного recovery user137;
user132/134/136 и остальные сессии не трогались. Проверка exact receipt-owned
allowlist уже скопированных файлов идёт параллельно; source/runtime не менялись.
До подтверждённого закрытия own-сессии и адресного guard recovery следующие
модельные попытки запрещены. Исходный failed outcome не заменяется.


На 2026-10-14 02:18 UTC адресное recovery собственной user137 завершено:
strict binding `4924ba9d…`, server close02:05:01.287/.288Z,
admin138 logout02:05:57.854Z, PlaywrightMCP84741 exit0.
User132 исчез по штатному timeout1800s02:03:52.914Z; user134/136 не закрывались.
Guard review `5a9a75c7…` подтвердил exclusive admission, deadCLI/runtime,
неизменный nonce8140…; root атомарно архивировал intact `.writer` в
`.writer-recovered-node-selection-20261013T233119Z-4699a5-user137`.
Receipt `36b7203f…`, независимый final recovery `6f4b1c6e…`:
inode/bytes сохранены, исходный failed attempt `596780a5…` остаётся прежним.

После read-only плана `a0955691…` и независимого review `b1247c38…`
root перепроверил102 exact receipt-owned files и перенёс их same-device68
в `/workdir/UserStorage/user/node-selection-archive-20261014T0214Z-4699a5`.
Receipt `82953398…` и полный inverse-path map сохранены отдельно:
614→513 top-level entries фактически; target bytes/SHA/inode/mode/mtime
сохранены, исходные пути отсутствуют, остальные имена не изменились.
34 input +34 savedLGP +34 CSV уже имели проверенные локальные копии.
Текущие failed CSV/input и неизвестные файлы вне allowlist. Файлы не удалены;
перед будущим reopen/reproduction LGP и входы нужно вернуть по inverse map
на точные прежние пути. XML и raw evidence не переписывались.
Предварительный сбой служебной find-команды на embeddedNUL произошёл до
intent/mkdir/move; исправлен только delimiter эфемерной команды.
Оценка max_top11665 остаётся прогнозом до следующего ordinary наблюдения.

Source/runtime/skill/закреплённые входы не менялись: matched233119 продолжается,
пересборка18+25 не требуется. После exact recovery/absence.writer и root
postmove-check запущен root23200: только оставшиеся ROI/3 и first-last/3,
последовательно отдельными CLI с тем же gating. Независимая postmove-проверка
идёт параллельно read-only. Baseline completed16/18,15oracle/полных расчётов PASS,
10policy PASS; candidate0/25. Failed claims/3 не заменяется и не исключается.
Для следующих live-слотов каталог нужно периодически поддерживать адресным
архивированием только finished cleanup-confirmed receipt/copied artifacts;
каждый перенос требует того же exact pre/post-check и inverse map.
Итоговая приёмка ещё не завершена.


На 2026-10-14 02:26 UTC завершены 17/18 baseline, 0/25 candidate.
`campaign-roi-by-channel/3`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec7cc35e5ffeOMtGOMaIZcZ0GG`,
SHA attempt `1ffc6e9f…`, audit `d79df2c9…`.
Первый плановый ordinary export после архивирования успешно получил CSV;
sourceworker read-only извлекает actual scroll bound из его raw без extra probe.
Postmove независимый review `6e1a3ae9…` подтвердил102targets/absenceoriginalpaths,
213local evidence,10pins/locks,74source,288runtime каждого payload unchanged,
а также failed CSV/input и архив guard. Recovery и storage действия завершены;
активен только root23200 на последнем baseline `first-last-touch/3`.
Во всех17startedslots16oracle/полных расчётов PASS,11policy PASS; failedclaims3
сохранён. После последнего baseline запланирован exact incremental archive
его и ROI3 шести успешных/copied файлов в тот же own archive, с прежними
pre/postconditions и restore map. Сопоставимая серия/skill/source не меняются.
Полная приёмка ещё не завершена.


На 2026-10-14 02:33 UTC baseline итоговой matched-серии завершён:18/18startedslots,
17oracle/полных расчётов PASS,11policy PASS. Последний `first-last-touch/3`
(Session `ses_ec7c5ee43ffe21njjqq6wmkAII`) дал oracle/расчёт PASS,
CLI0/wrapper1/cleanuptrue, JS1 и `JAVASCRIPT_NOT_ALLOWED`;
SHA attempt `63eb7bdf…`, audit `241cb302…`. Root23200 завершён exit0.
В17полных baseline-аудитах JS-узлов9: ABC3×2 и first-last3×1;
failedclaims3 остаётся CLI1/wrapper3/cleanupfalse/incomplete без замены.
Фактическая baseline-хронология отличается от заданного в исходном плане
порядка Task3: sales/2 выполнен сразу после sales/1, sales/3 — перед остальными
attempt2. Это отклонение сохраняется в ledger;18уникальных слотов/аналитические
входы/model/pins/фазы и последовательное использование профиля не изменялись.
Исходное правило candidate first9 и stop-on-first-policy-violation сохраняется.

Обычный ROI3-журнал после archive подтвердил max_top11713 и успешное получение
exactCSV286B/SHA1d8460f2… после10прокруток доtop10000, затем verified workflowreturn.
Observation `1610d2a6…`; initial target DOM outside_viewport не выдаётся заhit-testPASS.
Перед candidate подготовлен read-only incremental6plan `7be74b8a…`:
ROI3+firstlast3 own inputs/savedLGP/CSV, existingarchive102→108,
freshroot519→predicted513, fullinversemap. Независимый review ещё ожидается,
перенос этих6файлов ещё не выполнен; candidate0/25, новыхпроцессовнет.
Полная приёмка остаётся незавершённой.


На 2026-10-14 02:46 UTC финальный baseline ledger `7db572d8…` независимо подтверждён:
18unique started/finished,17machine/oracle/расчёт PASS,11policy PASS,
6FAIL и1incomplete,JSnodes9/calls10/successful9;330assistant model/variant messages,
18parentless/childfree snapshots,54runtime files,74source/10inputs и оба288runtime.
Incremental6перенос послеreview `0e70093b…` завершён: receipt `f0d2a18a…`,
513root/108archive измерены; postmove review `c9135a0d…` подтверждает все108bytes/
inodes/sourceabsence/обратнуюкарту и неизменность231evidence/pins/source/runtime.

Candidate first3 запущены root56096 в закреплённом порядке
sales/1→ABC/1→monthly/1; следующий слот начинается только при CLI/wrapper0,
cleanup/modelStarted/finishedAt/policy/oracle/fullcalculation PASS, иначе очередьSTOP.
`sales-by-category/1` завершён: Session `ses_ec7b8c849ffeWvjumDgTnvsJCs`,
CLI/wrapper0,cleanuptrue,policy/oracle/расчёт PASS,JS0;
SHA attempt `28e2d1d6…`, audit `bd4b399d…`.
Candidate completed1/25 (firstwave1/9); сейчас ABC/1,Session `ses_ec7b3d89fffeuHWc7SGKou3bao`.
Read-only ранний наблюдатель использует существующий frozen `inspectSelection`
на complete own-session tool_use parts в standardcases: canonical
`target.type=programming.javascript` означает `JAVASCRIPT_NOT_ALLOWED`
независимо от completed/error и output.running; при таком доказательстве root
прерывает own supervisor черезSIGINT и не запускает оставшиеся digest slots.
Describe/Calculator formulas/source refs и произвольные aliases не выдаются за
такое доказательство; финальный полный аудит остаётся обязательным.
Новый helper/source не создавался; общий build/skill/pins unchanged.
После cleanfirst3 нужен адресный archive9ихcopiedfiles передследующимchunk3.
Полная приёмка ещё не завершена.


На 2026-10-14 03:09 UTC candidate завершил 2/25 слотов (первая волна 2/9).
`sales-by-category/1` остаётся полным PASS. `abc-pareto-groups/1`, Session
`ses_ec7b3d89fffeuHWc7SGKou3bao`, завершён CLI 1 / wrapper 3 / cleanup false /
incomplete; oracle отсутствует, полного расчёта нет. Исходный SHA attempt
`2f048e06af106c17263fcff9ce2b97b2d8ead4d0c311444e39250c9bc6d07fb2` сохранён.
JS-попыток не наблюдалось, но без сохранённого графа это не policy PASS.
Root 56096 остановился exit 1; месячный спрос в этой очереди не запускался.

Отказ `calc-share-1`: `NODE_APPLY_STOPPED` с причиной
`WIZARD_OPEN_NOT_CONFIRMED`. Последующий снимок показывает нужный Calculator
`98530181-7349-4b26-a343-e7ac5ad82974` и правильный breadcrumb, но получен новым
`readUi()` после ошибки; точное состояние провалившегося предиката отсутствует.
Конфигурация формулы ещё не начиналась. Протокол не умеет продолжить unresolved
фазу open; inspect/resume/recover/cancel не восстановили её. Причину нельзя
приписать параметрам модели или объявить доказанным общим runtime-дефектом.

Адресное recovery выполнено отдельно от failed outcome. Strict binding
`e794705a…` подтвердил собственный `user:146`, init 02:44:52.092Z и четыре native
GUID. Root через Playwright MCP закрыл только эту сессию, вышел из admin:147 и
завершил bridge 11663 exit 0. Независимый postclosure review `3800ac5c…` подтвердил
server close 03:05:10.044Z, logout 03:05:24.132Z, завершение своих процессов и
неизменность raw 16, source 74, pins 10 и обоих payload runtime 288.
Guard с nonce `0fdc8b00-5d1e-448f-9b8a-8278dc2fdc5f` перенесён целиком в
`.writer-recovered-node-selection-20261013T233119Z-4699a5-user146` после сверки
inode и bytes; receipt `4cc274c5…`. Финальный независимый postarchive review ожидается.

Решение владельца выполнения: после этого review закончить оставшиеся первые
слоты только для диагностики, в frozen порядке monthly → claims → ROI →
first-last → explicit-js → tags → recovery. Первая волна уже нечистая: повторы
2/3 закрыты, ABC/1 не заменяется, полная приёмка не достигнута. При доказанном
нарушении policy дальнейшие слоты этого digest останавливаются. Параллельно
готовится отдельный deterministic native diagnostic без LLM для exact open
predicate; до воспроизведения product/runtime/skill/pins не меняются.


На 2026-10-14 03:18 UTC адресное recovery ABC/1 завершено: независимый
postarchive review `bdfcd9ee…` подтвердил сохранённые inode/bytes guard,
отсутствие исходного `.writer` и неизменность failed outcome, raw, pins,
исходников, runtime и квитанций закрытия. Original ABC/1 не повторялся.

`monthly-demand/1` завершён полным PASS: Session
`ses_ec79d2db9ffe53yzDMRmbd2a4T`, CLI/wrapper 0, cleanup true, oracle/policy/
calculation PASS, JS nodes/calls 0. Машинный аудит подтвердил полную историю,
settlement, идентичность экспорта и связность сохранённого графа.
SHA attempt `a781c5f7d45e6015b202589f880974544d3aca2bd1d8747183e4ca192610cf07`,
selection-audit `3f5251f0966a645b6579cc829d004175547d3e67380860324974bc86eecfe9f4`.
Root 59629 завершён exit 0; длительность CLI около 484 секунд.
Candidate завершил 3/25 (firstwave 3/9): два полных PASS и один технический
incomplete; JS-вызовов не наблюдалось. Baseline остаётся 18/18, 17 oracle/
расчёт PASS, 11 policy PASS. Общий build/skill/pins не менялись.

Перед следующим frozen модельным слотом claims/1 профиль временно выделен
для отдельного deterministic native diagnostic ABC opening без LLM.
Подготовка и TDD идут в ignored private run directory; независимый review
проверяет trace без изменения guard/control flow. Live diagnostic ещё не
запущен. Его результат не заменяет ABC/1 и не считается acceptance.
Первая волна остаётся нечистой, повторы закрыты, полная приёмка не завершена.


На 2026-10-14 03:35 UTC separate native ABC diagnostic воспроизвёл отказ
`calc-share-1` на пятом узле после четырёх успешных стандартных операций.
Root 32456 завершён exit 3; модельных вызовов 0. Result SHA
`307e12720ae23ae2e76d554ccdb08d94a201b15cb5591fc1e738c2bb9dfdaf6d`.
Instrumented результат не считается acceptance и не заменяет candidate ABC/1.
Private helper выполнен по TDD: четыре теста, целевой typecheck и syntax PASS;
static independent review `600579b3…` подтвердил неизменный исходный guard,
4456 source hashes, один исходный browser send без дополнительных чтений.
Root сохранил reviewed binding `fc84c59b…`; изменены только ready/status,
active binding `40984ed7…`. Product, matched payload и acceptance pins unchanged.

В captured pre-catch tuple для `calc-share-1:n29` через 534 ms после начала
browser call `contextMatches=true`, `intendedWizard=true`, native GUID before/
after совпал, dialogs 0. Единственный отказавший conjunct — две busy-маски.
У первой `target_tid=MF;TF-1;WizrdMCF`, у второй target_tid/dialog_ref null;
поэтому `ownedLoading` отказал и ожидание масок не начиналось. Источник второй
маски пока не установлен: её class/parent/geometry/cache identity отсутствуют
в первой trace. Это основание для уточнения диагностики, не для blanket-ignore
или изменения product guard. Готовится отдельная private v2 trace, сохраняющая
readonly DOM ownership в том же исходном browser call; v1 files/raw не меняются.

Cleanup/logout/shutdown диагностического Host не подтверждены, own PID 794091
в close receipt завершён exit 1 / ACK false. Package1 не сохранён. Нужны strict
server binding и адресное Root recovery этой новой собственной сессии; admin
inventory получен, сессии ещё не закрыты. Next candidate claims/1 не запускался.
Candidate остаётся 3/25 (два полных PASS, один incomplete), baseline 18/18.
Firstwave нечистая, повторы закрыты, итоговая приёмка не завершена.


На 2026-10-14 03:39 UTC native diagnostic v1 полностью проверен offline:
independent live review `8aec753b…` подтвердил 3557 journal rows одной
session/runtime/actionManifest, 61 public receipts, четыре runtime journals
и все 68 raw references. Sole failed conjunct — masks.length; источник
второй маски по этим данным ещё не доказан.

Адресное recovery этой диагностики завершено: strict binding `cf3dcf03…`
подтвердил `user:150`, init 03:24:21.547Z и четыре native GUID. Root через MCP
86234 закрыл только 150, logout admin:151 и bridge exit 0. Independent
postrecovery review `3100e4ca…` подтвердил server close 03:36:37.536Z,
logout 03:36:47.698Z, завершение own PID 794091, отсутствие `.writer`,
неизменность raw 68, source 4456, acceptance source 74, pins 10 и runtime
288 каждого payload. Изменения профиля/guard не требовались.

Original diagnostic `307e1272…` сохраняет cleanup/logout/shutdown false;
recovery записано отдельно. Candidate ABC/1 `2f048e06…` остаётся failed.
Профиль свободен; следующих model slots пока нет. Приоритет — уточнить
владельца второй маски отдельной private v2 trace, сохранив v1 неизменной,
затем решить необходимость минимальной runtime-правки. Если общая правка
потребуется, прежняя matched-серия останется исключённой из итоговой приёмки,
а новая потребует всех прежних 18+25 gates. Skill по технической ошибке
не меняется; JS fallback не разрешён. Первая волна 3/9, candidate 3/25,
полная приёмка не завершена.
