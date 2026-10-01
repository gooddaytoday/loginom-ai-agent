# JavaScript: общий Done/Close перед продуктовой регистрацией

## Основание и обнаруженный пробел — 2026-10-01

Согласованное ядро plan.md требует new/existing, настройку/Done, Close и
Execute/read. На source30b703fac0 общий createJavascriptCodeNodeSupport допускает
только finish=execute (validateJavascriptCodeRequest); descriptor всегда требует
materialization. Общий Done есть лишь в fixed B trial, который закреплён на
конкретных node/source и не может быть продуктовым handler. Общий Close пока
не подключён. Accepted C/D Execute/Save/cold не доказывают эти два публичных пути.

Это реализация уже согласованного scope, без новых model parameters или браузера.
Она не меняет незавершённый статус natural insufficient-primary/Done-refusal
observations и не считает эти наблюдения выполненными. Продуктовая регистрация,
формальное same-task review и immutable candidate остаются отдельными этапами.

## Выбор композиции

Рассмотрены: зарегистрировать fixed trial (неверно: fixture попадает в продукт),
создать второй общий writer (дублирует ownership/admission/discard), дополнить
существующий lifecycle. Выбран третий путь: общий source-admission/managed writer,
единые graph/port guards и registry/ACK/deadline. Execute сохраняет прежние два
явно идентифицированных исполнения и full output mapping/read; новые ветви не
используют oracle, fixture code или публичный forced-details переключатель.

- Done: new/existing в code/declared, preserved mappings. Source replace/preserve
  и declared columns принимаются по прежним правилам. Один owned Code Next/Done,
  actual graph settlement и независимый полный source/settings read. Затем fresh
  owner/source/settings/graph confirmation перед terminal без второго Done.
  Output wizard/materialization/explicit Execute/read не вызываются. Не обещать
  materialized mapping или свежий выход. Для code-generated schema отсутствие
  Execute не делает configured columns подтверждёнными кодом.
- Close: только existing, inputs=[]/mappings=[], без изменения schema mode или
  declared columns. New/combined Close отклоняется до target/input effects,
  поскольку создание узла/связей нельзя выдавать за rollback черновика. После
  одного source draft write — sole managed Close без Code Next/Done/Execute;
  verified closed/discarded lease, полный независимый retained source/settings и
  полный unchanged graph. Неподтверждённый Close/ACK не позволяет новый context.
- Generic node-apply допускает materialization только при explicit Execute;
  отдельный output mapping для JS Done пропускается явно, не считается verified
  materialized mapping. Остальные типы узлов и отдельные output wizard неизменны.
- Done readback: source SHA/UTF8/LF, реально наблюдённый schema mode/settings,
  declared columns при declared, receipts и commit proof. explicit_execute=false,
  internal_execution_started=null, configuration=applied, output=not_refreshed.
  Не добавлять придуманные output fields/freshness/reciprocity.
- Close: configuration=discarded/draft_discarded=true/settings_applied=false,
  execution=not_requested/output=not_refreshed, сохранён старый source и граф.
  Pure preflight, unknown effects, same-ID conflicts, lossless user-v1/budgets,
  redaction и source module policy остаются обязательными.

## Проверки до live

Actual validateNodeApplyRequest/applyNode и JS handler: допустимые Done/Close,
unsupported Close комбинации до effects, сохранение Execute phase order и
отсутствие output/materialization/execute/read на Done/Close. Pure/code/declared
result schemas и user-v1: честные flags/receipts, отказ forged execution/mapping/
source/columns. Actual managed adapter/discard/admission orchestration: retained
source/settings/graph drift, ownership, one-shot, ACK/reply loss, deadlines/cancel.
Не дублировать implementation в тестах. Затем addressed и затронутые общие
client/operator suites; provenance refresh/verifier для изменённых mapped files.

## Fresh live и независимый oracle

После commit/freeze/auditor pin — ordinary headed на единственном стенде7.4.2,
один fresh profile/owner. Отдельные code/declared saved packages:
NEW public Done с исходным business code плюс bounded comment; full independent
source/settings proof и no explicit Execute, same-ID exact retry без events;
NEW Close с другим draft/comment, independent retained Done source/settings и
unchanged graph, exact retry без effects. Затем NEW explicit Execute/preserve
на том же узле,2fresh executions/full6x4/1950 для проверки сохранённой конфигурации.
No Save; saved baseline на сервере не заменяется. PackageClose/logout/browserClose/
process absence и независимые corrupted-copy negative auditor tests обязательны.

Естественные ошибки этих прогонов фиксировать честно; их отсутствие не выдавать
за proof natural Done refusal. Не вводить ошибки через FException/RPC/DOM patches,
не расширять исчерпанную regex/import матрицу. После двух accepted modes —
пересмотреть remaining E requirements, затем F по полному плану.

## Следующий обязательный срез: new standalone Done — 2026-10-01

Fresh saved Code447/declared448 проверили existing lifecycle. Ранее new C/D
проверили intermediate Done внутри Execute; они не заменяют отдельный public
finish=done на новом узле. Использовать общий handler без продуктовых изменений:
фиксированный оператор создаёт new JS с одним verified input0 и business source,
finish=done/read.ports=[] в code/declared. Проверить terminal configuration=applied,
execution=not_requested/output=not_refreshed, explicit_execute=false/internal=null,
full independent source/settings и новый node/input link в owned graph. Exact-ID
retry должен вернуть прежний job без новых runtime events. Затем NEW existing
Execute с parameters={schema_mode}, inputs=[]/mappings=[]: исходник и declared
settings сохраняются, два distinct completed executions и full6×4/1950 совпадают
с независимым oracle. No Save; каждый fresh profile ordinary headed, cleanup
package/logout/browser/process absence. Source tests + fixed operator composition,
immutable source/freeze/oracle/auditor/negative checks закрепить до первого live.

Не создавать второй writer или публичный флаг для этого сценария. Добавить
закрытый operator-only entrypoint по аналогии с existing configuration case;
он принимает лишь mode и назначенные приватные paths. Штатный new Execute
сохраняет прежнее поведение. Natural Done refusal этим не доказывается.

## Подтверждённая pre-body перерисовка — 2026-10-01

Original headed444 на6043749a3f: Done/source/user-v1/zero-event retry OBSERVED;
Close остановлен в open до body click на detached old SVG при same native owner,
unselected cell и exact current shape. Journal содержит body_prepared, без returned;
originalexec57140 actualexit1/CLEANUP_UNCONFIRMED. Отдельная recovery446/2767exit0
закрыла exact idle package и jsteach:4314 без Save, подтвердив absence после
Refresh, затем admin logout/browser/process absence. Исходный Close остаётся
AMBIGUOUS и весь run не принят; дополнительных сообщений о клике не было.

Узкая поправка к прежнему selection guard: только managed body pre-click, до
первого gesture, one detached redraw same previously unselected native cell.
Native document/account/preparation/workflow/model/diagram/graph/container/node
object/data/cell/icon, уникальная current connected shape/tid и original deadline
обязательны. Old shape disconnected, initial/current selection одинаково empty,
replacement count0→1. Полный snapshot/point/controls/blockers должен совпасть
с pre-ACK snapshot, кроме подтверждённого counter; точка click берётся из fresh
inspection. Default read/poll/private selected policy не расширяется. Owner,
selection, geometry, connected old shape, duplicate, second pre-click redraw,
blockers, ACK/deadline и unknown click reply по-прежнему refused; no replay.

Выбран этот bounded native redraw path вместо повторного открытия мастера или
отключения held-DOM guard. Нужны actual serialized managed body/native inspection
положительная и отрицательные проверки, client/operator regressions и новый
freeze/pin. Accepted original artifacts неизменны; next live — новый profile447,
не повтор старого operation_id и не повышение failed run до PASS.

Для следующего source фиксировать returned browser receipt отдельной записью
`javascript_managed_body_returned` с exact ACK, owner/deadline/expected snapshot
и native pre_click_dom_replacements. Loss ACK после gesture не позволяет replay.
У прежнего source такого event не было: отсутствие body_returned в original444
само по себе не является proof no click; место original отказа подтверждает
его actual stack/source до mouse.click, при сохранённом AMBIGUOUS outcome.
