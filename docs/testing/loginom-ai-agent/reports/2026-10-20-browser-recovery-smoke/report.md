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
