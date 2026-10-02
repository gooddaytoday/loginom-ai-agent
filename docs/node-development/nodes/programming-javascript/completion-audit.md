# JavaScript: аудит завершения плана

Статус: **выполняется**. Этот документ не объявляет завершение Goal или принятие
всей матрицы по одному CLI PASS. Проверяемый source:
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

## Обязательный остаток аудита

«Проверить» ниже означает оценить сохранённые доказательства и текущий код,
а не автоматически заново запустить browser/test. Результаты истории искать
адресно по J-матрице и checkpoint; повтор нужен только при пробеле или
изменённом контракте. Не считать все исторические «открыто» актуальными.

| Группа требований | Что ещё требуется подтвердить в итоговом аудите |
| --- | --- |
| 0A, исследование, named artifacts | Источники Help/E2E/reference, Ubuntu memory admission/capture/read-back, assignment/base/toolchain и hashes; без повторного bootstrap/health |
| G1/J22 | Own identity/editor/navigation/assistant inventory и границы observed absence; new/existing пути |
| G2/G3/J09/J10/J14 | Переходы Next/Done/Close, materialization, mapping/manual/required/autosync, сохранение свойств и графа; new/existing обоих modes |
| G4/J05/J23 | Empty, LF/Unicode/quotes/URL/tabs, exact editor/cold, caps+1, redaction полного source и chunks, owner/cursor/digest и отказ без мутации |
| G5/J02/J06/J07/J08/J11/J20/J24 | Полный вход, scalar/NULL/Date/safe-int64,0/1/N, freshness/upstream, named access/columns,30 engine observations и все exact knowledge examples; сохранить explicit outside-safe/Date limits |
| G6/J12/J13/J25 | Основные live paths и текущие адресные guards сверены выше; при итоговом сведении сохранить scope lost-reply и not_observed natural cases, не назначать их автоматически повторно |
| J19/J26 | Current context и source_pending opt-in без ложного executed output; module policy effective source, source drift и отсутствие sandbox claims |
| J16/J17, фазы4–5 | Independent oracle mutations, смежные node/editor/deny regressions, применимые tests/typechecks/provenance; source changes после F и их адресные проверки |
| Итоговые документы | Current plan/card/discovery/registry/completion должны различать candidate acceptance и integration/release; основной checkout всё ещё имеет14 handlers |

Registry пока не повышен. До сверки остатка не устанавливать whole accepted
и не завершать Goal. Расширения раздела «Следующие расширения узла» требуют
отдельного назначения; TestCafe not_run по принятому плану. Merge/push/release
не входят в текущую приёмку и не выполнялись.
