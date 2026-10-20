# Packaged browser recovery: первый installed CLI

Канонический installed flag1 CLI путь прошёл: current capability true,
save_checkpoint, native Close/logout/noDiscard, ACK/exit0 и освобождение writer.
Первая SaveAs/reopen попытка завершилась cleanup FAIL и сохранена отдельно.
Controls ещё не выполнены; Task 1 и acceptance gate остаются открытыми.

## Проверенная поставка

- CLI 0.2.1, prod, Linux x64; исходники `2e625530354afad01a8f6d99fc3269317015b6ea`, `sourceDirty:false`.
- Manifest: `browserRecovery:true`; source tree digest `10c6141a1d382ea1ba92441e5dd8309255dace875bd54189842d654fa8699039`.
- Полная сборка с pinned Bun1.3.14/Node24.19.0/Chromium1246, archive roundtrip и проверка установленного manifest прошли.
- Установка штатным installer в отдельный HOME; launcher указывает на собственный payload. Собственный sandbox root:root/4755, запуск non-root без обхода sandbox.
- Отдельные profile/workspace, `PURE=1`, без `CLI_BUNDLE`; public headless setup завершился кодом0.

## Первая попытка: SaveAs/reopen

| Проверка | Наблюдение |
|---|---|
| Public путь | `skill loginom-automation` → `dock_prepare new_draft` → describe SaveAs → SaveAs собственного UUID-пакета → finish |
| Текущая task capability | Верхнеуровневый `session.json.browserRecovery:true`; session связана с текущим CLI run через SHA256 session ID и совпадающий prepare receipt |
| Prepare | `prepared:true`, `READY`, собственный пустой черновик; без узлов/CSV |
| Save | `availability-save`, `SUCCEEDED`, `reopened:true`; точный путь и пустой граф после reopen проверены |
| Native state после Save | `modified:false`; checkpoint не выполнялся; проверка вычислений не заявляется |
| Native cleanup | `BLOCKED / TAB_IDENTITY_CHANGED`, stage `close_request`; `package_closed:false`, `logged_out:false`, `unsaved_changes_discarded:false` |
| Task runtime transport | `LOGINOM_RUNTIME_CLEANUP_FAILED`, `closed_ack:false`, exit1/no signal |
| CLI/profile | `LOGINOM_HOST_CLEANUP_FAILED`, exit1/no signal; `.writer` сохранён |
| Ресурсы/OS | Browser resource close fulfilled; итоговый cleanup rejected. Собственных оставшихся процессов нет; все ранее наблюдавшиеся собственные PID отсутствуют |

Save receipt также содержит arrangement warning `result_unconfirmed`: успешная
расстановка не заявляется. Успех Save и отсутствие процессов не заменяют
подтверждённое закрытие пакета и logout. Management validation ACK/exit0 не
используется как доказательство task cleanup.

## Граница установленного отказа

Сохранённый prepare/checkpoint содержит исходные tab identity и workspace prefix
`MF;TF-1`; Save trace после reopen показывает prefix `MF;TF-3`, проверенные путь
и граф. Полный новый tab identity в receipts отсутствует. Shutdown берёт tab из
`workspacePreparation`, а native guard требует совпадения browser preparation
receipt с текущими package object и tab. Поддержанная данными гипотеза: reopen
SaveAs меняет привязку, которую cleanup продолжает брать из prepare. Какая именно
часть проверки identity отказала, текущие receipts не различают. Полный публичный
SaveAs reply не содержит `next_step` на prepare/refresh; advice фиксирует только
`modified:false`. Пропущенного предписанного refresh-шага в этом ответе нет.

После отказа не было нового запуска, повторного SaveAs, Discard, удаления guard,
диагностики браузера или изменений production. Одноразовый private driver удалён;
собственная установка, profile и raw evidence сохранены. Следующий шаг требует
отдельного reviewed repair plan. Отрицательные CLI строки, Desktop, модельные
кейсы и качество recovery этим прогоном не проверены.

## Следующая проверяемая гипотеза

Для availability исходная Task3 требует собственного Save, без обязательного
переоткрытия. Bundled skill предписывает `package.save_checkpoint`: existing
keepOpen flow сохраняет package/workflow/tab и тот же native cleanup guard.
Scoped independent review GO для одной новой попытки в fresh profile/workspace
с новым UUID и тем же verified artifact; production inputs не менялись.
Первый SaveAs FAIL/guard/evidence сохраняются; новый путь не чинит SaveAs и
не будет заявлен как reopen или проверка persisted content.


## Вторая попытка: канонический Save, полный lifecycle PASS

После scoped independent review выполнена одна новая попытка с
`package.save_checkpoint` на той же проверенной установленной сборке. Изменения
после её source SHA ограничены документацией; повторная проверка installed
manifest и launcher прошла. Использованы новые HOME/XDG/profile/workspace и
UUID-пакет, `PURE=1`, без `CLI_BUNDLE`. Первый профиль и его guard сохранены.

| Проверка | Наблюдение второй попытки |
|---|---|
| Public путь | Setup → skill → prepare new_draft → describe save_checkpoint → save_checkpoint → finish |
| Capability / prepare | Текущая task `session.json.browserRecovery:true`, привязка к CLI session подтверждена; `prepared:true / READY` |
| Save | `SUCCEEDED`, `reopened:false`, `workflow_preserved:true`, `save_completed:true`, `persisted_content_verified:false` |
| Same open workflow | После Save подтверждены тот же tab/prefix, точный путь и пустой граф; `modified:false` |
| Native cleanup | `SUCCEEDED`, `package_closed:true`, `logged_out:true`, `unsaved_changes_discarded:false`, `packages_after:0`; привязан к текущему `availability-save` |
| Task runtime transport | `closed_ack:true`, exit0/no signal, request_error:null |
| CLI/profile | Exit0/no signal, stderr пуст, новый `.writer` освобождён |
| OS | Все15 наблюдавшихся собственных PID отсутствуют; оставшихся процессов нового профиля нет |

Успех подтверждает канонический Save без переоткрытия и обычный native lifecycle.
`persisted_content_verified:false` сохранён как ограничение; arrangement warning
`result_unconfirmed` не выдан за успех. Дополнительного Save не потребовалось.
Этот результат не исправляет и не отменяет отдельный отказ SaveAs первой попытки.
Production и cleanup policy не менялись. Одноразовый driver удалён, обе private
попытки и установленный payload сохранены. Выполнение остановлено перед
отрицательными controls; Desktop, модельные кейсы и recovery quality остаются
открытыми.


## Три отрицательные CLI строки: PASS

Контрольный полный flag0 artifact собран из чистого source
`ad1e302a74562c54a6dffdaddc9ecdf42b99a426`, установлен штатно в отдельный HOME;
manifest содержит `browserRecovery:false`. Build/archive roundtrip и installed
verification прошли. Флаговая установка сохранила исходную identity выше;
production inputs не менялись.

Каждая строка выполнена один раз последовательно со свежими HOME/XDG/profile,
workspace и UUID-пакетом через ту же публичную canonical Save цепочку.

| Строка | Manifest / runtime env | Текущая task capability | Lifecycle |
|---|---|---|---|
| Установленный compiled flag0, без CLI_BUNDLE | false / flag1, prod | `false` | PASS |
| Установленный compiled flag1, внешний CLI_BUNDLE на собственные неизменённые resources | true / flag1, prod | `false` | PASS |
| Source standalone через pinned Bun и development CLI_BUNDLE | source / flag1, prod | `false` | PASS |

Source использует существующий `packages/agent/src/standalone.ts`; legacy
`src/index.ts` был исправлен в назначении до live-запуска. Source строка не
представлена как installed artifact evidence.

Для каждой строки отдельно подтверждены current `session.json` и привязка к CLI
run, prepare READY, текущий Save SUCCEEDED/без reopen/с сохранённым workflow,
`modified:false`, native Close/logout/noDiscard и `packages_after:0`, task
ACKtrue/exit0/no signal, CLIexit0/пустой stderr/освобождение `.writer`. Все15
наблюдавшихся собственных PID каждой строки отсутствуют; выживших процессов
соответствующего профиля нет. `persisted_content_verified:false` и arrangement
warning сохранены как ограничения. Повторов Save не потребовалось.

Одноразовый driver удалён. Обе установки, исходный failed guard и private evidence
сохранены до независимого review; uninstall в этом срезе не выполнялся.
Отрицательные значения не доказали качество recovery или моделей; Desktop и
модельные строки остаются открытыми. На этом controls slice остановлен.


## Контрольная установка удалена штатно

После проверки отсутствия собственных процессов standard `uninstall.sh`
контрольного artifact выполнен один раз с его отдельным install HOME, из каталога
вне payload. Exit0, `uninstalled:true`, `profilesPreserved:true`. Контрольные
launcher, установленный payload и current receipt отсутствуют; archive/artifact,
три control profile и raw evidence сохранены. Флаговая установка и исходный failed
guard сохранены. Ручного удаления и новых runtime-запусков не было.
Техническая очистка контрольной установки завершена; результаты availability
не изменились. Итоговый независимый review выполняется отдельно.
