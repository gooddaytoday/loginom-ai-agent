# Release writer после открытия owner

Новая локальная A/B smoke-пара v7 на frozen495 прошла судью, структуру,
warm oracle и installed cold. Полный clean suite484 PASS/2 SKIP/0 FAIL,
typecheck PASS; formal baseline v7 запущен. Приёмка90 ещё не завершена.
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
