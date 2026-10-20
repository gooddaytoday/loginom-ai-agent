# Browser recovery smoke — BLOCKED

2026-10-20, Linux x64, обычный пользователь, `DISPLAY=:1`, Loginom 7.4.2,
Node 24.19.0, Bun 1.3.14, Chromium 1246, MCP 0.0.82. Это source smoke,
не проверка установленного Desktop и не оценка качества модели.

Исходники runtime: `10ca8a403d4d2776d77680744a851eca006cca9f`.
Свежий штатный staging: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-task5/resources`.
Builder создал inventory из 4753 записей; SHA-256 `resource-manifest.json`:
`57d7067bbfb2620cf413d516d640c3786a8fe5af8bbf32d699c8af734a508b1d`.
Старые resources Task 0 не использовались.

Команда из `packages/desktop`:

```bash
DISPLAY=:1 \
LOGINOM_AI_AGENT_TEST_CONFIG=/home/george/.config/loginom-ai-agent-tests/browser-recovery.json \
LOGINOM_AI_AGENT_TEST_RESOURCES=/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-task5/resources \
/home/george/.cache/loginom-toolchain/bun-linux-x64/bun test/loginom/browser-recovery-acceptance.ts BR-S1
```

Приватные доказательства: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-task5/evidence/f6137e80-677b-46e9-9c51-06b080db8052`.
Каждый MCP-ответ сохранён отдельно; конфигурация и сырые журналы в Git не внесены.

| Сценарий | Результат      | Доказательство                                                                                               |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| BR-S1    | FAIL / BLOCKED | Первая попытка дошла до T1/handoff; следующие остановились на delivery, последняя — DISCOVERY_FILE_NOT_FOUND |
| BR-S3    | NOT_RUN        | Не запускался после неопределённости BR-S1                                                                   |

Ключевые квитанции:

- `02-dock_artifact_deliver.json`: `SUCCEEDED`, upload completion verified.
- `05-dock_node_wait.json`: import `SUCCEEDED`.
- Journal: `acceptance_fault_injected`, configure remaining=0 и release_refusal remaining=0.
- `10-dock_operation_recover.json`: `AMBIGUOUS`, `NODE_RELEASE_REFUSED`, browser recovery basis trigger `T1`; `user_action` в ответах отсутствует.
- `11-dock_browser_recovery.json`: `state:browser`, собственный Calculator/phase configure; journal handoff `verified:true`.
- `12-browser_snapshot.json`: узкий snapshot собственного `WizrdMCF` успешен. Наблюдается «Описание узла», кнопки мастера — безымянные `generic [cursor=pointer]`.
- `13-browser_find.json`: `No matches found for "Отмена".`, `isError` отсутствует, lease остаётся `browser`. Это подтверждённый пустой поиск, не transport uncertainty. Скрипт остановился до browser click, finish и Save. Полный DOM, unsafe code, evaluate и обходные жесты не использовались.
- `result.json`: `FAIL`, `Button must match exactly once`; журнал содержит fault и handoff, но не verified/dock_resumed.

Причина остановки — не выполнено условие единственного доступного текстового
совпадения кнопки в мастере. Snapshot подтверждает отсутствие её доступного имени;
скрипт не угадывал кнопку по порядку или внутреннему DOM. Следующая гипотеза
должна быть согласована с контроллером до нового прогона; текущие доказательства
не разрешают объявить browser recovery успешным.

Cleanup: `package-cleanup.json` = `BLOCKED / CLEANUP_OR_OPERATION_UNCONFIRMED`.
Runtime close receipt: `closed_ack:false`, `LOGINOM_RUNTIME_CLEANUP_FAILED`, exit=1.
Закрытие собственного несохранённого пакета и полная очистка browser/transport
не подтверждены. Завершение процесса не считается доказательством закрытия.
Исторический несохранённый пакет первой попытки Task 0 также остаётся отдельно
неподтверждённым; этот запуск не меняет его статус.

Проверки: Desktop `bun typecheck` PASS (его tsconfig охватывает `src`, не новый
acceptance script); отдельный `bun build --target=bun --packages=external`
скрипта PASS. Нативное выполнение подтвердило путь до public browser_find.
Полная runtime suite не повторялась: production code не менялся.

TDD: это acceptance-сценарий; RED — реальный BR-S1 FAIL выше. GREEN для полного
сценария отсутствует. Зеркальные unit-тесты и фиктивный pre-code RED не создавались.
Скрипт/runbook остаются незавершённой приёмкой; BR-S3 и ветви после find не проверены.

Попытка 2: приватный каталог `a5bf3343-55b1-4dcc-9997-556a0bab0a20` рядом с первой
попыткой. До проверки новой ref-гипотезы delivery вернул `NOT_APPLIED`,
`UI_EPOCH_CHANGED` на `deliver:nav1`, `effect_possible:false`,
`cleanup_complete:true`, `upload_submitted_or_unknown:false`,
`inspection_required:false`. Ответ предложил `dock_artifact_delivery_resume`
той же операции; harness остановился без повторной загрузки. Native node/recovery
не запускались. Закрытие несохранённого prepared package не подтверждено,
managed close ACK отсутствует. Отдельно офлайн исправлено ожидание асинхронного
`dock_node_read` через `dock_node_wait`; этот путь попытка 2 не достигла.

Попытка 3: приватный каталог `2f3ccbb6-4edf-4e0f-8ad4-9648ff043ec4` рядом с
предыдущими. `02-dock_artifact_deliver.json`: `AMBIGUOUS`,
`effect_possible:true`, `upload_submitted_or_unknown:true`,
`inspection_required:true`, без `next_step`; `Destination bytes require inspection`.
Upload receipt подтвердил native input submission, но потребовал server verification.
Journal `download_completed` (`artifact.download`) и `download_verified`
(`artifact.verify`) для `deliver:verify`: `AMBIGUOUS`, phase `discovery`,
`cleanup_complete:true`, `DISCOVERY_FILE_NOT_FOUND`. Native file store:
ready=true, complete=true, loading=false, count=total=604, file_ready=false;
масок и диалогов нет. Проверка байтов не получена. Повторного upload/resume
после этого исхода не было. Managed close receipt: `closed_ack:false`, exit=1,
`LOGINOM_RUNTIME_CLEANUP_FAILED`; package cleanup `BLOCKED / CLEANUP_OR_OPERATION_UNCONFIRMED`.
Read-only inspect в том же runtime невозможен после его завершения.

В итоговом harness bounded wait узлов повторяет существующий acceptance flow;
один delivery resume допускается только для явно предложенного checkpoint с
NOT_APPLIED/no effect/confirmed cleanup/no submitted upload/no required inspection.
Он не применяется к AMBIGUOUS, неизвестной загрузке или download verification.
Save использует existing checkpoint continuation и проверяет native modified=false;
очистка сверяется с собственным package/save operation. Эти ветви после browser
find пока не проверены нативно. Ref-поиск собственной btnClose/btnExecute также
остаётся непроверенной гипотезой: попытки 2–3 не достигли мастера.

Итог **BLOCKED**, Task 5 не завершён. По решению владельца доставка входного файла
отложена как внешняя к browser recovery область; продукт доставки и setup обходы
не менялись. Условие возобновления: получить успешную проверенную доставку через
тот же существующий flow, затем пройти BR-S1 с ref/owner проверкой и BR-S3.
До этого release gate остаётся закрыт. Все три приватных evidence-каталога сохранены;
отсутствие подтверждённого cleanup каждой попытки не подменяется успехом другого запуска.

## Последующая однократная setup-проба — BLOCKED

После независимого GO проверена возможность использовать собственный сохранённый Import как вход штатного Group. Harness и production не менялись; BR-S1/BR-S3 в этой пробе не запускались. Исходники: `677e5ece918b236baa21980ffd0bd5e5d3db89fd`; свежий staging текущим builder, 4753 inventory entries, resource manifest SHA-256 `ba5c5af9aa1728812d4732b849f6ecaa829560d27923404c12a3c0b3ad9beec3`.

Приватный evidence: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-resume-pilot/evidence/ffe039af-6894-499e-8dd4-e6db308eb730`; resources — соседний `browser-recovery-20261020-resume-pilot/resources`. Config и сырые журналы в Git не внесены.

- Open seed, уникальная собственная SaveAs-копия (`SUCCEEDED`, `reopened:true`) и fresh prepare — успешны. Исходный seed не изменялся; старые UI refs не переносились.
- Одна Group-операция завершена `NOT_APPLIED`, `effect_possible:false`, `cleanup_complete:true`, `NODE_APPLY_STOPPED`: `Grouping preflight requires an active source output zero`. Свежий результат Alpha=35/Beta=20 и финальный Group Save не достигнуты; saved-A manifest не создан. Историческая выборка seed не выдана за свежий результат.
- Текущая собственная копия закрыта: package cleanup `SUCCEEDED`, `package_closed:true`, `logged_out:true`, `unsaved_changes_discarded:false`, `save_operation_id:copy-seed`; managed close `closed_ack:true`, `exit_code:0`, `request_error:null`. Это не подтверждает cleanup предыдущих неудачных попыток.
- Временный probe script удалён; повторов, вызовов Calculator/imports.text/delivery и изменения harness не было. Разрешение на замену setup не открыто; подготовка с неактивным source output0 не повторяется.

Task 5 остаётся отложен до реально проверенного активного входа текущего runtime. Приёмочные критерии и release-гейт сохраняются; независимая работа над evals может продолжаться по указанию владельца об отложенных блокерах.

## Подготовка по уточнённому назначению — остановлена на дефекте пробы

После независимого GO выполнен свежий штатный staging из `5368a2fbfbc81d9861a586f1bcde102b776b3102`: 4753 inventory entries, manifest SHA-256 `4f48f2c8b8ed1495aa4058170c6d481531c24ec3891fbf2616800430b85d8452`. Private evidence: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof`. Production и harness не менялись.

Две команды остановились до browser/login из-за дефектов временной пробы: запуск hash-identical Node вне обязательного staged path (`LOGINOM_NODE_PATH_MISMATCH`), затем лишний filename-prefix gate исторического seed. В третьей попытке (`prep12-native`) открытие seed READY и собственный SaveAs SUCCEEDED/verified/cleanup_complete, `reopened:true`, path совпал с новой копией. Затем ошибочный assert поля `save_completed` от checkpoint получил undefined: actual SaveAs output содержит package_ref/reopened/arrangement/reporting_constraints. Fresh prepare, internal Import execute/read и Group NOT_RUN; гипотеза активного входа ещё не проверена.

Guarded package cleanup третьей попытки BLOCKED, `TAB_IDENTITY_CHANGED`: package_closed:false, logged_out:false, без discard. Resource trace дошёл до client close fulfilled и bridge_ack rejected; browserServer/context close этим путём не достигнуты. Exit1 и отсутствие post-exit exact profile/script process matches не доказывают полный descendant cleanup; исходный PID/PGID не фиксировался. Собственные package/logout/resources остаются UNCONFIRMED. Это не изменяет cleanup предыдущих запусков.

После третьего дефекта проба остановлена для пересмотра: общая ошибочная предпосылка — перенос проверок похожего checkpoint-ответа на SaveAs. Временный candidate упрощён до действительных SaveAs полей и немедленного fresh prepare; до следующего native запуска назначен independent read-only preflight. Первый свежий Import, Group/Save, cold public Group и BR-S1/BR-S3 по-прежнему не подтверждены. Временный код удерживается только до этого анализа, затем удаляется; private evidence/profile сохраняются.

## Исправленная подготовка: свежие Import и Group подтверждены

После focused candidate review и scoped исправлений выполнена одна попытка `browser-recovery-20261020-fixture-proof/prep12-reviewed` на том же свежем staging (runtime bytes не менялись; последующие source commits меняли только документы). Подготовка 1 PASS: own SaveAs → fresh prepare → existing Import execution completed/verified/owner_verified, Category:string/amount:integer, полная exact выборка Alpha10/Beta20/Alpha25, restore и возврат на graph подтверждены. Public Group SUCCEEDED/cleanup_complete с fresh Category:string/Total:real, двумя строками Alpha35/Beta20 и numbers_verified. Это первый подтверждённый активный вход текущей подготовки.

Подготовка 2 остаётся BLOCKED: checkpoint `save-group` вернул NOT_APPLIED, phase applying, effect_possible:true, output.conflict:true, cleanup_complete:true. Журнал содержит save_conflict_observed и conflict_rejected; исходники executor связывают это с политикой fail на уже существующем собственном SaveAs-пути. Сохранение Group не подтверждено, saved-A manifest отсутствует; cold public шаг 3 и BR не запускались. Следующая конкретная гипотеза — штатный conflict_policy:replace только собственной копии при checkpoint; уникальный SaveAs сохраняет fail, active-input/lineage/identity guards неизменны.

Cleanup этой попытки BLOCKED/UNSAVED_CHANGES: package_closed:false, logged_out:false, без discard; resources ACK unconfirmed. После exit1 собственный PID отсутствует, PGID пуст, exact profile-process matches отсутствуют, profile сохранён; эти факты не доказывают logout/package cleanup. Прежние неизвестные cleanup сохранены отдельно. Подготовка 1 отмечена, подготовка 2 целиком и setup blocker ещё не закрыты.

## Подготовки 1–2 PASS; cold public результат получен, Save/cleanup ещё не завершены

После scoped review выполнена одна новая попытка `browser-recovery-20261020-fixture-proof/prep12-own-checkpoint`. Fresh Import и Group повторно подтверждены в своей новой копии. Checkpoint с replace только этой копии — SUCCEEDED/save_completed/workflow_preserved, modified:false. Native cleanup SUCCEEDED, package_closed/logged_out:true, unsaved_changes_discarded:false, save_operation_id совпал с checkpoint; bridge/browserServer/context close fulfilled, complete fulfilled, exit0. Private saved-A manifest создан в существующей форме. Подготовка 2 отмечена выполненной; этот cleanup не подтверждает прежние попытки.

Затем в новом supervise/chat/profile без faults выполнен только публичный existing Group с parameters:{}, inputs:[], mappings:[], aggregate/execute (`prep3-public-cold`). Group SUCCEEDED/cleanup_complete/completed, fresh exact полная выборка по именам Alpha35/Beta20, те же Category:string/Total:real. Проба остановилась на позиционном schema assert: после cold output порядок Total,Category вместо Category,Total. Final Save не запускался. Native cleanup BLOCKED/CONFIRMED_SAVE_REQUIRED, managed ACK:false/exit1; отсутствие собственных PID/PGID не доказывает logout. Шаг 3 не засчитан.

Независимый read-only разбор: roles/functions/options/input_mapping совпадают; output port/autosync и все свойства полей, кроме order/index, совпадают по имени, включая source bindings. Фиксированный output layout в Task5 не задан, mappings пусты/autosync:true. Первая записанная cold-инвентаризация уже имеет обратный порядок до output-mapping edits; точная причина перестановки не установлена. Поэтому позиционный gate — лишний критерий пробы; следующее минимальное исправление сравнивает output по именам, сохраняя все остальные проверки и исходный readback. Оно не отменяет контракт явно запрошенного порядка и не выдаёт неуспешный cleanup за PASS. Для допуска harness по-прежнему нужен новый полный Step3 с final Save/modified:false/cleanup/ACKexit0.

## Named cold-попытка: readonly target, Group AMBIGUOUS

После scoped GO выполнен один новый public managed запуск `browser-recovery-20261020-fixture-proof/prep3-named-cold`. Уже prepare содержит READY/target_verified:true и native navigation «(только чтение)». ownership_verified:false отдельно не доказывает readonly: workspace устанавливает этот флаг только для new_draft; успешные open_package также имели false. Group settled AMBIGUOUS/input_mapping, effect_possible:true, cleanup_complete:false; execution:not_requested, NODE_APPLY_STOPPED: readiness timeout existing grouping before input schema refresh, no mutation was authorized. Нового свежего результата этой попытки нет; прежние cold данные к ней не приписываются.

Resume/retry/inspect/Save не выполнялись. Native cleanup BLOCKED/CLEANUP_OR_OPERATION_UNCONFIRMED, managed ACK:false/exit1 без signal. Parent/child PID отсутствуют, own PGID пуст, profile сохранён; logout не подтверждён. Причина readonly и её связь с прежней незавершённой сессией не установлены. Подготовки 1–2 и их подтверждённый cleanup сохраняют свой результат; это не снимает новый блокер.

Независимо принят следующий ограниченный план: одна новая UUID-заготовка исходного Task0 seed через уже проверенные подготовки 1–2, полный Save/cleanup; затем один cold public запуск нового manifest/path с ранним отказом при readonly navigation. Все semantic/read/finalSave/cleanup критерии прежние. Старые операции не повторяются и не разблокируются, новые hooks/API/fixture infrastructure не добавляются. Если readonly повторится на новой очищенной копии — STOP с внешним ограничением; последующие варианты не разрешены этой гипотезой.

## Подготовки 1–3 PASS — блокер подготовки снят

После independent GO выполнена одна новая уникальная заготовка `browser-recovery-20261020-fixture-proof/prep12-fresh`: fresh Import/Group с прежними точными schema/data, checkpoint modified:false, native package close/logout без discard, resource closure и exit0 подтверждены. Новый private manifest `saved-A-fresh.json` создан только после cleanup, старый manifest сохранён.

Один новый managed public запуск `prep3-fresh-cold` открыл эту сохранённую копию без readonly-метки. Existing Group parameters:{}/inputs:[]/mappings:[] завершился SUCCEEDED/cleanup_complete/completed; fresh execution-linked полная exact выборка Alpha35/Beta20, schema Category:string/Total:real по именам. Roles/functions/options/input mapping и все output field properties/bindings, кроме незаданного order/index, сохранены. Native column order наблюдается Total,Category; его причина не заявляется. Internal execution/foreign node_read/исторические operation IDs не использовались.

Final checkpoint `save-cold-group` SUCCEEDED/save_completed/workflow_preserved, modified:false. Native cleanup SUCCEEDED/package_closed:true/logged_out:true/unsaved_changes_discarded:false, exact path/save operation совпадают с текущим запуском. Managed close ACK:true/request_error:null/exit0 без signal, parent exit0. Собственные PID/PGID отсутствуют. Оба временных one-off скрипта удалены; evidence/profiles/reviews сохранены.

Ключевые private доказательства: `prep12-fresh/step2.json`; `prep3-fresh-cold/fresh-group-proof.json`, `05-dock_action_run.json`, `result.json` и связанная nested cleanup/close receipt. Ресурсы — тот же проверенный stage; runtime bytes не менялись. Успешный новый cleanup не закрывает исторические TAB_IDENTITY_CHANGED, UNSAVED_CHANGES, CONFIRMED_SAVE_REQUIRED и CLEANUP_OR_OPERATION_UNCONFIRMED. Причина readonly старой копии остаётся неизвестной.

По действующему критерию шаг 3 PASS снимает setup blocker и разрешает заменить только setup harness. BR-S1/BR-S3 ещё не запускались на этой заготовке, Task5 не завершена; release-гейт закрыт.


## Исходные BR-S1 и BR-S3 — native PASS

Harness/runbook зафиксированы до запуска: `3bcfcca05b`. Изменён только setup:
обязательный private saved-A manifest → seed → собственная UUID SaveAs-копия/fail →
fresh prepare → public existing Group с пустым patch → свежие Alpha35/Beta20.
Calculator использует Group и `Total*2`, прежний integer target/no output mapping.
Checkpoint/replace ограничен точным путём собственной SaveAs-копии. Production,
fault counts, T1/T3, browser operator, fresh read и исходные критерии не менялись.

Повторно использован проверенный свежий stage с исходной идентичностью builder,
указанной выше; manifest hash проверен перед BR. Новый harness SHA не приписан
staging. Обе команды выполнены из `packages/desktop` pinned Bun, DISPLAY=:1,
sandbox ON; child использовал фактический `resources/bin/node`. Аргументы:
`test/loginom/browser-recovery-acceptance.ts BR-S1 <private saved-A-fresh.json>`,
затем тот же вызов с `BR-S3`, только после полного первого PASS. Config/resources
переданы штатными `LOGINOM_AI_AGENT_TEST_CONFIG`/`LOGINOM_AI_AGENT_TEST_RESOURCES`.

Evidence root: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/evidence`.

| Сценарий | Private subdirectory | Подтверждённые исходы |
| --- | --- | --- |
| BR-S1 | `2f0a10f2-2419-4584-b9fe-d7dab995504f` | Group fresh exact PASS; T1; own cancel с наблюдённым подтверждением; continuable; calculator-corrected SUCCEEDED; fresh read SUCCEEDED; configure/release по одному, remaining0 |
| BR-S3 | `7d0af26a-14e4-4594-8db3-7194a3b2f03e` | Group fresh exact PASS; T3 после release; own execute/wait; completed с verified console execution и Preview schema; read source br-1:receipt SUCCEEDED; configure два раза, remaining1 |

BR-S1 receipts: `05-dock_node_wait.json` Group; `09-dock_operation_recover.json` T1;
`22-dock_browser_recovery.json` continuable; `24-dock_node_wait.json` новая existing
операция; `26-dock_node_wait.json` read; `27-dock_action_run.json` Save.
BR-S3: `05-dock_node_wait.json` Group; `11-dock_node_wait.json` T3;
`18-dock_browser_recovery.json` completed; `20-dock_node_wait.json` read;
`21-dock_action_run.json` Save. Каждый `result.json` — PASS, все четыре требуемые
journal phases присутствуют, `user_action` отсутствует во всех ответах.

В обоих сценариях `save` SUCCEEDED/save_completed/workflow_preserved, exact own
path, modified:false. Native package-cleanup SUCCEEDED, package_closed/logged_out
true, no discard, packages_before1/after0; path и save_operation_id совпали с
собственным admission/final Save. Managed close ACK:true/request_error:null/exit0
без signal, parent exit0. Runtime children2081199 и2087547 использовали staged
Node; parent/PGID2081186 и2087534 и оба child после выхода отсутствуют, exact
profile-process matches отсутствуют (`stop-resource-observation.json`). Logout
подтверждён native receipts, а не отсутствием процессов.

До native: syntax transpile PASS, Desktop package-local `bun typecheck` PASS с
pinned PATH/TEST_NODE, `git diff --check` PASS. Source suites не повторялись:
production/runtime не менялись. Smoke проверяет scripted operator; installed
Desktop/release и качество модели не проверены. Дополнительный numeric/schema
acceptance gate Calculator не добавлен: BR-S3 Preview фактически содержит также
Expr1:real; исходный критерий требует verified schema/read и выполнен. Это
наблюдение не объявляет настройки модели полностью независимо проверенными.
Исторические TAB_IDENTITY_CHANGED, UNSAVED_CHANGES, CONFIRMED_SAVE_REQUIRED,
CLEANUP_OR_OPERATION_UNCONFIRMED и unknown upload остаются неподтверждёнными.
Task5 metadata/checkboxes оставлены root до независимого review; merge/release
не выполнялись.
