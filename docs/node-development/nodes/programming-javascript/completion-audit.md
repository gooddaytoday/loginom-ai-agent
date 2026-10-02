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
| G6/J12/J13/J25 | Preflight/parse/throw, native owned error/details, Stop/cancel/lost reply/same-ID/unknown effect. Natural insufficient-primary/Done остаются not_observed, а не PASS; границу оценивать по исходному требованию и F |
| J19/J26 | Current context и source_pending opt-in без ложного executed output; module policy effective source, source drift и отсутствие sandbox claims |
| J16/J17, фазы4–5 | Independent oracle mutations, смежные node/editor/deny regressions, применимые tests/typechecks/provenance; source changes после F и их адресные проверки |
| Итоговые документы | Current plan/card/discovery/registry/completion должны различать candidate acceptance и integration/release; основной checkout всё ещё имеет14 handlers |

Registry пока не повышен. До сверки остатка не устанавливать whole accepted
и не завершать Goal. Расширения раздела «Следующие расширения узла» требуют
отдельного назначения; TestCafe not_run по принятому плану. Merge/push/release
не входят в текущую приёмку и не выполнялись.
