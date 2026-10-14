# Приоритет стандартных узлов в loginom-automation

Текущий checkpoint новой серии `20261014T185528Z-ad0f2b`: закрыты три candidate,
политика подтверждена в трёх; один итоговый расчёт правильный, два результата
не получены. Одна сессия завершена штатно, две освобождены адресно после отказа.
Сейчас monthly-demand/1 выполняется с20:25:31.229Z, CLI3071140;
runner3040743/exec71139 продолжает последовательную серию. Ещё21candidate не начат.

Sales-by-category/1 closed20:25:22.530Z: policy PASS, oracle/calculationtrue,
CLI0/cleanuptrue/Host3041636ACKtrue. Sidecar `2172b404…`: полные16messages/
62parts/18completedtools/52events/1846runtime; четыре стандартных SUCCEEDED
Import→Group→Sort→Export, JS0/childrennone/historyAnomalyfalse.
35protected/4copied hashes неизменны. Повторного oracle или live-запуска не было;
runner автоматически перешёл к Monthly после gate, без ручной паузы.

First-last-touch/1 closed20:04:25.456Z: policy PASS `01e41281…`, mandatory failure
review `558b2433…`; полные40messages/147parts/42tools/125events/3362runtime,
семь выполненных стандартных узлов, JS0/childrennone. Итоговые CSV/LGP не получены,
CLI1/cleanupfalse; Export3 остался AMBIGUOUS с OUTPUT_PORT_OPEN_UNCONFIRMED.
Own237 closed20:16:54.921Z, adminlogout20:16:56.536Z, wholebrowserclosed20:17:09.291Z;
9PIDgone, точный guard архивирован,18original/24recovery неизменны.
Descriptor `b5f74132…`/independent review `14754876…`/finalreadback `40deba3c…`;
public gate20:19:39.569Z разрешил TECHNICAL_FAILURE_RECORDED. Original FAIL сохранён.
Отдельный metadata erratum `4af5dab4…`/review `370231fb…` уточняет две описательные
метки; запечатанные descriptor/command и действительная команда не изменены.

Baseline6references, frozen sources/protocol/criteria и runtime неизменны.
Проверки JS-исключений, recovery и seeded3 стандартных успехов ещё впереди;
общая приёмка политики и достаточность полного покрытия пока не подтверждены.

Исторический checkpoint ABC/1: closed19:32:25.838Z. Отдельный
policy-v2 PASS `d46e66c0…`, mandatory failure review `a9d05ad9…`:full32messages/
124parts/36tools/101events/2769runtime, JS0/childrennone. Стандартные CumulativeSum,
Data(last running total), IF .8/.95 и Group count/sums содержательно покрыли ABC;
конкретный вызов Stat(...,Sum) не утверждается. CSV/LGP не получены, CLI1/
cleanupfalse/Host2841409ACKfalse; второй Calculator WIZARD_OPEN_NOT_CONFIRMED/
AMBIGUOUS, попытки inspect/resume и честный блокер без JS.

Own234 closed19:43:56.732Z, admin235logout19:45:31.881Z, wholeMCPbrowserclosed;
9PIDgone,2ownabsence snapshots, неизвестная233 не закрывалась. Точный guard
архивирован: ino7921008/mtime1792005811455.764, proof1134632b…; original19SHA
сохранены. Descriptor941ab5b5/independent review4d7303e8/finalrelease09714ab1;
actualpublicgate19:53:18.258Z разрешил advance TECHNICAL_FAILURE_RECORDED,
originalpolicyincomplete/mathfalse остаются. ПолитикаPASS не означает functionalPASS.

Исторический checkpoint19:54:40.938Z: first-last-touch/1 начат, CLI2946499;
runner2945739/exec13648 с19:54:30.413Z, sources/criteria/protocol прежние.
На этом checkpoint новая серия:1closedpolicyPASS,
0correct/1notobtained,0normal/1manualreleased и1active; policy acceptance пока нет.
24candidate slots оставались до стартаfirst-last. Baseline6references неизменны;
новая серия не заменяет originalFAIL и не запускает ABC retry.

## Действующая приёмка: политика выбора узлов, версия 2

Прямое указание пользователя от2026-10-14 заменяет функциональные пороги
приёмки цели. Канонические критерии: [acceptance-v2](2026-10-14-loginom-node-selection-acceptance-v2.md),
version `node-selection-policy-v2`, SHA `5b5053d14aecf7462e317b75fa3a14fa3bff6717080128edf0da582171a015fa`.
Для плана путь к файлу — `../specs/2026-10-14-loginom-node-selection-acceptance-v2.md`.
Policy, аналитика и runtime/normalcleanup оцениваются независимо. Не требуются
100% успешных расчётов, все functional PASS или превосходство над baseline.
Отказы и original verdicts сохраняются. Технический отказ с достаточными
содержательными решениями и полной историей может подтвердить policy;
prepare/import-only отказ получает insufficient-evidence, а не PASS из-за JS0.
Положительные explicit-JS/gap и error→standard-fix-or-blocker без JS обязательны.
Whole construction history включает временные/failed JS и child sessions.
Matrix31, mandatory reviews, candidate violation stop и strict own release
не меняются. Baseline описательный; дополнительные альтернативы только при
недостаточном policy coverage, а не ради functional100%. Original frozenprotocol
и его gates ниже — история условий запуска, не действующие пороги приёмкиv2.
Новые policy-v2 sidecars ссылаются на criteria/protocol/evidence SHA и не меняют
original attempt/audit. Runtime неизменен; исходные76source files сохранены в readonly
архиве. Минимальное execution-v2 изменение касается четырёх evaluator files;
rebuild runtime не нужен.


### Коррекция после нарушения tags/2

Новая версия skill исправлена отдельным commit `d99389dd2a`:17 строк в двух
Product md, без handler/runtime изменений. Новый asset-only candidate
`20261014T185528Z-ad0f2b`, digest `0ca88b2d03b546c358ce988637560a1c2c877581edd102252c7c66ec06e4b21b`.
Штатная проверка installed Product skills, ссылки и payload manifest прошли;
runtime остался659588. Изменены только два skill assets и два manifest-файла.
Canonical quick_validate не поддерживает прежнее поле compatibility;
проекция без этого поля прошла, реальное поле сохранено и accepted Host validator.
Старая серия и её FAIL/violation не меняются. На checkpoint19:17 до первого
dispatch новой серии моделей ещё не было.

Проверка новой версии сохраняет31позицию:6 completed baseline references и25
новых candidate. Контракт [baseline reuse](../../../evals/docs/2026-10-14-node-selection-baseline-reuse.md)
фиксируется до реализации/первого dispatch. Старые baseline identities и все
шесть исходных исходов сохраняются; C17 старой версии не засчитываются.
Controller получает только explicit opt-in/read-only existingOnly без fallback,
сопоставимость и release проверяются до dispatch. Порядок C9→B6references→C16.
Baseline описательный: один замер каждой задачи, историческое время исполнения;
повторяемость baseline и статистическая эквивалентность не утверждаются.

- [x] Исправить две инструкции skill по подтверждённому JS scope violation и проверить новый asset-only комплект без пересборки runtime.
- [x] Реализовать узкое baseline reuse по TDD, проверить независимое ревью и заморозить новый protocol до первой модели.
- [x] Подтвердить итоговый prospective admission и начать новую последовательную серию после strict own release.
- [ ] Выполнить25candidate новой версии с first9 gate, обязательным review и strict own release; подтвердить достаточность policy coverage отдельно от analytics/runtime.

Новая серия запущена19:23:22.539Z, runner2840711/exec86264; ABC/1 CLI2841168
с19:23:31.436Z. Independent admission `e7ba5561…`, final execution lock
`a48cfaf7…` заморожены до dispatch. Профиль был свободен,8previous ownPIDgone,
oldseries leaseabsent; ownrelease-only `5a92054f…` не повышает старый violation.
На checkpoint19:23 первая попытка выполнялась; принятие новогоskill
на этом checkpoint не утверждалось.
Дальше C9→проверка6Brefs→C16, модели последовательны. Successful standard
advance автоматически; JS/recovery/failure/anomaly и sampled successes review
сохраняются. Подтверждённый candidateviolation останавливает новую серию.

Controller commit `ffbbac4220`:28tests/429assertions, typecheck0, семь RED→GREEN
циклов. Independent source review `0bf150db…`, Root actual6existingOnly gates
`583efad7…`:4normal/2technical,267originalSHA неизменны,0models/0dispatch.
Два исходных отказа не повышены до PASS. Новый frozen protocol `f71e0c50…`,
source archive79/index `dad5e372…`; draft был readyfalse до admission,
final execution lock `a48cfaf7…` зафиксирован readytrue до первого dispatch.
Criteria v2 прежние, сравнительный порог и100%math в новом протоколе отсутствуют.

Дизайн следующей версии: [JS gap scope correction](2026-10-14-loginom-js-gap-scope-correction.md).
Перед JS проверяется соответствие каждой операции в коде обоснованному пробелу.
Для переменного split JS оставляет исходные части; доступные Trim/Filter/Group/Sort
выполняются стандартными узлами. Никаких новых handlers/runtime изменений.
Новая версия требует отдельного digest/prospective protocol и25candidate;
совместимость уже выполненногоbaseline6 проверяется до решения о переиспользовании.
Прежняя серия с подтверждённымviolation сохраняется остановленной.

### Выполнение приёмки v2

- [x] Зафиксировать отдельную версию критериев до следующего model dispatch, сохранить исходный протокол и получить независимое сравнение с прямым указанием пользователя.
- [x] Добавить отдельные policy-v2 verdicts для первых девяти закрытых candidate без изменения старых аналитических/runtime результатов.
- [x] Минимально изменить evaluator runner/release gate по TDD, сохранить исходные source seals и получить реальный strict-release допуск v2 до следующего нового model dispatch.
- [x] Выполнить и описательно оценить все шесть baseline на итоговом matched runtime, сохранив четыре правильных результата и два технических отказа без повторов и без сравнительного порога приёмки.
- [x] Сохранить исходный audit при обязательном ревью аномального стандартного успеха: отдельные review/verdict, минимальный runner R3 по TDD, независимый review и проспективный strict-release допуск.
- [x] Добавить узкий policy-only допуск стандартного отказа с штатным release, сохранив исходные результаты: TDD, независимое ревью и execution-r4 до следующей модели.
- [x] Расширить v2 memory review на успешные JS-исключения, сохранив исходный pending audit: TDD, обязательная роль JS, независимое ревью и execution-r5 до следующей модели.
- [x] Адресно освободить собственную Loginom-сессию и профиль после tags/2, сохранив originalFAIL и подтверждённое нарушение, без допуска старого candidate.
- [ ] Исправить подтверждённое нарушение scope JS вtags/2 и заморозить проверку нового candidate; прежняя серия остановлена и не переименовывается в успешную.
- [ ] Закончить неизменную матрицу31 и оценить все25candidate поv2 (17закрыты/1violation; текущая серия остановлена,8не начаты; новая версия требует отдельного протокола).
- [ ] Завершить обязательные reviews всех исключений/отказов/аномалий и трёх seeded standard successes.
- [ ] Подготовить итог с тремя независимыми оценками и решить приёмку политики по достаточности доказательств.

Criteria v2 `5b5053d1…`, lock `2c36d0cd…`, user authorization `aeff1714…`
сохранены. Независимое сравнение с дословным user request не выявило
блокирующих расхождений. Исходный protocol834620b9… и его76source копий сохранены; новый runtime
или model process ради переоценки не создавался.

Текущий checkpoint 2026-10-14 18:40 UTC: серия `20261014T112452Z-5e223f`
остановлена. Закрыты23 из31 попыток, моделей нет. Tags/2 finished18:19:28.149Z,
CLI1/cleanupfalse/Host2683156ACKfalseexit1. Exec75475/runner2682367 уже завершились
с SELECTION_CLEANUP_UNCONFIRMED до попытки Root отправить SIGINT; сигнал не отправлен.
Own231 закрыта18:33:57.965Z, admin232logout18:36:46.065Z, wholeMCPbrowserclosed;
8ownPIDgone/2freshownabsence snapshots, неизвестная user230 сохранена.
Точный guard архивирован: ownerino7867143/mtime1792001733991.9087,
proof `721f809a…`; independent release-only review `5a92054f…` подтверждён.
Профиль свободен, но старый candidateff18 по-прежнему запрещён.
Отдельный released supplement не меняет originalcleanupfalse/ACKfalse/CLI1.
Binding: successful JS GUIDae8aaaa3…/doc1a6c1da7…/resource171eb0cf…/Sessionsec45f7e49…;
текущая nativeinit18:15:46.778Z подтверждена, старые рециклированные231 исключены.
Адресный nativeclose разрешён independentbindingreview `d3e7ff91…`;
новая модель этой версии не разрешается ни binding, ни release review.

Подтверждённое нарушение: JS tags-split-001 выполнил Trim и фильтрацию пустых
элементов сверх обоснованного variable-unpack gap. Known Trim/Filter изучены
до JS; позднейшие standard Group/Calculator ошибки нарушение не оправдывают.
Independent verdict `4c560d5d…`, review `ee5ba7cb…` подтверждают wholehistory/JS1.
Skill digestff18… отклонён; новых попыток этой версии не будет. Все исходные
attempt/evidence/вердикты и frozen31 protocol сохраняются;8слотов не запущены.
Политика не принята. После strict own release нужны исправление skill и отдельный
проспективный протокол проверки новой версии; критерииv2 не ослабляются.

R5 commit6a30af1c34 изменил две строки effectiveAudit для успешных исключений:
66focusedPASS/416assertions/typecheck0. Independent source review `6bbc9b71…`,
Root review `978e0f5b…`, prospective execution-lock-r5 `cb27b1ca…` и delta
admission review `42ce9f85…` зафиксированы до старта18:15:23.177Z.
Readonly gate explicit-js/2 `00f493e9…` разрешил advance;46original hashes сохранены,
audit.reviewStatuspending и originalwrapper2 не переписаны. JS role inspector,
strict release, defaultv1 и R4 failed path неизменны; runtime не пересобирался.
R4 source archive `471ad6f0…` сохранён. Неизменные approved R4 proofs повторно
не пересматривались; R5 admission проверил67delta/case references без gate rerun.

Explicit-js/2 finished18:01:32.840Z: policy/oracle/calculationPASS/JS1/CLI0,
Host2629449ACK0/cleanuptrue, CLI2628380gone, writerabsent перед nextdispatch.
Mandatory graph-review `4adfd057…` и policy-v2 sidecar `59b1fda9…` положительны:
requested-aggregation вычисляет входные count/sum/means без hardcoded output;
4nodes3links, full19tools/55events/1932runtime,44original bindings неизменны.
Exec78963 завершён review, а не ошибкой расчёта. Successful explicit2 не повторён.
Текущие критерии, матрица31/model/inputs и продуктовый runtime прежние.

Узкий policy-only путь для first-last-touch/2 выполнен по TDD, commit355ba8d075,
64 focused PASS/342assertions/typecheck0. Independent source review `ff97a114…`
и execution review `734a399b…` одобрили source/pins/criteria/21closed/nextslot.
Проспективный immutable execution-lock-r4 `8ac5b47f…` зафиксирован до новой модели.
Actual readonly gate `8972d773…` разрешил POLICY_V2_FAILURE_RECORDED, сохранив
failed/incomplete/calculationfalse/oraclefalse/JS0;46старых файлов неизменны.
Эквивалентный gate повторно не запускался. Предыдущие R3 sources readonly,
index `d949fb8d…`; runtime, matrix31, inputs и model прежние, handlers не менялись.

First-last-touch/2 finished17:28:06.768Z: Export UI отказ не дал CSV, частичный
LGP сохранён. CLI2540012/Host2540474gone/ACK0/packageclosed/logout/cleanuptrue;
собственный guard отсутствовал перед nextdispatch. Policy sidecar `979df7d7…`
и обязательное failure/anomaly review `04bd0a4d…` подтвердили содержательную
полную историю,18settlednativeoperations и initialcatalog→samecachedprepare.
Исходные identity/runtimeSettled/graph/export false не подменены. Result-not-obtained
не объявлен incorrect calculation или functional PASS. Own release readback
`f9719307…` сохранил42original SHA; admin recovery не потребовался.
Product/runtime/criteria/matrix неизменны; technical refusal не заменён повтором.

Candidate17 closed summary `963b4229…`: policy16PASS/1violated/0insufficient,
аналитика11correct/6notobtained, штатных release12/ручных postfailure4,
own releasepending0; теперьmanualpostfailure5 (новыйrelease supplement). Прежний snapshot16 `c9e9f91f…` сохранён.
Explicit-js/2 дал второй положительный requested-aggregation JS-check с
правильным результатом; Import500→JS5→Sort5→Export346B/25cells.
Один из12штатныхrelease относится к реальному Export UI отказу; это не
утверждение успешного runtime выполнения всей аналитической цепочки.
Предыдущий снимок14 `87f0297c…` сохранён без переписывания.
ROI/2 finished17:17:32.674Z, oracle/calculationPASS/JS0/normalcleanuptrue;
sidecar `319ac1ec…`, autoadvanceproof `0c3c851c…` подтверждает переход к
first-last-touch/2 в17:17:32.822Z после завершения собственных CLI/Host.
Его аналитика: Group поchannel, Countcampaign/Sumbudget/Sumrevenue,
Calculator взвешенногоROI, SortDESC и Export. Исходный ROI/1 отказ сохранён.
Все шесть стандартных сценариев, explicit-JS, gap и recovery имеют содержательные
доказательства. Полная матрица25candidate, следующие исключения и seeded3 остаются
обязательными; общая приёмка пока не завершена.

Claims/2 finished16:41:00.996Z: CLI2441196/Host2441390gone, ACK/exit0,
normalcleanuptrue/oracle-calculationPASS/JS0. Аномалия разобрана отдельно:
неподдерживаемый label Filter отклонён до runtime; повтор с тем же predicate
и без label успешно применил стандартный узел. Неуспешный узел не создан,
сохранённый граф связан. Graph-review `a404e0d6…`, independent anomaly review
`2b22c974…`, новый policy-v2 sidecar `511bf69e…`. Исходный audit `3b392b57…`
и все исходные attempt/closure verdicts сохранены без изменения.

Узкое дополнение runner учитывает положительное отдельное ревью стандартного
успеха в памяти, сохраняя sealed audit на диске. Commit `ed23258bee`:
64 focused tests/238 assertions, typecheck0; независимый source review
`a4f7f6a…`, реальный readonly release gate `ad35b94e…` разрешил продолжение.
Предыдущие R2 sources сохранены readonly, index `47b10529…`.
Проспективный execution lock-r3 `e6433329…` и independent admission review
`6cc5076c…` зафиксированы до нового dispatch ROI/2 в17:00:50.950Z.
Criteria v2, матрица31, model/inputs и продуктовый runtime не изменены.

ABC/2 и Monthly/2 дали правильные результаты стандартными узлами, JS0;
policy-v2 sidecars `ea0fbc89…` и `bac2cd7f…`. Monthly/2 finished16:33:42.344Z,
его immediate gates разрешили автоматический Claims/2 без ручной паузы,
autoadvanceproof `5ea4a696…`. Инвентаризация19closed reviews `f8e9824b…`
включает Claims/2 и R3, прежний снимок18 `4eedc511…` сохранён. Новые исключения,
отказы, аномалии и финальная seeded выборка сохраняют обязательное review.

Sales/2 finished16:16:31.961Z/CLI0/Host2393038ACK0/cleanuptrue,
oracle/calculationPASS/JS0/connectedgraph. Audit `6db41087…`,
отдельныйpolicy-v2 verdict `e6b1c79b…` подтверждаетполнуюисториюиstandardlineage.
СледующийABC/2 начат автоматически послеimmediategates безручнойпаузы;
подробныйновыйverdictготовилсяпараллельноABC. Autoadvanceproof `f50f55c4…`.
ПредыдущийCandidate10 summary `a0c6df66…` сохранён отдельно безперезаписи.
Полнаяcandidate25приёмкаиseeded3ещёоткрыты;старыеотказынепереименованы.
Baseline6 закрыт и описательно оценён:4correct/2notobtained,
normalcompletion4/technicalfailure2 с отдельными approved strict releases.
ROI/1 oraclePASS/JS0/normalcleanuptrue автоматически перешёл кfirstlast;
firstlast/1 завершён15:56:26.961Z с CLI1/HostACKfalse/cleanupfalse,
AMBIGUOUS JS materialization_execute и неуспешным partial save, LGP/CSV нет.
Native JS activation в серверном журнале есть, публичный output success не подтверждён.
Own214 связан successful Import GUID, адресно закрыт16:03:33.193Z;
admin215logout16:04:34.759Z/егоBrowserclosed/8PIDgone/точныйguardarchive16:07:13.581Z.
Независимыйrelease review `6cfb41dd…` и actualgate `afc211b3…` разрешили next,
сохранив technical-failed/policyfailed/calculationfalse. Соседние211/213 не закрывались.
Ни один baseline отказ не повторён, четыре прежних correct результата не пересчитывались.

Candidate: 16 policy-v2 PASS и1подтверждённое нарушение; аналитика11correct/6notobtained,
normalcleanup12/ручных postfailure releases5/pending0. Политика не принята. Один Export UI отказ завершён штатно. Claims/2 anomaly review завершён.
Baseline: sales/ABC/monthly дали правильный результат; claims — отказ на
import configure/UI_SCAN_LIMIT до содержательных решений. Его policy-v2 —
insufficient-evidence, JS0 не превращён в PASS. Оригинальные файлы и отказы сохранены.
Итоговый descriptive baseline-v2 summary `ce274bef…`: policy3PASS/2violated/
1insufficient, аналитика4correct/2notobtained, normalcompletion4/technicalfailure2.
ABC использовал два JS-узла при верном расчёте; firstlast сделал один JS apply,
но не получил подтверждённого результата. Нарушения старого skill не являются
нарушениями candidate и не задают порог приёмки. Все прежние summaries/sidecars,
audit/attempt/verdict сохранены; firstlast released supplement `fe72c9cf…` отдельный.

Собственная user:209 автоматически закрыта15:03:04.387Z; два свежих снимка
диспетчера подтвердили отсутствие user-сессий. Admin210 вышел, браузер закрыт,
все8ownPIDgone; точный guard архивирован15:22:20.697Z. Finalrelease review
`f154e353…` и actualreadonly gate-r2 `85b4b131…` разрешили безопасное продолжение.
Прямая GUID-привязка остаётсяfalse; доказаны два узких native RPC и полный ledger.
Первый actualgate отказ `5d94fc72…` и неиспользованный lock `093e2f85…` сохранены.
Реальный U+2028 formatter record исправлен только в evaluator parser по TDD.
Итоговые64tests/190assertions/typecheck0; source commits118f1dce1b/c0ccb0150a/6345ca6abf.

Проспективный execution lock-r2 `495b3214…`, independent review `2794a055…`
и критерии `5b5053d1…` зафиксированы до нового model dispatch. 76 исходных sealed
files сохранены в readonly архиве;72currentsources unchanged, изменены ровно4
разрешённых evaluator source/test файла. Product и runtime не менялись и не
пересобирались. Matrix31/model/inputs/oracle прежние, старые слоты не повторяются.
Успешные стандартные слоты автоматически продолжаются после всех immediate gates;
исключения/отказы/аномалии и финальная seeded выборка сохраняют обязательное review.



Историческое состояние на 2026-10-14 11:05 UTC: обработчики стандартных узлов возвращены
к базе38ee (127productionfiles independentlychecked), а общие порты, мастера
и таблицы, необходимые JavaScript, сохранены. Rollbackd445c8ea65 и sourcegate
35c7bc60eb завершены; changedclient/JS2154PASS. Technicalcontinuation6993d7ca4a
прошёл44PASS/typecheck/source review. Новая matched пара20261014T105540Z-47e030
имеет единый runtime287files/b85167…; physicalpair reviewPASS, skill-only разница.
Основная матрица31=6baseline+25candidate и prospective technical continuation
закреплены доmodels0. Один необходимый ordinary Import→Sort→Export сейчас
выполняется локально; никакие старые live outcomes в новую серию не перенесены.
Полная приёмка открыта; technical failure остаётся failed, confirmed JS-policy
violation останавливает серию, strict own closure обязателен перед nextdispatch.

## История реализации и прежних серий

Дата: 2026-10-13. Ветка: `node-javascript`. Исходный код: `951a0027f`.
Статус: дизайн согласован пользователем; реализация идёт, live-приёмка ещё не завершена.
Основной skill изменён в двух Product файлах. Аудит/runner прошли TDD и независимый
review; реальный baseline-пилот прошёл финальную offline-проверку без JS.
Текущая серия `20261013T142936Z-072953`: завершены baseline 18/18, oracle/calculation 18;
ABC CLI exit 0, wrapper exit 2 из-за сборщика evidence, расчёт восстановлен offline.
Candidate payload собран и проверен; sales-by-category/1 прошёл full audit/cleanup без JS,
candidate 2/25 начаты: sales/1 full PASS; ABC/1 runtime-blocked на стандартном
Соединении (input_mapping readiness timeout), JS calls0, cleanup false. Live-серия
приостановлена для diagnosis/own recovery; первая волна не чистая, повторы закрыты.
Статические контракты candidate для tags сверены с baseline и исходниками;
реальные 15 стандартных `parameter_schema` получены native Host probe candidate
без LLM (ACK/exit0) и связаны с successful sales/1 `prepare` по build/catalog/digest.
Общего variable split-to-rows не найдено; невозможность конечной композиции для
151 элемента не доказана. Приёмка tags впереди; explicit logout probe не проверен.
Адресное offline-восстановление выполнено после проверки Loginom. По точному
GUID собственного ABC-узла подтверждены серверная сессия и её автоматическое
закрытие; актуальный admin-диспетчер через Playwright MCP подтвердил отсутствие
этой сессии. Архивирован только собственный guard; status/check прошли.
Playwright MCP 0.0.83 установлен в Codex; административные вход и выход проверены.
Исходная серия остановлена после трёх baseline-попыток; её отказы и evidence
сохраняются. После самостоятельного решения по обновлённой цели исправлен
подтверждённый runtime-дефект `imports.text.date_format` по TDD (`263df9620`).
Для итоговой приёмки нужна новая сопоставимая пара с этим общим runtime и полные
18 baseline + 25 candidate; прежние попытки не смешиваются с новой серией.
Это не итоговая приёмка.
Уточнён после проверки рекомендаций от 2026-10-13 по исходникам и локальным ресурсам.

## Решение и границы

Основной skill `loginom-automation` сначала строит решение из стандартных узлов,
которые агент действительно умеет создавать и настраивать в текущем каталоге.
Узел JavaScript разрешён только по явному запросу пользователя либо для
конкретной операции, которую нельзя выразить композицией доступных стандартных
узлов и режимов. При втором основании JS выполняет только недостающую операцию.

Пользователь отдельно подтвердил: ошибка настройки или выполнения поддержанного
стандартного узла не разрешает переход на JS. Ошибку нужно диагностировать и
исправить, а при невозможности продолжения сообщить конкретный блокер.

Проверочные запуски выполняются локально в текущей системе с текущим подключением Loginom.
Выделенный стенд, новый тестовый Loginom и перенос live-проверок в контейнеры не требуются.
Это уточнение пользователя от 2026-10-13 заменяет первоначальное предложение
о выделенном стенде.

Работа ограничена двумя файлами продуктового skill, независимым аудитом
доказательств выбора узлов и локальной приёмкой на аналитических заданиях eval.
Новые узлы, runtime-запрет JavaScript, новые публичные поля API, изменение судьи,
переписывание общего eval-harness и переустановка пользовательского Desktop
не входят в это изменение.

## Подтверждённое состояние

- Канонический источник: `packages/product/skills/loginom-automation/SKILL.md`
  и `references/workflow.md`. В обоих отсутствует правило standard-first.
- Shared staging доставляет одно дерево skill в CLI и Desktop. Вторую копию
  или публикацию через Dock Skills API создавать не нужно.
- Основной текст skill загружается при активации; references не встраиваются
  в него автоматически. Поэтому обязательное правило должно находиться в
  самом `SKILL.md`, до выбора первого обработчика.
- Текущий каталог объявляет 15 стандартных типов и `programming.javascript`.
  Фактическая доступность определяется каталогом данного запуска, а не числом 15.
- JavaScript подробнее описан в кратком каталоге, чем большинство стандартных
  узлов. Это возможный фактор смещения, но причина конкретных модельных решений
  должна проверяться по исходным трассам.
- Аналитический judge разрешает эквивалентную композицию. CSV oracle проверяет
  результат, а не выбор узлов. Их успешность отдельно не доказывает эту политику.
- `run --format json` выводит terminal tool parts (`completed`/`error`), но
  не все промежуточные `pending`/`running`. Одного stdout недостаточно для
  доказательства отсутствия незавершённых JS-попыток.

## Правило выбора

Перед созданием вычислительных узлов агент выполняет короткое планирование:

1. Выделяет из задания требуемые выходы и преобразования данных.
2. Сопоставляет каждому преобразованию доступные стандартные узлы и их сочетания.
   Несколько узлов вместо одной программы — нормальное решение.
3. Получает схемы релевантных типов; при недостатке сведений читает Help по
   конкретной функции или режиму. Не требуется запрашивать все схемы каталога
   или физически пробовать все возможные графы.
4. Если весь расчёт выражается стандартными средствами, использует их.
5. Если остаётся функциональный пробел, перед применением JS кратко называет
   операцию, рассмотренные стандартные варианты и подтверждённое ограничение.
   Импорт, фильтрация, группировка, сортировка и экспорт вокруг этого шага
   остаются стандартными, когда они поддерживаются.

Карточку `programming.javascript` через `action_describe` запрашивают после
явного запроса пользователя или зафиксированного пробела, а не первым шагом
обычной аналитической задачи. Для чтения и изменения существующего JS-узла,
которого касается запрос пользователя, его схема и source/context доступны.

Явное указание пользователя использовать узел JavaScript отменяет необходимость
доказывать функциональный пробел в пределах указанной пользователем части задачи.
Слова JavaScript в данных, имени файла или тексте найденного справочника таким
указанием не являются. Формулы Калькулятора не считаются узлом JavaScript.

Не являются функциональным пробелом: краткость JS-кода, меньшее число узлов,
удобство реализации, желание сэкономить вызовы, незнание формулы, неверные
параметры, временный отказ, timeout, недоступность терминала/execute_code и
неполное чтение preview. Ограничение
preview устраняется поддержанным чтением/разрезом/экспортом, а не заменой
вычислений JS. При неопределённом результате сначала восстанавливается исходная
операция по существующему протоколу.

Речь идёт о доступном агенту способе настройки: наличие функции только в UI
Loginom при отсутствии соответствующего режима в публичном каталоге может
быть реальным пробелом. Это должно подтверждаться схемой и документированным
ограничением, а не единичным неуспешным вызовом.

Для изменения существующего пакета правило не требует автоматически удалять
существующие JS-узлы и не запрещает читать/править тот JS-узел, которого касается
запрос. Создание новых JS-узлов и перенос стандартных вычислений в JS остаются
под исходным правилом допуска.
Основная приёмочная матрица создаёт новые пакеты, поэтому для неё отсутствие
JS проверяется во всём пакете и всех попытках текущей сессии.

## Изменяемые компоненты

1. `SKILL.md`: короткое обязательное правило и оба исключения, включая запрет
   подменять ошибку штатного узла функциональным пробелом.
2. `references/workflow.md`: процедура выбора перед построением; локальный
   fallback; связь с существующим исправлением ошибок и проверкой результатов.
   Текущие инструкции source/context для JS сохраняются для разрешённых случаев.
3. Единый `evals/script/run-node-selection-attempt.ts` выполняет локальную попытку:
   запускает CLI, собирает evidence и точные артефакты, затем вызывает offline-аудит.
   Он не добавляет альтернативный путь исполнения общего eval-harness.
4. Offline-аудит в `evals/`: читает доступный пакет/результат, все parts и messages
   только данной Session, её runtime-журналы и CLI exit code; отдельно оценивает
   политику, расчёт и полноту доказательств. Переиспользует `readNodeXml` и `checkOracle`, но не CrossTable-only
   правила `checkNodeXml` и не отбрасывающий ошибки `readNodeEvents`.
5. План и итоговый локальный отчёт: фиксируют происхождение бинарника/skill,
   исходные задания, модель, все попытки и оставшиеся ограничения.

Первый этап не меняет `node-contracts.mjs`. Если приёмка покажет сохраняющееся
нарушение, сначала пересматривается формулировка skill по наблюдённой трассе.
После первоначального изменения допускается не больше двух таких корректировок.
Если модель при подтверждённом наличии правила в контексте продолжает нарушать
политику, работа останавливается с доказательствами для решения владельца о
runtime-описаниях. Ошибка runtime, квота, timeout или отсутствие артефакта без
нарушения политики не являются поводом править skill. Расширение изменения на
runtime оформляется отдельным решением.

### Отдельное решение: необходимое исправление date_format

Пользователь обновил цель: самостоятельно устранять блокеры и принимать разумные
решения, где его участие можно исключить. На этом основании подтверждённый дефект
`imports.text.date_format` исправляется как общая предпосылка сравнения. Runtime
уже принимал шесть форматов по публичной схеме, но направлял их в неподдерживающий
текстовый setter. Минимальная правка выбирает точный существующий native dropdown
с проверкой root/owner/input и readback; публичные схемы, узлы и cleanup-протокол
сохраняются. В scope добавлены только `text-import-procedure.mjs` и его public
регрессии в `text-import-wide.test.mjs`. Skill из-за runtime-ошибки не меняется.

TDD RED воспроизвёл исходный отказ через `configureTextImportFields`, GREEN и
проверки чужого input/совпадающего значения прошли; 144 теста текстового импорта
прошли на pinned Node. Перед модельной серией нужен отдельный детерминированный
native proof этого поля через настоящий Host, без внешней LLM.

Native proof на исправленном baseline завершился exit 0: readback `yyyy/mm/dd`
и `/`, datetime schema, две ненулевые календарные даты, подтверждённые Save,
package close и logout. Точность времени не заявляется: preview возвращает
formatted display с `datetime_display_precision`. Первый smoke с ошибочным
ожиданием `cell.value` сохранён как неуспешный; его собственная сессия закрыта
адресно после GUID/log/admin-сверки. Оба smoke не входят в модельные 43 попытки.

Исходная серия `20261013T093809Z-f5d429` сохраняется как остановленная 3/18,
candidate 0/25. Результаты не удаляются, их отказы не переименовываются в успехи.
Новая полная серия получает отдельные run ID, immutable pins и evidence.
Обе сборки выполняются последовательно из одного нового managed worktree на
общем коммите: baseline с точными двумя skill-файлами исходного payload,
candidate после восстановления этих файлов к общему HEAD. Runtime, пути сборки,
Node/Bun/Chromium, явная версия `0.1.17`, модель, inputs/oracle и review seed
совпадают. Между сборками меняются только два skill-файла; attestation честно
фиксирует dirty baseline и clean candidate. Пользовательский untracked файл
corrections не изменяется и не коммитится; обе сборки используют одинаковый
tracked source HEAD нового worktree. Стабильность снимка и inventories проверяются.

Новая пара `20261013T132356Z-0a3983` собрана на общем `6768520a0`; обе source
verification завершились exit 0. Независимая побайтовая сверка полных inventories
подтвердила одинаковые runtime, compiled CLI/Host, Node/Chromium и зависимости.
Отличаются только два skill-файла, два манифеста и два build-inputs с различным
представлением import paths при одинаковых входных inventories и выходах.
Это подтверждение сопоставимости сборок, не результат модельной приёмки.

Новые baseline/candidate pins подготовлены и проверены независимо: 43 уникальных
слота, прежние tasks/inputs/oracle/model/reviewSeed, 72/72 audit/runner/fixture
hashes совпали. Frozen models и исторический acceptance lock скопированы побайтно;
новые manifest/pins hashes связаны отдельной квитанцией. `current-run` переключён
на новую серию, запущен её первый sales baseline. Старые три модельные попытки
остаются отдельно; ещё не выполненные gates не считаются пройденными.

Первый новый sales baseline завершился с `WIZARD_OPEN_NOT_CONFIRMED` и cleanup
unconfirmed, без Save/CSV. Он сохранён в знаменателе новой серии. После строгой
own GUID/log/admin-привязки закрыта только его сессия и архивирован собственный
guard; это восстановление не меняет исторический исход. Минимальный opening
дефект по имеющимся snapshot не доказан, runtime не меняется предположительно.
Следующая плановая попытка разрешена после подтверждённого восстановления.

### Отдельное решение: dataset output socket в overflow

Вторая новая baseline ABC повторила отказ старой ABC в output_mapping. Обе
использовали `schema_mode=declared`, native mapping и port GUID были подтверждены,
но port_context оставался unobserved, поэтому guard отклонял Close до жеста.
Offline RED через публичный workspaceUiCapability воспроизвёл сочетание скрытой
dataset-крошки и verified native port: видимая dataset и скрытая derived работают,
скрытая dataset не распознавалась. Сохранённый native DOM style/class не доступен;
именно overflow-ветку исправления ещё необходимо проверить native.

Минимальная TDD-правка `c2c898aca5` добавляет уже поддержанный dataset icon в
существующий overflow selector. Все ownership/GUID/opening/index/ancestry guards,
Close, публичные контракты и skill неизменны. Матрица 28 положительных/негативных
случаев и полные 310 workspace-ui/node-wizard-close тестов прошли; независимый
review PASS. Серия `20261013T132356Z-0a3983` остановлена 2/18, candidate 0/25,
оба провала сохранены отдельно. Own ABC-сессия адресно закрыта после GUID/log/admin
привязки, guard архивирован; другие сессии не трогали.

Новая общая пара `20261013T142936Z-072953` включает оба необходимые runtime fixes,
те же skill версии, version/resources/model/inputs/oracle/seed. После native proof
и attestation выполняется полная серия 18+25. Пять исторических попыток двух
остановленных серий не включаются в неё. Собственные ненужные build artifacts
периодически удаляются после сохранения evidence; другие агенты не затрагиваются.

Native proof обеих правок выполнен через Host на новой baseline-сборке: импорт
дат и declared JS завершились, mapping закрыт, Save/package cleanup/logout
подтверждены. Сохранённый журнал содержит DataSetOutputSocketWizard и точный
native_opening_bound_toolbar_overflow с совпадающими GUID/index/opening ID,
последующим Close/graph verification и terminal JS success. Независимый offline
review и root повторная offline verification exit 0 подтвердили 11/21, обе
календарные даты и 25 evidence/287 runtime file hashes. Исходный driver exit 1
остаётся историческим: неверное сравнение display date в discrete/continuous
полях. Импорт сохраняет display precision limitation; JS timezone unspecified.
Это native proof, не модельный eval и не проверка повторного открытия пакета.

Третья пара собрана и проверена на общем `1bfc135430`: baseline dirty только
из-за двух старых skill-файлов, candidate clean. Обе source verification exit 0;
независимая сверка полных CLI/resource inventories PASS, runtime/dependencies/
CLI/Host/Node/Chromium побайтно одинаковы. Immutable pins закрепляют прежние
tasks/model/seed, 72 hashes и 43 уникальных слота. `current-run` переключён на
`20261013T142936Z-072953`, первый sales baseline запущен; кандидат ещё не выполнялся.
Неиспользованный candidate остановленной второй серии архивирован с проверкой
всех 5725 entries, затем удалён только его собственный каталог. Baseline/browser
source и evidence сохранены; чужие артефакты не затронуты.

Первый baseline третьей серии (sales/1) завершился CLI/wrapper exit 0: no JS,
oracle/calculation/graph/export/history/identity/runtime и ordinary CLI cleanup
подтверждены. Это один из 18 baseline; candidate ещё не выполнялся, полная
приёмка не заявляется. ABC/1 той же серии завершился CLI exit 0, Save/Export и
ordinary cleanup подтверждены. Wrapper exit 2 вызван текстом `loginom_find`,
переданным в JSON-парсер квитанций. Исправление ограничивается внешним collector:
проекция `loginom_dock_*`, сохранение полной истории и строгого managed parser.
Общие runtime, payload и pins остаются прежними; новый model run не требуется.
Правка `f5eb5373e2` проверена RED → GREEN, 88 tests/206 assertions, typecheck и
independent review. Actual 68 parts дают 16 managed calls; original history
не мутируется. Historical acceptance lock неизменён; `collector-fix-lock.json`
закрепляет новый runner SHA и 71 прежний file hash. AuditVersion не менялся.
Командные проверки Task 6 завершены: current collector source/lock сверены,
evals 88 tests/typecheck/diff PASS. Bundled/staging/host checks Task 4 используются
без повтора: skill/host/dependencies неизменны; отдельного raw host-test log не
найдено, подтверждение сохранено в committed report. Runtime 310-test и native
offline evidence сверены отдельно. Это не закрывает candidate/review gates.

Exact receipt-based copyout дал пакет SHA
`dddd3fc96c6036cc74cf9096efd3a596a863b8d45e5417cc006e895d82b48e2a`
и CSV 228 bytes с ожидаемым SHA. Явная offline-проекция
`evidence/abc-collector-recovery` сохраняет исходные CLI/wrapper/blocker, восстанавливая
только receipt paths. После распаковки audit подтвердил oracle/calculation,
history/runtime/identity/graph/export identity; JS nodes/calls 2/2 и единственный
отказ `JAVASCRIPT_NOT_ALLOWED` отражают старый skill. Original attempt/history
не переписаны. Независимый read-only review подтвердил 11 исходных hashes,
21 shared evidence file, все 14 ZIP members и повторные pure audit/oracle checks.
Это baseline-замер, не приёмка candidate.

Следующий monthly-demand/1 завершился CLI/wrapper exit 0: стандартные импорт,
калькулятор, группировка, сортировка и экспорт, no JS. Сплошной oracle и полный
audit PASS, cleanup подтверждён. Это live-проверка текущего общего runtime и
runner после collector fix. Независимая сверка collector addendum/pins PASS;
risky-approved-claims/1 также прошёл full audit/CLI cleanup без JS. Ошибка
названия фильтра была отклонена до browser effect, исправлена новым operation ID
на стандартном узле и сохранена в истории. Campaign-roi-by-channel/1 также прошёл
полный audit/cleanup без JS. First-last-touch/1 завершился CLI0, oracle/calculation
и все evidence axes true, один JS node/call; wrapper1 только из-за baseline
JAVASCRIPT_NOT_ALLOWED. Первый проход всех шести baseline завершён: четыре без JS,
ABC с двумя JS и attribution с одним. Sales-by-category/2 также завершился
CLI/wrapper0, полный audit/cleanup PASS без JS. ABC/2 завершился CLI0/cleanup true,
oracle true, wrapper1: public/runtime settlement одного JS не подтверждён
(RUNTIME_APPLY_MISMATCH, TOOL_OPERATION_UNSETTLED, TOOL_RECEIPT_INCOMPLETE).
Исходный calculation false сохранён; ниже зафиксирована отдельная повторная
оценка после исправления `operation_inspect`. Collector обработал реальный Help.
candidate 0/25, полная приёмка ещё впереди.

`e871bf81d2` исправляет только аудит inspection: resolved/verified envelope,
полный bound successful node.apply outcome, cleanup/node/execution/runtime
binding и поздняя inspection после точного USER_RESPONSE_BUDGET refusal.
RED → GREEN, 106 tests, typecheck/diff и independent review PASS (38 negative
mutations). Generic error или внешний SUCCEEDED без terminal outcome не принимается.
Runtime, skill, payload и pins прежние. Новый auditVersion
`2654bfc1c61d4d0ecc73c7a6f4fa9613b5d5244ea83a7fdb8712be2ed452e445`
закреплён `settlement-fix-lock.json`; historical locks сохранены.

Все восемь baseline переоценены offline в `evidence/settlement-reassessment-e871bf81d2`:
oracle/calculation 8/8, standard policy 5/8 старого skill, JS 5 nodes/calls/successful
calls. Original attempt/outcomes/raw и предыдущие оценки побайтно сохранены;
только ABC/2 получил ранее недостающий settlement и расчётный PASS. Повтор модели
не выполнялся. Независимая сверка reassessment PASS: 96 protected files и восемь
prior audits неизменны, новые оценки и locks/pins/Session/package bindings
подтверждены. У семи изменился только auditVersion; остальные изменения только
у ABC/2 и касаются подтверждённого settlement. Начат monthly-demand/2.
Monthly-demand/2 также прошёл CLI/wrapper0 и full audit/cleanup без JS на
auditVersion `2654bfc1…`; использованы стандартные узлы, включая reform_columns.
Risky-approved-claims/2 также прошёл full audit/cleanup без JS; естественный
label refusal исправлен новым стандартным запросом и сохранён. Начат
campaign-roi-by-channel/2 прошёл full audit/cleanup без JS; начат first-last-touch/2.
Candidate по-прежнему 0/25.
First-last-touch/2 также прошёл CLI0/oracle/calculation/cleanup с одним JS;
wrapper1 только из-за baseline JS policy. Два прохода baseline завершены:
policy старого skill 8/12, JS6/6/6. Начат sales-by-category/3.
Sales-by-category/3 завершился full audit/cleanup PASS без JS: все три его
baseline успешны. Начат abc-pareto-groups/3, candidate 0/25.
ABC/3 завершился CLI0/oracle/calculation/cleanup и обе JS-операции подтверждены;
wrapper1 только из-за baseline JS policy. Все три ABC расчётно успешны, их
исторические collection/settlement assessments сохранены. Начат monthly-demand/3.
Monthly-demand/3 завершился full audit/cleanup PASS без JS: три monthly baseline
успешны. Начат risky-approved-claims/3; candidate 0/25.
Risky-approved-claims/3 завершился full audit/cleanup PASS без JS: три risky baseline
успешны. Начат campaign-roi-by-channel/3; candidate 0/25.
Campaign-roi-by-channel/3 завершился full audit/cleanup PASS без JS: три campaign
baseline успешны. Начат first-last-touch/3; candidate 0/25.
First-last-touch/3 завершился CLI0/oracle/calculation/cleanup с одним JS. Baseline
18/18 завершён: policy12/18, JS9/9/9, oracle/calculation18. Candidate0/25;
Independent machine review всех 18 PASS; candidate ещё не запускался.

Task 3: подтверждены 18 уникальных workspaces/Session/prefix и input-only файлы; independent baseline-final-review PASS.

Task 3: 18 отдельных CLI-процессов шли последовательно без пересечений; все CLI0, cleanup true и без timeout.

Task 3: у всех 18 сохранены единственная own Session, полная история и read-only snapshot; runtime identity/settlement подтверждены.

Task 3: 18 пакетов/CSV привязаны к own Save/Export receipts; SHA, exporter/execution lineage и 252 ZIP members проверены.

Task 3 завершён: 18 слотов в исходном порядке, oracle/calculation18, policy12, JS9/9/9; final audit2654bfc1 и addenda, исходные outcomes сохранены.

Candidate ABC/1 остановился на стандартном Join/input1: request и native mapping
валидны, но input_port_context unobserved не разрешает finish_wizard. Кнопка Done
enabled/visible во всех 44 финальных polls; конкретный breadcrumb DOM conjunct
не сохранён. Это не подтверждённый capability gap и не повод менять skill.
Для причины готовится отдельный native diagnostic без LLM с fixed read-only
NavigationPanel capture; immutable candidate и original model slot не меняются.
Own user:67 закрыт адресно по четырём GUID/server/admin binding; fresh log и
refresh absence подтверждены. Exact guard архивирован после SHA/mtime/proc
проверки; status/check0. Это recovery, original cleanup false сохранён.
Первый native diagnostic остановился до Join из-за operator preview assertion
(display_text вместо exact_integer value), Save не состоялся. Original failure
сохранён. После TDD-проверки actual receipt и Save-before-assertions исправлен
только private driver (5 tests/review PASS); own native user70 адресно закрыт,
второй diagnostic выполнен в новом каталоге без LLM и без изменения candidate.
Он воспроизвёл Join input_mapping refusal, но private capture guard ошибочно
отклонил чтение unresolved terminal context (LOGINOM_DIAGNOSTIC_BUSY). DOM cause
остаётся недоказанной; готовится узкая TDD-правка только diagnostic guard.
Оба исходных native failures сохранены, original model slot не повторяется.
Fixed read-only capture guard исправлен TDD (6tests/review PASS), own page/URL
и fixedargs сохраняются. Native2 user72 адресно закрыт по GUID/Save/log/admin
binding. Третий native воспроизвёл отказ и captured DOM: скрытые crumbs7
«Присоединяемая таблица» и8 «Настройка» не проходят generic hidden-caption guard;
43 polls связаны с own input1/GUID/opening. Source-причина подтверждена,
минимальная TDD-правка runtime проходит проверки. Own native3 user74 закрыт
адресно, raw failures сохранены. После общей runtime-правки обязательны новая
matched пара и полные18+25 на ней: прежние исходы в новый denominator не переносятся.

Source fix `05b645eec9` допускает только точные известные Join captions с
native input0/input1 и единственной Join icon; identity/opening/ancestry guards
сохранены. Main caption/binding подтверждены реальными наблюдениями, hidden Main
геометрия пока regression fixture. 5 focused tests/32 negatives и полный upstream
3765 PASS/10 SKIP/0 FAIL, syntax/diff-check и независимый review PASS. Новый run
`20261013T192418Z-c71363` готовит общий runtime и отдельные skill версии; до
модельных слотов нужны успешные live обе скрытые роли, Join output, Save/cleanup.

Новые payload/pins192418 допущены: общий source05b645eec9, обе sourceverify0,
старые skills/datasets/model/seed неизменны, independent pair/pins Approved.
Native canonical core подтверждён независимо: реальные hidden Main0/Joined1,
SUCCEEDED Join/exact rows, Save/persisted graph и package_closed/logged_out true,
transport ACK/exit0. Full private driver exit1/diagnostic-stopped сохранён:
дополнительный reread импорта использовал retained Package1 после Save rename;
effectfalse/cleanuptrue, inputsUnchanged не проверено. Этот дополнительный отказ
не повышен в успех и не служит основанием менять skill/runtime данной пары.
Обязательный core отдельно аттестован в live-independent-review SHA0e622b9d… .
Actual prepare новой candidate16types связан с describe15schemas/cache/handlers;
gap attestation c485ce08… поддерживает known-standard capability gap, а не
невозможность произвольной композиции151элемента. Model acceptance ещёpending.
Текущий run192418 требует полный новый denominator18+25.

Baseline192418 остановлена после2слотов: sales1 machinePASS/CLI0/cleanuptrue/JS0,
ABC1 CLI1/wrapper3/cleanupfalse, standardGroup target ещё не создан после
успешного managedJS. Actual runtime: native script source output0 active/visible/
enabled/pointbound, но generic JS deny даёт actions[]; Group требуетclick/F3.
Request validate/resolve PASS. New Sort с обязательными keys имеет тот же путь;
это мешает обязательным JS→Group и JS→newSort сценариям, не capability gap.
Исправляется только private owned temporary-preview для этих двух consumers:
latest successful managedJS execution/cleanup, nativeowner/doc/workflow/port0GUID,
fixedgestures/ACK/rebind/fresh complete schema. Cached mapping/active port не
заменяют свежесть (actual freshness_verified:false). Public JS click/F3/editor/
execute deny и Calculator/Union остаются; skill не меняется из-за runtime.
Own user81 закрыт по GUID/log/admin binding; guard адресно архивирован после
nonce SHA/mtime/no-own-process checks. Status0/check0, Helpready/browserverified,
adminlogout/MCPexit0 подтверждены. Independent recovery22e95b…PASS,19 originals
unchanged; исходные CLI1/wrapper3/cleanupfalse сохранены.
Private Group/newSort preflight исправлен в `dd8d480706`: latest owned successful
JS execution допускает только fixed output0 preview; fresh complete schema,
Close/graph restoration, prepared/completed ACK и native FLocked guard обязательны.
Общий publicJS deny и соседниеhandlers побайтно сохранены. Actual RED→GREEN и
independent review Approved, Node24.19 upstream3810PASS/0FAIL/10SKIP/exit0.
Verification SHA `a1c91ba28f775d83b90f0be0e6dc680f6d46a64813247f642c7964be18d1603a`,
review `fdd3a83d6c85bce0b938b7172ab996c07015f73cdc59effd3faad178807c3897`.
Native port selection==[port.FCell] пока fixture-only: новая matched пара203142,
actual JS→Group/directJS→newSort и обе Join hiddenroles, затем полные18+25 pending.
Исходные2baseline192418 сохраняются отдельно; предыдущие18 также не переносятся.

Новая matched пара203142 статически Approved: sourcedd8d480706, baseline dirty
только2oldskills/candidate clean, обаbuild/verify0, runtime47b871…/288 equal.
Manifest baselinec04abca3…/candidate77f51a21…, pins9cb0c002…/6f34460b…,
effective locke6eedea2… . Independent5726/4729inventory/hash/modes/source-tree
PASS, разница2skills+3metadata;43unique slots18+25 и unchanged72+2/audit2654/
model/seed/tasks. Native/catalog/schema/model gates pending; current-run192418
ещё не переключён. Приватный Join fixture делает initial ownSave до imports,
laterreplace; это диагностическая поправка после observed stale navigation,
не изменение public node-read API. Его actual newlive покаpending.

Actual203142 initial emptySave succeeded с workflow_continuations:[], а import0
NOT_APPLIED/effectfalse/cleanuptrue до nodecreation из-за stalePackage1 path.
Этот privatefixture exit1 сохранён, package_closed/logged_out/HostACKexit0 реально
подтверждены. Следующий отдельный corefixture использует прежний Save после
completedimports и оба actualhiddenroles/freshJoinoutput/Save/cleanup; standalone
postSave source reread не требуется и не заявляется. Сохранность численных inputs
проверяет exact freshJoinprojection. Pair/pins/runtime не меняются, это не modelslot.

Первый privateJS downstream203142 выполнил import/JS/Save/beforefullXML, затем
остановился до Group/Sort из-за непрочитанной roots pagination (actual32/92 с
next_cursor). Originalexit1/b274cbb2… сохранён, actualclose/logout/ACKexit0 verified.
Отдельный private proof-2 по TDD читает все roots pages до выбора Graph ref;
sameobservationID/revision/bounded16, затем отдельные details pages. Static review
Approved0da15709…; actual managed preview/native selection по-прежнемуpending.

NewJoin core203142/proof-2 actualPASS/independentreview2bbc5532…:
обаhiddenroles/fresh exact2rows/inputprojections/Save/3node2linknoJSpackage/
cleanup/logout/ACKexit0; standaloneInputReread=false. JSproof-2 исправилpaging,
но stoppedexit1 до downstream на intentionally forbidden genericUI call:
normalHost IPC скрывает текст под LOGINOM_RUNTIME_FAILED; stopreview e2cebed0…
подтверждаетclearcleanup/noeffects. Первоначальное объяснение через UI validator
опровергнуто проверкой реального user-profile routing: bridge удаляет
dock_ui_action из catalog и отклоняет вызов как Unknown Dock tool (-32602) до
uiAct/validateUiAction. Instrumentedproof-3 также exit1 до downstream; его узкий
wrapper ожидал другой код (-32603), исходные результаты сохранены. Own package
closed/logged_out и Host ACKexit0 подтверждены. Privateproof-4 использует обычный
managed-entry: actual catalog подтверждает отсутствие genericUI tool, live JS
port — allowed_actions:[], actual pure guard на live snapshot проверяется отдельно
и не объявляется live UI receipt. Главные native Group/directSort проверки идут
штатными node calls. Product/runtime/pins неизменны; JSGroup/Sort gate ещёpending.

Privateproof-4 впервые дошёл до реального Group preflight: import/managedJS/
save-producer SUCCEEDED, затем select ACK подтвердил возврат mouse.click.
Следующий inspect остановился с Managed preview native port changed до F3 и
создания Group; Sort не вызван. Originalexit3/cleanupfalse/HostACKfalse сохраняются.
Конкретное условие составного guard по этому сообщению неизвестно. Собственная
server incarnation user:90 установлена по initialization21:39:48.808Z и двум
nativeGUID; Root адресно закрыл её, дважды проверил отсутствие и вышел из admin.
Privateproof-5 собирается только для диагностики: exact generated browser code
получает bounded tuple в error.message того же guard, без изменения predicate/
жестов/control flow и без дополнительного browser call. Он instrumented, не
является приёмкой immutable runtime; Product/runtime/pins пока не меняются.
Ownrecovery независимо подтверждён f81ff164…: точный user90 closed21:44:11.150Z,
admin91 closed21:44:42.264Z, нет повторного init/чужих session closures; оригинальный
cleanupfalse сохранён, исходные30raw/source evidence и5runtime files неизменны.

Instrumentedproof-5 установил точный conjunct по actual tuple: после возврата
click selected=[ownPort.FCell], type/subtype1/nativeIndex0/portIndex0,
sameShape/Port/Data/Cell=true; sameElement=false, oldElementConnected=false,
currentElementConnected=true. Исходный guard отклоняет заменённый DOM-элемент,
хотя native identity остаётся прежней. Originalexit3/cleanupfalse/ACKfalse сохранён;
это диагностическое наблюдение, не приёмочный PASS. Surgical source TDD fix
должен разрешить только подтверждённую post-select замену отсоединённого DOM
при прежних native/owner/selection checks и адресовать F3 текущему verified port.
До жеста/при foreign selection/native changes/connected old swap отказ остаётся.
Source correction frozen bf5dd674…: только helper/targettest/actualtuple fixture,
два RED→GREEN/218relevant tests PASS; source review/privatecandidate nativeprobe
ещёpending. Final upstream и matchedbuild следуют после чистого privateprobe.
Proof5ownrecovery independently2e649a27…: exactuser92close/noReinit/adminlogout/
37raw+56sourceClosure+4397immutableRuntime entries unchanged. Разрешённая текущая
sourceправка отмечена отдельно; исходныйcleanupfalse сохраняется.
Source review Approved f2a80fb9…/53focused independentPASS. Privatecandidate
proof6 actual Group SUCCEEDED и Save SUCCEEDED; остановка EXACT_INTEGER_REQUIRED
относится к fixture reader: Total имеет native type real, binary64 values17/21,
decimal1.7E+01/2.1E+01 с verified precision. Sort ещёне вызван. Originalexit1 и
реальные packageclose/logout/HostACKexit0 сохранены. Separateprivateproof7 должен
по actual028 исправить только Group real-number assertion; не менять sourcefix,
числа/oracle и целочисленные producer/Sort проверки. Finalnativegate pending.

Privateproof7 подтвердил оба actual native sourceoverride preflights через
existing verifier: Group A17/B21, прямой Sort B21/A11/A6, freshschema/F3/Close/
graphrestore/Save. LastSave037 readback сохраняет полный JS component/source/
declaredschema. Source DOMfix завершён: independent f2a80fb9… и full upstream
3828tests/3818PASS/0FAIL/10SKIP/exit0, root verification98cdb115… . Это не final
ordinary rebuilt gate: first export-group остановился в input_mapping, Done
enabled, но finish_wizard недоступен из-за unobserved input_port_context.
Публичный запрос/схема/opening/mapping корректны; точный native predicate ещё
неизвестен и требует bounded readonly capture. Originalexit3/cleanupfalse
сохраняются. Sourcefix не ослабляет общий JS UI guard или Export ownership.
Independent recovery cf1fbfc8… подтверждает закрытие ownuser95/admin96 и полное
равенство JS component before/afterSort; CSV/finalgate не подтверждены. Следующая
минимальная diagnosticfixture Import→Group→Export сохраняет actual Group source/
schema/labels/breadcrumb ширину; bounded readonly preparedInputPort/navigation
capture нужен до нового guardfix. Non-reproduction не считается основанием для
Product changes.

Это перезапуск сравнения из-за необходимой общей runtime-правки, а не повтор
неудачного модельного слота. Ограничение двух последующих policy-исправлений skill
и все расчётные/политические критерии остаются прежними.

## Локальная приёмка

Используется локальный CLI и уже настроенный Loginom endpoint. Для baseline
и candidate собираются отдельные проверяемые payload из одинаковых исходников
продукта/runtime с функциональным различием только в skill; пользовательский
Desktop не заменяется. Завершение offline audit после pilot меняет проверяющие
файлы вне payload и отражается в отдельном source attestation. Текущий
CLI-профиль используется последовательно, с новыми Session и уникальными
именами пакетов/CSV. Нельзя очищать пользовательскую историю, Loginom storage,
чужие пакеты или процессы. Секреты не копируются в отчёт или Git.

Новый CLI-кандидат запускается по абсолютному пути. До серии проверяются его
manifest, staged skill и наблюдённый digest активации. Запуск старого установленного
бинарника без новой версии skill не считается приёмкой изменения.
Сборке нужны полный pinned Node с npm и Chromium текущего release pin; ресурсы
старого установленного CLI не подходят автоматически. Локальные исходники
проверяются по SHA, временный Chromium копируется в постоянный собственный
каталог до начала серии. Те же ресурсы используются обеими сборками и staging-тестами.

До первого модельного запуска собирается baseline payload и фиксируются его
manifest, hashes и digest skill. Все 18 baseline используют этот неизменный
payload. При сборке baseline выполняются сверка с исходниками и source attestation;
после изменения skill проверяется целостность frozen payload, а не его совпадение
с текущим checkout. Baseline и candidate сохраняют отдельные pins.
SHA manifest в pins связывает серию с его metadata source SHA/tree/dirty;
полный skill inventory с hashes сохраняется рядом. Базовые пути/resources/model
сохраняются в приватном environment.json; pins начатой серии не переписываются.
После фиксации baseline правка skill и сборка candidate могут выполняться
параллельно следующим baseline-попыткам. Запись candidate-исходников не должна
совпадать по времени с их сборкой; стабильность снимка сборки проверяется.
Во время сборки новые evidence пишутся только в игнорируемый `evals/results/`
или вне checkout; публикация fixtures и документации ждёт завершения сборки.
Модельные CLI-процессы с текущим профилем всегда выполняются строго последовательно.

Общий `evals/src/run.ts` остаётся со своим контрактом изоляции. Здесь используются
его задания, входные CSV, oracle и независимые offline-проверки; локальная серия
не объявляется изолированным benchmark и не смешивается с его статистикой.
Оцениваемая Session получает только prompt и inputs; reference/oracle/spec
остаются у проверяющего. Запуск выполняется из собственного рабочего каталога
вне репозитория. Кроме PURE и отключения project config/Claude prompt, отключаются
external skills и Claude Code skills: иначе домашние eval-skills попадут в контекст.
Отдельные `skills.paths` в конфигурации также проверяются: указанные флаги не
гарантируют их отключения. Основная серия использует `--command loginom-automation`;
Desktop и обычная активация skill этой приёмкой не проверяются.

Management status/check выполняются с `--headless`. PROFILE_BUSY (код 3 для run),
recovery required (4) и неподтверждённый cleanup останавливают серию; у management
код 3 также может означать другой конфликт — учитывать машинный код ошибки.
Чужой writer не
удаляется. Код 130 означает отмену; timeout указывается только при записанном
дедлайне и отправленном SIGINT своему CLI PID. Бюджет host.close — 90 секунд,
он не гарантирует общий срок выхода всего CLI. При превышении локального срока
ожидания сохраняется блокер; второй сигнал автоматически не посылается.
Локальный supervisor отдельно фиксирует deadline, PID, отправку единственного
SIGINT и подтверждённый exit; его код блокера не подменяет код ещё работающего CLI.

### Порядок запуска и основная матрица

Сначала готовятся минимальный аудит и единый runner, затем один pilot baseline
на `sales-by-category`. Pilot входит в 18 baseline и не является дополнительным
прогоном. Его реальные, очищенные от секретов evidence используются как fixtures
для завершения аудита. После этого pilot проверяется повторно offline без нового
обращения к модели. Необходимые полнота истории и settlement не заменяются
синтетическими флагами ради раннего старта серии. Критерии фиксируются до pilot;
реальные fixtures уточняют чтение существующих контрактов, а не меняют критерии
по результату. Финальные runner и audit фиксируются до оставшихся baseline и
сборки candidate.

По текущему протоколу064745 каждая строка запускается один раз с frozen baseline
и трижды с candidate, в новых Session:6baseline+18standard candidate. Прежние
три baseline повторения и43-slot locks относятся к историческому протоколу.

| Eval ID | Покрытие стандартных возможностей | Строк результата |
| --- | --- | ---: |
| `sales-by-category` | Группировка, count/sum/avg, сортировка | 5 |
| `abc-pareto-groups` | Сортировка, CumulativeSum/Stat, IF, группировка | 3 |
| `monthly-demand` | Извлечение месяца, группировка, сортировка | 12 |
| `risky-approved-claims` | Логический фильтр, группировка | 4 |
| `campaign-roi-by-channel` | Группировка и ROI из сумм | 5 |
| `first-last-touch` | Калькулятор, две группировки, слияние | 5 |

Источник: `evals/tasks/analytic/<id>/`. Эталонные `.lgp` этих шести кейсов
проверены чтением XML и не содержат `TBGJavaScriptEngine`. Приведённые маршруты
помогают проверяющему, но не дописываются в prompt модели и не требуют точного
совпадения числа узлов или GUID с эталоном.

Prompt каждого задания сохраняется; разрешён одинаковый технический хвост
`buildAgentPrompt` для уникальных выходных путей. Модель, variant, лимит,
inputs и формат запуска одинаковы между сериями. Неудачные попытки сохраняются;
исправленная версия skill получает новый digest и отдельную candidate-серию.
Для реализации пользователь выбрал gpt-6-sol, medium, fast: CLI alias
`openai/gpt-6-sol-fast` запрашивает priority для API model gpt-6-sol.
Публичный каталог модели фиксируется по SHA и передаётся обеим сериям через
MODELS_PATH. Фактический tier не предполагается по alias; модель не заменяется
без указания пользователя.

Первая волна candidate включает по одному запуску каждой из шести стандартных
задач, один `explicit-js`, один `capability-gap` и единственный targeted
`standard-recovery`: всего 9. Это первые попытки итоговой серии, а не отдельная
добавка. При первом подтверждённом нарушении политики дальнейшие candidate
останавливаются. Повторы запускаются только после полного прохождения первой
волны: у всех 9 попыток полные evidence и подтверждённая политика; у 6 стандартных
и 2 JS-попыток успешны пакет, oracle и машинная проверка графа; роли двух JS
подтверждены review; в recovery наблюдались реальный отказ, отсутствие JS и
успешное стандартное исправление. Честный recovery-блокер подтверждает только
политику, не открывает повторы и не считается чистым прохождением первой волны.
При другом провале можно закончить первую волну для диагностики, если runtime
settled и профиль освобождён, но повторы запрещены. Такой провал не разрешает
править skill или выборочно заменять модельную попытку.

### Исключения и восстановление

Статическая сверка собранного candidate выполнена: пять файлов контрактов
побайтно совпадают с baseline и исходниками; проверены экспорты 16 типов узлов
и схемы Калькулятора, Свёртки и Объединения. Генератор, цикл и dynamic
split-to-rows в них не объявлены. Evidence:
`evals/results/node-selection-local/20261013T093809Z-f5d429/candidate-gap-attestation.json`,
SHA256 `0d2bdcdb35e8c5d8af595cc19cb34424998a368c163dd7f094bd22935a01c0aa`.
Это поддерживает обоснование tags для общего требования произвольной длины,
но не доказывает невозможность всех мыслимых стандартных композиций.
До tags live остаётся сверить `prepare.knowledge.node_types` и релевантные
`action_describe.parameter_schema` именно в candidate Session; статическая
сверка не заменяет проверку доступности обработчиков или модельную приёмку.

- **Явный JS:** парный вариант `sales-by-category` с единственным добавлением
  «Агрегацию по категориям выполни узлом JavaScript». Исходный oracle сохраняется.
  JS обязан действительно выполнить указанную агрегацию; импорт, сортировка и экспорт
  остаются штатными. Три candidate-попытки.
- **Функциональный пробел:** CSV с полем `tags`, содержащим списки произвольной
  длины через `;`. Требуется разворачивать элементы в строки, trim, пропускать
  пустые элементы, сохранять повторения и считать частоты по тегу. Основной input
  включает четыре строки `red;blue;red`, `blue;;green;`, `; red ;`, пустое поле
  и пятую строку со 150 метками red и одной blue. Независимый oracle:
  blue — 3, green — 1, red — 153.
  Разная длина списков и review кода проверяют общий алгоритм без hardcode.
  Проверяющий до модельного запуска подтверждает по текущим схемам отсутствие
  стандартного variable-row expansion: Калькулятор создаёт фиксированные поля,
  Свёртка работает с фиксированным списком колонок, остальные доступные типы
  не предоставляют split-to-rows. Если live-каталог это опровергает, JS не
  разрешается и покрытие fallback остаётся незавершённым; нельзя объявлять
  ошибку узла новым доказательством пробела. JS разворачивает строки, а
  Группировка/Сортировка/Экспорт выполняются стандартными узлами. Три попытки
  на одном усиленном input, без второй Session, второго oracle и XML-diff между
  запусками. Более 128 элементов проверяют простой фиксированный потолок,
  но не доказывают невозможность стандартной композиции: 128 — лимит одного
  набора полей/узла, а не всего графа. Повторное исполнение сохранённого графа
  после холодного открытия и смены входных данных этой приёмкой не проверяется.
- **Ошибка стандартного узла:** отдельный диагностический запрос с намеренно
  ошибочной формулой Калькулятора и последующим исправлением. Нужны реальная
  квитанция ошибки и последующее стандартное исправление либо честный блокер;
  без наблюдённой ошибки исход `recovery_unobserved`, ветка считается непроверенной
  и skill по этой причине не меняется. Одна candidate-попытка. CSV явно ограничен
  колонками Category,Profit. Prompt подсказывает исправление, поэтому этот тест
  проверяет отсутствие JS после наблюдённого отказа, а не самостоятельную диагностику.
  Блокер может подтвердить соблюдение политики, но не успешное выполнение расчёта.
  Естественные ошибки во всех остальных candidate также проверяются обычным
  аудитом: они не разрешают JS. Их появление заранее не обещается; наблюдённое
  покрытие фиксируется отдельно и не превращает `recovery_unobserved` targeted
  попытки в успешную диагностическую проверку.

### Доказательства и критерии

Для каждой попытки сохраняются Session ID, CLI exit code, полные `events.jsonl`,
все parts и messages данной Session из локальной БД после завершения, финальный ответ,
digest skill, актуальный каталог, manifests и хэши входов/пакета/результата.
Чтение БД выполняется read-only, только по выданному Session ID; неизвестная
схема БД или отсутствующая история означают неполноту доказательств. Snapshot
БД содержит все сохранённые вызовы и их текущие состояния, а не историю всех
переходов каждого вызова. Он сопоставляется со stdout и runtime-квитанциями;
противоречия не разрешается трактовать как отсутствие JS.

Собственные runtime-журналы находятся в
`<profile>/loginom/runtime/generations/*/chats/<sha256(SessionID)>/attempts/*/`.
`session.json.sessionId` и `execution-events.jsonl.session_id` — UUID Dock,
а не ID Session агента. Не смешивать разные attempts/UUID при сверке операций.

Аудит выводит `policyStatus:passed|failed|incomplete` отдельно от
`oraclePassed:true|false|null` и `calculationPassed`.
Он вычисляет `historyComplete` и `runtimeSettled`, не принимает их входными
флагами. Проверяются единая Session, отсутствие дочерних сессий, соответствие
terminal stdout parts полному snapshot, отсутствие неизвестных inputs и
незавершённых вызовов. Пустой `state.raw` не восстанавливает input. Ответ running
может храниться как completed с `state.metadata.loginomPending:true`; его закрытие
подтверждается последующим результатом той же операции. Само событие completed
не закрывает uncertainty: settlement проверяется по контракту инструмента.
Для node_apply публичный запрос, runtime admission и terminal связываются по
document/workflow/node identity, включая существующий target.ref; совпадения
одного operation_id и типа узла недостаточно.
Для apply/delivery/save последний результат должен иметь
`SUCCEEDED | FAILED | NOT_APPLIED`, `cleanup_complete:true`, без оставшихся
pending/active работ. Source/context read используют собственный owner-bound
receipt с operation/node identity. Direct context имеет `cleanup_complete:true`;
direct source не содержит этого поля, поэтому cleanup подтверждается парой
`source_discard_settled` и `source_delivery_verified` для каждого read step
в том же runtime attempt с тем же owner. Их wait/status имеют
`state:settled`, `progress.cleanup_complete:true`, `pending_phase:null`.
Для таких read `outcome:null` штатен, apply-status от них не требуется.
Вложенный `artifact.upload` с `AMBIGUOUS/UPLOAD_SERVER_VERIFICATION_REQUIRED`
может быть закрыт собственной внешней квитанцией `artifact_delivery_completed`:
`SUCCEEDED`, `cleanup_complete:true`, `upload_completion_verified:true`, тот же
runtime attempt/Dock UUID и точное совпадение `upload_operation_id`, destination,
bytes и SHA256. Это подтверждённый формат пилота; остальные AMBIGUOUS и
несовпадение квитанций означают incomplete.

Ошибку читать из `state.error`, успешный ответ — из `state.output`. Для обрезанного
успешного ответа нужен полный файл из `state.metadata.outputPath`. У обрезанной
ошибки такого поля может не быть: использовать полную сохранённую runtime-квитанцию
или отметить неполноту. Summary не заменяет полный ответ. Квитанция FAILED
может подтвердить settlement, но не успех расчёта; CLI exit 0 тоже не доказывает
успех Loginom-вызовов.

Ожидаемый digest — digest всего `loginom-automation`, полученный
`verifyBundledSkills` в payload; наблюдаемый — `dock_prepare.skillRevision`
и metadata активации. Каталог берётся из `knowledge.node_types`, фактическая
модель/variant — из messages и конфигурации запуска.

Пакет и CSV берутся по точным подтверждённым путям, а не по «последнему файлу».
Способ получения файлов в этой серии — read-only `docker cp` из подтверждённого
server container/UserStorage текущего аккаунта. В продукте нет автоматического
скачивания сохранённого `.lgp`; запасной browser-download этап не планируется.
При отсутствии copy-out это блокер проверки; сообщение модели не заменяет файл.

Политика и расчёт оцениваются раздельно:

1. **Политика — жёсткое условие 18/18:** правило и JS присутствовали в контексте,
   полный audit не обнаружил ни одной JS-попытки. Считать все `node_apply`
   независимо от статуса и сверять с `node_apply_prepared.request.target.type`.
   При наличии пакета проверить все workflows на оба XML-типа:
   `TBGJavaScriptEngine` и исторический `TBGCodeModelComponentEngine`.
   Фактический тип подтвердить первым реальным JS-пакетом. Неполнота даёт
   `policyStatus:incomplete`, а не ноль JS. При отсутствии пакета полный trace
   может подтвердить только выбор узлов; XML-проверка остаётся недоступной.
2. **Расчёт — наблюдённая доля не ниже baseline:** C_oracle/18 ≥ B_oracle/6
   (C≥3B), при одинаковых задачах/модели/лимитах. Показать B0..1/C0..3 по
   каждой задаче; baseline1 не оценивает повторяемость, comparison описательное
   и слабее прежних трёх повторов. Для содержательной приёмки необходим хотя
   бы один candidate package+oracle+graph успех по каждой из шести задач:
   сравнение0/6→0/18 или исчезновение покрытия целой задачи не является успехом.
3. **Успешный расчёт отдельной попытки:** CLI exit 0, settlement, собственный
   сохранённый пакет, ровно один CSV, `checkOracle.passed===true`, valid XML и
   однозначное соответствие GUID экспортёра из успешной квитанции узлу
   `TBGExportTextFile` сохранённого XML, а также
   машинно подтверждённая связность от импорта приложенных данных к каждому
   экспортируемому результату. Все data inputs предков Export должны иметь
   источник с lineage от этого импорта, включая оба входа Join. Боковые ветви
   вне предков Export допустимы; подмена результата изолированной константной
   веткой не допускается. Порты различаются по scope, узлу и GUID;
   параметрическая связь не является путём данных. Проверка использует
   существующий readNodeXml без нового XML-парсера. Неизвестная форма
   ссылок или output lineage означает incomplete. Для стандартной candidate
   попытки также машинно подтверждается отсутствие JS. `passed:null`, invalid
   XML, отсутствующий артефакт, неподтверждённая квитанция не считаются успешным
   расчётом. Смысл графа дополнительно проверяется ограниченным review ниже;
   полное ручное review каждого стандартного успеха не требуется.
4. **Причины провала сохраняются отдельно:** неверный запрос модели, runtime,
   модель/квота, timeout, доступ к артефакту и неполные доказательства. Отсутствие
   `.lgp` само по себе не устанавливает, что виноват runtime. Ни одна такая
   причина без нарушения политики не запускает корректировку skill.

До первого model turn отказ инфраструктуры не занимает один из 18 слотов:
серию приостанавливают, incident записывают отдельно и после устранения допускают
повтор того же запланированного слота. Wrapper сохраняет такие отказы в новом
`incidents/` каталоге, без перезаписи квитанций и резервирования модельного слота.
После старта CLI отсутствие dispatch и exit/cleanup должны быть подтверждены,
иначе освобождать слот нельзя. Уже начавшаяся модельная
попытка, включая отказ модели или квоту после dispatch, остаётся в знаменателе;
её нельзя выборочно заменить успешной. Если rule/digest/catalog не подтверждены,
политика непроверена. При снижении успешности или неполном покрытии приёмка
не завершена; причины и решение о дальнейшем scope передаются владельцу.

Отдельная политика аудита различает `standard`, `explicit-js`, `capability-gap`
и `standard-recovery`. Для разрешённого JS проверяется наличие успешного
применения, соответствие узлу в пакете, роль JS и оставшаяся стандартная цепочка.
Проверка роли и обоснования проводится по коду узла и трассе, а не по названию.
Машинные условия explicit-js: ровно один JS, штатные импорт/сортировка/экспорт,
нет GroupData; tags: ровно один JS и штатные GroupData/Sorting/Export после него.
Смысл кода и checklist проверяет отдельный reviewer без права менять skill.
Его `graph-review.json` содержит verdict (`passed|failed`), reviewer, sessionID,
packageSha256, непустые evidence (существующие относительные пути попытки) и notes
с основанием verdict. Session/SHA совпадают с проверенными evidence; explicit-js
требует `javascriptRole:requested-aggregation`, tags — `variable-unpack-only`,
recovery — `recoveryObserved:true`. Без обязательного review раздельные машинные
статусы доступны, но общий PASS исключения не подтверждён.
Обязательное содержательное review охватывает все 6 JS-попыток, единственный
targeted recovery, все candidate-аномалии и 3 случайно выбранных стандартных
candidate-успеха. Seed фиксируется до pilot, выборка воспроизводима и не меняется
ради удобного результата. При обнаружении дефекта выборочное review расширяется
на затронутые задачи или общий механизм; полный ручной обзор всех попыток не
включается автоматически. Baseline служит машинным замером, без отдельного
семантического ручного review всех 18 графов. Это ограничение отражается в отчёте.
Recovery доказывается одновременно вложенным
`error.cause.code:WIZARD_CALCULATOR_VALIDATION_FAILED` при `NODE_APPLY_STOPPED`
и `node_phase_refused.receipt.verification` со значением
`calculator_syntax_rejected_draft_restored` для того же узла/операции.

Baseline может нарушать политику — это измеряемое исходное поведение.
Случайный успех, только CSV-pass и только judge-pass не заменяют эту приёмку.
Три повторения не доказывают универсальную гарантию поведения модели или
статистическую неухудшаемость; это критерий данной локальной серии.

Для завершения всей приёмки также обязательны 3/3 успешных `explicit-js` с
исходным oracle и подтверждённой ролью JS; 3/3 `capability-gap` с независимым
oracle на едином усиленном input и локальным JS; 1/1 targeted `standard-recovery`
с наблюдённой ошибкой, отсутствием JS и успешным стандартным исправлением.
При невозможности исправления остаётся явно отмеченный recovery-блокер. Он
подтверждает только политику, оставляет успешность расчёта непроверенной и
сохраняется в итоговых ограничениях; он не удовлетворяет порогу первой волны и
не разрешает запуск оставшихся повторов. `recovery_unobserved` не является PASS
и оставляет targeted diagnostic coverage незавершённым. Наблюдённые естественные
ошибки отмечаются отдельно. Непроверенное исключение или не возникшая
targeted диагностическая ошибка не позволяют объявить всю приёмку завершённой.

Текущая полная серия064745 —31модельный запуск:6baseline+25candidate
(18standard,3explicit-JS,3tags,1recovery). Первоначальные43 и pilot18baseline
сохранены как исторические условия; текущие31 закрепляются доfirstmodel.
Первая волна9 входит в25candidate. Корректировки skill требуют отдельной
серии. По30минут на запуск это максимум15,5часа окон
исполнения плюс сборка, cleanup и аудит; первая волна candidate — максимум
4,5 часа окон. Оценка «около часа» данными не подтверждена. Это сумма окон,
а не обещание срока: 90 секунд graceful ожидания после SIGINT — граница для
фиксации блокера, а не гарантия выхода CLI. CLI-профиль эксклюзивно занят каждым
процессом до подтверждённого cleanup и exit, между процессами освобождается.

LLM judge не является обязательным новым зависимым компонентом локальной серии:
структура и смысл сверяются с существующим checklist при review доказательств.
Если используется штатный судья, его версия и ещё не завершённая калибровка
указываются отдельно; prompt судьи и рубрики не изменяются.

## Завершение и контрольная точка

План реализации: `docs/superpowers/plans/2026-10-13-loginom-node-selection.md`.
Итоговый отчёт реализации: `docs/testing/loginom-ai-agent/reports/2026-10-13-node-selection-local.md`.
В отчёте отдельно фиксируются изменения skill, unit/static проверки, все local
live попытки, подтверждение исключений, доступ к физическим артефактам и блокеры.
Отдельно указаны сокращённое покрытие recovery до одного targeted прогона,
отсутствие cold reuse после смены входа, выборочный семантический review
стандартных успехов и отсутствие ручного семантического review baseline.
На этапе дизайна выполнены исследование исходников/аналитических эталонов,
независимое review и проверка примеров команд, oracle и snapshot из плана
на временных данных. Skill/runtime не изменены; сборки и live-серии ещё не запускались.


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


На 2026-10-14 03:45 UTC private mask diagnostic v2 запущен Root 26816
после independent static approval `b8c5ae24…`: семь тестов PASS, 4458 source
hashes и 79 V1 originals совпали. Дополнительно закрыты два RED→GREEN finding:
nonboolean cached value не выводится, cached foreign DOM getter не вызывается.
V2 capture выполняется в том же исходном evaluate; temporary field удаляется
до исходного guard/public snapshot. Повторных чтений/кликов/IPC не добавлено.
Пять исходных apply inputs, driver, managed entry и replay совпадают с V1.
Verification `e11dbb6e…`, reviewed binding `5c4eac75…` сохранён; Root изменил
только ready/status, active binding `9ae3a3a8…`. Каталог
`abc-wizard-mask-diagnostic` отделён от неизменного V1.
Live input доставлен, импорт выполняется. Model calls 0; no early Save,
Product/skill/payload/pins unchanged. Native diagnostic не является acceptance.
Следующие модели не запускались; candidate 3/25, firstwave 3/9 нечистая,
повторы и итоговая приёмка остаются незавершёнными.


На 2026-10-14 03:58 UTC V2 native diagnostic завершён Root 26816 exit 0,
без LLM: пять исходных apply и diagnostic-save SUCCEEDED, package_closed /
logged_out true, no discard, Host ACK/exit 0. Result
`2f2e995ca9db14ae9ed1565664c2abb5d2238de7b403c10ceb8c59a38f0ac19a`.
Independent postlive review `cc0e67c3…` подтвердил 3988 journal rows одной
session/runtime/actionManifest, 66 receipts, четыре journals и 73 raw,
4458 source / 79 V1 / 74 acceptance / 10 pins / оба runtime 288 unchanged.

Целевой Calculator в 557 ms показал единственную own wizard mask;
штатное ожидание 394 ms закончилось masks 0 и verified open в 951 ms.
Второй mask без TID из V1 не воспроизведён и не классифицирован. Это
non-reproduction, не Product fix, не acceptance и не замена failed ABC/1.
Save связан с own path `/user/ABCOpenDiag-d3f61ea4ba1e4fd4.lgp`, но
reopened/persisted_content_verified false; проверки сохранённого содержимого
и повторного открытия не заявляются. Дополнительная диагностика без нового
actualfailure сейчас не нужна; Product/skill/runtime/pins не меняются.

Диагностическая candidate firstwave продолжена в frozen порядке:
`risky-approved-claims/1` запущен Root 78243; Session
`ses_ec770db5bffeqJU4QzDZwcPh7p`, стандартный импорт выполняется, JS-вызовов
пока нет. После terminal нужен exact own archive трёх успешных/copied
candidate slots (sales/monthly/claims, девять файлов), с прежними статическими
pre/postconditions и обратной картой; во время active CLI файлы не переносятся.
Candidate completed 3/25, firstwave 3/9 нечистая, повторы закрыты;
полная приёмка не завершена.


На 2026-10-14 04:05 UTC `risky-approved-claims/1` завершён полным PASS:
Session `ses_ec770db5bffeqJU4QzDZwcPh7p`, CLI/wrapper 0, cleanup true,
oracle/policy/calculation PASS, JS nodes/calls 0. SHA attempt
`cd7cc72d40f5a703ab7f382ab90f501d3e477a9a0a3e01ddea6891f7f0d57f14`,
audit `27b07d0a59a02d6703e3237e0c043045734410c7464d5d222aeb4d528759a58f`.
Машинный audit подтвердил полную историю, runtime settlement, export identity
и связность графа. Root 78243 завершён exit 0; CLI около 381 секунды.

В observed history `filter-approved-high-1` отклонён до эффекта:
REQUEST_REJECTED / Unsupported node label (подпись содержит >), cleanup true.
Модель исправила подпись и с NEW operation ID `filter-approved-high-2`
успешно применила тот же стандартный Filter. JS fallback не использован;
это естественная ошибка настройки, отдельно от явного recovery fixture.

Candidate completed 4/25 (firstwave 4/9): три полных PASS и ABC/1 incomplete.
Baseline остаётся 18/18, 17 oracle/расчёт PASS, 11 policy PASS. Общие build,
skill и pins unchanged; повторы 2/3 закрыты, полная приёмка не достигнута.
Перед frozen next ROI/1 Root ждёт exact own archive девяти copied файлов
sales/monthly/claims с independent review; активных Root CLI/native/admin нет.
Read-only preparation6 `d8feff37…` сохранена (prior archive108/protected254);
отдельный final9plan готовится после claims terminal. Active/failed/unowned
файлы не переносятся, полная inverse map обязательна.


На 2026-10-14 04:13 UTC exact own archive трёх успешных candidate slots
sales/monthly/claims завершён. Final9 plan `8bf57641…` и independent approval
`e3393cf0…` сохранены без изменения readyForMove. Root operator 25780 повторил
проверки own receipt/local bytes, inode/mode/mtime/ctime/SHA, target absence,
idle profile и terminal CLI, protected268, prior108 и excluded6 до переноса.
Девять точных файлов перемещены `mv -n` на том же device68 в существующий own
archive; intent и полная inverse map записаны до переноса. Ничего не удалено.
Receipt `6b97846b8465655d3754d93dbc03afbd887074d679a7a2f64e8ea5b2392518b2`:
root526→517, archive108→117. New targets сохраняют bytes/SHA/inode/mode/mtime;
original paths absent; prior108, excluded6, protected268 и остальные root names
unchanged. Перед будущим reopen/reproduction обязательна точная обратная
реставрация соответствующих LGP и входов. Independent postmove ещё ожидается.

Следующий frozen candidate slot — ROI/1 после этого review. Root CLI/native/
admin отсутствуют; Product/skill/build/pins unchanged. Candidate completed4/25
(три полных PASS, ABC/1 incomplete), firstwave4/9 нечистая. Baseline18/18:
17oracle/расчёт PASS,11policy PASS. Повторы закрыты, итоговая приёмка не завершена.


На 2026-10-14 04:16 UTC independent postmove `16020b56…` подтвердил
117 archive names/bytes/SHA/device/inode/mode/mtime и отсутствие всех117
original paths; prior108 fullstats и excluded6 fullstats/SHA unchanged,
root517 измерен. Protected268/3excluded refs/141V1+V2raw/4458diagnostic source,
74acceptance source/10pins0400/обаruntime288 unchanged. Other root name equality
подтверждена Root operator; независимый review не заявляет повторное сравнение
полного before inventory, которого в receipt нет. Blockers отсутствуют.

Frozen следующий `campaign-roi-by-channel/1` запущен Root32921; Session
`ses_ec7615900ffeSpJbGwjzNPDotz`, стандартный импорт выполняется, JS-вызовов
пока нет. Source/build/skill/pins неизменны, инструментация private diagnostics
в этот model run не добавляется. Candidate completed4/25; первая волна4/9
остаётся нечистой, повторы закрыты, полная приёмка не завершена.


На 2026-10-14 04:22 UTC `campaign-roi-by-channel/1` завершён полным PASS:
Session `ses_ec7615900ffeSpJbGwjzNPDotz`, CLI/wrapper0, cleanuptrue,
oracle/policy/calculation PASS, JS nodes/calls0. SHA attempt
`1e37171e0efe0098f234b900f200df544cc4fdc169cbee0631f8ad15c20d637d`,
audit `4dd8c7e07a3896e4f8fabe557c0326feec01f11e0b943b6b6e9d3acc5e0e1488`.
History completeness, settlement, export identity и graph completeness PASS;
Root32921 exit0, CLI около378секунд. Обычный model run не содержит private
инструментацию. Product/skill/build/pins unchanged.

Следующий frozen standard `first-last-touch/1` запущен Root4970.
Candidate completed5/25 (four full PASS и original ABC/1 incomplete),
firstwave5/9 нечистая. Baseline18/18,17oracle/расчёт PASS,11policy PASS.
JS-вызовов в candidate standard пока не наблюдалось; это не policyPASS
несохранённого ABC/1. Повторы закрыты, полная приёмка не завершена.


На 2026-10-14 04:43 UTC candidate `first-last-touch/1` завершён технически
неполно: Session `ses_ec75aae26ffel7visXjzm5Wf31`, CLI exit1 / wrapper3,
cleanup false, attempt SHA
`284f23435c2cc4bfbfb4ecaceffb60970d1409715702fd7a66633976d8cd119b`.
Save, CSV и oracle отсутствуют; observed JS0 не является policy PASS.
Семь стандартных узлов выполнены успешно: Import, Calculator, два Group,
Join, Reform Columns (подготовка имени канала) и Sort. Ранее в progress
Reform Columns ошибочно назван Calculator; здесь сохранён фактический тип.

При Export3 native input0 имеет bbox (1164,780,15,24), нижняя граница own
canvas794, viewport800, scrollTop0/max82. После Link штатный cleanup
восстанавливает прежний scrollTop. Native GUID/роль/владелец проходят проверку,
но все девять hit points не принадлежат целевому PortCell; rightclick
не выполняется. Два covering div имеют role=presentation; точные владельцы
не установлены. Внутренний отказ NOT_APPLIED/effect false/cleanup true
не отменяет уже созданные Export и Link: внешняя операция AMBIGUOUS.
Это ошибка видимости поддерживаемого стандартного узла, не capability gap
и не основание для JS fallback. Патч для неповторившейся второй маски ABC
не выбран; V1/V2 evidence сохраняется как диагностика.

Строгая привязка собственных семи native GUID и latest server init04:22:10.525Z
подтвердила user:158; binding SHA
`f59e17748719e8d91affb42ca73a72074440f77e1690b1b8a2b87aab36a177c7`.
Закрыта только user:158 в04:40:31.099Z, admin:159 logout04:40:41.218Z,
две refresh подтвердили отсутствие собственной сессии, MCP69805 exit0.
После independent archive admission `df46f231…` guard перемещён intact
atomic rename в `.writer-recovered-node-selection-20261013T233119Z-4699a5-user158`;
receipt `ba16e90049a306a9aae2cf10a0d501478f8089574aaf11ae3089e59c564fe3b5`.
Original attempt не переписан и не повышен до PASS. Финальная независимая
проверка сохранности recovery boundary ожидается; Product/tests ещё неизменны.

Решение: непосредственно перед input0 mapping стандартного exports.text,
после Link, при доказанном выходе порта за нижний край viewport выполнить одну bounded
прокрутку собственной canvas через существующий guarded scroll.
Использовать свежий видимый non-script graph anchor с тем же container_ref,
не obscured port. Затем fresh observe должен подтвердить прежние document,
workflow, Export и canvas. Исходный openInputPort(0), native ownership,
роль и все девять hit checks остаются обязательными; если порт всё ещё
перекрыт, stale, masked/locked или диапазон недостаточен, клика нет.
Не добавляются public tools, JS grants, alias, обход guard или общий layout.

Серия233119 остановлена после18baseline и6candidate: baseline17oracle/расчёт PASS,
11policy PASS,6FAIL,1incomplete; candidate4full PASS и2technical incomplete,
firstwave6/9 нечистая. Явные JS/tags/recovery и повторы этой сборки не запускаются.
Необходимая правка общего runtime требует новой immutable matched пары и
полных18baseline+25candidate на новой сборке. Старые попытки сохраняются
исключёнными из итоговой приёмки; их нельзя заменять, переносить или повторно
считать. Политика skill и критерии приёмки unchanged; задача не завершена.


На 2026-10-14 04:50 UTC final independent recovery158 review PASS:
`a82224430bbc21ee95d92bf9fd3ed6b0b4e324d336006057e732ef82e6b2279b`.
Source .writer absent; архив сохраняет nonce/owner bytes/device/inodes7628891/7628892,
mode и mtime; directory ctime ожидаемо изменён rename. Fresh server log
подтверждает собственные closure158/logout159 без новых incarnations; own CLI/
chat/profile/currentpayload managed processes absent. Original attempt284f…
и raw16 (145parts/39messages), source74, pins10×0400, runtime288×2 и working288
unchanged. Операционное восстановление завершено отдельно от failed scenario;
CLI1/wrapper3/cleanupfalse/incomplete остаются исходным результатом.
Можно начать TDD исправление input0 clipping; общая приёмка остаётся открытой.


На 2026-10-14 04:53 UTC независимый review продолжения Export clipping
подтвердил scope, actual factory seam, сохранность guarded scroll/native GUID/
девяти hit checks и новую matched18+25. Блокеров нет. Уточнение плана принято:
existing negative guards могут сразу проходить, обязательный RED — actual
post-Link clipped input0 на старом factory; новые behavior/guards вводятся TDD.
Product implementation ведётся отдельно, source review/checks/live ещё впереди.

Подготовка сборки read-only: Bun1.3.14 revision0d9b296af, Node24.19 SHA
bc17c508… и Chromium1246 SHA1e0652a3… совпали с pins. Нужны clean detached
checkout нового общего commit, baseline verify до восстановления двух старых
skill-файлов, затем clean candidate build/verify, новые фактические closures
и ordinary native gates. Старые payload/current-run/profile не менялись.
Историческая series-stop SHA
`2dce56a9a7fe0f80179399be3aa9615067dfccc8ab6fb3813a74da25e9a921d7`
независимо сверена:24original attempt hashes/24unique Sessions,18baseline+
6candidate,4candidate selection-audit complete PASS,2incomplete,19unstarted.


На 2026-10-14 04:59 UTC для следующей matched пары уточнён prospective
порядок: independent pair review + все ordinary native gates + immutable pins,
затем candidate9; при чистом gate — baseline18, затем candidate16.
Runtime/runner/audit менять для перестановки не требуется: audit каждого
слота читает pinned task/attempt/mode и не зависит от baseline receipts.
Это execution order; full acceptance по-прежнему требует все43freshslots,
18standard policy PASS, oracle не хуже нового baseline, все исключения/
recovery/manual reviews. Сравнительный PASS до завершения обеих фаз запрещён.

Новый effective acceptance lock до первой модели обязан закрепить этот
executionSchedule. При ранней остановке сохранить каждый started slot и
явно отметить unstarted; старые outcomes0, никаких замещающих повторов.
Один общий профиль, уникальные пути/новые Sessions, sequential processes
сохраняются. Нагрузка/storage остаются факторами локальной серии при любом
порядке. Исторический baseline-before-first9 серии233119 не переписывается;
этот prospective порядок заменяет его только для следующих matched пар.

Независимый Product WIP review выявил привязку fresh retry к прежним canvas/
anchor до scroll. Actual UI_EPOCH_CHANGED RED подтвердил ненужную scroll,
когда порт стал visible; минимальный GREEN связывает fresh context/owner/
viewport/port/anchor в существующем perform identity. Shared perform,
native port ownership/hit guards unchanged; final freeze/negative suite/
approval ещё ожидаются. Trigger ограничен наблюдавшимся выходом порта
за нижнюю границу viewport (804>800), не всеми видами clipping canvas.


На 2026-10-14 05:04 UTC TDD исправление Export lower-viewport input0
завершено: Product изменён только в text-export-node.mjs (+24строки), SHA
`1e5772e763f81b67ac374722389b65ad7bbf97a835388d51b1630086cef44956`.
Новый actual factory test SHA
`e4190d32047d6ad64276c6d6e99288600e4cde08ab1c99d2bd1e31a2114561a0`.
RED original source: Port has no observed interaction point. GREEN проходит
через настоящий serialized observer/guarded scroll/native opener, проверяет
ровно один ui_scroll_applied с exact owner/from0/to82 и verified input wizard.
Отдельный actual UI_EPOCH_CHANGED RED закрыт pre-gesture identity binding
fresh node/context/owner/viewport/port/anchor; shared perform не менялся.
17/17 focused PASS, две syntax checks и diffcheck0; verification SHA
`f86a556646355c40ba3f911907ed3f19d7d0305be2d66f9fe4677844ccddb0e5`.

Independent final source review Approved-source, SHA
`96f0bf54ef3aa22817b38d4cea9f1dfee503338c74e5391b820c72b08fa8ef67`:
отдельные pinned Node17/17PASS/0SKIP, hashes до/после совпали, actual journal/
четыре line hashes и10author evidence проверены; observer/channel/opener/
context/shared fixture byteequalHEAD. Initial lock не допускает scroll;
если lock появился уже после scroll-prepared, безопасная own scroll может
завершиться, но fresh readiness запрещает даже начало открытия порта.
Общий Node suite и связанные модули, ordinary new-payload proof и модели
этим verdict не заменяются. Root related checks active; остальные stages открыты.


На 2026-10-14 05:08 UTC appropriate checks исходного commit
`a8db3e0f4cdde78399f6f81114e936fa16980920` завершены Root:
related focused378/378PASS/0SKIP и pinned Node24.19 fullupstream3847tests/
3837PASS/0FAIL/10SKIP/0cancelled/0todo, exit0. Cwd client; module/test hashes
до/после совпали. Full TAP command/log/result сохранены; related spec reporter
counts взяты из исходного полного log отдельной supplemental summary,
original result не переписывался. Общая root-checks-verification SHA
`a24d9902389d8e1d2adb370f4af89d2580f758eb10438b3422d532757c552f2a`.
Source review и checks закрыты отдельно от ordinary native/model acceptance.

Новая matched пара `20261014T050544Z-2085d7` собирается из того же commit
в собственном clean detached checkout; baseline74/candidateff18 skill,
модель/variant/tasks/seed/18+25 unchanged. Effective lock должен закрепить
новый prospective schedule candidate9→clean gate→baseline18→candidate16.
Пока нет активного Root model/native/admin процесса и current-run не переключён.
Private clipped Export proof проходит отдельный static review: нужны точный
saved XML noJS gate и canonical own scroll completed/trace; эти fixes не
меняют Product/runtime. Новые immutable bindings и live ещё не допущены.


На 2026-10-14 05:15 UTC новая matched пара050544 frozen без model/native calls.
Source `a8db3e0f4cdde78399f6f81114e936fa16980920`, own clean detached checkout;
baseline build/verify0 до restore двух старых skill-файлов, candidate build/
verify0 после restore. Runtime обеих фаз
`7982512e1949b23bc019305d22bf8fbfd54c4c3dc0258258497134e904e640f3`,
288files; относительно233119 изменён только text-export-node.mjs.
Full buildsource14701files, paired inventory5726: CLI/deps/browser equal,
различаются только2skill-файла и3metadata с original-specifier normalization.

Immutable0400 pins: baseline
`fb31e4f286a3fec4afa4a0896e34e40b98233fa789a321f6f2bead5740278adf`,
candidate
`dd65ee0a1e4a1e187925ebd16c94ec87d633b4abe239f5afb5e107869185ff67`;
effective lock
`afc1c7d94b5df4760d4efce3e5bf92b8d0640dfd89ec2102bdba2c470a485378`,
provenance
`f478535935cbf5c5c2174244d0eba393758465382b4f0abc8c1366d54585d8cb`.
Все10 operational inputs0400, historical72+2/audit2654 unchanged,
15defs/43unique18+25 без reservation. Lock закрепляет native/pair/pins→
candidate9→clean gate→baseline18→candidate16, comparative PASS только
после обеих фаз. Старые outcomes0; current-run остаётся historical233119.

Independent pair/pins review начат отдельно от автора сборок. Private reader
fixes и ordinary bound native gates ещё впереди; stage сборки+live не закрыт.
Полная модельная приёмка ещё не начата на этой паре; цель остаётся активной.


На 2026-10-14 05:24 UTC independent static pair/matrix/pins review PASS:
pair `2c103f2b9113e84d4e642dd5f9548b80a1537c1c77059d4a6af3818e1b5b5d65`,
matrix `b364ed2c364d83d091ec595f212e616ad8ba6a8e3970055c9ad3c798077b1773`,
pins `28b0d108f0ae2443871e310ec5de03a38630c0202d730adb631bed1acc6dcd0d`.
Обе5726-entry manifest,288runtime и14701source фактически сверены;
отличаются только2skill+3metadata. Payload/task/model/variant/seed unchanged.

Обнаруженные семь prompt hash mismatch относились к FOUR-arg diagnostic
buildAgentPrompt в metadata; actual runner использует THREE-arg. Сохранены
initial frozen matrix/lock/provenance и mismatch evidence, отдельно создана
corrected matrix SHA
`f6f1171a516b7895dc4ac308af875080ce92a9f09a3eccb3f8d0af03003c1774`;
независимо подтверждены43/43 actual prompt hashes (36 прежних unchanged).
Эффективный lock теперь только acceptance-lock-corrected.json:
`5be90328908ea793e4b75bb61adcaf54975e24ba85bab1729f611c32013a1875`.
Corrected provenance `cfb90d433652186f14a7b65f3dc0f3e6d027bd19d2ba337a980a3d978fb1ae24`;
metadata amendment `e854b2091cb15a9ceddf7ea6b3d603ae4d632e910e0dd5fccd1c3d4564640642`.
Оригинальные pins/payload/исходники/задачи/runner не менялись; это metadata
correction до первой модели, не новый runtime/pair и не перенос исходов.

Все ordinary proof для нового runtime prepared ready:false. Clipped Export
reader findings закрыты private TDD (9tests/38expect/typecheck0); independent
bound approval ожидается. JS/Join/schema подготовлены другим автором,
25tests/3typecheck0; их independently принимает другой reviewer, чтобы автор
не принимал собственный proof. Model/native live0, current-run historical233119;
полная приёмка и stage сборки+live остаются открытыми.


На 2026-10-14 05:29 UTC все bound ordinary proof получили independent static
approval: clipped Export `1b7c80af6d886273ed1da31b84689e5e049d86dd1ab0a333c2d75d58dd80a61b`;
JS `6145511ebcf611b03fb691229b8377895d4df32b6c1ecd752d70a65010b6860f`;
Join `1bb87b801a6b07a10fefe3f2ec5c5f185e4bb189ef37b150dd50c28b51be9eb6`;
schema `339d5242f782543d488ba9959f096d76da187ffff0d148a66d9b27ec05a2e92e`.
Approvals подтверждают static bindings/checks, не свежие native результаты.

Root запустил clipped Export первым, Root25228 active. Exact container0c72…
running, writer absent, run dir absent проверены перед допуском. Reviewed binding
`5b498da175e98e9e23b31e2e1cb02138b138f0d43f559f7f27001d512e28e692`
сохранена0400/byteequal; активированы только ready/status, active SHA
`973307358d75a95a7aef1e0e3cdbfc7872192c9b1d0b57f9da0aa98f404ab2a8`,
exclusive admission
`70ecc163420614cf53f8bc6b56302d4edbb32e0a2218eec50666dd2069874018`.
Первый preserve отказался O_EXCL, потому что reviewed copy уже существовала;
до повторного допуска подтверждены её exact bytes/mode, никакой overwrite
или дополнительный native запуск не происходил.

Own ordinary prepare и input delivery прошли; Import1 SUCCEEDED/cleanuptrue,
Calculator выполняется. Actual7standard prefix, Export3position900,640 и
no early Save сохраняются. Clipping/scroll/CSV/graph/финальный cleanup ещё
не подтверждены. Другие native/CLI/admin/модели не запускаются одновременно;
model slots0, current-run ещё historical233119. Цель и stages live/18+25 открыты.


На 2026-10-14 05:43 UTC original ordinary8node clipped proof Root25228
завершён exit3 до Export: GroupLast group-last-1 AMBIGUOUS/open/
WIZARD_OPEN_NOT_CONFIRMED/cleanupfalse; Import/Calc/GroupFirst SUCCEEDED.
Result SHA `6c7f7f93dca97432393f9ff9c7ab18f4a776836d0433c658a24c0430371c8d7f`.
NoSave/CSV/clipping, model0; runtime1029384 ACKfalse/exit1.
Raw1367: один own begin_wizard click ACK133ms, native waits140/192/259ms,
guard отказ564ms; before1365 exact own Group/unlocked/point observed/masks0.
Error output уже grouping с ownGUID/masks0, но catch перечитывает UI:
predicate-time cause неизвестна, secondmask не утверждается.
Read-only diagnosis SHA `a32a6d6d2af19c34ad07dd732e74c5f6e2a17307578ba2e6172a19965ed2634b`;
Product/общий runtime по этому неизвестному отказу не меняются.

Strict3successfulGUID/6serverevents связали только user:160 latestinit05:27:39.471Z,
binding `7a7c62478cf06abfab25e79e1f7621eadbfb5829ae853132f1b6ae3aba3c8895`.
Root soleadmin закрыл160 в05:37:51.045Z после exactfreshrow/confirmation;
двеrefresh подтвердили отсутствие160, admin161logout05:38:13.017Z.
Bridge59539/browser closed/exit0, guard отсутствовал; профиль/история не менялись.
Independent final recovery SHA
`6db3bae9b1fcde4ee77566b2378c4f9171de98d8dc8e96db5bc985c12ebbc4ee`:
raw35/source4452/fixtures9/protected15/effective10inputs0400/runtime288×2
unchanged, own processes absent, new160init отсутствует. Original failed
остался failed; recovery не подтверждает исправление Экспорта.

Следующий diagnostic scope — новый private ordinary Import→Sort→Export,
tiny27B/independent27B oracle, same Export position900,640,3nodes2links/noJS/
noGroup/noearlySave. Сохраняются verifyRevealEvidence, ordinary entry и
строгий cleanup; actual clipping обязателен, иначе NOT_REPRODUCED.
Это изоляция Exportfix от неизвестного Group отказа, не упрощение модельных
сценариев/18+25 acceptance. Новый private binder/graph проходит TDD и review;
старый8node proof immutable, runtime/pair/pins unchanged.

После recovery Root49772 запустил approved ordinary JS downstream отдельно.
Reviewed binding6e668b33… preserved; ready/status active SHA
`6c4c132dc9b2a1ef988629c476608225b4cebb2dc19cc145a5813c584ceb4296`,
admission
`aa1786cadade63c231efabe819476c9b8af0c70e87f8c49875df50618eb4246a`.
Другой Host/CLI/admin не активен. Новые native результаты ещё ожидаются;
model slots0, current-run historical233119, цель и live/model stages открыты.


Checkpoint 2026-10-14 06:03 UTC — pair050544, model slots0.
Ordinary JS downstream Root49772 завершён exit0: Group A17/B21,
direct Sort B21/A11/A6, native CSV27B и saved5nodes4links/source/schema/socket
проверены. Own package closed без discard, Logout/HostACKtrue/exit0.
Result SHA `c33451733c68f2cd52e2c8bd2d3f7a94e6d8f18f7c1dc7b4574dc6b0dd230d93`;
independent live review `4a25b1108464fe429d2ee77b96ce6360d556e2e9d06fd8f950f21efd7260766b`.
Это PASS отдельного native gate, не model acceptance/18+25.

Minimal ordinary Import→Sort→Export Root40322 завершён exit3:
Import/Sort SUCCEEDED, Export input_mapping AMBIGUOUS/cleanupfalse,
noSave/CSV/Logout/ACK. Result `4e90c98213335b3582dacbf3f199820fd3701ddbd2f040ec2c7231d399ee3877`
сохранён failed. Raw740 input bottom804/viewport800;741–742 один own scroll
0→82;744/746 same owner/ref/identity, input bottom722 внутри viewport.
Masks/dialogs0, но covering `<u>` без установленных owner/class/ancestors;
все9 native hits отказали до меню/клика. Вертикальное clipping устранено,
full mapping/CSV gate NOTPASS. Report clippingReproduced=false осталось
initial default: evidence reader не вызван после отказа, это не отсутствие
clipping в raw. Read-only diagnosis
`1c791af08cd3e754d3c1b423e4632e967bfa83db804d65a6802b811797a70eaa`.
Неизвестный U не основание для ослабления native guard или Product patch.

Strict native/server GUID binding связал только user:163 latest init05:50:57.982Z,
SHA `a9048d46a9473bb04d0b37ffb2437424d69bc69770cd91599e1a03643a7c7943`.
Root SDK7158 закрыл exactfresh163 после exact confirmation; отсутствие
подтверждено двумя refresh06:02:29.022/29.789Z. Own admin164 Logout06:02:50.254Z,
login visible; browser closed/bridgeexit0. Guard отсутствовал, originals/profile
не менялись. Независимый final recovery/read-back ещё ожидается.

Следующий private diagnostic собирает ограниченные DOM/parent/cache data-values
того же9hit evaluate только own Export input0; getters/новые browsercalls/clicks/
изменение predicate запрещены. TDD и independent static review до live,
no acceptance credit. Join/schema static approved, fresh live ещё не выполнены.
Runtime/payload/effective corrected pins unchanged; current-run historical233119.
Stages fresh native/build acceptance и18+25 остаются открыты.


На 2026-10-14 06:08 UTC independent recovery163 PASS:
`f9f5b2ee23889b8ef38628dc24445a285726f75e789554f0c12294e72ad9d386`.
Server closure16306:02:28.203Z/admin164Logout06:02:50.246Z/noReinit;
raw22/source4453/fixtures15/protected68/effective10/runtime288×2 unchanged,
own processes absent/.writer absent. Original failed4e90… не upgraded.

Root79801 запустил approved ordinary Join. Reviewed binding6a0062fd…f3302
preserved0400; only ready/status activation
`5246b5963751898d04971e500ed2aa43411fe07e2a3d46d3adbb52e06ff1574c`,
admission `18c5ae1a96fc9481cb6236bbc609b2a7b774a5f0ad696313cee481ad99c80538`.
Fresh4452source/5fixtures/85protected и own idle проверены. Первоначальный
read-only process filter оказался шире own scope и отказал до mutations;
повторная проверка scoped к этой серии, чужие процессы не затрагивались.
Join outcome pending; no other Host/CLI/admin/model. Model slots0/stages open.


Checkpoint 2026-10-14 06:14 UTC — fresh Join PASS/independent PASS.
Root79801 exit0/result `5892db63337e7091aa7526f01b9ea47360d05c1a6e4b5df0508a64e07cf8ceac`;
independent live `f3f3bd07bbc10d1a08526d4b4a54ef4f078bfe6840e607841b086d4b83544caa`.
Actual role0/role1 native GUID/ACK→wizard observations, exact integer rows
[1,5,15]/[1,10,15], both import projections и saved3nodes2rolelinks/noJS.
Own package `/user/JDbbe947d8.lgp` closed без discard, Logout/HostACKtrue/exit0,
PID1094100 absent. No standalone input reread/fresh hiddenDOM/model claim.
1315ownjournal rows; raw36/source4452/fixtures5/protected85/effective10/runtime288×2
unchanged. Это отдельный native gate, общая acceptance всё ещё открыта.

Root9855 schema probe exit0/result
`aa497d0c89338cc50437ff990a4066ff3a4338748d68f7463287dfe24620798a`:
15standard schemas получены, ACKtrue/exit0/noSignal. Explicit Logout false,
prepare/node/package/UI calls отсутствуют; actual16prepare проверен отдельным
JS downstream. Independent schema live review pending. External admission
`3673bd6ec208f5d2715bbb18939a4a35dab51b9ad39a81fa4d983fb0753f87b8`;
readyFalse metadata-only не менялась. Gap scope ограничен known15/API/case,
не универсальной математической невозможностью любого стандартного графа.

Private U capture `native-export-port-cover-diagnostic` prepared/frozen:
binding `979ee5bb4463687e11ee252d173b2e09526c2b8c0564d1b2034c73e0a2755d46`
readyfalse0400, verification
`110656399c41f97d5f971858bff8881e43841e5df62d35dcb6faf5f1bfbd9ed0`.
Author7Node+11Bun65assert/typecheck/syntax0;4456source20fixtures70protected.
Exact frame only, same9hit predicate/point/click/browsercall count; inverse
byteequal test, bounded marker extracted before unchanged error slice500.
Getter/oversize data fail to unknown/truncated, guard remains refusal.
Independent static review pending; no live/Product/payload/profile change.
Models0, clipped Export/full native stage/18+25 remain open.


На 2026-10-14 06:17 UTC private U static review Approved:
`9e8283114fecbee2de0d0ed84077694544bc37200923e53a8334737c4907b83e`.
Independent7Node PASS/actualstorage-receipt wrappers preserved; four insertion
inverse equals canonical frame, same9hits/no gestures/no additional browsercalls,
4456source/20fixtures/70protected/5effective unchanged. Bounds12000 JSON characters,
128char strings; no full raw stack byteidentity claim. U remains unknown.

Root81562 soleHost private diagnostic active. Reviewed979ee5… binding preserved0400,
only ready/status active SHA
`07724764ce8456390c71f7f917d36197ccd4c7075de0e85ffba5b13c6f5c7407`,
admission `3e5f277585e40e67ec271fce7df5baed8c433a0cddcf950100f0fe0cee18dcbb`.
Fresh source/fixtures/protected verified, .writer absent/run absent, own prior
schema PID1103452 absent/ACKexit0. Explicit schema Logout остаётся false.
No simultaneous Host/admin/CLI/model. Instrumented diagnostic excluded from
native/model acceptance; Product/payload/pins unchanged. Fresh result pending,
model slots0, Export/fullnative/18+25 open.


Checkpoint 2026-10-14 06:28 UTC — known tooltip cover, no acceptance upgrade.
Schema independent live PASS
`e74936500f1f2d006b5800441ffc523c873e286d975ff3da09c8dadb105cf5dc`:
15public schemas/16freshJSprepare cards/31cachekeys independently reconstructed;
source5/fixtures4/protected22/effective10/runtime288×2/raw22 unchanged.
Distinct probe/prepare sessions, same build/runtime/skill; Logoutfalse preserved.
Known bounds: Calculator/Collapse128 per node, Union14additional/15total,
fields1000. General variable-unpack gap limited to known15 contracts;
finite151 composition/universal impossibility not excluded or claimed.

Private U diagnostic Root81562 exit3/result
`2aac86b9bd1bd93fba14ebcb336290e668f1b2160160f59836d48b5bdde32814`.
Raw760: nine inViewport points hit one U; fourth ancestor tooltip-2760/ttip/
x-tip; port connected/sameModel/samePortDom/nativeGUID/input1 confirmed.
Scroll0→82/780→698 succeeded, nativeopen NOT_APPLIED/effectfalse beforemenu;
wholeExport AMBIGUOUS/cleanupfalse, noSave/CSV. Reportclippingfalse remains
default before verifier. Tooltip owner/trigger/lifetime unknown, cachefoundfalse
is not absent native ownership. Source scroll only sets guarded scrollTop;
it does not move mouse, so hover on scroll-anchor is not established.
Diagnosis `83fc9f9ad2014fd7b143b61ae76e6b4fec936de032c1a975b4a2145767b32c89`;
independent live-stop
`619dbead9daf11ae6683d511ffc25131db7a136a59a63d1385b5996cd95bb99e`.
Raw/source/pins intact; instrumented result excluded from acceptance.

Strict own167 binding `a0b179b8d63f4ca50d161b1525db3d6ececf74fbbb88885b3fbb8e7bb5dde030`
confirmed latestinit06:17:02.249Z plus Import/Sort GUID4serverrows.
Root soleadmin closed167; twoUIabsence checks06:22:26.359/27.123Z,
neighbor166 untouched, admin168logout06:22:50.363Z/bridge81629exit0.
Independent final recovery
`988ae4d4d793487d642ed75c0719f480761711de6e7a629387bd6b25bcdc354b`:
serverclose16706:22:25.537Z/admin168logout06:22:50.356Z/noReinit,
raw23/source4456/fixtures20/protected70/effective10/runtime288×2 unchanged,
ownPID1111256 absent/.writerabsent. Original failed remains failed.

Prospective surgical design: only after successful own reveal and fresh
same-owner read, if input0 still has no point, perform ONE existing guarded
click of exact own Export LABEL, then fresh read/rebind and unchanged native
openInputPort0/9hits. Actual label point1208,645/bbox1167,637,82,16 is visible
outside tooltip y686..800, non_script/click allowed. BODY-first selection helper
is unsuitable here: its computed center1208,710 is covered. No tooltip mutation,
owner assertion, new hover API or guard waiver. Existing target/signature/
pre-gesture epoch checks remain required; after valid selection fresh native
GUID/doc/workflow/graph identity replaces obsolete DOM refs/epoch. If label
or port remains covered, owner changes, wizard/mask/lock appears, or no exact
label exists, refusal remains. Visible port/no own reveal means no label click.
This is own selection with no link/mapping edit; actual disappearance and final
Save/CSV/graph/cleanup still need proof. Independent design review pending;
Product/payload unchanged, Root idle/model0. Any Product change requires a new
matched pair and all native gates/full18+25; current050544 no model slots run.


На 2026-10-14 06:31 UTC independent design review Approved:
`73fc70b052396effa7ba096db837e55c0bec73591160b168af0e17a68c87d3c7`.
Label branch обоснован actual758 и existing checkedHandle/epoch guard.
До click удерживать exact label/port/owner fingerprint; после него fresh native
GUID rebind, без старого DOM ref/epoch. Один click — максимум один физический
жест; существующие no-effect pre-gesture refresh допускаются. Эффективность
очистки tooltip ещё не доказана. Shared BODY-first helper не используется;
unknown tooltip owner/trigger не переопределяется.

050544 остановлен ДО model admission: `series-stop.json`
SHA `362d5569ab85f295bb0f22effbd74271765194b389b83211951036d4acd01138`.
Models0, no candidate/baseline attempts; остановка обусловлена required common
runtime fix, не заявленным policy violation. Source1e577… был неизменён при stop,
все own Host/admin закрыты/.writerabsent, raw/payload/pins preserved. Старые
JS/Join/schema native PASS не переносятся на новый runtime. Новый source commit
требует новой matched пары, всех ordinary native gates и полного18+25.

Worker реализует approved LABEL branch через TDD, только text-export-node.mjs
и focused test; raw/oldfixtures/pins/docs не меняет. Root owns canonical docs,
checks/commits; independent source review до commit/live. Stage TDD label
и его review/checks пока открыты, model acceptance не начиналась.


Уточнение LABEL guard scope 2026-10-14 06:38 UTC: наблюдавшийся lock в fresh
read до label запрещает click. Если native FLocked изменится уже ПОСЛЕ
node_step_prepared admission, прежний shared checkedHandle может допустить
одну безопасную own-label selection; следующая fresh проверка обязана отказать
ДО input/menu/mapping. Это та же temporal граница, что у разрешённого own scroll;
selection не меняет данные/links. Zero selection после такой race не заявляется.
Shared guard/API не изменяются ради расширения scope. Author tests фиксируют
этот реальный инвариант и negatives; final source freeze/review пока pending.

Skill_policy source review дважды не начался из-за selected-model capacity;
Product independent review передан verify_audit_corrections (не автор правки).
Это не model eval slots и не quota outcome попытки. Никакого live/LLM eval нет.
Next-pair подготовка `08c944c76e85cff7e22bec70e1e675f29c0d800552b27a9d50ad9497d4dae563`:
existing build/verify pipeline, baseline verify до restore2skills; новая initial
matrix сразу actual3arg, прежний schedule9→clean→18→16. Build checkout не менялся,
сборки/новые payload не стартовали; требуется новый чистый source commit.


LABEL TDD source завершён 2026-10-14 06:45 UTC: только16lines в
text-export-node.mjs и actual factory/native-protocol tests. Product SHA
`d6543f396964351173bdf38532cad5f9db33e449162d61a310beb56228d8dbfd`;
test SHA `0e60290d16510a388c90fa8206e54af93048eb08b2598a06a46c23843315f076`.
Author vertical RED exactno-point→GREEN one ownlabel→nativeinputwizard,
34focusedPASS/0skip/syntax0/diffcheck0, verification
`2b3187e16a7a3766bcbe2e6e3169d600acf3d8c5c09fa8082a871bec4f2ef320`.
Covered/missing/duplicate/foreign/script/disabled label, persistent port cover,
owner drift, target fingerprint, fresh DOMref replacement and both lock
boundaries tested. Visible/no own reveal does not add label click.

Independent source review Approved
`4352deffe2020a845499cbe6286d2cccd457302b829f9763f9a1449121524465`:
34independentPASS,5sharedguards/38originals/actualjournalrefs unchanged,
no shared observer/channel/port/API/catalog/JSgrant changes. Root expanded
focused395/395PASS/0skip, started06:41:53.598Z→06:44:35.874Z, receipt
`3992aa1004a3aa01cb9917a13000cbac89e203683f5731a184dd961b409e298f`,
command6a684653…/log6a93185f…, source hashes unchanged. Wrapper syntax error
before first execution created no artifacts/tests; corrected command ran once.
Full runtime suite pending; review/checks checkbox remains open. New build
and actual ordinary tooltip disappearance/mapping/CSV/Save/cleanup remain
required, all43models fresh on final pair. No live/acceptance upgrade yet.


LABEL source commit `c5930ed6899fa3963d60022636927c7a4840c062` и required
review/checks завершены 2026-10-14 06:52 UTC. Independent source Approved4352de…,
root focused395/395PASS/0skip; root full3864tests/3854PASS/10SKIP/0FAIL/
0cancel/0todo, tool21437 terminalexit0. Full06:47:09.658Z→06:50:13.048Z,
command `1641aa86385433db90079a042ec90f1fd3ea854ccd5d7a0247a98573a7b851cb`,
log `f357b337e15d3db2e99c1610d8aad1f630b7e1f0a3d97fd5f46faf08ca69ed06`,
result `953bf855ebe1bfb2a6a33b25c0698837cb6f236e701681af425a9f80f48e7677`.
Source d6543f…/test0e6029… unchanged before/after, pinnedNode24.19/bc17….
Overall check/readback `9d7884fb6a678ccb958cfcf542e3c2c068c7ad488714d13db97bf7e28d94e87b`.
10SKIP остаются ограничением offline suite; actual ordinary/live ещё обязательны.

Новая matched серия `20261014T064745Z-367f4b` подготовлена параллельно полным
checks в собственном clean detached checkout c593…; profile/server не трогались.
Baseline build/verify0, verify06:50:40.517Z ДО restore06:50:40.577Z;
candidate build/verify0, verify06:50:52.745Z, checkoutclean. Initial build
preparation missing parent вызвал ENOENT до компиляции/payload создания;
command/log сохранены отдельно, создан только собственный payloadRoot,
повтор того же source snapshot прошёл. Native/model slots0, initial metadata
сразу actual3args; full inventory/pins/static review pending. Ни один outcome
050544 не переносится. Новый ordinary clipped Export с label action и остальные
native gates, затем candidate9→clean→baseline18→candidate16/full43 открыты.
## Текущий протокол проверки — 31 запуск (2026-10-14)

Это изменение принято до первой модельной попытки серии `20261014T064745Z-367f4b`.
Фактическое состояние: source `c5930ed689`, review/checks `17d4c19e30`; focused395/395,
full3854PASS/10SKIP/0FAIL; оба build/source verify0. Независимо проверены14701source,
61symlink и5726files каждого payload; общий runtime `21fcca85…`, различия только
2skill+3metadata. Новые model Session/слоты0, native run/results0 на момент решения.
Исторические43-slot locks и начатые прежние серии сохраняются без пересчёта.

Выбран **baseline6 + candidate25 =31**: одна baseline-попытка для каждой из шести
standard задач; candidate сохраняет18standard (6×3),3explicit-JS,3tags и1recovery.
Сначала ordinary Import→Sort→Export на итоговой сборке с actual clipping, одним
own scroll, допустимым guarded label click, native input0/mapping, точным CSV,
Save/graph/own Logout/ACKexit0. Unit PASS этого gate не заменяет. Новый JS downstream
с Export тоже проверяется. Join и15schema подтверждены в050544; повтор их live
не нужен при byte-identical relevant dependencies. Это carried regression confidence,
а не новый064745 native/model PASS; fresh minimal prepare сверяет текущие16cards.

Порядок первой девятки: ABC/Pareto → первое/последнее касание → sales → monthly →
claims → ROI → explicit-JS → tags → recovery. Затем полный clean gate всех9,
baseline6, остальные candidate16. Нечистая волна не открывает повторы; policy
violation останавливает digest. Начатые timeout/error/quota/incomplete остаются
в знаменателе, не заменяются удачными retries. Одинаковы итоговые runtime, модель
`openai/gpt-6-sol-fast`/medium, requestedpriority (actualtier неизвестен), параметры,
входы/oracle; между версиями меняется только skill. Новые optimized inputs
создаются отдельно0400; исходные frozen files не переписываются.

Приёмка candidate не сокращается:18/18standard policy, ≥1fullcalc по каждой задаче,
3/3explicit-JS,3/3tags, наблюдённый1/1recovery, первый9clean, прежние lineage/oracle/
history/settlement иmanual reviews (все6JS, recovery, провалы/аномалии,3seeded successes).
Сравнительный oracle gate нормализуется: C_standard/18 ≥ B_standard/6 (C≥3B).
Показываются отдельно B:0..1 и C:0..3 по каждой задаче. Это описательное сравнение
при одинаковых условиях; baseline1 не оценивает повторяемость старого skill и
не равноценен43-запускам. Candidate имеет прежнее функциональное покрытие и3повтора,
а надёжность baseline-сравнения слабее. Старые данные на другом runtime только история.

Успешные standard candidate продолжаются thin sequential driver поверх существующего
single runner: oracle/graph/policy/history/settlement/CLIexit0 + exact own bound
package close/Logout/noDiscard, Host/resource close ACK/exit и свободный профиль.
Отсутствие .writer само по себе недостаточно. Для baseline JS — наблюдение старой
версии, не ложный policy PASS; его расчёт/история/завершение проверяются машиной.
Неопределённый cleanup, живой процесс, unknown receipt, failure или blocker запрещают
следующий запуск. JS/recovery требуют review; closed artifact review и финальный
отчёт выполняются параллельно следующему разрешённому CLI. Loginom/CLI-процессы
этого профиля остаются последовательными. Все допуски перед следующим процессом
синхронны; глубокий review закрытых immutable artifacts не блокирует обычный успех.

Экономия:12модельных процессов (28% от43), примерно1ч25мин при указанной средней
7мин5с на процесс; фактическая длительность зависит от новых запусков. Максимум
окон исполнения уменьшается21,5→15,5ч при прежнем deadline30мин; это не обещание
wall-clock срока. Повторных full/focused проверок неизменного runtime нет.


Checkpoint 2026-10-14 07:44 UTC — итоговый Export live gate подтверждён.
Новая серия `20261014T064745Z-367f4b`, runtime `21fcca85…`, Product source
`c5930ed689`: ordinary Import→Sort→Export без LLM действительно воспроизвёл
clipping (bottom804 при viewport800). Один own scroll0→82 и один guarded own
label click открыли native input0; mapping подтверждён. CSV27bytes точно равен
oracle; сохранённый пакет содержит3native nodes/2directed links/noJS. Root
Tool29560 terminalexit0; exact own package closed, logouttrue/noDiscard,
HostACKtrue/exit0/noSignal/noError, PID отсутствует и .writer отсутствует.
Результат `native-export-input-reveal-minimal-proof/run/result.json`
SHA `9d69a60568a661204720fb2ba91605dda89499f54b3543926ea9627707e715cf`;
независимое чтение948journal rows/CSV/LGP/receipts/закрытия —
`native-export-input-reveal-minimal-proof/independent-live-review.json`
SHA `1f437200b0fee528863a700dea49118adb45fa725c972ebdbe16454a8c0f6e62`.
Две ошибки подготовки offline parser-входа исправлены без повторного native
прогона; исходные run evidence не изменялись. Девять отдельных hit points не
эмитируются: unchanged ordinary guard/open прошёл; tooltip owner не заявляется.

Независимая проверка optimized31 завершена до моделей0:
`optimization-independent-review.json`
SHA `43d2662aa7b7c4f070895ee449869f807a6fc49b43f714898f5a5e88c10a40e0`.
Actual3args/31unique identities/9→6→16, все сохранённые prompts/paths совпадают;
семь новых optimized files0400, исходные43metadata сохранены. Candidate меняет
только firstWave order, baseline только attempts=[1]; resource/model/input/oracle
прежние. Нового model admission ещё нет. Fresh ordinary JS downstream запущен
один раз после Root source review4455source/36fixtures/20protected files;
его результат и independent auto-next review ещё ожидаются. Join/schema outcomes
050544 остаются историческими и дают confidence только для byte-identical
зависимостей; не засчитываются как fresh outcome064745.


Checkpoint 2026-10-14 07:51 UTC — последовательный auto-next готов.
Добавлены только `evals/script/run-node-selection-series.ts` и
`evals/test/node-selection-series.test.ts`; Runtime и single-attempt runner не
менялись. Driver исполняет фиксированные9→6→16, пишет dispatch до однократного
вызова runner, не повторяет начатый слот при re-entry. Следующий standard допускают
authoritative audit и exact own saved-package cleanup/resource/terminal/Host
close, временная привязка, отсутствие собственных PID и .writer. Неизвестный
receipt, ошибка или нарушение блокируют продолжение; JS/recovery/anomalies
останавливаются для review закрытых артефактов. Baseline JS учитывается как
policy failure старого skill, а не как PASS. Отдельный final review остаётся.
Независимый review выявил проверку auditor source только при старте; исправление
RED→GREEN добавило small evaluator closure в проверку перед каждым следующим
слотом. Новый payload/build и повтор full runtime checks не нужны.
Author119/119PASS/285expect, typecheck0; peer повторил только найденный regression
(1PASS). Final script SHA `5002026ee66b27083e6851fb419bc2ea5c4b9d047de289a07b92199e162ac9e4`,
test SHA `7b52c22f3ba5572ee3166ed03143d8f5b846c1e0d7e832aa5db9daa3b835c5f4`.
Author `series-driver-development/verification-review-fix.json` SHA
`3577ff3f7756d90ad9c37a1b3ccd15936974534aa2e3e447d8d02d258b12412d`;
peer `series-auto-next-proof/independent-review.json` SHA
`ed066c06ab2f4e687f890cb876918d84c64286e4d4079e26444c8d2b7e8b2738`.
Host receipt не содержит chatID: attribution требует эксклюзивного профиля,
единственной новой квитанции и её времени внутри собственной попытки.
Модельная серия пока не начиналась; activation — только через новый immutable
ready:true lock, не изменяющий исходные ready:false optimized/43-slot файлы.


Checkpoint 2026-10-14 07:54 UTC — matched runtime gates завершены,31-slot admission frozen.
Fresh ordinary JS→Group/Sort→Export прошёл на `21fcca85…`: Group A17/B21,
Sort B21/A11/A6, exactCSV27bytes, сохранены5nodes/4links. Исходный JS component,
code/declaredschema/socket равны до/после; native managed previews для двух
ветвей подтверждены. Публичные generic UI/raw browser tools отсутствуют;
pure validator на actual own captured port отказал, live UI receipt не заявляется.
Root43066terminalexit0; exact own package закрыт, logouttrue/noDiscard,
HostACKexit0/nosignal/noerror/PIDgone/.writerabsent. Result SHA
`61c80c0bafbc18e89db5ce04d73acf5bfa418b116333c6e00ae2aa2766b207a6`;
Root independent2195journal rows/full LGP parser/CSV/receipts/close review
`native-js-downstream-proof/independent-live-review.json` SHA
`be5e5edf1b856b4ae345fbad3404205f83a3332ab6ed4686a94dfa200ef85090`.
Два fresh prepare имеют текущие16cards/build7.4.2/digest; их knowledge совпадает
с историческим. Durable Join/schema dependency review SHA
`7528b629ab4bea52686204df7fff7e649f7ff4a856b9f5d09f163f0089303c33`:
из4397runtime files изменён только text-export;23конкретные shared/Join/schema
зависимости byte-equal. Исторические15fullschemas/Join outcomes не переносятся;
probe explicitLogoutfalse не повышается доtrue.

Новый `acceptance-lock-effective.json` mode0400/readytrue, SHA
`0770362667497e888718e996ed74a0d5c580ddca3dc4f230823f51749d921d06`,
создан до моделей0. Он связывает исходный optimized lock, immutable pins/matrix,
общий runtime source pin,74evaluator/task source files (включая новый script/test),
11gate/review receipts. Product sourcec593 и evaluator commit6c7cdb0bea разделены;
никакого payload rebuild из-за нового evaluator. Первые9 идут ABC/firstlast
первыми, baseline6 только после clean9, затем candidate16. Все исходные43/optimized
readyfalse artifacts сохранены; новое правило не применяется к старым попыткам.
На момент seal live acceptance model slots ещё0; итоговая приёмка31 и manual
reviews остаются открытыми. Первый planned ABC проверит actual auto-next lifecycle.


Checkpoint 2026-10-14 08:24 UTC — первая planned model попытка закрыта отказом.
Effective31 protocol SHA `07703626…` закреплён до first dispatch; ABC/1
`ses_ec697939effeRuzLucKmyqYLaK` исполнялся07:55:03.983→08:02:41.533UTC.
Модель/variant — frozen `openai/gpt-6-sol-fast`/medium. Five standard native
operations SUCCEEDED. Первый Join request.validate отказал из-за отсутствия
case_sensitive; corrected Join SUCCEEDED. Следующий Calculator abc-class-01
(node87755053…) вернул AMBIGUOUS/open/WIZARD_OPEN_NOT_CONFIRMED до execution.
CLI1/wrapper3, normal cleanupfalse; Save/package/CSV/oracle/audit/closure отсутствуют.
JS apply calls0, saved JS nodes неизвестны; policyincomplete, не PASS. Вызовы
inspect/resume/recover/cancel не подтвердили завершение исходной операции.
Runner автоматически halt, не допустил второго слота и не заменил failed attempt.
Planned31=6+25, started1 technicalfailure1, fullcalc successes0, notstarted30.
Immutable `series-stop.json` SHA
`e4876b16a02cd65f80af91321534290907b8ede3c0691f93739bb92fd30b5dc4`.

Own recovery завершён отдельно от model outcome. Пять точных native GUID в
server app.log связали user:172/latestInit07:55:19.648; fresh dispatcher row и
exact confirmation закрыли только её (server08:15:58.735). Два refresh подтвердили
absence, соседняя user:171 осталась. Own admin:173 logout08:18:20.440 подтверждён
server log и видимой login form; Playwright MCP page закрыта. CLI1293811 и
Host1294389 отсутствуют. Только собственный .writer с nonce586f6bb7… и исходными
inode7629293/7643038 архивирован в `.writer-recovered-node-selection-20261014T064745Z-367f4b-user172`.
История/evidence/pins/payload сохранены; discarded only own unsaved failed draft,
normal cleanupfalse исходного attempt не повышен доtrue. Recovery `final.json`
SHA `7919a2bc178521873b872cebea5309d69f1bf4d8a07f561d535bd99288f59c0f`;
post-recovery CLI status/check0, Helpready/Browserverified/.writerabsent, modelCalls0.

Независимый closed readback SHA `7ce3f6f2…`; forensic diagnosis SHA
`d2970bd91e5602e51f2a00e979cafafa83ac1e6f30b153070823ec13b2c61488`.
Доказан один адресованный begin_wizard click и native waits; catch workspace-ui
4162–4167 заменяет отказавший frame новым readUi. Поздний frame уже соответствует
own wizard, masks/dialogs0, поэтому конкретный false conjunct/foreign mask/задержка
не доказаны; stable/flaky неизвестно. Full/focused PASS и short Export/JS gates
не отменяются и без нового изменения не повторяются. Сопоставимого baseline
для новой серии0; сравнительный вывод ещё невозможен. Ожидаемая экономия85мин
относится к плановым12процессам, не включает непредвиденную диагностику/отказы.
Если подтверждённая правка меняет final runtime, нужна новая prospectively frozen
matched пара и31fresh slots; этот started failure остаётся историческим.


## Диагностика actual prethrow Calculator frame (2026-10-14 08:32 UTC)

Новый scope — только сохранение недостающего доказательства. Остановленная
серия064745/ABC1 и все immutable inputs остаются неизменными. Общая цель и
условия31-slot приёмки не сокращаются. Пользователь делегировал самостоятельное
решение блокеров; отдельного model retry/изменения Product сейчас нет.

Выбран private instrumented native запуск без LLM: оригинальный16735bytes CSV,
пять успешных standard requests (Import→Sort→Calculator и Group→Join), те же
метки/параметры/автоматическое размещение. Runtime воспроизведения — pinned
candidate21fcca85…; новые owner/doc/GUID берутся из собственных receipts, source
references переназначаются явно. Затем ровно исходный abc-class-01 Calculator
request; исходные runtime deadlines, clicks и guards сохраняются.

Private managed entry сохраняет неизменный resource verifier, createSession,
createBridge и close lifecycle. На существующем browser transport преобразует
ТОЛЬКО канонический serialized workspace-ui act frame для begin_wizard этого
целевого operation ID. Hash/точные unique anchors обязательны. Перед исходным
throw сохраняет уже прочитанные значения contextMatches/intendedWizard/
deactivationPending/ownedLoading, bounded masks/dialogs, intended owner/path,
prepared/current native identity/TID и epoch. Никакого нового readUi, browser call,
ожидания, жеста, DOM/CSS/native mutation или переопределения результата.
Capture failure остаётся отдельным diagnostic unknown, не меняет исходный отказ.
Поздний catch readUi хранится отдельно; маркер private и acceptanceEligiblefalse
явны в bindings/result. Frozen Product/payload/source файлы не патчатся.

Тест через реальный workspaceUiCapability/serialized browser fixture сначала
показывает, что прежний код теряет refused frame при позднем чтении; затем private
rewrite сохраняет его при том же AMBIGUOUS/code/click count. Отдельные negatives:
foreign/non-target frame не переписывать, anchor/hash drift отказ, success не
создаёт fake refusal, late snapshot не подменяет prethrow, bounded/unknown capture.
Не угадывать Product correction до actual capture.

Private artifacts: новый каталог `evals/results/node-selection-local/20261014T064745Z-367f4b/native-calculator-open-diagnostic`;
entry/rewrite/test/driver/bindings и private fixture projection. Author использует
TDD, source review независимый. Root один запускает `--run` после ready bindings,
idle profile/process checks. Никаких parallel CLI/Loginom attempts текущего профиля.
Отсутствие воспроизведения записывается как такой исход, не как fixed/PASS.
Unsaved state до целевого opening сохраняется; early Save меняет исходную модель
и не вводится. Если native close не подтверждён, Root адресно связывает и закрывает
только собственную server session, сохраняя evidence; чужие сессии не трогает.

Альтернатива Product diagnostic изменила бы final runtime/сборки ещё до причины;
она отложена. По actual frame — узкая доказанная TDD правка при необходимости,
её focused/full checks и ordinary live regression; затем новая matched31 series
с prospectively frozen protocol. Старый started failure в новую серию не входит.


### План private capture, после independent design approval

Design receipt `calculator-open-design-review.json` SHA
`8d781ceacd4c0801ec35a233aaf072f9456ea4b280371d2331f6a6f61c641ca3`:
обязательные boundaries совпадают с каноническим source; findings0. Пользовательская
автономия блокеров/параллельного исполнения сохраняется; Root владеет только live.

- [x] Реализовать private evidence-preservation через TDD в новом diagnostic
  каталоге. Первый behavioural RED выполняет canonical serialized workspace UI
  fixture: refusal frame отличается от позднего catch frame; прежний код теряет
  первый. GREEN сохраняет bounded первый frame отдельно при неизменных status,
  originalcode, evaluate/gesture counts. Success, incoming foreign/non-target,
  anchor/source drift, malformed/oversize/unknown и post-click foreign frame
  проверяются ровно по фактическим диагностическим boundaries.
  Owner author — private entry/rewrite/tests/proof.ts/bindings/fixtures; Product,
  payload, profile, audit/runner и original evidence16/source closure74 не менять.
- [x] Выполнить package-level targeted private tests на pinned Node24.19,
  entry syntax и `bun typecheck` из evals для private driver. Независимо проверить
  semantic diff, canonical frame/source/anchor pins, bounded same-frame inputs,
  собственный fresh artifact/source GUID remap и сохранность originals. Root
  закрепляет ready bindings отдельно; уже прошедший Product full/focused не
  повторять при неизменном Product.
- [x] Root выполнить один private native `--run` в текущем локальном Loginom:
  full originalCSV →5original successful standard requests →one targetopening.
  Нет LLM/нового modelslot/earlySave/retry. Сохранить raw RPC/journals/инструментацию
  exact prethrow и late frames, one-gesture semantics и strict own closure/PID
  evidence. Если закрытие не подтверждено — только адресное own admin recovery;
  остальные сессии/пакеты/guards не трогать. Результат capture / no-repro / unknown
  не является successful acceptance и не заменяет original ABC failure.
- [x] Прочитать actual frame независимо; установить exact false conjunct либо
  честно зафиксировать отсутствие необходимого доказательства. Лишь доказанная
  runtime correction идёт в TDD и ordinary gate; source/runtime change требует
  новой matched baseline/candidate пары и prospectively sealed31fresh modelslots.

Каждое `[ ]`→`[x]` — отдельный описательный commit с синхронными plan/spec updates.


Private capture TDD завершён: 8focusedPASS; source/predicate/gesture/evaluate
counts сохраняются. Ранний отказ и latecatch разделены; incoming discriminator,
source/frame/anchor drift, bounds/unknown и success-no-fake-refusal проверены.
Это evidence-preservation, не Product correction и не доказанный actualmask.
Authorverification SHA `dd7cd896979d90a516be13435642c9c977ca5e21ac908f1aa9b0dcd9bd22508c`.


Private capture проверки и independent source review завершены: 8focusedPASS,
typecheck0/syntax0. Peerвыявленный late-catch empty-snapshot reader дефект исправлен
RED→GREEN, повторен только regression1PASS. Source4454/fixture3/protected116,
original16/effective source74/runtime288×2 unchanged. Peer review SHA
`dcc68ae1479246a4195cc37e87a3776ac50bd5217d7a9a94dc24faf4710f96ac`;
readyfalse0400 binding SHA `28dbed938ced99d118e3a5ada76e85a2a9eccf3902ceac7597abeca882740fcd`.
Fresh live ещё не начинался; Rootactivation отдельна, acceptanceEligibilityfalse.

Checkpoint 2026-10-14 09:00 UTC — один private Calculator replay завершён без воспроизведения.
В текущем локальном Loginom, без LLM, выполнены шесть исходных standard requests
на полном CSV16735bytes. Целевой abc-class-01 применён ровно один раз и SUCCEEDED.
Единственный begin_wizard frame инструментирован; отказа нет, prethrow captures0.
Нового Product исправления и нового acceptance/model PASS это не доказывает.
Original failed ABC/1, stopped31 protocol и его 30 незапущенных слотов сохранены.

Save выполнен только после target success. Собственный package
/user/CalcOpen-79afafd3c14845ea88cec9ca240116fd.lgp закрыт без discard, logouttrue;
session17ea0dc4…/docda5c9daf… связаны с cleanup receipt. Host1423892 ACKtrue/exit0,
noSignal/noError; result cleanupConfirmedtrue. Результат
native-calculator-open-diagnostic/run/result.json SHA
`1c2960985ac890360762adab344cc434b084012d4cc64e06f44cc5bc3640337a`.
Независимый readback2290rows/48receipts/6requests/onegesture/Save/strictclose:
`native-calculator-open-diagnostic/independent-closed-live-readback.json` SHA
`6d627d3b8bff72a6d2b89a6b04584e9a677728123da1127729e3ffc0536b9bcc`.
PID действительно отсутствует, .writer отсутствует; originals16/source74/4454
и stopped/effective locks неизменны. Live-диагностика не входит в31модельный слот;
завершённые runtime checks и Export/JS regression gates не повторялись.

Независимое чтение закрыто с явным unknown для причины original refusal:
prethrow frame отсутствует, потому что private target SUCCEEDED. Его штатное
ожидание own WizrdMCF mask431ms успешно; это не доказывает owner/mask/context
исходного отказа. Верхнеуровневая задача получения actual refused frame остаётся
открытой; Product fix, новая matched пара и model dispatch пока не допускаются.
Ни тесты неизменного кода, ни модельная попытка повторно не запускались.

## Ограниченная диагностика межоперационного интервала (2026-10-14 09:20 UTC)

Закрытый private NO-REPRO не разрешает новую модельную серию. Фактическое
различие original и private: Join completed → Calculator prepared5029ms и19ms;
исходный public node_wait end → node_apply start4978ms. Обе операции до begin_wizard
выполнили ту же последовательность steps1–30. Original отказ на656ms не содержит
actual prethrow frame; успешный private дождался own wizard mask431ms и opening
подтверждён на1044ms. Ни интервал, ни mask не объявляются причиной original failure.

Независимый timing readback SHA
`0867b8bc6f3bd8256b106a86f1762dbfb7b7a785e77a73326e9caa73de782ef0`.
Все6 request projections/geometry/topology равны; Help/schema/read до импорта,
других tools между Join/target нет. Join-01 отказал без browser effect.
Предыдущие интервалы/длительности также различались; admission→begin_wizard
14063/12999ms. Новый run проверяет только один фактор и не воспроизводит всю
временную последовательность; NO-REPRO не исключает timing sensitivity.

Выбран один дополнительный private запуск без LLM с единственным различающим
фактором: внешний idle5029ms после собственного Join SUCCEEDED перед target apply.
Это приближение observed interoperation timing; фактический новый gap измеряется
по journal, а не заявляется точно равным исходному. Internal deadlines/readUi/
masks waits/guards/one-gesture opening не меняются. Более широкое изменение
Product diagnostic пока не обосновано; повтор модели не допускается протоколом.

Новый отдельный каталог native-calculator-open-paced-diagnostic сохраняет
original/private evidence, pins и frozen stop/lock. Input/case/entry/rewriter —
byte-equal проверенным файлам. Меняются только private driver и внешний pacing gate;
source bindings создаются заново, ready:false до checks/review, затем Root activation.
Six requests/autoPlacement/fresh owner-GUID remap, один target/noearlySave,
Save только после targetSUCCESS и strict own cleanup остаются прежними. Refusal
сохраняет same-frame capture; неизвестное close требует только exact own recovery.
Никаких parallel Loginom/CLI процессов текущего профиля и acceptance credit.

TDD проверяет наблюдаемое поведение gate на реальном таймере: target callback не
допущен до recorded delay и вызывается один раз; non-target не задерживается;
ошибочный timing не вызывает apply. Не добавлять timer mocks/global substitutions
или универсальную framework-конфигурацию. Повторяются только новые/затронутые
private tests, syntax/typecheck; unchanged Product/full/focused и старый private
rewriter suite не повторяются. Независимый design/source review обязателен.
После одного run: capture → установление actual predicate; NO-REPRO → unknown,
без автоматического третьего диагностического запуска или model retry.

- [x] После independent design review минимально реализовать и проверить внешний
  pacing gate по TDD; новый immutable binding и independent source review.
- [x] Root выполнить один paced private native run, сохранить actual timing,
  same-frame capture/no-repro/unknown и exact own close.
- [x] Независимо прочитать закрытый результат и определить следующий шаг только
  по фактическим данным, сохранив исходный failed slot и условия приёмки31.

Paced private подготовка завершена: helper11lines,3focusedPASS (реальный таймер
~5035ms), typecheck0/syntax0; поведенческие RED→GREEN сохранены. Seven reused files
byte-equal; runtime288×2/source4456/fixture3/protected2181 (включая predecessor2064)
сохранены. Product и общие runner не менялись, live ещё не начинался.
Design approval SHA `4942cab18e477a235ab8ef38fcf3f37aec64b9f4bb81653f8289dd7f32e1387f`;
verification SHA `cba0b045dfbb8e648445f7e3af60d6447e3c8c303a1a0056c9bdeb7dd7de3d22`;
independent source review SHA `831fb8ec460d4ff599b3da68f8ffde828d5a1da690672bc188282a05f2215a5f`.
Readyfalse0400 binding SHA `7228e6f484f87d107bbfb310c69252702a108903053c2e25a11e72efddbfbd87`.
Раннее пробуждение таймера fail-closed до target; не вводить дополнительное
ожидание/повтор для подгонки результата. Root activation/one live остаются отдельно.

Checkpoint 2026-10-14 09:48 UTC — paced private запуск закрыт, отказ не воспроизведён.
Root31151 terminal0. Все6standard requests SUCCEEDED; one target/noearlySave,
Save после target success, prethrow0. Внешний idle5031.161708ms, фактический
Join completed09:44:46.993 → target prepared09:44:52.049 =5056ms (не5029).
Result native-calculator-open-paced-diagnostic/run/result.json SHA
`fa7991698ec1e5667eb9346398d7896acba165371d2485a1d7658d963c277eec`.
Own session8790350c…/doc01be2ced…/package CalcOpen-972538d7… закрыты,
logouttrue/noDiscard, Host1496283 ACKexit0/noSignal/noError; PID и .writer отсутствуют.
Root conservation подтвердил source4456/fixture3/protected2181 без изменений,
включая original16/effective74/previous closed private2064. Product не исправлялся.

Интервал проверен как один фактор; причина прежнего отказа остаётся unknown.
Третий private diagnostic и model retry автоматически не разрешены. Текущая
серия31 остаётся stopped: model started1/technicalfailed1/notstarted30/baseline0;
оба private NO-REPRO не являются успешной приёмкой или заменой failed slot.
Parallel current progress readback SHA
`7cb9659dd26161dcd22b9b885c5fa0f90e74a984d4a7146ddd703aa9c2ca1b33`
подтвердил frozen до first dispatch31=6+25, все25candidate coverage/order,
completed gates/build/tests без rerun и ограниченность baseline comparison.
85мин экономии — оценка12плановых модельных процессов, без диагностики/отказов.

Independent closed paced readback SHA
`70f70d56e4b283188bbc802ae2e190ac55fb829d82f22e7a60ebabcac56a27cf`:
48receipts/2296rows/6requests/onegesture, exact timing/ownclose/PIDgone/.writerabsent,
protected2181/effective74 unchanged. Causeunknown; no native/model acceptance.
Новое ограничение владельца требует отменить branch standard-node production
changes до исходной базы; дальнейшие standard fixes/diagnostic loops здесь запрещены.

## Действующее ограничение области и новый протокол (владелец, 2026-10-14)

Этот раздел имеет приоритет над прежними заданиями исправлять standard runtime
и gate clean9. Новые правила применяются только к новой сборке/серии, до её
первого model dispatch; старые frozen locks/outcomes не переписываются.
Источник — полный запрос владельца в attachment80e0c1d9 от2026-10-14.

Исходная база всей текущей rebased node-javascript —
`38ee045e79720d363a35666484f17804162b55a1`: merge-base с loginom, parent первого
коммита2f28591b69, reflog rebase onto38ee и programming-javascript/rebase-checkpoint.md.
Историческая pre-rebase a8ad59766… не применяется: она откатила бы upstreamloginom.
849cc844ea — checkpoint skill, а не база ветки. Карта40mixed/standard production
libfiles и99changed inventory SHA
`bb5c82be6d53e7bc19ca2a282e702ee0931e24b92e15cbdf4da01fea1dc49dad`.

В этой ветке запрещено менять обработчики production Import, Group, Sort,
Join, Calculator, Export и любых других стандартных узлов. Их код возвращается
к38ee, включая дату импорта, Group/Sort preflight после JS и специальную логику
распознавания/scroll/label внутри Export. Новые исправления этих узлов ради eval
запрещены.

Уточнение владельца после attachment80e0c1d9: запрет относится к самим узлам,
а не к общему коду портов, мастеров и таблиц вывода, необходимому JavaScript.
Такие общие доработки сохраняются с конкретным JS caller/test/live evidence;
требование возвращать все shared paths к38ee отменено. Общая инфраструктура
JS registration/lifecycle/source/context, Host/bridge/budgets и необходимая
eval-инфраструктура сохраняются. Самостоятельные изменения общих процедур,
сделанные только ради стандартных узлов и не нужные JS, не получают этого
исключения. Итоговый diff проверяется по назначению каждого mixed hunk.

Сохраняются собственно JavaScript,2skill files и необходимая eval-инфраструктура.
Откат — обычный обозримый commit, без reset/history/evidence/userfile deletion.
Все собственные live процессы завершены; последний31151/Host1496283 закрыт,
logout/ACK0/PIDgone/.writerabsent независимо подтверждены70f70d56….
Чужие процессы/сессии/незавершённые изменения не трогать. Нового live пока нет.

Новая основная матрица31=6baseline+25candidate неизменна:18standard/3explicitJS/
3tags/1recovery; порядок первых9 ABC→firstlast→sales→monthly→claims→ROI→explicit→
tags→recovery, затем baseline6 и remaining16. Первые9 должны быть исполнены,
исходы сохранены/разобраны, все разрешённые continuation подтверждены; требование
всех9functionalPASS отменено для новой серии. Плановые attempts2/3 сохраняются
отдельными исходами; не перезапускать уже dispatch/admitted слот и не заменятьfailure.

Технический отказ сохраняется в отчёте/знаменателе и не становится PASS.
После strict own session close, dead CLI/Host и свободного профиля допускается
следующий другой слот. Успешный standard идёт автоматически по прежним обязательным
oracle/graph/policy/history/closure checks. Technical путь отдельный: complete
own history, отсутствие подтверждённого policy violation, классификация/review,
normal exactclose либо bound manual recovery; свежий idle gate перед dispatch.
Manual recovery не меняет attempt.cleanupConfirmedfalse/CLIcode/oracle/policyincomplete
и не подделывает нормальный closure, Save, graph или HostACK0. Недостоверная история,
unknown close/PID/.writer запрещают автоматическое продолжение до проверки.
Подтверждённый candidateJS-policy violation имеет приоритет и останавливает digest.
Неверный аналитический результат нельзя автоматически назвать runtime technicalfailure.

Ошибки standard nodes не разрешают JS fallback. В этой ветке их не исправлять:
blocker с evidence, существующая диагностика плюс максимум1необходимый новый
дополнительный прогон, затем доступные сценарии. Старые Calculator no-repro уже
подготовлены; новых циклов diagnostics/fixes здесь нет.

Альтернативы — только заранее записанные coverage mapping+independent oracle,
отдельные IDs/attempts/знаменатель и независимый review. Исходный failed scenario
остаётся failed. Для ABC нужны accumulatedsum/statisticalsum/conditionalclass;
одна Group не заменяет это покрытие. Alternative не включать в основные31.

После production rollback нужна новая matched baseline/candidate пара с одинаковыми
итоговыми runtime/model/parameters/input и skill-only различиями. Old21fcca и все
прежние results исторические; gates/checks на нём не выдаются за gate новогоruntime.
Проверять только изменённое и необходимые JS/regression/scope boundaries. Код
изменять по TDD, rollback подтверждать base-diff и независимым review. Никаких
Clientgenerate без publicProtocol/HttpApi изменения.

Отчёт разделяет policy compliance, analytical correctness и runtime reliability;
при technical failures полную приёмку не объявлять. Отдельное подтверждение —
все запрещённые production deltas отменены, новых standard changes нет.

- [x] Отменить изменения обработчиков стандартных узлов относительно38ee;
  сохранить JavaScript, необходимые общие порты/мастера/таблицы и skill/eval.
  Независимо подтверждены15nonJSfamilies/127productionfiles exactbase;
  сохранены58JSfiles,18sharedJSdependencies и21Core/Host/runtime/CLIfiles.
  Group/Sort-only postJS helper/API удалены; новые standard fixes запрещены.
- [x] Независимо проверить итоговый scope diff и необходимые changed-code/JS
  проверки:2154PASS/0FAIL/0SKIP,127standardproduction exactbase и JS dependencies
  сохранены. Rollback сохранён обычным commit d445c8ea65; повторных неизменных
  Host/runtime checks не было. Это source gate, а не live-приёмка.
- [x] По TDD добавить отдельный technical continuation/recovery/history path
  в eval, без ослабления success path и без изменения failed outcomes. Проверено:
  44PASS/144assertions, typecheck0 и независимый source review revision2;
  оба реальных cleanup receipts строго связаны с filename/policy/own Save.
  Live-подтверждение нового протокола остаётся частью новой серии.
- [x] Собрать новую matched пару112452 изfdc4ac455e; до firstmodel закреплены
  immutable31/rules/76source/ownership pins и независимые pair/protocol/native
  readbacks. Runtime659588… общий; clippedExportCSV/LGP/strictownclose прошли
  свежий live без модели. Старые results не перенесены; models0 при freeze.
- [ ] Выполнить все31исходных слотов последовательно; success auto-next,
  technical после verified release продолжает; policy violation останавливает.
- [ ] При blockedcoverage заранее закрепить обоснованную alternative с oracle,
  проверить отдельно и сохранить оригинальный failure; не объявлять удобную замену.
- [ ] Подготовить итоговый трёхосевой отчёт с scope/base evidence и ограничениями.

## Действующее уточнение владельца: восстановить разрешённые исправления (2026-10-14)

Владелец после предыдущего уточнения явно разрешил вернуть отдельные ранее
выполненные исправления Import, Join и Export, затем Калькулятора, Group и Sort,
а также javascript-output-preview.mjs и его подключение. Этот раздел заменяет
запрет восстановления перечисленных изменений из предыдущего раздела.

Восстанавливаются проверенные изменения из15e2f43c5d: дата/формат Import,
специальная видимость входов Join/Export, открытие/scroll/label Export,
Calculator wizard check, Group/Sort preflight после JS, общий openJavascriptPreview
и его helper/test. Это точное возвращение существующего кода и соответствующих
тестов, без новых произвольных правок стандартных обработчиков. Остальные
неразрешённые изменения стандартных узлов остаются на исходной базе38ee;
Variant-reader не включён в разрешение и остаётся отменённым. Общие зависимости
JavaScript и необходимая eval-инфраструктура сохранены.

Правило skill не меняется: standard-first; ошибка стандартного узла не позволяет
JS fallback, допускаются только explicit JS или подтверждённый функциональный
пробел. Technicalcontinuation сохраняет failure и требует strict own release;
подтверждённый candidate policy violation останавливает серию. Матрица31 и
ограничение сравнения baseline1×6 сохраняются.

Пара105540 на rollback runtimeb85167 остаётся исторической, models0. Единственный
short Import→Sort→Export воспроизвёл clipped input: bottom804>viewport800,
scroll0/max82, no interactionpoint; Import/Sort succeeded, Export AMBIGUOUS
input_mapping до execution. Нет CSV/Save/LGP; normalcleanupfalse/HostACKfalseexit1
не повышаются доPASS. Sessionuser177 адресно закрыта изadmin178, logout admin
и browser pageclose выполнены; независимый ownrelease review pending.
После разрешённого восстановления нужна новая matched пара и новый prospective
lock до firstmodel. Старые failure, pins, drafts и review остаются неизменными.

- [x] Восстановить15разрешённых runtime/test путей exact15e2f43c5d, включая
  JS→Group/Sort helper и его hook; Variant/base и чужие файлы сохранены.
  Existing Export regression RED→GREEN; targeted15suites713PASS/0FAIL/0SKIP,
  собственные процессы завершены. Полная live-приёмка этим не подтверждается.
- [x] Независимо проверить разрешённый diff и targeted restoration regressions:
  все15paths exact15e;289physical clientlibfiles — только Variant/base отличается;
  713PASS/0FAIL/0SKIP, scope review659917e995… findings0. Failure/ownrelease
  оформлены в отчёте; восстановление сохранено обычным commit d3cd4e46f9.

Новые matched build/pins/live31 и итоговый трёхосевой отчёт остаются открытыми
задачами основного протокола. При technical failures полная приёмка не заявляется.

Checkpoint 2026-10-14 11:47 UTC — новая модельная серия112452 фактически запущена.
Effective31lock834620b93866078023dd988c283fcf9ddbc1651158503cbcf8c072458d79b3c0
закреплён доdispatch11:44:00.194; current-run переведён на112452 послеadmission.
ABC/1 candidate Session ses_ec5c5d610ffebZFU1G7WFWq9aV, CLI1760120 подтверждёнlive;
Rootseriesexec2562 и series.active process live. Started1/closed0/accepted0,
никакой provisional exit3/incomplete не считаетсяотказом. Typed imports.text
выполняется, модельgpt-6-sol-fast/medium; следующие слоты через existing sequential
runnerпослеобязательныхgates. Source/pins/payload/modelparams frozen, старыеoutcomes0credit.
Next: pollsamehandle/CLI; не перезапускатьadmittedslot приobservationtimeout.

Checkpoint 2026-10-14 12:06 UTC — ABC/1 завершена техническим отказом.
CLI1760120/Host1760811 завершены, attemptCLI1/normalcleanupfalse/wrapper3;
modelseriesexec2562 terminal1, ledger halt SELECTION_CLEANUP_UNCONFIRMED.
История96parts/26messages/81events complete+identityverified,2275runtime rows
bound; JS calls0/JS nodesunknown/policyincomplete, безSave/CSV/LGP/oracle.
Три узла Import/Sort/cumulativeCalculator SUCCEEDED; classCalculator
abc-class-001 AMBIGUOUS/open/WIZARD_OPEN_NOT_CONFIRMED, executionnotrequested.
Причина UI не установлена, новые diagnostic/fix loops не запускаются.
Started1/closed1/technicalfailed1/accepted0/notstarted30, baseline0.
Own backenduser181 связан exact3successfulGUID/latestinit11:44:23.150;
закрыт изownadmin18211:57:57.634/.669, neighbor180 untouched. Adminlogout
11:58:48.757/loginUI; soleownbrowser actualCDP6processIDs завершеныBrowser.close.
Свой guard nonce/hash fcbed76… архивированsameinode/mtime12:00:44, .writerabsent;
история/evidence/modeloutcomes/pins неизменны. Technicaldescriptor584fb11e…
0400 связывает17original+14recovery; independent release review pending.
Дальше — pure continuation gate и first-last-touch/1, еслиindepreviewapproved;
ABC1неповторятьиfailureнеподменять. Initialplaceholderexitнеиспользуетсякакoutcome.

Checkpoint 2026-10-14 12:13 UTC — own release ABC/1 подтверждён, серия продолжена.
Independent review b6d76b1516bd409862c976965c6cc66933e3c961eeead4da336d66f32b19b793
связывает descriptor584fb11e…; подробный read-back f204c447… подтвердил17original+
14recovery, exactuser181close/admin182logout, neighbor180 untouched,8actualPIDgone,
архив собственного guard с прежними nonce/inode/mtime и отсутствие .writer.
Сохранены исходные normalcleanup=false/HostACKfalse/exit1 и неуспешный outcome.
Root pure runSeriesSlot gate: advance/TECHNICAL_FAILURE_RECORDED, technical-failed,
policy=incomplete/calculation=false/JS calls0/JS nodesunknown. Новый ledger record
12:12:02.032Z rechecked=true; это read-only assessment, не повтор модели ABC.
Existing sequential runner возобновлён с теми же lock834620…/pins/runtime/model/inputs;
root-series-resume-1-command.json и отдельный журнал сохраняют точный запуск.
First-last-touch/1 admitted12:12:02.040Z, CLI1857207 started12:12:10.959Z,
Session ses_ec5ac2d8fffe15FRObifENEobd. Initial attempt exit3/modelStartednull —
рабочий placeholder до terminal, не результат. Started2/closed1/technicalfailed1/
accepted0/notstarted29/baseline0. Следующая попытка допускается только после
обязательных machine gates; никаких параллельных профильных CLI/Loginom-сессий.
Закрытые evidence и отчёт разбираются параллельно текущей модели.

Checkpoint 2026-10-14 12:25 UTC — first-last-touch/1 закрыт, machine PASS/review pending.
Attempt finished12:23:07.498Z, CLI1857207exit0/normalcleanup=true; Host1857900
closed_ack=true/exit0/noSignal/noError12:23:05.615Z. Обе ownPIDgone, .writerabsent.
CSV d4a002e1… совпал с oracle b1506490…; пакет2515144f… сохранён action save-1.
Audit7f444963… complete: policy/oracle/calculation/history/runtime/identity/graph/
export=true, failures=[], JS calls/nodes/successfulcalls0. Closure.historyAnomaly=true;
runnerexec88234 terminalexit2/ledger12:23:07.698Z MANUAL_REVIEW_REQUIRED.
Ошибки export-1..3 и успешныйexport-4 должны быть разобраны по полным tool outputs,
сохранённому графу и runtime; независимое семантическое ревью branch_base pending.
Исходный machine audit сохранён0400 в series/candidate-first-last-touch-1/
selection-audit-before-manual-review.json; исходные attempt/history/closure неизменны.
Модель не повторяется; следующий слот запрещён до manual gate. Started2/closed2/
technicalfailed1/machinepassed1/accepted0/notstarted29/baseline0.

Отдельно подготовлен offline alternative-coverage-draft/proposal.json16cb1c47…:
mini-ABC с6строками и независимым Decimal oracle, оба порога0.8/0.95 и3класса;
Import→Sort→ONE Calculator(CumulativeSum+Stat+inlineIF)→Group→Sort→Export.
Это убирает второй classCalculator, общий wizard остаётся; livePASS не утверждается.
Исходный200-row business oracle также независимо пересчитан. Драфт не запускается
сейчас, не меняет31матрицу/denominator и не заменяет failedABC1; при отдельном запуске
покрытие/ожидаемыйрезультат/параметры будут закреплены заранее.

Checkpoint 2026-10-14 12:30 UTC — first-last-touch/1 принят; sales/1 реально запущен.
Independent wx graph-review7a26ab3ffb9983faf129de32ec0ea78246b67795ab931207b1016511b18491b0
passed, details92740b6f…, oracleb1506490…: независимый Decimal-пересчёт500строк,
все25ячеек/5каналов и64случая touchpoint_2=None при заполненномtouchpoint_3.
Импорт ValueNull=None и IsNull в Calculator согласованы; обе Count/Sum Group,
Join, переименование, Sort и Export подтверждены XML/receipts. Все8businessnodes
необходимы и связаны8links,0JS, только1Export. Export-1..3 terminalNOT_APPLIED
лежит вstate.error при пустомoutput (truncatedparts0/tooloutputs=[]), node=null,
executionnotrequested/effectfalse/cleanuptrue;9before/afterграфов структурноравны.
Export-4 создал единственный CSV361B/d4a002e1…. Все11nodeoperations terminalcleanuptrue;
ни orphan узлов, ни незавершённого reconciliation.35originalprotectedfiles unchanged.
Root refresh толькоselection-audit: diff ровно reviewStatus not-required→passed,
новыйaudit eb932217365c50472caa030421bb6ab022b142aac40d5f44c7122a7ec19dca22,
original7f444…0400 сохранён. Pure gate advance/null, savedroot-post-review-gate.json0400.
Runner resume2 с теми же lock834620…/pins/runtime/model/inputs; ledgerrecheck12:29:58
сохраняет ABC technical-failed, firstlast advance. Sales-by-category/1 admitted
12:29:58.383Z, CLI1931252 started12:30:09.794Z, Session ses_ec59bb705ffeER56yPWSw7JG1h;
exec36709/runner1930475 active. Новых моделей дляfirstlast/ABC не было.
Started3/closed2/technicalfailed1/accepted1/notstarted28/baseline0.
Current coverage — успешный standalone exportgate и один автономный standard
firstlastcase; ABC blocked. Сравнение skill ещё невозможно; полнаяприёмка открыта.
Report amendments ae428436…/2dc1917b… подготовлены параллельно, старый skeleton сохранён.
Новых правок производственных обработчиков стандартных узлов не внесено.

Checkpoint 2026-10-14 12:40 UTC — sales/1 принят автоматически; monthly/1 running.
Sales CLI1931252exit0/normalcleanuptrue/finished12:36:04.794Z; CLI354.077с,
wrapper366.408с. Audit7f783432… complete policy/oracle/calculation/history/runtime/
identity/graph/export PASS, JS0/failures[]/reviewnotrequired/historyAnomalyfalse.
SavedLGP5e83a6a9…/oracleba7e5d7f…; Host1931579ACKtrue/exit0/noError/noSignal,
ledger12:36:04.913Zadvance. Все обязательные release gates прошли вrunner.
Sameexec36709 автоматически начал monthly-demand/1, CLI1945851 started
12:36:14.690Z, Session ses_ec5962735ffeyM1A97EXc2G6y6; живойPID подтверждён.
Импорт дат settledSUCCEEDED; месяц извлекает стандартныйtransform.date_time.
Reportamendment003/e2edbba1… подготовлен параллельно; oracle/модель не повторялись.
Started4/closed3/accepted2/technicalfailed1/notstarted27/baseline0; сравнительный
вывод и полная приёмка пока невозможны. Runtime/skill/source/pins/lock неизменны.

Checkpoint 2026-10-14 12:47 UTC — monthly/1 принят автоматически, claims/1 running.
Monthly finished12:45:43.761Z, CLI1945851exit0/normalcleanuptrue/Host1946051ACKexit0/
noError/noSignal. Audit7b2da041… complete, failures[], policy/calculation/oracle/
history/runtime/identity/graph/export PASS,0JS, historyAnomalyfalse/reviewnotrequired.
LGP128b7d80…/oracle16e62d64…; graph использует standard Import Date/time Group
Reform Sort Export. Ledger12:45:44.026Zadvance, следующие mandatorygates прошли.
Sameexec36709 автоматически admitted risky-approved-claims/1 started12:45:44.032Z,
CLI1967137 started12:45:53.007Z, Session ses_ec58d52b0ffesM1zyvCNz7sATr;
PIDalive подтверждён. Source/runtime/skill/lock/pins/model/inputs неизменны.
Started5/closed4/accepted3/technicalfailed1/notstarted26/baseline0; полный25candidate
и6baseline всё ещё обязательны. Main31 task остаётся незавершённой.
Закрытыеreport amendments готовятся параллельно без повторных oracle/live/model/tests.
ТехническийABCотказ/denominator сохранён; полнаяприёмка и сравнение не утверждаются.

Checkpoint 2026-10-14 12:55 UTC — claims/1 machine PASS, обязательное review pending.
Attempt12:53:25.366Z CLI1967137exit0/normalcleanuptrue/0JS; audit0bb6b13f… complete
policy/calculation/oracle/history/runtime/identity/graph/export=true/failures[]/
reviewnotrequired. SavedLGPc30350d7…/oracleaaa80edf…;72filteredclaims/4policyrows.
Closure.historyAnomalytrue: первичная настройкаfilter-approved-highfraud-1 и исправление
filter-approved-highfraud-2 требуют независимого семантического/эффектного ревью.
Runnerexec36709 terminalexit2, ledger12:53:25.530Z MANUAL_REVIEW_REQUIRED.
Originalmachineaudit0400 сохранён вslot/selection-audit-before-manual-review.json;
Rootreleaseobservation12:54:48: CLI1967137/Host1967501 absent/.writerabsent/.activeabsent.
Host closed_acktrue/exit0/noSignal/noError. Branch_base ownsmanualreview толькоclosed
artifacts; reportготовитсяпараллельно. Доgraph-review+auditrefresh+puregate accepted3.
Started5/closed5/technicalfailed1/pendingreview1/notstarted26/baseline0.
Истории/исходныеevidence/pins/lock/модель/runtime не менялись; повторовmodelsнет.

Checkpoint 2026-10-14 12:59 UTC — claims/1 independent PASS, ROI/1 live.
Wx graph-review674b63693a3849e26e11b84d1a157279b795e0c882135ac825f9523125bcb751
passed; detailscb76fd8d…/independentDecimaloracle468237ac… подтверждают400→72,
все20ячеек/4строки, maxerror3E-10. Отказfilter1=request.validate NOT_APPLIED/
effectfalse/cleanuptrue доruntimeadmission из-за label сзапрещённым«>»; filter2
убралтолькоlabel, обаусловия сохранены. Первый runtimebaseline — Import+Variables,
безраннегоFilter/orphan/reconciliation; LGP5businessnodes/4links/единственныеFilter
иExport/0JS. Export304B receiptlinked.35protectedoriginalfiles unchanged.
Во входе нетровно0.8/alternate-caseApproved: строгийfrtGreater0.8/CaseSensitive=true
подтвержденыXML, новогоboundaryliveтеста не было. Ограничение остаётсявотчёте.
Rootauditrefresh exit0: единственнаяразница reviewStatus not-required→passed,
новыйSHA70408e2fd37181b6f123eb9bc35c1ed170daea832ac2d79b7a3b08eeee765e20,
original0bb6…0400сохранён. Rootpuregate advance/null,0400binding saved.
Same frozen31series resume3/exec45876/runner1992739; ledgerclaimsadvance12:58:24.593Z.
ROI/1 admitted12:58:24.601Z/CLI1993214start12:58:34.419Z,
Session ses_ec581b16affet18cuk4byCEIIz, actualPIDalive. Всеsource/pins/runtime/skill/
model/inputs/lock прежние, моделипервых5слотовнеповторялись.
Started6/closed5/accepted4/technicalfailed1/notstarted25/baseline0.
Reportamendment005/cd5b8785… сохраняетinitialreviewhold; последующеерешение отдельно.
Main31/полнаяприёмка/сравнение остаютсяоткрытыми; новыхправокstandardruntimeнет.

Checkpoint 2026-10-14 13:16 UTC — ROI/1 failed; actualown recovery completed/review pending.
CLI1993214exit1/normalcleanupfalse, finished13:03:19.978Z; exec45876 terminalexit1,
ledger13:03:19.979Z SELECTION_CLEANUP_UNCONFIRMED. Host1993544 soleactualsource5588dbbc…
ACKfalse/exit1/LOGINOM_RUNTIME_CLEANUP_FAILED preserved; PIDgone. Snapshot74parts/19messages,
JS0/noLGP/noCSV/calculationfalse/policyincomplete; Import6c5f107e…/Group79c88dda…
SUCCEEDED. calculate-roi-01 node95ef7c78… AMBIGUOUS/open/WIZARD_OPEN_NOT_CONFIRMED,
executionnotrequested. НаблюдаемыйкодкакABC, underlyingUIcauseunknown; новыхdiag/fixloopsнет.
Independentpre-reviewee45412d… approved exactownbinding: backenduser192latestinit
12:58:50.403 внутриCLIinterval/2actualGUIDs/doc61fe9498…/Docka22383f4… совпадают.
UIexactownconfirmation192 идваrefresh подтвердилизавершение; serverclosed13:10:36.888.
Соседние189/191 untouched. Ownadmin193created13:06:31.167/logout13:11:22.629/loginUI;
единственныйadminbrowseractualCDP6IDs2006903/2006973/2006974/2006939/2006941/2006943
завершёнBrowser.close; direct/proc подтверждаетall6+CLI+Hostgone13:11:56.785.
Exactown.writer nonceSHA bcccb8…/dir7752449/owner7752450/mtimeMs1791982714439.0408
архивированrename13:13:03.299 в .writer-recovered-node-selection-20261014T112452Z-5e223f-user192;
original/archivedSHA/inodes/mtime unchanged/sourceabsent. История/evidence/pkgsсохранены.
Descriptor45b24645844c1cb19190d8305a26408506e79974e98ce25ae7fc6582327fbe3f0400
binds17original+14sealedrecovery; preparedByRoot/technicalfailure, безPASSилиreplacement.
Finalindependentrelease review pending, затемpuregate→explicit-js/1 еслиapproved.
Started6/closed6/accepted4/technicalfailed2/notstarted25/baseline0. Source/pins/lock/skill/
model/runtime/inputs unchanged. Main31/сравнение/полнаяприёмка всёещёopen.

Checkpoint 2026-10-14 13:20 UTC — ROI releaseapproved; explicit-js/1 running.
Wx0400review b7bcbbe3c40423f4f2343df0e8c2e4115a2e31e8a4ed94818fc599ea07b5d84d
bindsdescriptor45b246…; readbackf9309a22… подтвердил17original+14recovery400,
latestown192init/2GUIDs/close13:10:36.888, ownadmin193logout13:11:22.629/loginUI,
8actualPIDgone/Nodeexactguardarchive/.writerabsent. SavedUIпослеsecondrefresh
подтверждаетownabsence; count2operator-attested, отдельногоfirstrefreshsnapshotнет.
Logdeltaавтотаймаутuser18713:06:14.560 предшествуетadmininit, неRootaction;
соседние189/191 неизменны. FailedACKfalse/exit1 и noLGP/CSV outcomes preserved.
Rootactualpuregate: advance/TECHNICAL_FAILURE_RECORDED/technical-failed,
policyincomplete/calculationfalse/JS calls0/JS nodesunknown;0400gate saved.
Same lock834620…/runtime659588…/model+variant/pins/inputs/source, resume4exec88693/
runner2028835 started13:18:18.436Z. LedgerROIrecheck13:18:20.011Z retainsfailedoutcome.
Explicit-js/1 admitted13:18:20.020Z/CLI2029431start13:18:30.928Z,
Session ses_ec56f7346ffeJ6vqFRxuwxRb4o/PIDalive. Прошлые6моделейнеповторялись.
Started7/closed6/accepted4/technicalfailed2/notstarted24/baseline0. Всеexceptions
требуютmachine+manualreview; followingtags/recovery и вся31matrix ещёобязательны.
Reportamendment007/3ce588fa… подготовленпараллельно, сохраняетrecoverychronology.
Main31/сравнение/полнаяприёмка open; новыхstandardnodefixes/diagnosticloopsнет.

Checkpoint 2026-10-14 13:26 UTC — explicitJS/1 machinePASS/manualreviewpending.
Attemptfinished13:23:42.052Z/CLI2029431exit0/normalcleanuptrue/wrapper2(reviewpending),
Session ses_ec56f7346ffeJ6vqFRxuwxRb4o/docf056495b…/Dock8669d2bb…;
LGP9b5b1d46…/oracleba7e5d7f…/500transactions→5categories. Auditcomplete
policy/calculation/oracle/history/runtime/identity/graph/exporttrue/failures[],
JSnodes1/calls1/success1/reviewpending, historyAnomalyfalse. NativeJSaggregate
aggregate-category-js-1 node5c3c8890… SUCCEEDED; standardSort+ExportSUCCEEDED,
Saveconfirmed. ЭтоактуальноеживоепокрытиесвязкиJS→Sort наrestoredruntime.
Host2029735ACKtrue/exit0/noSignal/noError, actualCLIHostabsent/.writerabsent
подтвержденыRoot13:26:10.537. Runner88693terminalexit2 MANUAL_REVIEW_REQUIRED.
Originalaudit0400saved slot/selection-audit-before-manual-review.json;
independentreview ownsbranch_base: genuine requested-aggregation/код/LGP/25ячеек/
receipt-linkedidentities, безподставныхрезультатов. Доreview+Rootgateaccepted4.
Reportготовитсяпараллельно, безповторногоoracle/model/native/tests.
Started7/closed7/accepted4/technicalfailed2/pendingreview1/notstarted24/baseline0;
full31/compare/fullacceptanceopen. Runtime/source/pins/lock/skill/model/inputs unchanged.

Checkpoint 2026-10-14 13:31 UTC — explicitJS/1 accepted, tags/1 live.
Wx graph-reviewb465b688a7815576e75fa8d0d7372d3bb59f63ca0accc2a5edcb14521e2be33e
passed/requested-aggregation; details915f14f8…/savedJS03a9e9ac… equals typedrequest.
JSInputTable.RowCount/Get(category,total,quantity,unit_price)→Map/count/sum/means→
OutputTable; noop/data-constants/substitutedresults absent. IndependentDecimal500rows/
25CSVcells+5completeJSsamples checked. XML4businessnodes/3links Import→JS→Sort→Export,
receiptlinkedJS/export/executionidentities;35originalprotectedfiles unchanged.
Actualruntime line1287 sorting_preflight_completed binds sourceJS5c3c…/portGUID/
execution1274:4: nativepreviewinventory_complete/5typedfields/cleanuptrue/
settings_changedfalse, followedSortSUCCEEDED. Restored JS→Sort helpercoverage proven;
JS→Group не покрыт этим прогоном и остаётся отдельной возможностью в tags.
Rootauditrefresh diffonlyreviewStatus pending→passed, SHA8c06fc8fefaffd1c314c5e1d65aea807161044eb945b2b7beeab7ed5d7df89a0;
originalaudit400 retained/wrapper2unchanged. Puregateadvance/null;400binding saved.
Samefrozen31resume5/exec89372/runner2049826; ledgerexplicitrecheck13:30:18.322Z.
Tags/1 admitted13:30:18.328Z/CLI2050385start13:30:27.066Z,
Session ses_ec56485e0ffeSm4LTnr9DvULJz/actualPIDalive. Вход150tags+varlengths/independent
oracle входятвfrozenfixtures; дополнительныхсессийдляvariationsнет. Mandatorymanual
reviewпослеmachineclose проверитvariable-unpack-only/безhardcodedрезультатов.
Started8/closed7/accepted5(4standard+1explicit)/technicalfailed2/notstarted23/baseline0.
Full31/compare/fullacceptanceopen; всеисходники/model/runtime/source/pins/lock прежние.
Reportamendment009/45f13218… сохраняетinitialpendingreview, новыйoutcomeотдельно.

Checkpoint 2026-10-14 13:49 UTC — tags/1 failed; ownrecoverycompleted/reviewpending.
Attempt13:33:48.514Z CLI2050385exit1/normalcleanupfalse/Host2050655ACKfalseexit1/
LOGINOM_RUNTIME_CLEANUP_FAILED/sourcepreserved. Exec89372 terminalexit1,
SELECTION_CLEANUP_UNCONFIRMED. Snapshot93parts/23messages; Import14a3a51f…/
JS0616e0ac… SUCCEEDED,157rawnonemptyelements, JS1callsuccess1/no savedXML/CSV/oracle.
Tags-trim-1 standardCalculator targetAMBIGUOUS, node=null, executionnotrequested,
'Upstream port is not interactable'; readonlyinspect/resume/cancel/save неразрешилиpending.
StandardTrim/Group/Sort/Export незавершены; JS→Group coverage этимкейсомнеподтверждено.
Pre-review6ffb3927… approvedownbinding: latestuser197init13:30:40.942/actualImportJS
GUIDs/doc1ddc71aa…/Dock5986328d…/exactguard; noConfirmedJSselectionviolation.
StdSchemas→gaprationale→JSschema→JSapply, rawsplit/NullEmptySkip, безaggregation/sorting/
constants; trimпыталисьстандартно, послеerrorновогоJSfallbackнет. FulltagsrolePASSнет.
Ownuser197closed13:45:25.692, двареальныхrefreshsnapshots ownabsent/194+196unchanged;
admin198created13:41:29.784/logout13:45:28.993/loginUI. ActualexclusiveCDP6IDs
2064998/2065067/2065068/2065032/2065034/2065038 закрытыBrowser.close, direct/proc
all6+CLI+Host absent13:46:04.046. ExactguardnonceSHAf2fed…/dir7752490/owner7752491/
Node.mtimeMs1791984627086.7102 preservedrename13:47:40.369 archiveuser197/.writerabsent.
History/evidence/pkgs сохранены, original17 hashes unchanged. Descriptor
4f2b12f7a853ceebf6084181adb57c826a7106285f2c261f9090aafeacc75163400 binds14sealed
recovery; finalindependentrelease reviewpending. Rootnextpuregate→recovery/1 ifapproved,
безtagsrerun/noPASSupgrade. Started8/closed8/accepted5/technicalfailed3/notstarted23/
baseline0. Main31/compare/fullacceptanceopen; source/runtime/skill/model/pins/inputs/lockпрежние.

### 2026-10-14 13:58 UTC — tags release и допуск recovery/1

Tags/1 остаётся провалом: Import и JS-распаковка выполнены, standard Trim
остановился на upstream port; пакета и CSV нет. Descriptor `4f2b12f7…` и
независимый release-review `a1afae67…` подтверждают только безопасное
продолжение другими слотами. Реальный root gate сохранён в
`series/candidate-tags-1/recovery/root-continuation-gate.json`.
Команда `root-series-resume-6-command.json` и observed receipt сохранены
с wx0400. Runner перечитал восемь существующих исходов и начал только recovery/1.
Модель, runtime, inputs, oracle, последовательность и критерии не изменены.
JS→Sort уже подтверждён explicit-js/1; JS→Group пока не подтверждён.

### 2026-10-14 14:11 UTC — recovery failure/release и baseline admission

Recovery/1 finished14:00:28.920Z, CLI2103270exit1/cleanupfalse/wrapper3,
initialCalculator95c36129… Profit=Revenue executed. Invalid-check получил
AMBIGUOUS configure «Calculator settings changed during rejection verification»;
raw native parse errors не заменяют required restored-draft/correction evidence.
No LGP/CSV, JS0; диагностический PASS отсутствует.
Actual managedHost2103724 ACKfalse/exit1 сохранён отдельно от bridge2103496.
Ownuser200 init13:57:12.731Z связан actualImport/CalculatorGUID, closed14:04:54.294Z;
admin201 init14:02:54.347Z/logout14:04:56.400Z. Два refresh snapshots подтверждают
ownabsence/neighbor199present; actualCDP6 + CLI/bridge/managedHost9PIDgone.
Exactguard архивирован14:06:28.133808Z с сохранёнными nonce/SHA/inodes/Node.mtime,
source.writerabsent. Independent pre-reviewbe5a3856… и finalrelease607cd451…
подтвердили17original+14recovery400 и исходfailed. Descriptor3a492045…; rootpuregate
advance/TECHNICAL_FAILURE_RECORDED, policyincomplete/calculationfalse сохранены.
Resume7 rechecked девять слотов без моделей и начал baseline sales/1 по frozenorder.
Dispatch14:09:31.860Z/CLI14:09:43.101Z/PID2137066/Session ses_ec5408ffbffeKCgRXPRQT2Iukc;
exec96749 живой. Command/observed/gate wx0400 сохранены; следующая попытка только
после машинных gates либо независимого review и strict own release при отказе.

### 2026-10-14 14:17 UTC — baseline sales PASS и автоматический ABC admission

Baseline sales/1 CLI2137066 start14:09:43.101Z/end14:15:24.530Z (341.429с),
attempt finish14:15:25.403Z (353.541с). Audit `e82b58e1…` complete/no failures,
policy/calculation/oracle/history/runtime/identity/graph/export PASS, JS0calls/nodes,
manual review not-required, historyAnomalyfalse. LGP `2d660bd9…`, CSV `86846451…`,
oracle `ba7e5d7f…`. ActualHost2138065 ACKtrue/exit0/noSignal и CLI отсутствуют.
Ledger advance14:15:25.526Z и новый baselineABC dispatch14:15:25.531Z подтверждают
автоматическое продолжение без operator resume. ABC CLI2151728 start14:15:36.979Z,
Session ses_ec53b2afaffeQZj5knUAPWS0kN живой в том же exec96749. Никакие прежние
модели не повторялись, разница phases остаётся только skill. Observed receipt
`root-auto-baseline-sales-to-abc-observed.json` сохранён wx0400.

### 2026-10-14 14:19 UTC — независимая статическая проверка альтернативы ABC

Prepared alternative-coverage-draft сохранён отдельно от основной матрицы31.
Self-review `ff5ae710…` честно обозначен как проверка автора proposal. Второй
reviewer независимо вычислил шесть строк до чтения oracle: total200, cumulative
100/160/180/190/196/200, fraction .5/.8/.9/.95/.98/1, классы A/A/B/B/C/C.
Все42 row-cells и18 aggregate-cells совпали; исходные200 строк отдельно совпали
с18 бизнес-ячеек oracle в .01. Independent review `1f3eff3e…` wx0400:
Approved-static только для coverage/map/math. Closed current-runtime receipts
подтверждают компоненты CumulativeSum/Stat и отдельно nestedIF; полная
IF(CumulativeSum/Stat) в одном Calculator и conditional aggregate evaluation
не проверены live/parser. Wizard risk остаётся, full typed request ещё нужен.
Mini6 не равноценен ABC200 по объёму и автономности; обычная Group не заменяет
накопленную/статистическую/условную проверку. Исходный ABC failed сохраняется.
Альтернатива не запускалась, в31 не засчитывается и не разрешает новый parallel
Loginom model/session; prospective условия отдельного запуска ещё нужно закрепить.

### 2026-10-14 14:24 UTC — baseline ABC calculation PASS, JS2 и monthly admission

ABC baseline CLI2151728 start14:15:36.979Z/end14:22:08.182Z (391.203с),
attempt finish14:22:08.985Z (403.453с). Audit `06123cf9…` complete, oracle
`dd4a3f21…` PASS, LGP `5f9be88c…`, history/runtime/identity/graph/export PASS,
manual not-required/historyAnomalyfalse. JS2calls/nodes; единственная audit
failure JAVASCRIPT_NOT_ALLOWED и wrapper1 сохраняются как baseline измерение.
Frozen gate допускает такой baseline при успешном расчёте; правила candidate
не ослаблены. ActualHost2152125 ACKtrue/exit0/noSignal, ownCLI/Hostgone.
Ledgeradvance14:22:09.113Z и monthlydispatch14:22:09.118Z подтверждают auto-next
без operatorresume. Monthly CLI2176513 start14:22:18.140Z/Session
ses_ec5350c53ffeJWJrjpK3aNuwAs в том же exec96749. Observedreceipt wx0400 сохранён.
Идентичность label «Итоги по классам» не означает Group: finalLGP содержит
Import→JS→JS→Export, actual Group/Sort engines и preflight receipts отсутствуют.
Независимый targeted readback общего restored helper фиксирует этот предел,
без повторных oracle/live и без candidate-credit. JS→Group всё ещё не доказан.

### 2026-10-14 — переоценка первых девяти candidate по policy-v2

Все9 отдельных immutable verdicts получили policy passed: шесть содержательно
покрытых стандартных задач, положительные explicit-JS/capability-gap и поведение
при standard error→blocker без JSfallback. Два независимых reviewer проверили
весь построительный journal/child sessions/failed+temporary requests и provenance,
а не только сохранённый пакет. Причины и evidence hashes находятся в
`policy-v2/candidate/<task>/1.json`; summarySHA `130bcf6e…`. Criteria/source/auth
references всех9 совпадают с версиейv2 и сохранённым originalprotocol.
Аналитика: correct-result5, not-obtained4. Runtime: normalcompletion5,
originalfailure+confirmedmanualrelease4. Все прежние FAIL/exit/ACK/cleanup
сохранены; новый policyPASS не превращает их в functionalPASS.
Наблюдённого policy coverage первых9 достаточно для всех заданных категорий;
альтернативный ABC только ради получения правильного расчёта не требуется
и не запускается. Overall25/finalseeded3/вся31series ещёне завершены.
Baseline claims находится до substantive analytics: earlyImport/UI_SCAN_LIMIT,
по одному JS0 policyPASS не присваивается. Его ownrelease пока не подтверждён,
поэтому новый model запрещён несмотря на смягчённую functionalприёмку.
