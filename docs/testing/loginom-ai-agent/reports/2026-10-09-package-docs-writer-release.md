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
