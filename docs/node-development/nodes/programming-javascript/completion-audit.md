# JavaScript: аудит завершения плана

Статус: **проверки завершены в согласованном scope v1**. Итог опирается на
матрицу ниже, текущий код, actual candidate CLI и отдельные source/live proofs;
один CLI PASS не подменяет остальные требования. Проверяемый source:
`6f6a66eb62c78ab2e8b10cd1bd7f38bcf931d8d6` в `node-javascript`;
canonical docs — ветка `javascript`. Исходные требования: [plan](plan.md),
G1–G7, J01–J27, фазы0–6, [постоянные указания](checkpoint.md#указания-пользователя).

## Уже повторно проверено — 2026-10-02

| Требование | Проверенные источники | Результат и предел |
| --- | --- | --- |
| Обычный CLI закрывает принадлежащий пакет до браузера | `standalone-run.ts`: private option только mode=run; Host исключает validation/readiness; bridge выбирает последний новый успешный Save, связывает document; `package-cleanup.mjs` проверяет session/document/account/path/build, отсутствие running/dirty, вызывает ClosePackage(node,false,true), затем logout; оба native receipts pair13 | Подтверждено кодом и двумя normal CLI trials. Не используется acceptanceCleanupPackage; нет автоматического Save, Stop или discard |
| J03/J04/J15/J18, фаза6 | [Original pair13](completion-phase6.md), writer/whole/cold reports, ручной разбор полного исходника обоих modes; текущие байты native/cold файлов сверены с запечатанными SHA | Оба режима,6×4, fresh Execute, Save/cold/source/settings/mappings/graph и cleanup PASS; автономное задание без технических ответов. Это проверка двух заданных задач, не всех видов данных |
| J01/J21 — actual delivery | J21 read09: заново прочитаны18 tool parts из собственной SQLite; SHA каждого output совпал с закреплённым delivery-audit, truncated=false, readback_summary отсутствует. Отдельно измерена фактическая JS card | Card16382 UTF-8 /17510 wrapped-wire bytes, ниже20000; validated_for7.4.2/Linux. Полные ответы укладываются в46000/51200/2000. Source32768bytes/1024LF/8chunks и full6×4 подтверждены исходным независимым payload audit; это technical delivery, не автономная задача |
| J27 — explicit target persistence | Actual compiled candidate02 setup и отдельный restart/status; receipt SHA ниже. `git diff ee5184a606 HEAD` для connection subtree, `loginom-management.ts`, `standalone.ts` пустой. В обоих текущих candidate15 writer profiles прочитаны exact URL и urlSource=explicit | Допускается переиспользование неизменного persistence-контракта; новые candidate15 процессы реально работали по сохранённому назначенному адресу. Повтор setup на candidate15 не заявлен |
| Fixtures/oracle | Все10 файлов manifest сверены по длине и SHA; model-input содержит только CSV и бизнес-задания, operator-only oracle отдельный | Fixture integrity PASS; сама целостность не заменяет аналитический oracle |
| Ресурсы | Оба original release; host acceptance_lease=null, acceptance.lock/.writer отсутствуют; holder отсутствует после final pair/exit | Нет незавершённого браузера или контроллера pair13; прежние failed trials не повышены |

Read-only перепроверка сохранена приватно в campaign `completion-audit-evidence-01.json`,
SHA256 `53e12d94697849bd8b24e1f94dc54bfa059ecceae49439b61769d5a0549e1ed0`.
Она проверила12 текущих native/cold файлов обоих modes, исходные whole reports,
18 SQLite output payloads и10 fixtures. Original controllers не восстанавливались
из JSON; их завершающий pair audit выполнен до выхода holder.

J27 receipt `f-j27-candidate-02.json`, SHA256
`fe8fddd525e8a2935779574a6af2588b2fb186444d9ee936577361fc89c6e314`.
J21 `f-cli-j21-read-09/delivery-audit.json`, SHA256
`65c4343abd4fd093076af5c16c44289a45b22bea1c3d5851dd0928684a2a28f6`.
Knowledge semantic SHA256
`86506db742980407b41de7c042edcd622d4809b339141b2065e936f5803049c0`.

## Типы, кардинальность и сохранность прежних proofs — 2026-10-02

Заново разобраны16 исходных report/journal pairs и их независимые oracle:
real, Boolean, String, safe integer, civil Date и outside-safe integer по два
schema modes, а также keep2/odd/duplicate Code и declared-empty. SHA receipts
сопоставлены с ранее записанными в checkpoint; report/journal/oracle/source
остались неизменными. Проверены полные values/types/NULL/order/count/schema,
два различных execution IDs, native input payloads и cleanup. Это исторические
public handler runs, не новые candidate15 браузерные прогоны.

| J / случаи | Повторно подтверждённое содержание | Граница |
| --- | --- | --- |
| J06 real | NULL/0/−1.25/10.125 обоих modes, входные binary64 bytes и полное точное совпадение output values | Не объявляется native output-byte proof этих публичных runs |
| J06 Boolean/String | NULL/false/true; NULL/empty/литералы/Unicode/quote/backslash/LF, без отождествления false и0 | Input payload форматы проверены отдельно: Boolean byte, String length/codepage65001/UTF-8, не общий числовой decoder |
| J06 Date | NULL и две civil даты с milliseconds, прежняя native civil attestation сохранена | Epoch/timezone не установлены |
| J07 integer | NULL/0/±9007199254740991 exact decimal output в обоих modes | Outside-safe отдельно characterized:9007199254740993→9007199254740992, exact_pass=false; общей гарантии int64 нет |
| J08 cardinality | [1,2,3]→[2], [1,3], [1,1,2,2,3,3], []; полная Integer schema сохранена при0 строк | Empty INPUT и declared nonempty counterparts — отдельные evidence, ещё нужны в полном аудите |

Приватный `completion-audit-evidence-02.json` SHA256
`5d882623d92f43f803a2d8046698d0011f4dbb4ecec34b7dd4f18d0e8350cd15`;
проверяющий script `completion-types-revalidation-02.py` SHA256
`edddc7c23fd3df66e1dbbab4457c9b0db34f3e9b5c39e3f2213212ba595a66c8`.
Первый запуск этого нового checker остановился на неверном предположении об
общем native payload layout. После чтения оригинальных type-specific auditors
checker исправлен; исходные reports/oracles/receipts не менялись. Это ошибка
новой перепроверки, не регрессия Loginom и не причина повторять live.

Все16 **фактических старых requests** дополнительно пропущены через текущий
`validateJavascriptParameters` (включая module policy) на pinned Node24.19.0:
16PASS. Старые declared columns уже используют Boolean/String discrete и
Integer/Real/Date continuous; исправление общего declared-контракта не делает
эти inputs неподдержанными. Это подтверждение admission, не доказательство
неизменности всего текущего lifecycle. Receipt
`completion-types-current-preflight-02.json` SHA256
`29107fb708a579f6843e3b801f8c7e351ad0e7c89b4d1a3b9861bb88d637775d`.

Также повторно сверены8 receipts с исходными report/journal и cleanup:
J09 manual/Required2, J11 changed/reordered4, J22 UI-profile2.
`completion-audit-evidence-03.json` SHA256
`e2de5c4a1b6ee497e758d47bdb4d2e93d0c67bc70f5bf0dcb6404991c6740bcf`.
J09 доказывает source Required=true/target Required=false, autosync=false,
manual label и явный отказ неподдержанного mapping edit до admission;
target Required=true этим не покрыт. J11 проверял все6×5 входных и6×4 выходных
ячеек после замены/перестановки input при сохранённом JS GUID. J22 — bounded
visible inventory двух openings; нет доказательства глобального отсутствия
assistant или runtime FullType. Проверка сохранности этих proofs не заменяет
оставшуюся оценку текущих lifecycle/source изменений.

## Диагностика и восстановление — 2026-10-02

Повторно проверены10 исходных report/journal pairs: Code/declared SyntaxError,
Code/declared synchronous throw, finite Stop, local cancel/SAME-ID continuation,
controlled caller reply loss, native details inventory, owned details expansion
и natural regex diagnostic. Во всех10 после отдельного repair заново сопоставлены
все24 typed клетки с независимым business oracle, схема/порядок/full coverage,
fresh execution ID и native package/logout/browser cleanup. SHA самих receipts
совпадают с ранее закреплёнными в checkpoint; это не новые browser trials.

| Требование | Подтверждённое поведение | Непереносимая граница |
| --- | --- | --- |
| J12/J25 syntax | Native Code Next SyntaxError обоих modes, owned diagnostic/Close, сохранение прежнего исходника/свойств/графа и NEW repair | Не доказательство natural Done refusal |
| J12/J25 throw | Отдельный materialization Execute, свой failed JS child, public FAILED/native message, applied configuration и not_refreshed output; NEW repair | Native stack position не атрибутирована; откат уже применённого кода не обещается |
| J13 Stop | Один Stop собственного root/group/child, cancelled terminal и два новых repair Execute | Local cancel не выдаётся за server Stop |
| J13 cancel/resume | Read-only pause, тот же operation/request/owner/execution, original deadline, один исходный Raw Execute; retained driver продолжает wait | Нет automatic cross-process resume |
| J13 lost reply | Потеря ответа public caller при живом backend; status до Stop, inspect после settlement, без повторного apply/Execute | Browser gesture receipt не терялся; unknown receipt не разрешает replay |
| J25 details | Owned native inventory, одна expansion, bounded text и OK; natural regex с достаточным primary не раскрывает details | Natural insufficient-primary и Done errors остаются not_observed, а не PASS; исходная матрица требует preflight/parse/throw и честную позицию либо её отсутствие |

Текущий `javascriptExecutionWaitContext` прочитан: требует retained operation,
cleanup/read-only pause, точные request/owner/source/settings/mappings/receipts,
неизменный deadline и отсутствие transport uncertainty. Новый процесс или
неподтверждённый эффект не допускаются к продолжению.

Чтобы проверить применимость source guards после позднейших изменений,
на текущем child HEAD с pinned Node24.19.0 из `packages/loginom-runtime/client`
выполнена адресная команда:

```sh
"$LOGINOM_NODE" --test test/javascript-execution-continuation.test.mjs test/javascript-managed-done-settlement.test.mjs test/javascript-managed-wizard-error.test.mjs test/javascript-wizard-error-details.test.mjs test/javascript-source-policy-refusal.test.mjs
```

Результат115PASS/0FAIL/0SKIP, actual exit0. Проверки охватывают original deadline,
unknown/changed ACK, foreign/stale dialog, single gesture, bounded/redacted
diagnostic, native classification и отказ до editor/Execute. Тестовые native
fixtures не объявляются новым live доказательством редких ошибок.
Private `completion-diagnostics-current-tests-04.log` SHA256
`ee75cf853ebfb0e4ad08e44d9d9d3e910e7a011a660dbbd01bb403950ea0926b`.
Сводка10 cases `completion-audit-evidence-04.json` SHA256
`b624a8feac6f168a46d2e5b5476c3e0b4921cf80778d98400d52acbe953d7080`.

## Done/Close, source и context — 2026-10-02

Сверены16 original independent receipts с текущими raw report/journal bytes,
наблюдаемым headed/status/cleanup: general configuration2, new Done2,
context baseline2/reordered2/renamed2, source-policy2, long writer/cold2,
bound source1 и empty declared source1. Для большинства receipts в checkpoint
есть полный hash; у renamed v7 прежний receipt hash сокращён, но полные
report/journal SHA закреплены. В новой ведомости это различие отмечено явно.
`completion-audit-evidence-05.json` SHA256
`9208136dfc47f6ce5ae42378821de939ebb23a2ddf611c26220e50c90c3b4c22`.

| Требование | Проверенное содержание original proof | Граница |
| --- | --- | --- |
| G2/J14 existing | General Done→Close→NEW preserve Execute обоих modes, source/settings/graph, same-ID zero-event retry, full6×4 | Done: explicit=false/internal=null, not_requested/not_refreshed. Close только свой draft; отсутствие внутреннего Verify не доказано |
| G2/J14 new | Standalone new Done обоих modes, собственный input0 link/source/settings и последующий preserve Execute/full6×4 | Code v4 auditor усилен после live, declared v4 закреплён до live; история не переписана |
| G4/J05 | Bound32768bytes/1024LF source и empty declared, полное source-read равенство | Empty source не используется как доказательство fresh бизнес-выхода |
| G4/G7/J23 | Long public writer Save и path-only cold: exact source/settings, fresh Execute/full6×4 | Отдельные source revisions writer060a/cold6531, не одна подменённая ревизия. Native LGP byte proof этих runs отсутствует |
| J19 | Current source/ports/mappings, inert label/comment data, reordered input и renamed CustomerNow; default pending refusal→NEW explicit opt-in→correction→fresh result | Fixed operator не доказывает устойчивость автономной модели к инструкциям в данных |
| J26 | По8 public preflight refusals new/existing, source-bound output reread,3 distinct own executions, no-effect same-ID retry | Saved unsupported source/drift/unknown effects проверялись source tests, не live injection; sandbox не заявляется |

Текущий `javascript-context-read.mjs` прочитан: opt-in строго boolean;
configured-only output требует отдельного native witness, возвращает
schema_state=source_pending, configured_inventory_verified=true,
native_reciprocity_verified=false. Без explicit true действует строгий путь.
`git diff 9bc52b9468 HEAD` для этого модуля пустой: actual renamed live proofs
относятся к тем же bytes контекстного reader.

Сравнение JS runtime files между new Done source `fecbc9f44d` и current HEAD
показало поздние изменения только declared column-types/managed-declared/
parameters/knowledge. Поэтому old Done proofs сохраняют значение для lifecycle,
а актуальный declared column contract дополнительно опирается на текущий
preflight16 и Declared13 candidate/live (см. предыдущие разделы); не заявляется
свежая проверка всех типов через candidate15.

## Профиль движка, подготовка и source regression — 2026-10-02

`engine-profile.json`: все30 referenced report bytes заново сверены с SHA.
Сохранены исходные категории:14 observed_pass,6 native refusal,3 own native
failure,7 characterization. Это30 наблюдений, не30 успешных executions и не
полная ECMAScript conformance. Среди отдельно наблюдённых возможностей:
trim/кириллические lower/upper, globalThis, async declaration; ??/optional
chaining/lookbehind/BigInt/top-level await имеют свои отдельные отказы.

Текущий `describeJavascriptKnowledge('7.4.2')` возвращает1.2.0; оба его source
example SHA совпали с source SHA уже проверенных public `e-public-knowledge-*`.
Report/journal обоих example runs и cleanup перепроверены. Новый build7.4.3
действительно отвергнут текущей функцией. Примеры1.2.0 не изменены относительно
1.0.0; новые рекомендации declared columns/column names не добавили скрытых
непроверенных исполняемых snippets. Current semantic hash совпал с CLI delivery.

Исходный пользовательский справочник в Git:51570bytes, SHA256
`c9c2d44d4dc4cf34b8f21a98504cf9f6acfc70cac510c36fe2725e7c0d7c2d16`.
Он сохранён отдельно от runtime knowledge. По `sources.json` сверены16 product
Git blobs закреплённой базы и19 e2e файлов закреплённой ревизии. Семь LGP —
Git LFS: проверены SHA/size pointer и реальные локальные bytes, а не hash текста
указателя.26 official references остаются источниками исследования; web заново
не перечитывался, TestCafe по-прежнему not_run.

Приватные исторические квитанции `.local/project-memory/rollouts/20260926.2/`
прочитаны: actual Codex metadata, capture22 messages/one commit, root exact
read-back+semantic find, без ручного remember/write; upgrade сохранил state и
предыдущий runtime. Это выполненный допуск Ubuntu и проверка полного цикла,
не тест текущего соединения. Bootstrap/health повторно не выполнялись.

Evidence06 SHA256
`0cced666ac9d59ce63293a105fc71c16bf7e2c26767ef9c63e63a4db4fb1c505`;
research provenance07 SHA256
`e327d61ba56af152e17444e9dec99e073c7ccd3330716091debb6c09e0551b33`.
Оба файла находятся в приватном campaign root с именами
`completion-audit-evidence-06.json`, `completion-research-provenance-07.json`.

Текущий source получил адресную перепроверку remaining caps/redaction/source
admission/read/public projection/product registration/response budgets и
generic UI/calculator regression из owning client package:

```sh
"$LOGINOM_NODE" --test test/javascript-parameters.test.mjs test/javascript-source-admission.test.mjs test/javascript-source-read.test.mjs test/javascript-source-public.test.mjs test/javascript-product-registration.test.mjs test/user-response-budget.test.mjs test/workspace-ui.test.mjs test/calculator-context.test.mjs test/calculator-parameters.test.mjs test/calculator-procedure.test.mjs test/calculator-readback.test.mjs
```

Actual exit0,518PASS/0FAIL/0SKIP. Это адресный source suite, не повтор всего
client и не новый live run. `completion-source-regression-tests-07.log` SHA256
`5059e7a9b1dd971b29db46e1c11380d9aba3204769ceb60edcb21096deba09e8`.
Полный suite и owning TS typechecks предыдущих code batches остаются своими
историческими проверками; после них TS в этом аудите не менялся.

Штатный provenance verifier с `--map docs/migration/source-map.json --root .
--transforms docs/migration/source-transforms.json` из child root:5045PASS,
actual exit0. Log08 SHA256
`91918370d54b6ee97714cadcf7b78d7415dd2e72bcc39b22a9cb47cf1fc4056a`.
Первый вызов log07 не содержал обязательных аргументов и завершился exit2 до
проверки; он сохранён и не считается PASS.

## Последние адресные проверки

Evidence08:5 fixed AssignColumns cases (control/Cyrillic/space/leading-digit/
Unicode DisplayName), Code+declared empty-input, исходные logs независимых
configuration/output auditors. Пустой input в обоих случаях дал0 rows с полной
output schema. Сверены report/journal/receipt bytes,5 name mappings и48 non-noop
oracle mutation tests. Старый общий Python discover exit130 не считается PASS.
`completion-audit-evidence-08.json` SHA256
`d6d8ac389cfda79ad5b5bb11ea79c203838cb1d933fca1e4cdf11dab9a4b0c26`.

## Итоговая матрица требований

Статус «подтверждено» относится к первоначальному scope ядра и указанному пути
доказательства. Candidate CLI проверяет две бизнес-задачи, а не каждую строку
матрицы; fixed public/source proofs сохраняют свои версии и ограничения.
Исторические report paths/hashes перечислены в evidence01–08 и checkpoint;
исполняемые auditors не подменялись model verdict или суммой столбца.

| ID | Итог / доказательство | Граница |
| --- | --- | --- |
| J01 | Подтверждено: current knowledge1.2.0, build fence, J21 SQLite18 и pair13 actual delivery | Только7.4.2/Linux; источник reference не равен автоматически прочитанной модели справке |
| J02 | Подтверждено: C/D independent6×5 до JS, native typed inputs audit02, pair13 input admission/upload/import/output binding | CLI получает только закреплённый CSV; типы не угадываются по preview |
| J03 | Подтверждено: Code13 original whole/cold/pair PASS | Один вход/output0, synchronous builtIn/Data |
| J04 | Подтверждено: Declared13 original whole/cold/pair PASS | Current type/kind/64-column contract, schema из мастера |
| J05 | Подтверждено: empty/bound public source, long writer/cold/J21, current source admission/read tests |32KiB/1024LF; CR/NUL/cap overflow отвергаются, не обрезаются |
| J06 | Подтверждено: public native-input/typed-output scalar2 modes, private native roundtrip; audit02 | Date civil/milliseconds, без UTC/epoch; не все scalar cases заново выполнены candidate15 |
| J07 | Подтверждено: safe-range exact; outside-safe characterization и честные ограничения | Нет общей гарантии int64 |
| J08 | Подтверждено:0/1/N/native cardinality, Code/declared empty input, сохранённая схема | Нет large-table acceptance |
| J09 | Подтверждено: manual/autosync/Required preservation; неподдержанные schema/mapping изменения явно отвергаются до мутации | Source Required=true/target=false проверен; изменение target Required не входит в разрешённый edit |
| J10 | Подтверждено: existing edits/context/lifecycle/repair, preserved GUID/graph и candidate J21 existing | Existing {} сохраняет; пустой source — явная замена |
| J11 | Подтверждено: changed/reordered4 proofs, полные input/output и новые execution IDs | Fixed upstream variants, не произвольное внешнее изменение |
| J12 | Подтверждено: current preflight guards, Code/declared native parse/throw и repair | Applied source после throw не называется rollback |
| J13 | Подтверждено: Stop/cancel/retained wait/caller reply loss;115 current tests и original traces | Unknown browser gesture/worker loss fail-closed, cross-process resume отсутствует |
| J14 | Подтверждено: general existing Done/Close2 и new Done2; same-ID zero events/preserve Execute | Done не обещает fresh output или отсутствия внутреннего Verify |
| J15 | Подтверждено: оба pair13 Save/path-only cold source/settings/mapping/graph/full result | Сохранён именно последний source; отдельное открытие без ремонта |
| J16 | Подтверждено: independent configuration/output/native/source/cold audits и non-noop mutations; actual pair composition | Hash/exit0 сами не являются аналитическим oracle; interrupted discover не засчитан |
| J17 | Подтверждено: current generic UI deny/calculator/product registry/source regressions518PASS | Не повторная аналитическая приёмка всех соседних узлов |
| J18 | Подтверждено: две independent original Sol6.1/low CLI попытки30min на одном candidate15 | Без technical solution/oracle/model workspace injection; не DEBUG_ONLY |
| J19 | Подтверждено: current source/technical names/mappings, reordered/renamed proofs, strict default и explicit source_pending opt-in | Fixed data/instruction isolation, не статистическая гарантия сопротивления модели инъекциям |
| J20 | Подтверждено:30 observations и оба exact текущих knowledge examples + business primitives | Не полный ES/Data API; async declaration не равна async execution support |
| J21 | Подтверждено: current budget tests и actual candidate15 SQLite18,32KiB/8chunks/full result/no truncation | JS card17510wire<20000; весь response≤46000 и effective Agent limits |
| J22 | Подтверждено scoped inventory: два openings Code/declared, помощник не вызывался | Наблюдаемые страницы, не global absence/FullType |
| J23 | Подтверждено: exact editor readback, Unicode/LF/tabs/URL/bound writer/cold/J21 | Cold source прочитан целиком; не hash экранированного XML вместо source |
| J24 | Подтверждено:5 fixed public AssignColumns actual names/display/schema/readback, current knowledge guidance | Общий normalization/AddColumn/empty/collision не заявлен |
| J25 | Подтверждено: owned bounded native diagnostics/позиция либо отсутствие, details по политике и cleanup | Natural insufficient-primary/Done not_observed, не новый обязательный gate |
| J26 | Подтверждено: current parser/effective source guards,8public refusals×2 и source-bound reread | Static Data scope, unsupported modules refusal; не sandbox |
| J27 | Подтверждено: compiled setup/restart candidate02, unchanged persistence source, actual explicit profiles candidate15 | Не переписана legacy migration; назначенный origin/path сохранён |

| Gate / фаза | Авторитетные подтверждения |
| --- | --- |
| G1 /0A–0B | Own native GUID/icon/editor/visible UI/J22, actual7.4.2/Linux; Ubuntu assignment/product base/toolchain, historical memory full-cycle receipts, candidate manifest/freeze/launch guards |
| G2 | Execution-effects design, owned stage/ACK/settlement tests, general new/existing Done/Close, Stop/cancel, candidate explicit fresh executions; internal effect uncertainty сохранена |
| G3 | Native source→target→physical mapping witnesses, Code/declared C/D и pair13, manual preservation/refusal, correct native declared types/DefaultUsageType |
| G4 | Exact managed input/readback/source digests, source-read/redaction/cursor tests, public bounds, independent cold и J21 model delivery |
| G5 | Pinned scalar/native/civil/int64/cardinality/named oracles и30 engine cases с разделением PASS/characterization/refusal |
| G6 | Diagnostics/recovery audit04, current115 tests, original Stop/cancel/lost-reply traces, unknown effect fail-closed |
| G7 | Original latest Save/native dirty guards, long source writer/cold, оба normal CLI path-only cold trials и own cleanup |
| Фаза1 | Публичные схемы/parameters/module policy/context/source/knowledge, product registration на7.4.2, actual describe/prepare delivery |
| Фаза2 | Узкий owned editor, exact source/empty/bounds/focus/foreign guards и current source regressions |
| Фаза3 | General lifecycle/new/existing/mappings/executions/diagnostics/recovery выше; shared runtime, без второго UI interpreter |
| Фаза4 | Independent oracles/typed fixtures, source/config/output/cold/model/native binding, meaningful negatives, оба original trial objects до final pair |
| Фаза5 | Same-task F e02e8fd41f; addressed fixes/source tests, immutable candidate15/frozen reader15, current provenance5045; TS typechecks сохранены в owning source validation receipts |
| Фаза6 | [completion-phase6](completion-phase6.md): обе модели/inputs/source/build/knowledge, all6×4, Save/cold, normal cleanup и final pair PASS |

## Deliverables и исключения

Исследование процесса/кода/предусловий/Help/E2E — `research.md`,
`e2e-coverage.md`, `sources.json`, `review-verification.md`; original prompt
перенесён неизменным в `references/`. Profile/snippets/typed cases/fixtures/oracle,
execution effects и предметные designs связаны из плана. Адресные tests и
source provenance проверены; SDK/HttpApi generation не требовалась: соответствующий
публичный Protocol не менялся. TestCafe not_run — принятое требование, не пробел.

Исходники находятся в child `node-javascript`, docs — `javascript`.
Product base `a8ad59766dbdb4f2da0b54367a755ce00891dd71` сохранён; завершённый
rebase/Cursor3f35c5f232 не повторён. Необходимая Ubuntu адаптация и normal CLI
Close включены в проверенный candidate. Scope expansions требуют отдельного
назначения. Push/merge/release/установка не являются следствием acceptance.

Финальный комплект должен связать эту матрицу с card/registry/discovery и
completion. Основной checkout имеет14 зарегистрированных handlers; child
candidate содержит JavaScript. Поэтому registry сохраняет checkout inventory,
а candidate acceptance записывается отдельно с source/manifest/evidence.
