# Release writer после открытия owner

Новая локальная A/B smoke-пара v7 на frozen495 прошла судью, структуру,
warm oracle и installed cold. Полный clean suite484 PASS/2 SKIP/0 FAIL,
typecheck PASS; formal baseline v7 прерван после19 завершённых попыток.
Приёмка90 ещё не завершена.
Продуктовые binary/resources49b1584f2 не изменены. Прежний formal v6 отказал
в management preflight до задач; его FAIL и evidence сохраняются отдельно.

## Принятая функциональная пара

Frozen harness b4661a7b68fbad21726bd4d922a8c659165f8b11; common SHA256
`c07c876e618383b6428beb24f16819aba80c5c68f92d4c22a2f0dfb7564c4dd0`.
Baseline run20261008-204506-b4661a7b6 / candidate run20261008-205411-b4661a7b6:
оба completed/exit0/judge100/pass=true, структура/warm oracle/installed cold PASS.
Package/input bytes unchanged, settingsReapplied=false, close/logout/remaining0,
own cold containers removed. Серверный skill/action catalog/knowledge snapshot
после пары совпали с исходными pins; evals ref заново прочитан:b31ebe7d0.

Baseline/candidate:17/18 step-finish events,17/19 unique tool calls,0/1 skill,
13/13 Loginom calls. Smoke — функциональный контроль, статистический verdict
не заявлен. Evidence `ab-smoke-v6-{base,candidate,pair}-accepted-20261008`.
Закрытые histories/diagnostics сохранены с full roundtrip и restore receipts:
baseline4506 entries/15020315 bytes history,3 entries/3455785 bytes diagnostics;
candidate1928 entries/9134058 bytes history,3 entries/3999026 bytes diagnostics.
Raw result/events/judge/artifacts сохранены. Свободно около1.7GiB.

## Диагноз и исправление

Controller2749 завершён exit1; log `ab-local-stand-20261008/formal-v6-base.log`:
`Management cleanup failed: ENOENT ... statx ... base/profile/.writer`.
Отказ ensureProfile/profile.ts:102;280 до dispatch/conditions/result задач.
Точная историческая последовательность IO не записана; native stable/flaky
UNKNOWN. Текущие refs0/writer absent/pending absent/recovery0 не отменяют FAIL;
receipt `formal-v6-preflight-current-processes.json`, native calls в audit0.
Исходные loginom-server/client-7.4.2-test running и не переключались.

Collector выполнил ровно3 narrow runs четырёх прежних writer guard tests:
каждый4 PASS/0 FAIL/6 assertions. Они не покрывают release после owner open.
Final20 evidence files скопированы с exact bytes verification в
`formal-v6-writer-gap-signal-final-20261009`; ранний19-file snapshot сохранён
отдельно. Параллельные root test edits описаны в signal, исходники collector
не менял; причинный breaking SHA исторического native отказа не установлен.

Новый real-IO тест синхронизируется по открытому собственному owner-дескриптору
в /proc/self/fd и удаляет только созданный им writer directory во время чтения.
RED0 PASS/1 FAIL: тот же ENOENT/statx .writer; GREEN1 PASS.16MiB test owner
удерживает read в работе, файл/profile удаляются в finally; mocks отсутствуют.
Минимальное изменение writerIdentity:11 строк catch только ENOENT/ESRCH с
повторной проверкой directory. Исчезновение возвращает null; оставшийся guard
сохраняет dev/inode/symlink guards и прежние3 samples/two20ms waits. Постоянно
пустой guard и подмена остаются отказами; permission errors не скрываются.
Не добавлены writer deletion, неизвестные PID signals или live retries.

Три post-open cases (release, persistent empty, replacement) прошли каждый
из5 последовательных runs:3 PASS/0 FAIL/7 assertions в каждом. Все writerIdentity
guards PASS; typecheck PASS. Modules profile+process-supervisor session90146
завершены exit0:77 PASS/0 FAIL/241 assertions/168.25s. Harness commit
`495463543901f1a69888b8d6375cd77996ef157b` clean; protected diff0 против
fresh evals refb31ebe7d0 при исходной проверке.

## Полный suite и новая frozen-пара

Первый full suite session80830 завершён exit1:447 PASS/2 SKIP/37 FAIL/2 errors.
Хотя own TMPDIR в /dev/shm имел20GiB и executable probe PASS, preflight отдельно
проверяет cwd harness:640MiB ниже неизменённого порога1GiB.31 отказ прямо связан
с этим порогом; для6 downstream отказов связь поддерживается сигналом, но не
доказана независимо. Log writer-post-open-full-495463543.log и collector
full-cwd-space-signal-20261009 сохранены; ошибка подготовки запуска признана.

Освобождены только точные дубликаты собственных immutable файлов через hardlink:
26568 tracked файлов старых frozen worktrees,612 browser файлов в сохранённых
baseline/candidate CLI/Desktop resources,13285 tracked файлов нового frozen.
Сохранены пути/байты/права, проверены inventories/pins/clean Git до и после;
setuid chrome-sandbox исключён. Receipts frozen-worktree-dedupe-20261009,
immutable-browser-dedupe-20261009 и frozen-release-worktree-dedupe-20261009.
Эти immutable источники и ресурсы нельзя редактировать на месте. Чужие /tmp,
контейнеры, профили и исходные Loginom server/client не очищались.

Новый full suite session12760 завершён exit0:484 PASS/2 SKIP/0 FAIL,
2063 assertions/576.34s. Log writer-post-open-full-clean-495463543.log;
own fresh TMPDIR /dev/shm/loginom-skills-evals-495463543-clean-20261009,
receipt writer-post-open-full-clean-tmpdir.json; порог1GiB не изменён.
Оба TMPDIR и исходный FAIL сохранены. Сейчас около1.9GiB свободно на cwd.

Создан detached worktree skills-evals-release на
495463543901f1a69888b8d6375cd77996ef157b, bun install --frozen-lockfile и
frozen typecheck/session46440 exit0. Freeze прочитал свежий evals ref
992fca12badf209169f13b569b9bd291e4d70e99; protected diff0. Более поздние docs-only
изменения evals не подставляются в frozen; ref/pins повторно проверяются перед приёмкой.
Conditions ab-conditions-release-20261009/common.json SHA256
`a268a81e8b4ea163f50ac52ee99817559b3fab9a08ffc09652dc96c00fcd2ed4`:
658 harness files/281 task files/21 adapter pins,5389+5651 build files verified.
Те же15 задач, модели/параметры/judge/viewport, оба сохранённых CLI.

Baseline smoke v7/session30063 завершён exit0:run20261008-214239-495463543,
score100/pass/oracle,304729ms, process/environment cleanup confirmed, все6 stages confirmed.
Структура/warm oracle PASS; installed cold/session21564 exit0/PASS/oracle0,
settingsReapplied=false/packageInputUnchanged/closeLogoutVerified/remaining0,
containerRemoved/ownedStorageRemoved, modelJudgeHelpCalls0.
Receipt ab-smoke-v7-base-accepted-20261009/review.json. Closed history4505entries,
15563202archive bytes и diagnostics3entries/4006770archive bytes сохранены с
full roundtrip/restore receipts; result/events/judge/artifacts остаются на месте.
Candidate smoke v7/session95877 завершён exit0:run20261008-215120-495463543,
score100/oracle/323206ms, process/environment cleanup confirmed и все6 stages confirmed.
Структура/warm oracle PASS; installed cold/session22429 exit0/PASS/oracle0,
package/input unchanged/settingsReapplied=false/close/logout/remaining0,
own container/files removed/modelJudgeHelpCalls0. Candidate closed history1928entries/
9151638archive bytes и diagnostics3entries/4008636archive bytes сохранены
с full roundtrip/restore receipts. Candidate accepted receipt сохранён.

Paired functional smoke принято: ab-smoke-v7-pair-accepted-20261009/review.json.
Перед этим повторно проверены658 frozen files/21pins/5389+5651 CLI inventory
bytes/modes/judge executables/external-after server skill/catalog/knowledge pins.
Fresh evals refb30dcbe5f2768a740abab18d3fec436aada9ab2b; protected diff0;
с freeze992fca изменён только соседний docs-файл, frozen495 не менялся.
Первый read-only broad audit ошибочно сравнил все файлы независимого own harness
с соседней веткой и отказал AssertionError до записи/мутаций/model calls.
Корректная повторная проверка использует закреплённый набор protected paths;
ошибка проверки отдельно описана в smoke-v7-metrics-fresh-ref.json.

Метрики base/candidate:16/18 provider step-finish parts,17/20 unique tools,
13/13 Loginom,0/1 skill(loginom-automation),tool errors0. До первого prepare
1/2 provider turns:activation delta1/skill1 соответствует заранее заданному
допуску. Два read идут в том же candidate turn, что prepare; общий рост на2
хода включает отдельный todowrite после prepare и не подменяет activation delta.
Receipt smoke-v7-activation-allowance-review.json. Smoke не доказывает
статистическую неухудшенность и не входит в90 attempts.

Formal baseline v7/session81639 запущен из frozen skills-evals-release/evals,
root ab-formal-v7-20261009/base. Candidate formal ещё не запускался.
После45+45 обязательны структура, cold каждого сохранённого пакета и compare.
Первый formal result:ab-revenue-per-converter#1 completed/PASS/score100/oracle,
386113ms, environment/process cleanup confirmed. Структура/warm oracle отдельно
PASS; cold ещё не выполнен. Closed history4604entries/17062750archive bytes,
diagnostics3entries/5122138archive bytes full roundtrip сохранены. Следующая
abc-pareto-groups#1 выполняется; baseline45/candidate45/compare ещё не завершены.
Closed-only preservation helpers v7 используются; failed/active profile не очищать.
34 closed archive перенесены с readback на own локальный ext4-диск; прежние
пути сохранены как links, original preservation receipts unchanged.
См. [хранение архивов](2026-10-09-package-docs-archive-storage.md).
Evidence private ab-local-stand-20261008; secrets/raw diagnostics в Git не внесены.

Evidence TDD в writer-post-open-{red,green,guard,all-guards,repeat-1..5,typecheck,modules}.log.
При смене harness SHA новая пара получает новый manifest и обе smoke стороны;
v6 PASS не подставляется вместо неё. Этапы5–8 открыты,stage9 отложен;
выбор вторичной модели всё ещё ожидается.

## Formal v7: первые5 terminal results

Baseline session81639 продолжает run20261008-220203-495463543.
Ab-revenue-per-converter#1,articles-by-author#1,campaign-roi-by-channel#1:
completed/score100/pass/oracle, все environment/process cleanup confirmed,
структура и warm oracle отдельно PASS. Cold ещё не выполнен.

ABC#1:no_artifact/score0/oracle false/judge_status=no_artifact,841512ms,
package отсутствует. Cohort#1:failed/exit1/failure_kind=permission,
303494ms/timed_out=false/score0/oracle false/no artifact.
У обоих node_wait:output_mapping/AMBIGUOUS/NODE_APPLY_STOPPED,
затем OUTPUT_MAPPING_RECOVERY_UNVERIFIED у wait/cancel;
effect_possible=true/cleanup_complete=false. Recover вернул unstructured error.
У cohort дополнительно read error и CLI_PERMISSION_REJECTED events.
Эти факты не доказывают исходную причину или native stable/flaky.
Они не помечены infra,infra_retry отсутствует, manual retries0.

Environment/process cleanup обоих confirmed; это не подтверждение
семантического восстановления output_mapping. Raw result/events/cleanup
сохранены, observations с SHA:
formal-v7-abc-attempt1-observations-20261009/review.json,
formal-v7-cohort-attempt1-observations-20261009/review.json.
Cold для отсутствующего package не заявлен, judge_status=no_artifact сохраняется.

Closed histories/diagnostics первых5 с confirmed environment/process cleanup
сохранены full roundtrip, включая pending/error journals, без переписывания FAIL.
ABC history4616entries/25253226archive bytes,diag3/13250774bytes;
articles history4600/15885766,diag3/4024752;
campaign history4610/16662169,diag3/4689053.
Архивы новых случаев пока на root disk; переносить на выделенный own storage
только после их confirmed closure и проверки receipts, как в storage report.
Новые продуктовые/профильные/инструментальные ограничения не сняты;
все90/paired compare/installed transitions/lifecycle и secondary smoke открыты.

Customer-activity-segments#1 также completed/score100/pass/oracle,
environment/process cleanup confirmed; structure/warm oracle PASS.
Итого6 terminal результатов:4 PASS/2 FAIL; next observed first-last-touch#1.
Live handle81639 подтверждён; snapshots formal-v7-progress-{3,5}-20261009.json
содержат фактическое число результатов на момент записи (в последнем6),
не количество, подразумеваемое именем файла. Candidate/cold/compare не запускались.

## Formal v7: седьмая попытка

First-last-touch#1 completed/score89/pass=false/oracle=true; environment и
process cleanup confirmed. Структура и warm oracle отдельно PASS,
review `ab-formal-v7-20261009/base/first-last-touch-1-review/review.json`.
Судья отклонил пункт `two-aggregates`: в сохранённом сценарии нет правила
исключения канала `None`. Остальные семь пунктов приняты. Правильный CSV
не отменяет этот FAIL; судья и рубрика не изменялись, повтор не запускался.
Cold ещё не выполнен. Первое обращение к reviewer завершилось ENOENT при
создании output под отсутствующим parent; исправлен только путь output,
повторена локальная проверка артефакта без model/Loginom/judge calls.

Closed history4636entries/17169232archive bytes и diagnostics3entries/5237257bytes
сохранены с полным extraction roundtrip. Вторым batch перенесены12 новых
confirmed closed архивов143641070bytes на собственный локальный диск:
copy/hash/metadata/readback12 PASS, штатное tar-чтение через2 исходных alias
PASS. Preservation receipts и результат FAIL сохранены без правки.
Итого46 архивов490686762bytes вне root disk; текущий profile не переносился.

Snapshot `ab-local-stand-20261008/formal-v7-progress-7-20261009.json` закрепляет
7 terminal результатов:4 PASS/3 FAIL, все7 environment/process cleanup
confirmed. Это не подтверждает semantic recovery неуспешных ABC/cohort.
Baseline81639 остаётся live; candidate formal, formal cold и compare не начаты.

## Formal v7: восьмая попытка

Low-liquidity-companies#1:no_artifact/score0/pass=false/oracle=false,
judge_status=no_artifact, infra_retry отсутствует. Environment/process cleanup
confirmed, все шесть cleanup stages confirmed. В23 уникальных tool calls
семь terminal errors: первый filter request отклонён как Unsupported node label
без possible effect; далее sort output_mapping AMBIGUOUS/NODE_APPLY_STOPPED,
effect_possible=true/cleanup_complete=false. Wait/cancel сохраняют
неопределённость; resume требует исходный checkpoint без unresolved phase.
Recover/inspect не подтверждают разрешение pending outcome. Точная native
причина и stable/flaky UNKNOWN; предположение о прежнем geometry отказе
не выдаётся за доказательство текущего случая.

Raw result/events/cleanup сохранены; отдельный readonly observations receipt
`formal-v7-low-liquidity-attempt1-observations-20261009/review.json` содержит SHA.
History4487entries/15698877archive bytes и diagnostics3entries/4065431bytes
сохранены с full roundtrip. Cold без package не заявлен, ручных повторов0.
Snapshot `formal-v7-progress-8-20261009.json`:8 terminal,4 PASS/4 FAIL.
Baseline81639 подтверждён live; candidate formal и compare пока не запускались.

## Formal v7: девятая попытка

Monthly-demand#1 completed/score100/pass=true/oracle=true,
environment/process cleanup confirmed. Структура и warm oracle отдельно PASS;
request/plan для cold сохранены в artifact-review. Cold ещё не выполнен.
History4527entries/16176904archive bytes и diagnostics3entries/4597165bytes
сохранены с full extraction roundtrip. Snapshot `formal-v7-progress-9-20261009.json`:
9 terminal результатов,5 PASS/4 FAIL; baseline81639 остаётся live.
Current binary/resources, harness и условия пары не менялись; candidate formal,
formal cold и compare остаются открытыми. Подготовка независимых native adapters
описана в [отчёте контрактов](2026-10-08-runtime-acceptance-contract.md).

## Индекс cold replay и частичные метрики

`ab-local-stand-20261008/formal-v7-closed-metrics-and-cold-index-9-20261009.json`
связывает первые9 terminal result/run/events с SHA и все6 сохранённых пакетов
с их review/request/plan. Включён first-last-touch#1 с harness FAIL;
правильные CSV/структура не разрешают пропустить его cold replay.
Все6 structure/warm PASS, все cold ещё pending. Для first-last-touch записан
фактический нестандартный путь review, без предположения об общем layout.

Метрики первых9:209 уникальных step_finish parts,208 уникальных tool calls,
skill calls0 у legacy baseline. Finish parts дедуплицированы по part id,
tools — по callID; turns до первого prepare посчитаны по упорядоченным
step_start messageID. Это частичный baseline snapshot без candidate,
не paired verdict и не доказательство activation delta/noninferiority.
Общий manifest/порог/допуск не изменены. Индекс составлен локально без
model/Help/Loginom/judge вызовов; live controller81639 подтверждён.

## Formal v7: десятая попытка

Nps-segments-by-tier#1 completed/score100/pass=true/oracle=true,
environment/process cleanup confirmed. Структура и warm oracle отдельно PASS,
cold request/plan сохранены; cold pending. History4606entries/17148561archive
bytes и diagnostics3entries/5290695bytes сохранены с full roundtrip.
Snapshot `formal-v7-progress-10-20261009.json`:10 terminal,6 PASS/4 FAIL;
всего7 сохранённых пакетов. Controller81639 live, candidate formal/compare
не запускались. Частичный индекс первых9 остаётся историческим snapshot,
перед cold составить полный индекс обеих законченных сторон.

## Formal v7: одиннадцатая попытка

Risky-approved-claims#1 completed/score100/pass=true/oracle=true,
environment/process cleanup confirmed. Структура и warm oracle отдельно PASS,
request/plan cold сохранены. History4532entries/16837528archive bytes и
diagnostics3entries/5188681bytes сохранены с full roundtrip.
Snapshot `formal-v7-progress-11-20261009.json`:11 terminal,7 PASS/4 FAIL,
8 сохранённых пакетов. Baseline81639 live; candidate formal/cold/compare pending.
52 прежних confirmed closed архива перенесены на отдельный own local disk
с сохранением исходных путей через links и проверкой receipts/readback;
это не изменение результата кейсов или условий A/B.

## Formal v7: двенадцатая попытка

Sales-by-category#1 completed/score100/pass=true/oracle=true,
environment/process cleanup confirmed. Структура/warm oracle отдельно PASS;
cold request/plan сохранены. History4505entries/14880901archive bytes и
diagnostics3entries/3331513bytes сохранены с full roundtrip.
Snapshot `formal-v7-progress-12-20261009.json`:12 terminal,8 PASS/4 FAIL,
9 сохранённых пакетов. Controller81639 live; все formal cold, candidate formal
и compare остаются pending. Ручные повторы не запускались.

## Formal v7: тринадцатая попытка

Slow-supplier-deliveries#1 completed/score100/pass=true/oracle=true,
447324ms. Все шесть стадий cleanup confirmed, обе проверки процессов
показали owned_remaining=0; cleanup_error отсутствует. Исторический V5 FAIL
очистки на этой задаче сохранён: текущий успех не устанавливает его причину.
Структура/warm oracle отдельно PASS; cold request/plan сохранены, cold pending.
History4620entries/18324214archive bytes и diagnostics3entries/6426441bytes
сохранены с full roundtrip. Snapshot `formal-v7-progress-13-20261009.json`:
13 terminal,9 PASS/4 FAIL,10 сохранённых пакетов. Common SHA повторно проверен.
Controller81639 live; candidate formal/cold/compare pending, ручных retries0.

## Formal v7: четырнадцатая попытка

Support-by-priority#1 no_artifact/FAIL0/oracle=false/judge=no_artifact,
298261ms. Все шесть стадий environment cleanup и process cleanup confirmed,
две проверки owned_remaining=0; cleanup_error отсутствует.
21 уникальный tool call,4 terminal tool errors: node_wait в output_mapping
AMBIGUOUS/NODE_APPLY_STOPPED, затем wait/cancel с
OUTPUT_MAPPING_RECOVERY_UNVERIFIED; effect_possible=true/cleanup_complete=false.
Operation_recover вернул неструктурированную ошибку. Семантическое восстановление
не подтверждено; точная native причина и stable/flaky UNKNOWN. Process cleanup
не считается доказательством успешного восстановления операции.
Private `formal-v7-support-attempt1-observations-20261009/review.json` содержит
хэши исходных файлов и наблюдения без новых model/judge/Loginom вызовов.
History4563entries/15325983archive bytes и diagnostics3entries/3498982bytes
сохранены с full roundtrip. Snapshot progress-14:14 terminal,9 PASS/5 FAIL,
10 сохранённых пакетов; common SHA проверен, controller81639 live.
Candidate formal/cold/compare pending; выборочных повторов и правок harness нет.

## Formal v7: первый повтор всех15 завершён

Trial-dosage-outcomes#1 no_artifact/FAIL0/oracle=false/judge=no_artifact,
81956ms, exit0/timed_out=false/harness_error=null. Environment cleanup6 stages
и process cleanup confirmed, два owned_remaining=0; это не успешный сценарий.
14 уникальных tool calls,6 terminal errors: первый node_wait target/AMBIGUOUS/
NODE_APPLY_STOPPED; после resume wait/cancel target/AMBIGUOUS/NODE_WORKER_REJECTED.
Все три структурированных отказа effect_possible=true/cleanup_complete=false;
inspect×2 и recover вернули неструктурированные ошибки. Семантическое
восстановление, точная native причина и stable/flaky не установлены.
Private observations `formal-v7-trial-attempt1-observations-20261009/review.json`
сохраняют исходные SHA; новые model/judge/Loginom вызовы не выполнялись.
History4177entries/10357584archive bytes и diagnostics3entries/22340bytes
сохранены с full roundtrip. Snapshot `formal-v7-progress-15-20261009.json`
проверен:ровно15 разных task_id, у всех attempt1,9 PASS/6 FAIL,
10 сохранённых пакетов, environment/process cleanup confirmed15, common SHA
неизменён. Controller81639 live, начат ab-revenue-per-converter#2.
Это первый повтор baseline, не полная сторона45 и не A/B verdict.
Остальные повторы, candidate45, formal cold и compare pending; manual retries0.

Индекс первого повтора `formal-v7-first-repeat-cold-index-15-20261009.json`
проверяет matching result/cleanup SHA всех15 и SHA десяти локальных сохранённых
пакетов, review/request/plan. Структура и warm oracle10/10 PASS, cold pending;
first-last-touch#1 включён с неизменённым judge FAIL. Серверный package_path
и локальный artifact/package.lgp записаны отдельно. Первоначальная сборка
индекса ошибочно проверяла серверный путь как локальный файл и остановилась
на assertion до записи; это исправлено без native/model вызовов и ослабления
SHA/structure/oracle проверок. Перед formal cold нужен полный индекс обеих
завершённых сторон; этот снимок охватывает только первый повтор baseline.

## Formal v7: второй повтор начат, шестнадцатая попытка

Ab-revenue-per-converter#2 completed/score100/pass=true/oracle=true,
380938ms. Структура/warm oracle отдельно PASS, cold request/plan сохранены.
Все6 cleanup stages confirmed, обе process verification owned_remaining=0,
cleanup_error отсутствует. History4607entries/17099517archive bytes и
diagnostics3entries/5150834bytes сохранены с full roundtrip.
Snapshot `formal-v7-progress-16-20261009.json`:16 terminal,10 PASS/6 FAIL,
11 сохранённых пакетов, environment/process cleanup confirmed16;
common SHA совпадает. Controller81639 live; остальные baseline29,
candidate45, formal cold и compare pending. Ручных retries0.

## Formal v7: семнадцатая попытка

Abc-pareto-groups#2 completed/score100/pass=true/oracle=true,679027ms.
Структура/warm oracle отдельно PASS, cold request/plan сохранены.
Environment cleanup6 stages и process cleanup confirmed, оба owned_remaining=0,
cleanup_error отсутствует. History4648entries/21424792archive bytes и
diagnostics3entries/9443164bytes сохранены с full roundtrip.
Snapshot `formal-v7-progress-17-20261009.json`:17 terminal,11 PASS/6 FAIL,
12 сохранённых пакетов, environment/process cleanup confirmed17;
common SHA совпадает, controller81639 live. Первый ABC повтор остаётся
no_artifact/FAIL; второй — отдельный предусмотренный повтор. Эти два результата
не устанавливают точную причину первого отказа или native stable/flaky.
Baseline ещё28/candidate45/formal cold/compare pending; manual retries0.

## Formal v7: восемнадцатая попытка

Articles-by-author#2 completed/score100/pass=true/oracle=true,360663ms.
Финальные environment cleanup6 stages и process cleanup confirmed,
оба owned_remaining=0, cleanup_error отсутствует. Структура/warm oracle
отдельно PASS; cold request/plan сохранены. History4600entries/15920392archive
bytes и diagnostics3entries/4052595bytes сохранены с full roundtrip.
Первый combined closed guard отказал до вызовов review/archive; значения
того чтения не были сняты, точная причина UNKNOWN. Повторное чтение тех же
файлов и тот же guard PASS; live/judge повторов или ослабления guard не было.
Это наблюдение сохранено в progress-18; финальный результат соответствует
подтверждённым result/cleanup SHA, первоначальный отказ не скрыт.
Snapshot `formal-v7-progress-18-20261009.json`:18 terminal,12 PASS/6 FAIL,
13 сохранённых пакетов, environment/process cleanup confirmed18;
common SHA совпадает, controller81639 live. Baseline ещё27/candidate45/
formal cold/compare pending; manual retries0.

## Formal v7: девятнадцатая попытка

Campaign-roi-by-channel#2 completed/score100/pass=true/oracle=true,405733ms.
Структура/warm oracle отдельно PASS, cold request/plan сохранены.
Environment cleanup6 stages и process cleanup confirmed, оба owned_remaining=0,
cleanup_error отсутствует. History4612entries/17613386archive bytes и
diagnostics3entries/5645544bytes сохранены с full roundtrip.
Snapshot `formal-v7-progress-19-20261009.json`:19 terminal,13 PASS/6 FAIL,
14 сохранённых пакетов, environment/process cleanup confirmed19;
common SHA совпадает, controller81639 live. Baseline ещё26/candidate45/
formal cold/compare pending; manual retries0.

## Formal v7: незавершённая cohort#2, live observation

Controller81639 подтверждён живым; собственный Bun controller PID246016
и его launcher PID496816/starttime84315688 наблюдены живыми, связь PPID
проверена. В приватном receipt launcher selected fields:ready=true,
exit_code=0, sandbox_started=true/sandbox_exit_code=0, error/sandbox_error=null.
При этом events/stderr пусты, result.json отсутствует; официального terminal
результата и process/environment cleanup этой попытки нет. Два ограниченных
поиска baseline CLI по argv0 и затем executable dev/inode не нашли совпадение
в тот момент; это не замена полного процессного cleanup verifier.
Точная причина задержки UNKNOWN. Замеры и selected fields без command capsule,
nonce, stdin, env или credentials сохранены в приватном
`formal-v7-cohort-attempt2-live-observations-20261009/snapshot.json`.
Launcher намеренно сохраняет subreaper boundary до проверок supervisor;
один живой launcher не доказывает, что CLI всё ещё исполняет запрос.
Это read-only signal, не успешный кейс и не повод перезапускать серию по таймауту
наблюдения. Текущий controller сохраняется, новые live/judge calls0,
product/harness edits0; очистка/архивирование активного профиля не выполнялись.

Дополнительно сохранён `identity.json`: текущие UID/birth/executable dev/inode,
PGID/SID launcher сняты без сигналов; group=session=PID496816. После terminal
результата сравнить эту live identity с сохранённой identity в process cleanup,
не объявляя расхождение заранее. Manifest закрепляет effective timeout cohort
1800000ms: task override30 минут, global default900000ms; `taskTimeoutMs` в
frozen harness выбирает explicit override → task → global. Ожидание результата
продолжается на том же handle81639; причина задержки пока UNKNOWN.

По новому live concern выполнен ограниченный source-only запуск двух
существующих process-supervisor tests: protected fixture ends before unit exit
и native writer publication/release gaps. Оба PASS/0 FAIL/12 assertions,
1366ms, exit0; остальные17 tests отфильтрованы. Использованы реальные локальные
fixture процессы и отдельный own TMPDIR без Loginom endpoint, browser/debugger,
model или judge calls. Это не воспроизвело live задержку и не доказывает native
cleanup незавершённой cohort#2. Полный suite не повторялся, source/guards не
менялись; frozen495 HEAD и clean worktree проверены. Лог и source hashes:
`ab-local-stand-20261008/cohort-second-receipt-signal-20261009.{log,json}`.


## Formal v7: подтверждённая остановка неполного прогона

После effective task timeout30 минут и окна cleanup результата cohort#2
по-прежнему не было. Контроллеру246016/starttime83429397 передан SIGINT через
frozen `signalProcess` с проверкой UID/birth/executable/group; подтверждения
обработчика не последовало. Первоначальный guard закрытия launcher отказал:
оставался дочерний процесс. Зависимый вызов прочитал отсутствующий request и
завершился до сигнала; это отклонение порядка зафиксировано, процессов не затронуло.
Свежая проверка установила, что единственный потомок — известный sandbox496829,
состояние Z, birth84315691 совпадает с receipt. Исполняющихся потомков нет.

Только после этой проверки собственный launcher496816/birth84315688 закрыт
SIGTERM через тот же identity guard. Sandbox исчез; launcher стал Z под
контроллером. Контроллер продолжал не выдавать результат и был закрыт SIGTERM
после повторной проверки, что его единственный потомок — этот же Z launcher.
Exec session81639 вернул terminal143. При свежем readback PID246016/496816/496829
отсутствуют; доступные cmdline/FD прочих процессов не ссылаются на этот run.
FD трёх сторонних sd-pam/ssh-agent/gpg-agent недоступны: это ограниченная
проверка, а не подтверждение штатного harness cleanup попытки20. Сигналов
сторонним процессам не было. Исходные server/client и собственные контейнеры
работают с прежними ID/StartedAt; остановки или reset контейнеров не выполнялись.

Все19 завершённых result/cleanup/process-cleanup совпадают с SHA snapshot19:
13 PASS/6 FAIL,14 сохранённых пакетов. Для cohort#2 сохранены prompt, пустые
stderr/events, raw profile и leases; result/cleanup/process-cleanup/run отсутствуют.
Не создавать искусственный результат, summary или receipt штатного cleanup.
Прогон INCOMPLETE, непригоден для сравнения; candidate formal, formal cold и
compare не начаты, ручных retries0. Ни причина пустого CLI exit0, ни причина
неотзывчивости контроллера не установлены. Это не доказанный дефект Bun или
конкретной фазы supervisor. До нового live — воспроизведение и TDD исправление
подтверждённой причины в собственном mutable harness; при смене условий нужны
новый freeze, обе smoke стороны и полный90. Все дальнейшие запуски локально,
стенд10.200.13.152 не используется.

Приватный evidence: `formal-v7-cohort-attempt2-live-observations-20261009/`
содержит request/signal identities, zombie guards и `interruption-readback.json`
SHA256 `084760453d2b0a37328014992d85ab1e91b48f49df536c97aa06c2a3d010190a`.
Readback проверен после записи; чужие недоступные FD и отказ первого observer
scan (shell содержал собственный текст проверки) явно сохранены без ослабления
вывода. Профиль незавершённой попытки не архивировался и не очищался.


## Локальная диагностика и промежуточное evidence supervisor

На текущей системе две последовательности через старый495 supervisor:
25 быстрых `/usr/bin/true` в bubblewrap и25 `--help` установленного baseline
CLI с отдельным пустым профилем. Все50 exit0/process cleanup confirmed,
максимальная длительность532/614ms; model/judge/Loginom запросов не запускали,
credentials не копировали. Последовательности не воспроизвели зависание v7.
Все50 process-cleanup SHA проверены в приватном
`ab-local-stand-20261008/cohort-local-sequences-readback-20261009.json`.

В собственном mutable harness добавлен `process-progress.jsonl`: фиксированная
фаза и observed_at, mode600, промежуточные границы supervisor; без команды,
окружения, paths, capsule или credentials. Последняя полная строка сообщает
границу, не конкретный syscall и не успешный cleanup. Даже persistence не
заменяет result/environment/process-cleanup receipts. Отказ записи сохраняет
failed process cleanup в возвращённой и записанной квитанции. Продукт, судья,
near-miss/tasks и правила admission/retry/таймаутов не изменены.

TDD RED: running phase отсутствует,1 FAIL/1 assertion. После реализации тест
уточнён: читать свежий файл и дождаться собственного fixture ready до abort.
Первый GREEN assertion отказал; точная причина чтения не установлена. Следующий
тест оборвался на15s после раннего abort до готовности child. Остаток этого
собственного fixture569834/birth84613049 закрыт через frozen signalProcess
после проверки UID/exe/group и точного cwd/marker; PID отсутствует. Это отдельный
тестовый startup race, не установленная причина formal v7. Все неудачные логи
сохранены. Итоговый live-phase test1 PASS/12 assertions; guard записи PASS.

Связанные modules29 PASS/0 FAIL/140 assertions/71.14s; typecheck exit0.
Full suite session23188:486 PASS/2 SKIP/0 FAIL/2080 assertions/581.74s;
controller terminal0, process cleanup confirmed/error null/remaining0 в обеих
проверках. Коммит own harness `d08be6baf8f5aea53f83c228cd0984c9d2bf0494`,
clean; source hashes/full receipt read-back:
`ab-local-stand-20261008/process-progress-full-readback-20261009.json`
SHA256 `56ca3f5c787e902c35da5efce582f2d01455094b0891e9283b6e55ad1d105152`.
Protected diff0 против свежего evals `b30dcbe5f2768a740abab18d3fec436aada9ab2b`.
Это source-only проверка, причина native hang UNKNOWN. Следующие запуски только
локально; новый frozen worktree/common conditions/обе smoke стороны ещё не
созданы. До formal comparison нужны полный90 и cold/structure gates. V7
остаётся19/45 INCOMPLETE и не сравнивается как полный baseline.


## Новый frozen d08, отказ storage admission v8 и локальный smoke v9

Создан detached worktree `/home/kiselev/storage/loginom-skills-frozen-progress-20261009/loginom-ai-agent`
на `d08be6baf8f5aea53f83c228cd0984c9d2bf0494` в собственном parent mode700.
Install с frozen lockfile/typecheck exit0, Git clean;658 tracked evals files,
281 task files и оба полных CLI inventories5389/5651 проверены. Fresh evals
`b30dcbe5f2768a740abab18d3fec436aada9ab2b`, protected diff0. Старые frozen
worktrees не менялись, оригинальные Loginom server/client продолжают работать.

V8 baseline smoke/session47153 terminal1: EvalFailure exitCode2 — выделенный
storage не пуст; tasks0, model/judge calls0, candidate не запускался.
Проверка обнаружила только файл UserStorage/user
`a62b18810e20236b724c8d0faac20590796adf9c066dd9d44a66676b58479bba-0-dataset.csv`,
30094bytes. SHA256 `deeaa158ab05f0313fc11bfefce9026b3093d599ce7566d0cf1d39a697f8d2b3`
совпал с нашим сохранённым input cohort-spend-activity. SessionBackup пуст.
CSV скопирован в приватный `v8-preflight-storage-rejection-20261009/owned-cohort-input.csv`,
mode600, SHA/размер/readback PASS. После повторных ID/name/owner-label/no-mount/
marker и SHA проверок, отсутствия выбранных native exe процессов и других
own acceptance контейнеров удалён только этот regular non-symlink CSV.
Storage и SessionBackup после удаления пусты. Никаких unknown locks или
quarantined raw profiles не удалялось; это не исправляет и не подтверждает
cleanup незавершённой v7 cohort#2. Source harness/reset adapter не менялся.

Preservation и exact-owned-input-cleanup receipts сохранены в том же приватном
каталоге; SHA последнего `e4388eb796972c250d99e307eab5ef64d2f069545ab27d254965b018281a5b57`.
V8 raw profile и failed preflight log сохранены. Для новой пары нужны новые
каталоги: V9 helpers/21 adapter pins зафиксированы отдельным common
`ab-conditions-storage-clean-20261009/common.json`
SHA256 `020c08059d809d417e03b977911407c570a51b8861cc3eeb21786c4fce1b162a`.
Тот же frozen d08, judge/model/config/15 tasks/оба payload. Baseline v9/session79154
запущен из frozen evals, run20261009-014845-d08be6baf, phase running подтверждена;
terminal результата ещё нет. Candidate smoke, formal90 и compare ещё не начаты.
Все запуски локальные; никаких действий на10.200.13.152.


## Baseline smoke v9 принят

Session79154 terminal0/run20261009-014845-d08be6baf: completed/score100/pass,
oracle true, environment cleanup confirmed; все6 stages и process cleanup
confirmed/error null/remaining0 в обеих проверках. Структура по независимому
verifier и warm oracle PASS. Cold session24704 terminal0/PASS: новый native
server, сохранённые package/input bytes, settingsReapplied false, свежий CSV
собран до logout, oracle PASS, package close/logout/remaining0 подтверждены;
только byte-verified owned storage files удалены, own cold container удалён.

Closed history4506 entries/15452718bytes и diagnostics3/3882841bytes сохранены
с полным inventory/restore roundtrip, mode600; активные профили не архивировались.
Frozen658 files/21 adapters и fresh evals b30/protected diff0 повторно PASS.
Receipt `ab-smoke-v9-base-accepted-20261009/review.json`
SHA256 `c019ba636696ef9535cfc3b504ce753fc1b129d687052184c27abbb506bac646`.
Метрики уникальных step-finish parts18/tool call IDs17/Loginom13/skills0/errors0;
turns through prepare1. Это smoke, не доказательство statistical non-inferiority.
Candidate smoke session80478 запущен на том же common020c08059…;
formal90 и compare ещё не начаты.


## Smoke-пара v9 принята; formal baseline запущен

Candidate session80478 terminal0/run20261009-015934-d08be6baf: completed/score100,
pass/oracle true, structure/warm PASS, все6 cleanup stages/process cleanup
confirmed/error null. Cold20548 terminal0/PASS: fresh server execution/oracle,
package/input unchanged, settingsReapplied false, close/logout/remaining0,
owned storage и cold container удалены. History1927/9027240bytes и diagnostics3/
3884116bytes сохранены с полным inventory/restore roundtrip, mode600.

Повторно проверены frozen658 hashes,21 adapters, оба полных CLI inventories,
281 task snapshot files, judge executable pins и fresh external snapshot после
пары. Protected diff0 против текущего evals b30. Candidate completed skill
metadata.activation: name/profile loginom-automation, digest
`2a6ffec0d043a9e78e0a3640ffe231deecade7d63f75d631e97a04bc09019b44`.
Уникальные provider finishes18/18, tool calls17/20, Loginom13/14, errors0,
skills0/1; turns through prepare1/2 — ровно+1 activation turn. Прочие различия
не маскируются activation allowance; это не statistical NI доказательство.

`ab-smoke-v9-pair-accepted-20261009/review.json` SHA256
`94fea2d339bcc117874a5562bb42254bcd4ccc086648343f0027287b1551078d`;
common020c08059… одинаков у обеих сторон. После принятой пары запущен formal
baseline session60189/run20261009-021118-d08be6baf,45 scheduled attempts.
Controller PID676156/UID1001/birth/executable/group/session проверен живым;
resume `ab-local-stand-20261008/formal-v9-resume-20261009.json`
SHA256 `2e312d35d14d46027e362f9e4b77fe02ae0d7e93f209ce63f70db2f1a5ea49b7`.
Candidate formal/cold/compare не запускались. Не перезапускать по timeout
наблюдения; использовать тот же handle60189. После обеих45 необходимы полный
индекс сохранённых артефактов, structure/cold и compare. V7/V8 отдельно сохранены
и не подставляются в эту пару. Stage5–8 остаются открыты; stage9/full35 deferred.

## Первый закрытый formal результат v9

Baseline `ab-revenue-per-converter#1` завершён: PASS/score100/judge scored.
Структурный verifier и warm oracle PASS; все6 environment cleanup stages
confirmed, process cleanup confirmed/error null/owned remaining0 в обеих
проверках. `process-progress.jsonl` содержит все9 фаз; подтверждением cleanup
служат отдельные terminal receipts, а не фазовый журнал.

Closed history4604 entries/17048407bytes и diagnostics3/5110421bytes сохранены
с полным inventory/restore roundtrip, mode600. SHA result/cleanup/process-cleanup,
review и preservation receipts закреплены в private
`ab-local-stand-20261008/formal-v9-progress-1-20261009.json`, SHA256
`5a577bd985e8303f64f0263e1ef2fc41ca3f8b028d212f6486699a9fa56f30be`.
Controller60189/PID676156 повторно совпал по UID/birth/executable/inode и жив;
вторая задача abc-pareto-groups#1 running. Candidate formal/cold/compare0,
manual retries0. Первый результат не заменяет45/45 и общий90; активный
профиль и frozen условия не изменены, endpoint остаётся собственным локальным.

## Второй закрытый formal результат v9

Baseline `abc-pareto-groups#1` завершён: completed/PASS/score100/judge scored,
structure и warm oracle PASS. Все6 environment stages и process cleanup
confirmed/error null/remaining0×2; все9 process phases сохранены отдельно.
Closed history4640 entries/21348941bytes и diagnostics3/9371065bytes full
inventory/restore roundtrip PASS, mode600; активный profile не архивировался.

Private `ab-local-stand-20261008/formal-v9-progress-2-20261009.json` SHA256
`e8dc4fedbeeb48fa0f8cab53a00320bd28707a3c6b8265fc549318c4d3db2ebc`:
обе закрытые попытки/result/cleanup/process-cleanup/review/preservation SHA
повторно проверены, controller60189/PID676156/UID/birth/executable/inode жив
и совпал. `articles-by-author#1` running; closed2/45/PASS2/FAIL0,
candidate formal/cold/compare0/manual retries0. Полный90 ещё не принят;
исторический ABC FAIL v7 не удалён и не объявлен доказанной flaky ошибкой.

## Formal v9: сохранённые результаты текущей серии

Baseline run `20261009-021118-d08be6baf`, session60189. Для сохранённых пакетов
structure/warm oracle PASS. Во всех строках все6 cleanup stages confirmed,
process cleanup confirmed/error null/remaining0×2 и full restore roundtrip архивов.
Cold formal ещё не выполнялся; candidate formal и compare не начаты.

| Задача | Повтор | Итог | Пакет / structure+warm | Provider finishes / tools / Loginom | History entries / gzip bytes | Diagnostics entries / gzip bytes |
| --- | --- | --- | --- | --- | --- | --- |
| ab-revenue-per-converter | 1 | PASS100 | Есть / PASS | 21 / 20 / 16 | 4604 / 17048407 | 3 / 5110421 |
| ab-revenue-per-converter | 2 | PASS100 | Есть / PASS | 20 / 20 / 16 | 4604 / 17083652 | 3 / 5138263 |
| ab-revenue-per-converter | 3 | PASS100 | Есть / PASS | 20 / 20 / 16 | 4604 / 17064225 | 3 / 5127521 |
| abc-pareto-groups | 1 | PASS100 | Есть / PASS | 36 / 35 / 31 | 4640 / 21348941 | 3 / 9371065 |
| abc-pareto-groups | 2 | PASS100 | Есть / PASS | 36 / 35 / 31 | 4642 / 20953453 | 3 / 8976043 |
| abc-pareto-groups | 3 | PASS100 | Есть / PASS | 31 / 30 / 26 | 4640 / 20930500 | 3 / 9107352 |
| articles-by-author | 1 | PASS100 | Есть / PASS | 22 / 22 / 18 | 4600 / 15892038 | 3 / 4038019 |
| articles-by-author | 2 | PASS100 | Есть / PASS | 21 / 21 / 17 | 4600 / 15910931 | 3 / 4045637 |
| campaign-roi-by-channel | 1 | PASS100 | Есть / PASS | 19 / 19 / 15 | 4610 / 16655815 | 3 / 4687353 |
| campaign-roi-by-channel | 2 | PASS100 | Есть / PASS | 17 / 16 / 16 | 4612 / 17586705 | 3 / 5620442 |
| cohort-spend-activity | 1 | FAIL0/no_artifact | Нет / не выполнялись | 22 / 21 / 18 | 4563 / 15206251 | 3 / 3337376 |
| cohort-spend-activity | 2 | FAIL0 | Нет / не выполнялось | 21 / 21 / 19 | 4564 / 15352878 | 3 / 3489173 |
| customer-activity-segments | 1 | PASS100 | Есть / PASS | 21 / 20 / 16 | 4608 / 17448322 | 3 / 5497845 |
| customer-activity-segments | 2 | PASS100 | Есть / PASS | 21 / 21 / 17 | 4604 / 16817553 | 3 / 4888921 |
| first-last-touch | 1 | FAIL0/no_artifact | Нет / не выполнялись | 26 / 25 / 23 | 4585 / 15440708 | 3 / 3550529 |
| first-last-touch | 2 | FAIL0/no_artifact | Нет / не выполнялись | 24 / 24 / 22 | 4585 / 15423157 | 3 / 3531856 |
| low-liquidity-companies | 1 | FAIL0/no_artifact | Нет / не выполнялись | 23 / 23 / 21 | 4487 / 15707741 | 3 / 4075869 |
| low-liquidity-companies | 2 | FAIL0/no_artifact | Нет / не выполнялись | 24 / 23 / 21 | 4487 / 15712963 | 3 / 4062618 |
| monthly-demand | 1 | PASS100 | Есть / PASS | 21 / 20 / 16 | 4604 / 16230213 | 3 / 4358291 |
| monthly-demand | 2 | PASS100 | Есть / PASS | 21 / 21 / 17 | 4605 / 16339085 | 3 / 4482084 |
| nps-segments-by-tier | 1 | PASS100 | Есть / PASS | 23 / 22 / 18 | 4605 / 16613250 | 3 / 4745354 |
| nps-segments-by-tier | 2 | FAIL0/no_artifact | Нет / не выполнялись | 25 / 24 / 22 | 4573 / 15360166 | 3 / 3529110 |
| risky-approved-claims | 1 | PASS100 | Есть / PASS | 20 / 21 / 17 | 4531 / 16301844 | 3 / 4666374 |
| risky-approved-claims | 2 | PASS100 | Есть / PASS | 21 / 21 / 17 | 4531 / 16273731 | 3 / 4637187 |
| sales-by-category | 1 | PASS100 | Есть / PASS | 16 / 17 / 13 | 4507 / 15561728 | 3 / 4000100 |
| sales-by-category | 2 | PASS100 | Есть / PASS | 17 / 17 / 13 | 4507 / 15570944 | 3 / 4007473 |
| slow-supplier-deliveries | 1 | PASS100 | Есть / PASS | 22 / 22 / 18 | 4618 / 17032000 | 3 / 5128503 |
| slow-supplier-deliveries | 2 | PASS100 | Есть / PASS | 23 / 23 / 19 | 4618 / 17032433 | 3 / 5127753 |
| support-by-priority | 1 | PASS100 | Есть / PASS | 24 / 23 / 19 | 4622 / 17776466 | 3 / 5863398 |
| support-by-priority | 2 | FAIL0/no_artifact | Нет / не выполнялись | 20 / 21 / 19 | 4578 / 15761243 | 3 / 3906956 |
| trial-dosage-outcomes | 1 | PASS100 | Есть / PASS | 20 / 21 / 17 | 4606 / 16932603 | 3 / 5046893 |
| trial-dosage-outcomes | 2 | FAIL0/no_artifact | Нет / не выполнялись | 25 / 24 / 21 | 4574 / 15704805 | 3 / 3850992 |

Последний private snapshot `formal-v9-progress-9-20261009.json` SHA256
`bd3dfd6fadbe73a2f9bff01ee31681692d1fb6da52d92f348a5351bfaba04702`:
девять result/cleanup/process-cleanup/preservation, шесть review и archive SHA
повторно проверены. Controller идентичность живого PID676156 совпала;
nps-segments-by-tier#1 running. Closed9/45/PASS6/FAIL3/manual retries0,
common020c08059… неизменен. Новый private `formal-v9-observe.py` read-only,
SHA256 `eb9111bcc5191527eafcc49b5af07633709a3cc63276bb60f7a40b5c696a6e9a`,
проверен на живом процессе; не входит в исполняемый harness/21 adapters.
Наблюдался промежуточный result PASS100 с environment cleanup not_run;
архивирование начато только после отдельной подтверждённой полной cleanup.
Его метка RESULT не является terminal cleanup доказательством.

Метрики трёх закрытых попыток сохранены отдельно в private
`formal-v9-base-metrics-3-20261009.json`, SHA256
`51bbcc35a92e4ff2416809c1aeb0696c411eb16a0044e95d5bccc06a3396a13e`.
Provider finishes считаются по уникальным part.id, tools по последнему событию
каждого callID, first prepare — по числу упорядоченных уникальных messageID.
Tool/Loginom/error counters совпали с result.json у всех3; errors0, skills0,
turns through prepare1. Tokens/duration/reported cost и SHA traces закреплены
в receipt. Это partial baseline, без вывода о candidate или non-inferiority.
Первое измерение отклонено assertion из-за неверного имени prepare в observer;
исправлено на наблюдаемый loginom_dock_prepare. Частичный файл не записан,
guards неизменны, новых product/model/judge попыток0; отказ сохранён в receipt.

После campaign#1 метрики дополнены: `formal-v9-base-metrics-4-20261009.json`,
SHA256 `03b78992bdc21ef102a2a7353be4f13abebbc2e7628ce55d7afa6058ad3711ee`.
19 provider finishes/19 tools/15 Loginom/errors0/skills0/prepare1; harness
counters совпали. Три прежних result/trace hashes повторно проверены без
пересчёта изменённых данных; progress4 хранит SHA предыдущего progress3.
Старый cohort#2 v7 INCOMPLETE отдельно сохранён, не подставляется в новую
попытку и не считается причиной или предсказанием её результата.

Cohort#1: CLI exit0, timeout/interruption false, status no_artifact,
build_failure package_not_created, judge_attempts0; пакета и result CSV нет.
Четыре trace errors: node_wait/NODE_APPLY_STOPPED/AMBIGUOUS; второй node_wait
и node_cancel/OUTPUT_MAPPING_RECOVERY_UNVERIFIED; operation_recover также
REQUEST_REJECTED. Нативная первопричина не подтверждена. Process/environment
cleanup отдельно confirmed; semantic recovery не считается успешной.
Closed history/diagnostics сохранены только после подтверждённой cleanup,
full roundtrip и absence guards; failed-cleanup/incomplete raw profiles v5/v7/v8
не архивировались. Выборочного повторного model прогона нет.
Метрики5 `formal-v9-base-metrics-5-20261009.json` SHA256
`f775807def4870bcd68f0fc2cb9e555657d72fba80050d23de5491b4fa76edd2`:
для cohort22 provider finishes/21 tools/18 Loginom/errors4/skills0/prepare1,
counters совпали с result. Прежние четыре result/trace SHA повторно проверены;
progress5 содержит SHA предыдущего progress4. Пятый FAIL остаётся в серии.

Customer#1: structure/warm PASS,6 cleanup stages confirmed/remaining0×2,
history4608/17448322bytes+diag3/5497845bytes full roundtrip. Метрики6
`formal-v9-base-metrics-6-20261009.json` SHA256
`304f271fc1707b3b3feb0f6f40142a452412cd6600628f531cbb6feba4eca1df`:
customer21 finishes/20 tools/16 Loginom/errors0/skills0/prepare1; counters match.
Все прежние result/trace/archive SHA проверены; progress6 сохраняет chain5.

Cohort private read-only review `formal-v9-cohort-readonly-20261009.json` SHA256
`fcc694fe0fa4b22f5a6e9560c350b73152e6c4f6b4e1b41f746d3dfcd13959dc`:
archive и extracted execution journal hashes совпали с preservation inventory;
journal1392 events, calculator calc-cohort/output_mapping/step69. Все47 samples
0–46:workspace.observe SUCCEEDED/effect false, wizard output_mapping,
output page unverified_definition_page/fields0, readiness false. Original
semantic_condition_v2 timeout15000ms, observed15011.93ms. Последнее workspace
чтение cleanup true не заменяет outcome node.apply cleanup false/recovery
unverified. Bundled baseline source требует подтверждённую definition page и
retained Done receipt для recovery; hashes двух source files сохранены.
Native root cause UNKNOWN; model/Help/native/judge calls0, продукт/harness/
deadlines/guards не изменены, причина старого v7 hang из этого не выводится.

First-last#1: CLI exit0/timeout false, no_artifact/package_not_created,
judge0/oracle artifact absent. Trace4 errors: join-metrics/input_mapping
NODE_APPLY_STOPPED/AMBIGUOUS, readiness timeout «calculator done available»;
resume REQUEST_REJECTED требует original inspected checkpoint без unresolved
phase; cancel сохраняет AMBIGUOUS, recover также REQUEST_REJECTED.
Node outcome effect_possible true/cleanup false; process/environment cleanup
separate confirmed/remaining0×2. Native root cause и semantic recovery не
подтверждены. Structure/warm/cold не выполнялись без пакета; отказ сохранён.
History4585/15440708bytes+diag3/3550529bytes full roundtrip/600 PASS.
Метрики7 SHA256 `d9f3aeeb0b8455d1c6048656ac8275559eb095921ef553d770a6026a85a6e98a`:
26 finishes/25 tools/23 Loginom/errors4/skills0/prepare1, counters match.
Все прежние SHA/archives повторно PASS, progress7 сохраняет chain6 и отдельно
unreviewed results при продолжающемся runner; сейчас их0. Это не старый
first-last v7 с package/score89; результаты не подставляются друг вместо друга.

Low-liquidity#1: CLI exit0/timeout false, no_artifact/package_not_created,
judge0/oracle artifact absent. Из8 trace errors первый filter-liquidity-1
REQUEST_REJECTED/NOT_APPLIED/Unsupported node label/effect false/cleanup true.
Затем sort-liquidity-1/output_mapping NODE_APPLY_STOPPED/AMBIGUOUS: readiness
timeout complete output definition page at0, effect true/cleanup false;
cancel сохраняет отказ, resume требует original checkpoint, observe/inspect/
recover также rejected. Native root cause и semantic recovery UNKNOWN.
Environment/process cleanup6 stages/remaining0×2 confirmed; без пакета
structure/warm/cold не выполнялись. History4487/15707741bytes+diag3/4075869bytes
full roundtrip/600 PASS, весь отказ сохраняется в серии.
Метрики8 SHA256 `8f3dc44e6a685f417a5d9da1d3292b440c80a30882fb4f38ae698eb7b2c07a08`:
23 finishes/23 tools/21 Loginom/errors8/skills0/prepare1, counters match;
прежние7 SHA/archives повторно PASS, progress8 сохраняет chain7/unreviewed0.

Monthly#1: PASS100/scored/structure/warm, все6 cleanup stages confirmed,
process cleanup error null/remaining0×2. History4604/16230213bytes и
diagnostics3/4358291bytes full inventory/restore roundtrip/600 PASS.
Метрики9 SHA256 `8fa1154d3f230acf682f12b158589406dce811569c8aec9cb64b76ef07271aa9`:
21 finishes/20 tools/16 Loginom/errors0/skills0/prepare1, counters match.
Все прежние8 result/trace/archive SHA повторно PASS; progress9 сохраняет
chain8/unreviewed0. Три no-artifact FAIL остаются в серии, новая попытка
NPS#1 выполняется на том же common020c08059…; полный90 ещё не принят.

Десятый closed formal v9 `nps-segments-by-tier#1` принят с score100:
структура/warm oracle PASS, все6 cleanup stages confirmed,
process cleanup/error null/remaining0×2. History4605/16613250bytes и
diagnostics3/4745354bytes сохранены с полным roundtrip. Trace/result counters
match:23 finishes/22 tools/18 Loginom/skill0/prepare1/error1. Ошибка
`node_apply` — REQUEST_REJECTED/NOT_APPLIED, Unsupported node label,
effectPossible=false/cleanupComplete=true; она сохранена в исходной трассе.
Ручного повторного запуска не было. Cold этой formal попытки ещё не выполнялся.

Private progress10 SHA256
`2066b2870a0c1dd494098f1bf8cbf8b5597cd392b7ffe516120b028c11a1f68d`,
metrics10 SHA256
`a4b85716bc1640de51a6bfcd6785ac541da515079cf3258e2527721316fd69ee`.
Все10 закрытых результатов/cleanup/process-cleanup, архивы и traces предыдущих
девяти повторно проверены по SHA. Контроллер60189/PID676156/birth84924950
жив с совпадающими UID/exe/inode, common020c08059… неизменен.
Итого closed10/45:7 PASS100/3 no_artifact FAIL0; risky-approved-claims#1
выполняется. Candidate formal/cold/compare не начаты, полный90 не принят.

Одиннадцатый closed formal v9 `risky-approved-claims#1` PASS100:
structure/warm oracle PASS, cleanup6 stages/processes confirmed,
error null/remaining0×2. History4531/16301844bytes и diagnostics3/4666374bytes
сохранены с full roundtrip. Trace/result counters match:20 finishes/21 tools/
17 Loginom/skill0/prepare1/error1. Ошибка node_apply REQUEST_REJECTED/NOT_APPLIED
(Unsupported node label, effectPossible=false/cleanupComplete=true) сохранена;
ручного перезапуска нет. Cold formal пакета pending.

Private progress11 SHA256
`e5e85ebe774444ffd35653ab8afd9c6e89c26ab57b21eeaf4484aa4a64949769`,
metrics11 SHA256
`7b2ffa3dfe112a9786188c6167ba0f536ce252e1b18bbd138ed852994bda7cb8`.
Все11 closed results/cleanup/process-cleanup и архивы, предыдущие10 traces
повторно проверены по SHA; common020c08059… и PID676156/UID/birth/exe/inode
неизменны. Closed11/45:8 PASS100/3 no_artifact FAIL0, sales-by-category#1
running. Candidate/cold/compare не начаты; полный90 не принят.

Двенадцатый closed formal v9 `sales-by-category#1` PASS100:
structure/warm oracle PASS, все6 cleanup stages/processes confirmed,
error null/remaining0×2. History4507/15561728bytes и diagnostics3/4000100bytes
сохранены с full roundtrip. Trace/result counters match:16 finishes/17 tools/
13 Loginom/skill0/prepare1/errors0. Formal cold ещё pending.

Private progress12 SHA256
`33fb9504d79c22d2647ef10e3f34b1d8358b1071a13c75c416ff15b610cfa576`,
metrics12 SHA256
`936a78890131f8f6a9f3addeef0307e1e3057ed63224051c08d3ca685a019da0`.
Все12 closed results/cleanup/process-cleanup и архивы, предыдущие11 traces
повторно проверены по SHA; common020c08059… и PID676156/UID/birth/exe/inode
неизменны. Closed12/45:9 PASS100/3 no_artifact FAIL0, slow-supplier-deliveries#1
running. Candidate/cold/compare не начаты, retries0; полный90 не принят.

Тринадцатый closed formal v9 `slow-supplier-deliveries#1` PASS100:
structure/warm oracle PASS, все6 cleanup stages/processes confirmed,
error null/remaining0×2. History4618/17032000bytes и diagnostics3/5128503bytes
сохранены с full roundtrip. Trace/result counters match:22 finishes/22 tools/
18 Loginom/skill0/prepare1/errors0. Formal cold pending; успешная текущая
очистка не воспроизводит и не объясняет historical v5 failure этого кейса.

Private progress13 SHA256
`9a8189ce9a06505b64275291e243eb364f96794215f69e1e96cb2bb8672d90c4`,
metrics13 SHA256
`99949cd70d70609eda9667266a6d48f57d8d786174e343ec97439dfea7e94828`.
Все13 closed results/cleanup/process-cleanup и архивы, предыдущие12 traces
повторно проверены по SHA; common020c08059… и PID676156/UID/birth/exe/inode
неизменны. Closed13/45:10 PASS100/3 no_artifact FAIL0, support-by-priority#1
running. Candidate/cold/compare не начаты, retries0; полный90 не принят.

Четырнадцатый closed formal v9 `support-by-priority#1` PASS100:
structure/warm oracle PASS, все6 cleanup stages/processes confirmed,
error null/remaining0×2. History4622/17776466bytes и diagnostics3/5863398bytes
сохранены с full roundtrip. Trace/result counters match:24 finishes/23 tools/
19 Loginom/skill0/prepare1/errors0. Formal cold pending.

Private progress14 SHA256
`137eab28fc6574fce3d3f203831b80da5a6dd90b4f3a54f060a68ec5feb703c5`,
metrics14 SHA256
`f2c3a2c653bcd83875768a91744520c90bb06432ce5ed498d5d3199ff81251db`.
Все14 closed results/cleanup/process-cleanup и архивы, предыдущие13 traces
повторно проверены по SHA; common020c08059… и PID676156/UID/birth/exe/inode
неизменны. Closed14/45:11 PASS100/3 no_artifact FAIL0, trial-dosage-outcomes#1
running. Candidate/cold/compare не начаты, retries0; полный90 не принят.

Пятнадцатый closed formal v9 `trial-dosage-outcomes#1` PASS100:
structure/warm oracle PASS, все6 cleanup stages/processes confirmed,
error null/remaining0×2. History4606/16932603bytes и diagnostics3/5046893bytes
сохранены с full roundtrip. Trace/result counters match:20 finishes/21 tools/
17 Loginom/skill0/prepare1/errors0. Ранее наблюдённый result PASS100 с
environment_cleanup=not_run не принимался до confirmed всех этапов.

Первый повтор всех15 заранее выбранных задач завершён:12 PASS100,
cohort/first-last/low-liquidity no_artifact FAIL0. Для12 пакетов структура и
warm oracle PASS, но formal cold ещё не выполнялся. У всех15 подтверждены
6 cleanup stages/process cleanup/error null/remaining0×2; semantic recovery
ошибочных node operations этим не доказывается.

Private progress15 SHA256
`346ceeefe6bab469ed6f4eb125a690df5dec46ff3b2c0ce24d3b4da55a6e0821`,
metrics15 SHA256
`cf14c23a5bdcf6750900e5cc3e52c6b9684f69f819d7023da496b238b82e46eb`.
Все15 closed results/cleanup/process-cleanup и архивы, предыдущие14 traces
повторно проверены по SHA; common020c08059… и PID676156/UID/birth/exe/inode
неизменны. Все21 adapter pins повторно PASS.

`formal-v9-first-repeat-cold-index-15-20261009.json` SHA256
`25f7fe52873b17d5c5d859a574e15095175762426f3f94944b0260344cdda8b0`
содержит все15 outcomes и12 фактических cold requests с проверенными
request/package/input SHA. Три отсутствующих пакета сохранены как FAIL,
им не приписаны structure/warm/cold PASS. Индекс частичный: для формального
cold нужен полный индекс двух сторон по90 исходам, каждому сохранённому
пакету требуется отдельное повторное выполнение.

Контроллер продолжает второй повтор, ab-revenue-per-converter#2 running.
Baseline closed15/45/candidate0/cold0/compare0/manual retries0. Первый повтор
не доказывает stable baseline3/3 или statistical non-inferiority; полный90
остаётся открытым.

Шестнадцатый closed formal v9 `ab-revenue-per-converter#2` PASS100:
structure/warm oracle PASS, cleanup6 stages/processes confirmed,
error null/remaining0×2. History4604/17083652bytes и diagnostics3/5138263bytes
full roundtrip. Trace/result counters match:20 finishes/20 tools/16 Loginom/
skill0/prepare1/errors0. Два успешных повтора не заменяют stable baseline3/3.

Private progress16 SHA256
`90fc921d655a04bf85a2d8359debef8e66752495dc03ddd211a8173c12a8f2ef`,
metrics16 SHA256
`f86fdb89b9efce86fd6e0931cafcb261a6453a66fcf4cfd6a1413af75008b7a6`.
Все16 closed results/cleanup/process-cleanup и архивы, предыдущие15 traces
и cold index15 повторно проверены по SHA; common020c08059… и
PID676156/UID/birth/exe/inode неизменны. Closed16/45:13 PASS100/3 no_artifact
FAIL0, ABC#2 running; candidate/cold/compare0/retries0. Полный90 не принят.

В плане накопленная хронология сведена к текущему статусу и ссылкам на этот
отчёт/checkpoint; все97 checklist lines и критерии сохранены без изменений.
Подробные outcomes и historical failures остаются в отчётах и private evidence.

Семнадцатый closed formal v9 `abc-pareto-groups#2` PASS100:
structure/warm oracle PASS, cleanup6 stages/processes confirmed,
error null/remaining0×2. History4642/20953453bytes и diagnostics3/8976043bytes
full roundtrip. Trace/result counters match:36 finishes/35 tools/31 Loginom/
skill0/prepare1/errors0. Два успешных повтора не заменяют stable baseline3/3.

Private progress17 SHA256
`64eab54cb03849c5a48f57cf71c567d45708c027d8b8be301a1219231a4ba772`,
metrics17 SHA256
`f41c16436f710ca5a9f0f7728a9afc24d4c415f8b888723b0425bc9cb2a5c002`.
Все17 closed results/cleanup/process-cleanup и архивы, предыдущие16 traces
и cold index15 повторно проверены по SHA; common020c08059… и
PID676156/UID/birth/exe/inode неизменны. Closed17/45:14 PASS100/3 no_artifact
FAIL0, articles#2 running; candidate/cold/compare0/retries0. Полный90 не принят.

Восемнадцатый closed formal v9 `articles-by-author#2` PASS100:
structure/warm oracle PASS, cleanup6 stages/processes confirmed,
error null/remaining0×2. History4600/15910931bytes и diagnostics3/4045637bytes
full roundtrip. Trace/result counters match:21 finishes/21 tools/17 Loginom/
skill0/prepare1/error1. Наблюдавшийся result PASS100/environment not_run
не принимался до подтверждения всех6 этапов.

Единственная ошибка — `loginom_search`, plain text74bytes; оригинал сохранён
в private events.jsonl, SHA256 текста
`c7cbb0b34648843841df603f97891cd731de54b760bef51d8d8f48e346612d18`.
Причина не классифицирована; structured codes/semantic cleanup не придуманы.
Первоначальный read-only observer ошибочно предположил JSON и получил
JSONDecodeError; отказ сохранён в metrics18, дальнейшее наблюдение учло
фактический текстовый формат. Harness/продукт/критерии не менялись,
model/manual retry отсутствует; ошибка инструмента остаётся в счётчиках.

Private progress18 SHA256
`cd4b193bcd6d09b4aed617aae7c87c8b0fe27751b0f4d54583c5380d7c9edabf`,
metrics18 SHA256
`c4c40094cdf5637547f9107c640ef5d6636c9d39bc348219be82bb6dc5f38861`.
Все18 closed results/cleanup/process-cleanup и архивы, предыдущие17 traces
и cold index15 повторно проверены по SHA; common020c08059… и
PID676156/UID/birth/exe/inode неизменны. Closed18/45:15 PASS100/3 no_artifact
FAIL0, campaign#2 running; candidate/cold/compare0/retries0. Полный90 не принят.

Девятнадцатый closed formal v9 `campaign-roi-by-channel#2` PASS100:
structure/warm oracle PASS, cleanup6 stages/processes confirmed,
error null/remaining0×2. History4612/17586705bytes и diagnostics3/5620442bytes
full roundtrip. Trace/result counters match:17 finishes/16 tools/16 Loginom/
skill0/prepare1/errors0. Предварительный score100/environment not_run
не принимался до подтверждения всех6 этапов.

Private progress19 SHA256
`4450c28d7082a79c24efd50a662d5ca482ea1c0f887ea4d724531ce7728efa07`,
metrics19 SHA256
`cf8a2e6e9991af876483682cf7ebae0c117b3838919dbec46b1db4528ec811eb`.
Все19 closed results/cleanup/process-cleanup и архивы, предыдущие18 traces
и cold index15 повторно проверены по SHA; common020c08059… и
PID676156/UID/birth/exe/inode неизменны. Closed19/45:16 PASS100/3 no_artifact
FAIL0, cohort#2 running с непустой CLI trace. Это текущая v9 попытка;
исторический v7 cohort#2 остаётся INCOMPLETE с неизвестной причиной.
Candidate/cold/compare0/retries0, полный90 не принят.

Двадцатый closed formal v9 `cohort-spend-activity#2` no_artifact FAIL0:
package_not_created, CLI exit0, timeout/interrupted=false, judge_attempts0.
LGP/CSV отсутствуют, structure/warm/cold не выполнялись. Калькулятор
`calc-cohort-2` остановлен на output_mapping: readiness полного output definition
page at0 не подтверждена. Wait/status/cancel сохраняют
AMBIGUOUS/NODE_APPLY_STOPPED, effectPossible=true/cleanupComplete=false.
Последующее ожидание вернуло OUTPUT_MAPPING_RECOVERY_UNVERIFIED:
Original output Done reference unavailable. Operation recover error —
plain text2668bytes, SHA256
`02e495d0c8ff4707bb2013c73de8c8cc2e08bd38ea938a5948d807171584bcee`;
в тексте наблюдаются REQUEST_REJECTED/AMBIGUOUS/OUTPUT_MAPPING_RECOVERY_UNVERIFIED,
structured phase/effect/cleanup для него не придуманы. Оригиналы ошибок
сохранены в private trace; native root cause и semantic recovery UNKNOWN.

Очистка окружения подтверждена независимо от semantic FAIL:
все6 cleanup stages/processes confirmed/error null/remaining0×2.
History4564/15352878bytes и diagnostics3/3489173bytes full roundtrip.
Trace/result counters match:21 finishes/21 tools/19 Loginom/skill0/prepare1/
errors5. Отказ сохранён в общей серии без исключения или ручного повторного запуска.
Это завершённая v9 попытка, отдельная от historical v7 cohort#2 INCOMPLETE.

Private progress20 SHA256
`4742f8799c99fb045fc15777e54c039244a337dc0a29d93a2ac10fa9c15675f3`,
metrics20 SHA256
`9996c3d2ad40cdf10dc3416e58a79a73d85bae987cbc1ad15d0f1aa0f9b5d609`.
Все20 closed results/cleanup/process-cleanup и архивы, предыдущие19 traces
и cold index15 повторно проверены по SHA; batch8 receipt/readback SHA
совпали, common020c08059… и PID676156/UID/birth/exe/inode неизменны.
Closed20/45:16 PASS100/4 no_artifact FAIL0, customer#2 running;
candidate/cold/compare0/retries0. Полный90 не принят.

Двадцать первый closed formal v9 `customer-activity-segments#2` PASS100:
structure/warm oracle PASS, cleanup6 stages/processes confirmed,
error null/remaining0×2. History4604/16817553bytes и diagnostics3/4888921bytes
full roundtrip. Trace/result counters match:21 finishes/21 tools/17 Loginom/
skill0/prepare1/errors0.

Private progress21 SHA256
`3231e4b2382b130064bd7ad5f4fb55fa126364fdd300a5a5f952ee610f3a910a`,
metrics21 SHA256
`599b3301f10a9a7263696ae0504d843f7e9d89c31db3797e44544a7f4d8ea790`.
Все21 closed results/cleanup/process-cleanup и архивы, предыдущие20 traces
и cold index15 повторно проверены по SHA; batch8 receipt/readback SHA
совпали, common020c08059… и PID676156/UID/birth/exe/inode неизменны.
Closed21/45:17 PASS100/4 no_artifact FAIL0, first-last#2 running;
candidate/cold/compare0/retries0. Полный90 не принят.

Двадцать второй closed formal v9 `first-last-touch#2` no_artifact FAIL0:
package_not_created, CLI exit0, timeout/interrupted=false, judge_attempts0.
LGP отсутствует, structure/warm/cold не выполнялись. Input_mapping
AMBIGUOUS/NODE_APPLY_STOPPED: calculator Done readiness не подтверждена.
Resume отказал с REQUEST_REJECTED; cancel сохраняет AMBIGUOUS. Два
operation_recover error — plain text2279bytes, SHA256
`b2aeaa26ef864fe05ac8d929d388756111c5a766f88de0752d514e807fb4006c`: в тексте
наблюдаются REQUEST_REJECTED/AMBIGUOUS/NODE_APPLY_STOPPED; structured
semantics не выведены из plain text. Native cause и semantic recovery UNKNOWN.

Все6 cleanup stages/processes confirmed/error null/remaining0×2.
History4585/15423157bytes и diagnostics3/3531856bytes full roundtrip.
Trace/result counters match:24 finishes/24 tools/22 Loginom/skill0/prepare1/
errors5. Отказ сохранён без исключения или ручного повторного запуска.

Private progress22 SHA256
`dd71ba33d7e9c1b70286b2e7356caa72c7cb88b501653e8c3368cb874112a2b8`,
metrics22 SHA256
`e40cdb4f36b92f1626ebc28550112ab2c5595faf141298d593a3cb4e7aa5fdec`.
Все22 results/cleanup/process-cleanup/архивы и предыдущие21 trace SHA
проверены. Optional eventsSha256 отсутствовал у старых progress rows:
первый read-only snapshot helper отказал KeyError до записи; все21 trace SHA
проверены через metrics21. Исполняемый harness, продукт и retries неизменны.
Cold index15 SHA совпал; common020c08059… и controller identity совпали.
Closed22/45:17 PASS100/5 no_artifact FAIL0, low-liquidity#2 running;
candidate/cold/compare0/retries0. Полный90 не принят.

Двадцать третий closed formal v9 `low-liquidity-companies#2` no_artifact FAIL0:
package_not_created, CLI exit0, timeout/interrupted=false, judge_attempts0;
structure/warm/cold не выполнялись. Node apply отказал с unsupported node label:
NOT_APPLIED/REQUEST_REJECTED/effectPossible=false/cleanupComplete=true.
Позднее output_mapping остановлен с AMBIGUOUS/NODE_APPLY_STOPPED:
complete output definition page at0 readiness не подтверждена,
effectPossible=true/cleanupComplete=false. Связь отказа по названию с этой
остановкой не доказана. Resume/recovery отказали, cancel/status сохраняют
AMBIGUOUS. Всего7 ошибок; workspace observe и operation recover — plain text
2739/2729bytes, SHA256 соответственно
`8763acce8b333b52f3b7bf0c1d97baede41d15f15a1718852dccf739096d2ace` и
`620d1f178b1092a6c8e704aeec1b3d0d90a402f6166fb740d7a1c46140e7c438`.
Оригиналы сохранены; structured semantics для текста не выведены.
Native cause и semantic recovery UNKNOWN.

Все6 cleanup stages/processes confirmed/error null/remaining0×2.
History4487/15712963bytes и diagnostics3/4062618bytes full roundtrip.
Trace/result counters match:24 finishes/23 tools/21 Loginom/skill0/prepare1/
errors7. Отказ сохранён без исключения или ручного повторного запуска.

Private progress23 SHA256
`72aba11436f8849eb86d64cb9d68629eefac9cedc37e0b7e6acc12ad3e5e6d9c`,
metrics23 SHA256
`cf35eafb307391956912e19493f4f3f9336028aacf1a6738ce061a48c57852b3`.
Все23 results/cleanup/process-cleanup/архивы и предыдущие22 trace SHA
проверены; reviews17/cold index15/batch8 receipt/readback SHA совпали.
Common020c08059… и controller identity совпали. Closed23/45:17 PASS100/
6 no_artifact FAIL0, monthly#2 running; candidate/cold/compare0/retries0.
Полный90 не принят.

Двадцать четвёртый closed formal v9 `monthly-demand#2` PASS100:
structure/warm oracle PASS; cleanup6 stages/processes confirmed,
error null/remaining0×2. History4605/16339085bytes и diagnostics3/4482084bytes
full roundtrip. Trace/result counters match:21 finishes/21 tools/17 Loginom/
skill0/prepare1/errors0. Process persistence до финальных result/cleanup
не принималась за полное завершение попытки.

Private progress24 SHA256
`73f418ef2e3aa993ff055519685566c86154f5e7f971d34a9a549d4300466b05`,
metrics24 SHA256
`2fd2efbcc05dc33595360104df7df93814d0dd9cc83db670ee8448dfe69eba9c`.
Все24 results/cleanup/process-cleanup/архивы и предыдущие23 trace SHA
проверены; reviews18/cold index15/batch8 receipt/readback SHA совпали.
Common020c08059… и controller identity совпали. Closed24/45:18 PASS100/
6 no_artifact FAIL0, NPS#2 running; candidate/cold/compare0/retries0.
Полный90 не принят.

Подготовлен partial cold index для closed24,18 сохранённых пакетов:
`formal-v9-partial-cold-index-24-20261009.json`, SHA256
`8eecd96824cbbf119aaba9aa2e1fdb983430837fb94983791731497b13220c6f`.
Для всех18 повторно проверены request/review/package SHA, exact local artifact
path и соответствие server packagePath результату harness. Все входные CSV
и oracle сопоставлены по SHA с неизменным task snapshot manifest. Все24
result/cleanup/process-cleanup SHA и полная cleanup подтверждены. Шесть
no_artifact сохраняются как FAIL и не получают фиктивный cold PASS.

Первый read-only индексатор ошибочно сравнил local request.package с server
result.package_path; assertion отказала до записи. Исправлено сравнение
request.packagePath с result.package_path и exact local artifact/package.lgp.
Все18 пары проверены; correction сохранена в private receipt. Продукт,
исполняемый harness и модели не изменены, retries0/new Loginom calls0.
Статус PARTIAL_BASELINE_ONLY_COLD_PENDING: это подготовка будущего replay,
не его выполнение и не полная90/NI приёмка. Старый first-repeat index15
SHA25f7fe5287… сохранён отдельно без изменений.

Двадцать пятый closed formal v9 `nps-segments-by-tier#2` no_artifact FAIL0:
package_not_created, CLI exit0, timeout/interrupted=false, judge_attempts0;
structure/warm/cold не выполнялись. Unsupported node label и затем Invalid
mappings.fields: full output list must include every configured source field
дали NOT_APPLIED/effectPossible=false/cleanupComplete=true. Последующий
output_mapping остановлен с AMBIGUOUS/NODE_APPLY_STOPPED: complete output
definition page at0 readiness не подтверждена. Cancel сохраняет AMBIGUOUS;
последующее wait вернуло OUTPUT_MAPPING_RECOVERY_UNVERIFIED, Original output
Done reference unavailable. Для этой остановки effectPossible=true/
cleanupComplete=false; связи с предыдущими отказами и native cause UNKNOWN.
Все5 ошибок имеют JSON-формат и сохранены в private trace. Первый повтор
задачи PASS100 не заменяет второй FAIL и не доказывает стабильность3/3.

Все6 cleanup stages/processes confirmed/error null/remaining0×2.
History4573/15360166bytes и diagnostics3/3529110bytes full roundtrip.
Trace/result counters match:25 finishes/24 tools/22 Loginom/skill0/prepare1/
errors5. Отказ сохранён без исключения или ручного повторного запуска.

Private progress25 SHA256
`9bc1f8a6714e48c4a9e995a5caf68547d6e2de9df1b49c765135f12a9c5b55ac`,
metrics25 SHA256
`821d43c9c4e06ef71987d207cf1a26d9014bfc56e40e1a26b7e9dc10aaa3295e`.
Все25 results/cleanup/process-cleanup/архивы и предыдущие24 trace SHA
проверены; reviews18/first-repeat cold index15/partial closed24 cold index/
batch8 receipt/readback SHA совпали. Common020c08059… и controller identity
совпали. Closed25/45:18 PASS100/7 no_artifact FAIL0, risky#2 running;
candidate/cold/compare0/retries0. Полный90 не принят.

Двадцать шестой closed formal v9 `risky-approved-claims#2` PASS100:
structure/warm oracle PASS; cleanup6 stages/processes confirmed,
error null/remaining0×2. History4531/16273731bytes и diagnostics3/4637187bytes
full roundtrip. Trace/result counters match:21 finishes/21 tools/17 Loginom/
skill0/prepare1/errors1. Единственный node_apply error: unsupported node label,
NOT_APPLIED/REQUEST_REJECTED/effectPossible=false/cleanupComplete=true.
Исходная попытка затем завершилась PASS100; ручного model retry не было.

Private progress26 SHA256
`274d0b7c6e21ad22dd018ef27183bc7f8862bd3d9a5414eb53bd00cc2c79d8cf`,
metrics26 SHA256
`a0f0d16644d55dd26e280a5e34df655e6627a1a20e631343c1c942da0cb62651`.
Все26 results/cleanup/process-cleanup/архивы и предыдущие25 trace SHA
проверены; reviews19/first-repeat cold index15/partial closed24 cold index/
batch8 receipt/readback SHA совпали. Common020c08059… и controller identity
совпали. Closed26/45:19 PASS100/7 no_artifact FAIL0, sales#2 running;
candidate/cold/compare0/retries0. Полный90 не принят.

Двадцать седьмой closed formal v9 `sales-by-category#2` PASS100:
structure/warm oracle PASS, cleanup6 stages/processes confirmed/error null/
remaining0×2; history/diagnostics full roundtrip (объёмы и метрики в таблице).
Trace/result counters match:17 finishes/17 tools/13 Loginom/skill0/prepare1/
errors0. Промежуточный PASS100 с cleanup not_run не принимался до полной очистки.
Все27 results/cleanup/process-cleanup/архивы, предыдущие26 trace SHA и
reviews20/cold indexes15+24/batch8 receipts повторно проверены.
Progress27 SHA `317723f5dd28728405d95fdd0dfe3702c1d65d0943f759ac2e256381341bfdfa`;
metrics27 SHA `f7fceb513de557b0a091923abb9a3a93788ae0cfca5b46170ef43d87c0332e70`.
Common020c08059…/controller identity совпали. Closed27/45:20 PASS100/7 FAIL0,
slow-supplier#2 running; candidate/cold/compare0/retries0, полный90 не принят.

Двадцать восьмой closed formal v9 `slow-supplier-deliveries#2` PASS100:
structure/warm oracle PASS, cleanup6 stages/processes confirmed/error null/
remaining0×2; history/diagnostics full roundtrip (объёмы в таблице).
Trace/result counters match:23 finishes/23 tools/19 Loginom/skill0/prepare1/
errors1. Единственный node_apply error: unsupported node label,
NOT_APPLIED/REQUEST_REJECTED/effectPossible=false/cleanupComplete=true;
исходная попытка затем завершилась PASS100 без ручного model retry.
Все28 results/cleanup/process-cleanup/архивы, предыдущие27 trace SHA и
reviews21/cold indexes15+24/batch8 receipts повторно проверены.
Progress28 SHA `5ab97a0490aef8b3362e78df36ac61b51a7e56a9d56b833a814c74359f63e213`;
metrics28 SHA `24d5c023b7848070ae56736578e59f9dd22162c3eb9e6bdf6d99e689317ec297`.
Common020c08059…/controller identity совпали. Closed28/45:21 PASS100/7 FAIL0,
support#2 running; candidate/cold/compare0/retries0, полный90 не принят.

Двадцать девятый closed formal v9 `support-by-priority#2` no_artifact FAIL0:
package_not_created, CLI exit0, timeout/interrupted=false, judge_attempts0;
structure/warm/cold не выполнялись. Output_mapping readiness полного output
definition page at0 не подтверждена: AMBIGUOUS/NODE_APPLY_STOPPED,
effectPossible=true/cleanupComplete=false. Resume отказал REQUEST_REJECTED,
cancel сохраняет AMBIGUOUS. Recover/inspect — plain text2645/2621bytes, SHA256
`4f00c67fbc9e2bb3105b56665c9a0967b46da3293788d1ff39536138fede2898` и
`ff10fe985adedcbfafa4b7edf269a7d58be058ebc86272b1c8c61b4be325bd63`.
В тексте наблюдаются REQUEST_REJECTED/AMBIGUOUS/NODE_APPLY_STOPPED;
structured semantics для него не выведены. Native cause/recovery UNKNOWN.
Первый повтор PASS100 не подменяет второй FAIL; выборочного retry не было.
Все6 cleanup stages/processes confirmed/error null/remaining0×2;
history/diagnostics full roundtrip (объёмы в таблице).
Trace/result counters match:20 finishes/21 tools/19 Loginom/skill0/prepare1/errors5.
Все29 results/cleanup/process-cleanup/архивы, предыдущие28 trace SHA и
reviews21/cold indexes15+24/batch8 receipts повторно проверены.
Progress29 SHA `b1a1d22792aa8b634d5203dec5199f23788422d52672059808c5f9f12206a2ba`;
metrics29 SHA `627be3080ab086e92942123a82add56b945ccf5df84d200da094167cd655d4d0`.
Common020c08059…/controller identity совпали. Closed29/45:21 PASS100/8 FAIL0,
trial#2 running; candidate/cold/compare0/retries0, полный90 не принят.

Тридцатый closed formal v9 `trial-dosage-outcomes#2` no_artifact FAIL0:
package_not_created, CLI exit0, timeout/interrupted=false, judge_attempts0;
structure/warm/cold не выполнялись. Output_mapping readiness addressed output
definition page at0 не подтверждена: AMBIGUOUS/NODE_APPLY_STOPPED. Последующее
wait/cancel вернуло OUTPUT_MAPPING_RECOVERY_UNVERIFIED: Original output Done
reference unavailable; effectPossible=true/cleanupComplete=false. Два recover
error — plain text2656bytes, SHA
`e327e4d7ffe5979b172b8e5cbb68a6305f8b4d32009c71eb7ff925323a57529e`.
Наблюдаются REQUEST_REJECTED/AMBIGUOUS/OUTPUT_MAPPING_RECOVERY_UNVERIFIED;
structured semantics для текста не выведены. Native cause/recovery UNKNOWN.
Все6 cleanup stages/processes confirmed/error null/remaining0×2;
history/diagnostics full roundtrip (объёмы в таблице).
Trace/result counters match:25 finishes/24 tools/21 Loginom/skill0/prepare1/errors5.
Все30 results/cleanup/process-cleanup/архивы, предыдущие29 trace SHA и
reviews21/cold indexes15+24/batch8 receipts повторно проверены.
Progress30 SHA `53408abe3d7205591303b0f95d07b91915e69a55447669c8f2a93fb0e32a2c87`;
metrics30 SHA `ccc67b12ea64ee71ceffbec220ed9980e0093a1d26a9233d4b508f074023698d`.
Common020c08059…/controller identity совпали. Первый повтор12 PASS/3 FAIL,
второй9 PASS/6 FAIL; всего30/45:21 PASS100/9 FAIL0, ab-revenue#3 running.
Candidate/cold/compare0/retries0, полный90 не принят.

Индекс двух завершённых повторов:
`formal-v9-two-repeat-cold-index-30-20261009.json`, SHA
`942b6964c64e55fbec29332a1ea95a7df0988d9743cf430216d5e4b253d4af38`.
Проверено exact15 selected tasks×attempts1/2, result/cleanup/process-cleanup SHA
и полная cleanup30; у21 пакета request/review/package/input/oracle SHA
сопоставлены с неизменным snapshot manifest. Девять no_artifact сохранены как
FAIL без фиктивного cold PASS. В первых двух повторах9 задач PASS/PASS,3
FAIL/FAIL,3 mixed (NPS/support/trial). Третий повтор обязателен; эти данные
не доказывают стабильность3/3 или NI. Статус
TWO_BASELINE_REPETITIONS_ONLY_COLD_PENDING, live cold ещё не выполнялся.
Предыдущие indexes15/24 сохранены без изменений.

Тридцать первый closed formal v9 `ab-revenue-per-converter#3` PASS100:
structure/warm oracle PASS, cleanup6 stages/processes confirmed/error null/
remaining0×2; history/diagnostics full roundtrip (объёмы в таблице).
Trace/result counters match:20 finishes/20 tools/16 Loginom/skill0/prepare1/errors0.
Промежуточный PASS100 с cleanup not_run не принимался. У задачи повторно
проверены все3 baseline outcomes: judge100/structure/warm3/3 PASS; formal
cold этих3 ещё pending, candidate/NI не доказаны.
Все31 results/cleanup/process-cleanup/архивы, предыдущие30 trace SHA и
reviews22/cold indexes15+24+30/batch8 receipts повторно проверены.
Progress31 SHA `8178e7295e6b2dc7d4f9a790b80931c4281ca1244685be0bfabf9becb313f257`;
metrics31 SHA `1052402afdb73a1e4f5092f78a25c9a82320592a3a46f40b51390b86f27aac5c`.
Common020c08059…/controller identity совпали. Closed31/45:22 PASS100/9 FAIL0,
ABC#3 running; candidate/cold/compare0/retries0, полный90 не принят.

Тридцать второй closed formal v9 `abc-pareto-groups#3` PASS100:
structure/warm oracle PASS, cleanup6 stages/processes confirmed/error null/
remaining0×2; history/diagnostics full roundtrip (объёмы в таблице).
Trace/result counters match:31 finishes/30 tools/26 Loginom/skill0/prepare1/errors0.
У ABC и ab-revenue повторно проверены judge100/structure/warm3/3 PASS; formal
cold этих6 пакетов pending, candidate/NI не доказаны.
Все32 results/cleanup/process-cleanup/архивы, предыдущие31 trace SHA и
reviews23/cold indexes15+24+30/batch8+9 receipts повторно проверены.
Progress32 SHA `1c48de09b50e03a9b9576c6215989fc684fe734a94079d05e2354526a22af4c7`;
metrics32 SHA `77eed560fd009cb7ab374383eba5c418f68e0554d34dea446429210020c53e53`.
Common020c08059…/controller identity совпали. Closed32/45:23 PASS100/9 FAIL0,
articles#3 running; candidate/cold/compare0/retries0, полный90 не принят.
