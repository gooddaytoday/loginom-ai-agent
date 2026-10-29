# Browser recovery: остальные source-сценарии

Статус: ordinary Export, BR-S2 и новая попытка BR-S4 — native PASS. BR-S6 — negative assertions PASS, cleanup BLOCKED/ACKfalse/managed exit1; это не recovered/export/Save success. BR-S5 отложен: последний FAIL на storage verification подтвердил no_scroll_owner; причина отсутствия anchors не установлена, текущие файл/Save/native cleanup не подтверждены. Независимое review кода Task2 Approved, Task2 открыт из-за S5. Исторические FAIL/UNKNOWN сохранены ниже. Это scripted source acceptance; установленный продукт и качество модели здесь не проверяются.

## Обычный Export без fault — 20.10.2026

Проверены исходники `c7ef577634283347c7f60957f9901edbbf73570d`. Использован неизменный stage из [smoke-отчёта](../2026-10-20-browser-recovery-smoke/report.md), с исходной identity и resource-manifest SHA; runtime/Host/Product/Agent inputs с его origin не изменялись. Старым ресурсам новый source SHA не присваивался.

Одна managed-сессия: собственная SaveAs/fail-копия saved-A, fresh prepare, публичный existing Group с текущими Alpha35/Beta20, новый Export в собственный UUID destination под подготовленным exports-каталогом, overwrite reject. AcceptanceFault отсутствует. Параметры: UTF-8, разделитель `;`, names, без BOM, LF, decimal `.`, пустой null_marker, qualifier `"`.

Результат SUCCEEDED/completed/cleanup_complete. Текущие destination_check existed:false, execution ownership и raw download/lease receipts связаны с единственным public artifact и retained файлом; второй download не выполнялся. CSV имеет header `Total;Category`, строки `35;Alpha`, `20;Beta` и завершающие LF; поля сопоставлены по именам текущего Group. Raw размер32байта, независимо пересчитанный SHA-256 `2f73ef403757e282950b79bbdffd6ca037acdd281c71da3d2f379e844d08f140` совпал с public/raw receipt, также после shutdown.

Final Dock Save по точному собственному пути: modified:false. Native cleanup SUCCEEDED/package_closed:true/logged_out:true/unsaved_changes_discarded:false; path/save_operation_id совпали с текущим Save. Managed ACK:true/exit0/no signal; все12 наблюдённых собственных PID отсутствуют, обе собственные PGID пусты. Процессные факты не заменяют отдельную native-квитанцию.

Private evidence: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/export-mainpath-8600df10-3e12-467c-ad7f-ec34c128c997`; result.json, MCP receipts01–08, текущий execution journal, package-cleanup и runtime-close. Каталоги0700, файлы0600; server paths, node IDs, credentials и raw logs в Git не включены. Временный probe удалён. Syntax transpile PASS; package tests/typecheck не повторялись для одноразовой пробы без tracked code changes.

Это доказательство обычного Export, не BR PASS и не вход/fixture для следующих сценариев. Каждый BR получит собственный UUID destination и текущие квитанции. Исторические unknown upload/cleanup и readonly из smoke-отчёта этим результатом не закрыты.

После принятой пробы реализован BR-S2 по уточнённому плану5Task2; [CI fixture follow-up](../../../../superpowers/plans/2026-10-20-browser-recovery-native-fixtures.md) принят по native Source checks. BR-S6 учитывается как отрицательная проверка, отдельно от native cleanup/shutdown.


## BR-S2 — 20.10.2026: PASS

Source `1a6a6b44544af542788a29dce9e1fa6bc2b48e18` закоммичен до native-прогона. Stage origin `5368a2fbfbc81d9861a586f1bcde102b776b3102`, resource-manifest SHA-256 `4f48f2c8b8ed1495aa4058170c6d481531c24ec3891fbf2616800430b85d8452` сохранены; runtime bytes не менялись. Before-live: harness syntax transpile PASS, Desktop package-local pinned `bun typecheck` PASS, `git diff --check` PASS. S1/S3 native не повторялись; их действия/assertions сохранены. Runtime/Host/API/dependencies не менялись.

Private evidence: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/evidence/d9b17d5f-005c-4614-bf1f-34a4ea8f1562`; launcher logs: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/br-s2-launch-acb4f719-b4fd-4e45-b069-86f5fc47769e`. Каталог0700, MCP/result/logs0600. Один managed браузер, свой новый SaveAs/fail package и UUID destination; вход — текущий свежий Group Alpha35/Beta20, обязательный saved-A manifest.

- MCP07: original `export` settled AMBIGUOUS после единственного configure fault (`remaining:0`). MCP08: T2/NO_RECOVERY_OPTIONS, recovery_options=[]; Export release не вызывался.
- MCP09–20: browser handoff на тот же узел; текущие public refs/единственность/принадлежность own мастеру, observed «Отмена», подтверждение точного вопроса через own «Да», ожидание закрытия. Одиннадцать разрешённых browser calls; eval/unsafe/navigation нет.
- MCP21: finish→dock/continuable, `receipt_id:br-1:receipt`, remaining18 =30−11−1finish. MCP22: original `export` теперь FAILED, output.released_by=browser_recovery, output.recovery_receipt_id=br-1:receipt; original не объявлен SUCCEEDED.
- MCP23–24: новый `export-corrected` с полными настройками/inputs[]/mappings[] на том же existing node и том же destination; SUCCEEDED/completed/cleanup_complete:true. Ни resume, ни recreate, ни dock_node_read не применялись.
- Current configure/destination_check verified:true/existed:false; current session/document/workflow/node/execution binding, download `export-corrected:export-download`, public artifact/raw bytes receipts совпали. Retained файл32bytes, SHA-256 `2f73ef403757e282950b79bbdffd6ca037acdd281c71da3d2f379e844d08f140`, UTF-8/LF без BOM, header Total;Category и Alpha35/Beta20 по именам текущего Group. Файл независимо перечитан после shutdown; размер/hash совпали. Исторический файл не использовался, второго download не было.
- MCP25: final Save собственной копии, native modified:false. package-cleanup SUCCEEDED/package_closed:true/logged_out:true/unsaved_changes_discarded:false; own path и save_operation_id=`save` совпали. Единственный child.close дал managed ACKtrue/exit0/no signal; resource-close complete fulfilled. Все12 зафиксированных own PID отсутствуют, обе own PGID пусты; ручного kill не было.

В журнале все четыре требуемые фазы: acceptance_fault_injected, browser_recovery_handoff, browser_recovery_verified, browser_recovery_dock_resumed. Harness exit0/PASS, stderr пуст. Исторические unknown upload/cleanup сохраняются. BR-S4/S5/S6 не запускались; следующий шаг — чтение квитанций root и отдельный допуск S4.


## BR-S4 — 20.10.2026: FAIL / check defect, остановлено

Source до native: `44ea2182226579b9f30c02d0864d0bf65575ce2a`; stage origin/hash прежние, production/runtime не менялись. Syntax transpile PASS, package-local Desktop pinned `bun typecheck` PASS, diffcheck PASS; после commit worktree clean. Native запуск один, exit1, stderr пуст; S5/S6 не запускались.

Evidence: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/evidence/1e0bc380-d64f-4e70-ac3e-0e30a90df3a8`; launcher logs `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/br-s4-launch-e727f2aa-3e4d-4388-9a7f-2bde73239bba`. MCP01–05 подтверждают свою SaveAs/fresh prepare/точный Group. MCP07: ожидаемый execute fault×1/remaining0, original calculator AMBIGUOUS. MCP09: Dock release SUCCEEDED, original execution unknown, T4/effect execution. MCP10→11: start→finish с actions[], browser calls0; runtime вернул dock/completed, execution verified:true/owner_verified:true/status completed, output_schema verified:true, receipt br-1:receipt, next_step dock_node_read с совпавшим source_operation_id.

После успешного finish добавленный assertion harness ошибочно ожидал calls_remaining29; фактический ответ30. Точная ошибка: `Expected values to be strictly equal: 30 !== 29`. Исходники `client/lib/browser-recovery.mjs:177` удаляют budget key при completed, а :92–94/:183–184 возвращают полный новый остаток30/600000. Это дефект приёмочной проверки, не обнаруженный дефект runtime. Read и final Save не вызваны, поэтому BR-S4 PASS не установлен. Нужна отдельная поправка harness/runbook: убрать ошибочную предпосылку29; не менять runtime и не добавлять новый критерий.

Existing close вызван один раз: package-cleanup BLOCKED/reason UNSAVED_CHANGES, package_closed:false/logged_out:false/unsaved_changes_discarded:false, последняя Save-квитанция own-save-as. Managed close request_error LOGINOM_RUNTIME_CLEANUP_FAILED, closed_ack:false, exit_code1/exit_signal:null. resource-close bridge_ack rejected. Все12 наблюдённых own PID отсутствуют и обе own PGID пусты; это не подтверждает native Close/logout. Ручного kill/повторной очистки не было. Сохранились три journal phases (fault/handoff/verified), dock_resumed отсутствует из-за раннего assert.

При первом неожиданном FAIL работа остановлена; код и live запуск не повторялись. Для возобновления требуется root review и допуск минимальной поправки check. Неизвестная native очистка этой попытки остаётся отдельной записью; последующий PASS её не закроет. Исторические unknown также неизменны.


## BR-S4 — 20.10.2026: новая попытка PASS

После root review удалён только лишний post-completed assert29 и соответствующая фраза runbook; expected30 не добавлен. Pre-live source `3e3d6afeea6714299e14a2d525a700f354b000b2`, поправка двух файлов +1/−2. Syntax transpile, Desktop package-local pinned `bun typecheck` и diffcheck PASS. Stage origin/hash прежние; production/runtime не менялись. Один новый запуск, новая собственная SaveAs/fail-копия и текущие refs; старые копия/сеанс не открывались и не очищались.

Evidence: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/evidence/b8b91582-0470-4425-ad1f-daa15d588d2a`; launcher `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/br-s4-fix-launch-e54dd04c-da66-4929-9f14-c7741ed439b1`. Каталог0700, public receipts0600, stderr пуст, harness exit0/PASS.

MCP01–05: own SaveAs/fresh prepare/Group Alpha35/Beta20. MCP07: execute fault×1/remaining0, calculator AMBIGUOUS. MCP09: обычный Dock release, T4/effect execution. MCP10→11: start→finish actions[], browser calls0, dock/completed; execution verified/owner_verified/status completed и output_schema verified. MCP12→13: read по текущей br-1:receipt, SUCCEEDED, output0 fresh:true, execution binding совпал. Numeric70/40 и budget-after-completed критерии не добавлялись. Все четыре требуемые journal phases присутствуют.

MCP14: Save текущей собственной копии, modified:false. Native package-cleanup SUCCEEDED/package_closed:true/logged_out:true/unsaved_changes_discarded:false, точные path/save_operation_id=save совпали с текущим Save. Managed close один раз: ACKtrue/exit0/no signal, request_error:null; resource-close complete fulfilled. Все12 зафиксированных own PID отсутствуют, обе PGID пусты; ручного kill не было. Это отдельные подтверждения native cleanup и OS shutdown.

Ruling: убрать внутреннее числовое ожидание, не менять критерий пользовательского результата и runtime. Стоимость: −1 assertion и правка одной строки документации; один новый native run по согласованной гипотезе. Новых механизмов нет. Гипотеза подтверждена до read/Save/cleanup. Первый FAIL и его native cleanup UNKNOWN не закрыты этим PASS; прежние unknown upload/cleanup сохраняются. S5/S6 NOT_RUN; STOP до проверки root, Task2 целиком не завершён.


## BR-S5 — 20.10.2026: FAIL до execute fault, STOP

Pre-live source `833f11423c499252e66772a70418cbb004e294f0`. Stage origin/resource-manifest SHA сохранены как в BR-S2 выше; восемь исходных файлов диагностируемой runtime-границы побайтово совпали со stage. Before-live syntax transpile/Desktop package-local pinned typecheck/diffcheck PASS. После запуска изменён только отчёт; повторные native проверки не выполнялись.

Private evidence: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/evidence/83078122-4bec-488a-95a1-2adfd890686b`; launcher `br-s5-launch-f1c00d21-4977-4dd6-9fe0-45c002abfd3e` под тем же private base. Один managed запуск, новая собственная SaveAs/fail-копия, fresh Group и новый UUID destination/replace. MCP07: original Export AMBIGUOUS/configure, execution not_requested, cleanup_complete:false; `NODE_APPLY_STOPPED: UI reference is absent, ambiguous, or does not support this action`. Faults=[]; execute и acceptance_fault_injected не достигнуты.

Первый отказ — выбор decimal_separator «Точка (.)»: journal477–479, n29, NOT_APPLIED/UI_EPOCH_CHANGED/effect_possible:false/cleanup_complete:true, без preconditions_verified/gesture_applied; разрешён bounded refresh. Следующий snapshot n30 сохраняет stage, но не содержит старого ref и select_wizard_option. Оба snapshot ограничены (`ui.truncated.elements:true`), поэтому физическое закрытие dropdown не доказано. `client/lib/text-export-procedure.mjs:101–102` захватывает choice.ref до refresh и проверяет ready только по stage; `node-procedure.mjs:724,753,640–642` повторно подаёт старый ref в validateUiAction; `workspace-ui.mjs:40–43` выбрасывает указанную ошибку до нового dispatch. Offline воспроизведение настоящим validator на сохранённых n28/n30 подтвердило точное исключение без UI/runtime calls. Это defect Export refresh, не ошибочный expected результат harness; причина исходного изменения epoch остаётся неизвестной.

MCP09: stopped/handoff_unverified, handoff reason RECEIPT_UNSETTLED, tools:[], verification/settlement/safe_release:null. `executor.mjs:2393–2409` требует свежее completed+cleanup browser receipt; исключение чтения сворачивается в unsettled. Последняя записанная mutation n29 завершилась безопасным отказом, но её journal outcome не заменяет свежую receipt. Underlying readReceipt error/state не сохранён: около10с до handoff совместимы с timeout10000, но не доказывают его. Нельзя приписать отказ deadlock/потере связи или разрешить handoff по старому journal. Recovery-фаза только handoff; finish, file bytes/SHA, final Save и S5 completed не проверены. Harness сообщил FAIL: actual stopped != expected browser; stderr пуст.

Existing close один раз: native BLOCKED/CLEANUP_OR_OPERATION_UNCONFIRMED, последняя Save own-save-as. Managed request_error LOGINOM_RUNTIME_CLEANUP_FAILED, ACKfalse/exit1/no signal; bridge_ack rejected. Package close/logout неизвестны. Read-only `/proc` в 09:30:07Z: все12 exact PID из start snapshot отсутствуют, обе сохранённые PGID пусты; private own-processes-final.json сохранён0600. Сигналы/kill/второй runtime/повторная очистка не применялись. Отсутствие процессов не подтверждает native cleanup.

Минимальная следующая гипотеза: на разрешённом source follow-up разрешать текущий option по свежему snapshot и требовать его присутствия в ready, сохранив owner/intent/deadline; сначала локально проверить refresh. Это ещё не докажет успешность при отсутствующей опции. Для отдельной причины handoff требуется фактический readReceipt error/result; новые live-пробы здесь не разрешены. Ruling: сохранить FAIL и неизвестную очистку, не повторять эффект и не ослаблять receipt proof; стоимость — S5/Task2 остаются открытыми. S2 и новая S4 PASS сохранены, первый S4 FAIL/native cleanup UNKNOWN и прежние unknown неизменны; S6 NOT_RUN.

## Export refresh follow-up — 20.10.2026: source PASS, BR-S5 FAIL / STOP

Source `2ddea10ae2ca41f70d2bb446110f65746733a91a`: configureTextExport теперь ждёт единственный вариант прежних exact stage/tid/label/action и разрешает ref из текущего наблюдения. Existing bounded channel, identity/intent, deadline и receipt proof сохранены; остальные callbacks не менялись. Одна регрессия через настоящую процедуру/callbacks: RED old-option вместо fresh-option; GREEN проверяет свежий ref и отказ readiness для отсутствующей/чужой/неоднозначной опции. Focused text-export-lifecycle + node-procedure:134/134 PASS. Обычный package-local `bun run test:upstream` с pinned Node24.19.0:4469 PASS,14 SKIP,0 FAIL, exit0; diffcheck PASS. Отдельного typecheck script нет.

Свежий штатный stageResources (desktop/linux-x64), pins Node24.19.0/Chromium1246; source identity именно указанного коммита, manifest SHA-256 `5f43305bffdce87ab9fdd20d807395221e89295337321c135f7886e3957c1d8b`. Private base `/home/george/.cache/loginom-ai-agent/browser-recovery-export-refresh-d509070b-74ed-4f08-82ba-6ac8bf0c6ba8`; source.json/checks и evidence сохранены0700/0600, temporary helper удалён. Старый stage не менялся. Unchanged harness запущен один раз на resources/bin/node, DISPLAY=:1/nonroot/sandbox ON, новой собственной SaveAs-копии и UUID destination.

Evidence `evidence/362aff18-4999-457e-beff-8b6291c20150` под новым base. MCP01–06: own SaveAs/fresh prepare/Group успешно. Export configure и finish подтверждены; MCP09: execute fault×1/remaining0. MCP10: T2/NO_RECOVERY_OPTIONS; MCP11 start=browser, handoff verified. MCP12 finish с actions[] и нулём browser calls вернул stopped/verification_unconfirmed вместо dock/completed. Execution verified/owner_verified/status completed, но workspace verified:false (quiet graph observation: PREPARED_NODE_CONTEXT_CHANGED), export_file verified:false (`Export file read did not return to its workflow`), missing workspace/export_file. Это первый unexpected результат; повторов/дополнительных UI-действий после него не было.

В journal file lease prepared610, file click prepared611/SUCCEEDED612, double_click prepared613 и возврат click prepared614 без записанных completed; roots refused615 с PREPARED_NODE_CONTEXT_CHANGED/NOT_APPLIED/effect_possible:false/cleanup_complete:true. Первая потеря подтверждения — prepared double_click при навигации к каталогу (text-export-output.mjs:44,169–172); был ли жест dispatch/применён и какой guard/transport отказал, из записей не установлено. Return click также UNKNOWN; NOT_APPLIED615 относится только к последующему чтению roots. Причина отсутствующих completion и первичного file-read отказа не установлена; отказ возврата не доказывает отсутствие файла или безопасный повтор. Current bytes/SHA/data/full lineage не подтверждены, финальный Save не достигнут. Есть только acceptance_fault_injected/browser_recovery_handoff; verified/dock_resumed отсутствуют. Сам dropdown choice refresh в этом native run не возникал: его смену ref доказывает локальная регрессия, а native прошёл configure до нового blocker.

Harness exit1/FAIL, stderr пуст. Existing close выполнен один раз: native BLOCKED/CLEANUP_OR_OPERATION_UNCONFIRMED, save_operation_id own-save-as; package close/logout/noDiscard не подтверждены. Managed PID2415093: LOGINOM_RUNTIME_CLEANUP_FAILED, ACKfalse/exit1/no signal, bridge_ack rejected. В09:50:07Z read-only /proc: все13 точных PID/start_ticks из own-processes-start.json отсутствуют, PGID2415076/2415107 пусты; собственный Chromium PID2415107 и Node executable совпали со свежим stage. Сигналов/kill/повторной очистки не было. OS shutdown не подтверждает native cleanup.

Ruling: локальная регрессия настоящих callbacks вместо нового browser fixture — достаточна для доказанного stale-ref дефекта, стоимость: полное materialization/file/cleanup доказательство остаётся native-проверкой. Новый отказ за пределами узкой правки: сохранить STOP и неизвестность, не менять Export file reader/guards и не повторять эффект. Старый S5 FAIL83078122, первый S4 FAIL/native cleanup UNKNOWN и прежние unknown неизменны; S2/новый S4 PASS сохранены. S5/Task2 остаются открытыми; S6, installed/models/release не выполнялись.

## Export UI operation ID — 20.10.2026: source PASS, новый BR-S5 FAIL / STOP

Source `2e34d70dc34becf511e6c01d98bc2c61f878a638`: файловый UI producer передаёт существующий operation_id во внутренний makeWorkspaceUiCode task, как NodeProcedure. Matcher, transportUncertain, durable ACK, deadlines и cleanup не менялись. Existing recovery fixture теперь проверяет ID именно внутреннего task и берёт ответ из него, вместо безусловной подстановки receipt_id. Последовательный RED исходного Export recovery теста (file verified:false), затем GREEN после одного production поля: file-read/recovery128/128 PASS. Один full runtime с pinned Node24.19.0:4469 PASS/14 SKIP/0 FAIL, exit0; diffcheck PASS. Source-коммит создан до live.

Новый штатный stageResources desktop/linux-x64 с Node24.19.0/Chromium1246: private base `/home/george/.cache/loginom-ai-agent/browser-recovery-export-id-12a457fc-e517-4eec-8420-33415d5ae30c`, manifest SHA-256 `3d01a2a2c0a8bf7ef6e8116a45f0bac8861a5397acc4880a04d9d645af76157e`, source identity именно указанного коммита. source.json/checks/evidence сохранены0700/0600, helper удалён. Unchanged BR-S5 запущен один раз на новых resources/bin/node, DISPLAY=:1/nonroot/sandbox ON, собственной новой SaveAs-копии/UUID destination; старые stage/сеансы не использовались для runtime-повтора.

Evidence `evidence/1f412927-16c7-494c-a0d5-c0c73cfbeca7` под новым base. MCP01–05 own SaveAs/prepare/fresh Group успешны, MCP08 execute fault×1/remaining0, MCP09 T2/NO_RECOVERY_OPTIONS, MCP10 start=browser. MCP11 finish actions[]/zero browser calls вернул dock/continuable вместо обязательного completed: execution completed/owner_verified, workspace verified, export_file verified:false. Первый unexpected — этот итог; Save, повторный Export, node_read и новая попытка не выполнялись. Harness exit1, stderr пуст.

Все11 file ui.act completed (journal621–641, нечётные строки) содержат тот же operation_id, что их prepared. Три завершились безопасным UI_EPOCH_CHANGED/NOT_APPLIED/effect_possible:false/cleanup_complete:true; существующий bounded refresh завершил навигацию. В642 `export_file_read_refused_restored`: failure.step=storage_navigation, code=STORAGE_ENTRY_UNAVAILABLE, kind=Error, reason=null; navigation_only:true, restored verified/cleanup_complete/quiet:true, lease_released:true. Это отсутствие доступной строки в ограниченном наблюдении, не доказательство физического отсутствия файла. Download/bytes/read_completed не достигнуты: текущие bytes/SHA/data/full lineage не подтверждены. Есть fault/handoff/verified, нет dock_resumed. Итог восстановления quiet graph не означает completed Export.

Один штатный close: native BLOCKED/UNSAVED_CHANGES, package_closed:false, logged_out:false, unsaved_changes_discarded:false, save_operation_id own-save-as. Managed PID2456389: LOGINOM_RUNTIME_CLEANUP_FAILED, ACKfalse/exit1/no signal; bridge_ack rejected. Read-only /proc в10:11:53Z: все13 PID/start_ticks из нового own-processes-start.json отсутствуют, PGID2456372/2456467 пусты. Node и Chromium PID2456467 были из свежего stage. Kill/сигналов/повторной очистки не было; OS shutdown не подтверждает native cleanup.

Ruling: один параметр существующего producer и узкая проверка сформированного task — без нового механизма; цена проверки без DOM fixture компенсируется native evidence exact IDs. На STORAGE_ENTRY_UNAVAILABLE/continuable сохранить STOP и исходный completed-критерий, не добавлять file search/повтор ради PASS. Исторические S5 FAIL83078122 и FAIL362aff18 (prepared-only613/614 UNKNOWN), первый S4/native cleanup UNKNOWN неизменны. S5/Task2 открыты; S6/installed/models/release не выполнялись.


## BR-S5 — сохранённая диагностика storage refusal

В последнем NativeB поиск относится к текущему CSV basename в точном destination parent после подтверждённого refresh. Четыре успешные прокрутки:0→1000→2000→3000→4000 при max_top14264; последний сохранённый snapshot имеет14 доступных scroll anchors. Ни исчерпание12-шагового бюджета, ни физическое отсутствие файла этим не доказаны. Окончательное table observation перед STORAGE_ENTRY_UNAVAILABLE не записано; code допускает no_scroll_owner либо folder_end, сохранённый failure.reason:null не различает их. Гипотеза временного исчезновения anchors требует воспроизведения, readiness/retry по предположению не добавлялись.

Только saved-data/source диагностика: новых live calls/тестов/правок production нет. Исходники соответствуют NativeB stage. BR-S5 отложен с прежними критериями; следующая независимая проверка — S6. Для возврата к S5 нужен отдельно спланированный новый подготовительный сеанс со штатными roots/table observations, сохраняемыми через dock_workspace_observe; старый сеанс/файл не читается и не повторяется. Cleanup NativeB остаётся BLOCKED/UNSAVED_CHANGES/ACKfalse/exit1, logout не подтверждён; исторические UNKNOWN сохранены.


## BR-S6 — отрицательные assertions PASS, cleanup BLOCKED

Source `8202879aa016d134ce543672e6821662cb37228a`: одна новая собственная SaveAs-копия, fresh Group Alpha35/Beta20, Export configure fault×1/remaining0 с новым UUID destination/replace, T2 → browser. Dock/evaluate/navigate отказали BROWSER_RECOVERY_ACTIVE, snapshot filename — BROWSER_RECOVERY_ARGUMENT_FORBIDDEN. Filename metadata30 и первый разрешённый snapshot29 подтверждают отсутствие расхода бюджета; три ACTIVE-ответа budget metadata не содержат.

Ровно30 snapshot depth1 имеют текущие attempt/state, remaining29…0; все30 actual journal calls подтверждают origin_ok:true/page_count1/document_present:true. Вызов31: BROWSER_RECOVERY_BUDGET_EXHAUSTED/stopped/budget_exhausted/remaining0, без dispatch. Отказы и snapshots заняли2553ms. Negative assertions PASS не означают completed/recovered Export или сохранённый итоговый пакет; Cancel/finish/repeat Export/final Save/node_read не выполнялись.

Existing close один раз: native cleanup BLOCKED/CLEANUP_OR_OPERATION_UNCONFIRMED; ACKfalse, LOGINOM_RUNTIME_CLEANUP_FAILED, managed exit1/no signal. Все12 собственных PID отсутствуют, обе PGID пусты; package close/logout остаются неподтверждёнными. Harness exit0 относится только к отрицательным assertions. Исторические unknown/FAIL сохранены, S5 FAIL отложен, Task2 открыт.

Syntax transpile, package-local pinned Bun typecheck и diffcheck PASS; настоящий verifyResources PASS и360 runtime files byte-equal. Stage source `2e34d70dc34becf511e6c01d98bc2c61f878a638`, manifest `3d01a2a2c0a8bf7ef6e8116a45f0bac8861a5397acc4880a04d9d645af76157e` сохранены, SHA harness указан отдельно. Runtime не изменён и suite не повторялась. Raw46 replies/journal/OS/exact commands и Rulings+cost — private SDD `br-s6-report.md`; installed acceptance/models/release не выполнялись. STOP до независимого review.


## Storage reason — 20.10.2026: source PASS, BR-S5 FAIL / STOP

Source `853425c20f0c540b0742c29dac77416ef83c7c91`: existing failure.reason сохраняет только no_scroll_owner/folder_end при точном STORAGE_ENTRY_UNAVAILABLE; остальные ошибки используют прежнюю message allowlist/null. Две actual-read ветви проверены последовательно RED→GREEN; unknown/private reason и правильный enum с другим code остаются null. Refusal journal, quiet restore, lease release и Save admission проверяет прежняя fixture. Focused read-refusal/virtual-storage/recovery141/141 PASS; один обычный full runtime:4473 PASS/14 SKIP/0 FAIL, exit0; diffcheck PASS. Production +2/−1, тесты +15/−7; новых механизмов нет.

Новый штатный stageResources desktop/linux-x64 создан после source-коммита из чистого дерева:360 runtime files byte-equal, verifyResources4753 entries PASS, exact resources/bin/node, Node24.19.0/Chromium1246. Manifest SHA256 `a743de8b6b31bc8428c8aad0d148147b72d3c801a84864bc67ba82a06eead6c1`; source identity именно указанного коммита. Одна unchanged BR-S5 попытка на новой собственной SaveAs-копии/fresh Group/new UUID destination/replace, headed/nonroot/sandbox ON. Private source/evidence/logs0600 под0700, temporary stage helper удалён; прежние stage/сеансы не менялись.

Evidence run `42c9b70d-b313-4c5c-822f-b1ea3b66c574`: MCP09 execute fault×1/remaining0, MCP10 T2, MCP11 start=browser, MCP12 finish (harness actions[], journal browser calls0) дал dock/continuable вместо completed. Journal622: failure{step:storage_navigation,code:STORAGE_ENTRY_UNAVAILABLE,kind:Error,reason:no_scroll_owner}, navigation_only/lease_released:true, restored verified/cleanup_complete/quiet:true. Текущий поиск файла после refresh правильного parent имеет две подтверждённые прокрутки0→1000→2000; все8 file prepared/completed имеют matching ID. Enum доказывает отсутствие eligible scroll anchors в отказавшем чтении; не доказывает временность, причину, геометрию того чтения или отсутствие файла. Execution completed/owner_verified и workspace verified, export_file verified:false; download/bytes/read_completed отсутствуют, current bytes/SHA/full file provenance и финальный Save не подтверждены.

Harness exit1; единственный existing close: native BLOCKED/UNSAVED_CHANGES, package_closed/logged_out/unsaved_changes_discarded:false, last Save own-save-as. Managed ACKfalse, LOGINOM_RUNTIME_CLEANUP_FAILED, exit1/no signal; bridge_ack rejected. Read-only own-process snapshots до/после cleanup: все13 exact PID отсутствуют, PGID2580772/2580802 пусты в11:13:00Z; OS absence не доказывает logout. Дополнительных Save/Export/read/cleanup/kill не было, runtime source после результата не менялся.

Ruling: минимальный существующий enum дал недостающий факт без capture bootstrap, readiness/retry или ослабления acceptance; цена — причина no_scroll_owner остаётся неустановленной. Исходный S5 остаётся FAIL/deferred, Task2 открыт, исторические UNKNOWN и принятый S6 неизменны. Raw evidence, exact commands, source/stage identity и self-review сохранены в ignored storage-reason task-1-report; independent review/checkpoint принадлежат root. Installed/models/merge/release не выполнялись. STOP.


## S5: source/saved-data разбор после storage reason

В NativeC сохранённые post-scroll snapshots615/617 содержат одинаковые65 строк/refs: после top1000→2000 все bounding boxes сдвинулись на−1000px, все65 строк стали outside_viewport, actionable anchors24→0. Это не потеря строк по лимиту240: table-root содержит66 элементов, scan complete, mutation counts/root прежние. Для snapshot617 hit-test также не причина отказа — outside_viewport определяется раньше. Почему native virtualizer не заменил видимое окно строк, эти данные не устанавливают; wrong owner, необходимость wheel или transient repaint не доказаны.

Existing fixtures используют статические rectangles либо вручную заменяют строки; достоверного causal reproducer не получено. Новых live calls/production changes/wait/retry не было. S5 остаётся FAIL/deferred с исходными file/Save/native cleanup критериями; следующий независимый путь — [packaged Task3](../../../../superpowers/plans/2026-10-20-browser-recovery-packaged.md). NativeC cleanup и все исторические UNKNOWN остаются прежними.


## 2026-10-20 — preparatory scroll probe: BLOCKED до scroll

Один current-source запуск на свежем штатном desktop/linux-x64 stage; verifyResources,
закреплённый remote catalog, compatibility и выбранный Save destination PASS.
Own new_draft READY/ownership_verified/persisted=false; direct checkpoint Save
SUCCEEDED/verified/save_completed, reopened=false/workflow_preserved=true/path exact.
Passive identity/connection до/после Save подтверждены; Save остаётся успешным.
Дополнительный probe assert ожидал непустой workflow_continuations, фактически [].
Этот producer требует nodeTargetWorkflowNode, которого new_draft prepare не создаёт;
причинность namespace отвергнута source inspection. STOP без повторной записи.
Files navigation/Refresh/scroll и passive250/1000ms reads не достигнуты; causal
временного результата нет, поэтому это BLOCKED, не NOT_REPRODUCED и не S5 PASS.
Probe bookkeeping отметил persisted только после assertion и ошибочно пропустил
native cleanup: Close/logout/modified=false/noDiscard не подтверждены; это дефект
probe, не отмена Save. Own diagnostic package и private profile сохранены.
Context.close resolved/close event/pages0 подтверждены отдельно. OS ownership
UNKNOWN: before список PID/starttime пуст; after exact-profile absence не заменяет
потерянное ownership evidence. Причина пустого collector filter не установлена;
offline exact-source regex/NUL гипотеза опровергнута. Повторов/kill не было.
Private evidence: `/home/george/.cache/loginom-ai-agent/browser-recovery-scroll-0goRLMSE/evidence`;
raw commands/source/self-review — ignored scroll-probe task report. Production
не менялся; прежние S5 FAIL/deferred и historical cleanup UNKNOWN сохраняются.


## 2026-10-20 — revised preparatory probe: native cleanup PASS, scroll BLOCKED

Одна новая attempt после scoped preflight GO: fresh stock source stage, pinned catalog,
selected Save route и compatibility PASS; новый own empty draft/profile/UUID package.
Direct checkpoint Save SUCCEEDED/verified/save_completed, reopened=false и
workflow_preserved=true, exact path/active_identity; continuation[] допустим.
Save подтверждён в памяти до post-check/evidence. Native saved-state modified=false.
Fresh discover_roots UI guard отказал SAVED_UI_BINDING_UNCONFIRMED до filegrid:
tab_tid/prefix exact prepared, но package_identity key отсутствует по compact roots
контракту. Это собственный probe assertion defect, не потеря native package identity.
Общая ошибка двух preparation checks — требование внутренних полей, которые
выбранный штатный path не производит. Третьего live не было; root переоценивает план.
Files navigation/Refresh/scroll/passive250/1000ms reads не достигнуты; причинного
временного факта нет, это BLOCKED, не NOT_REPRODUCED и не S5 PASS.
Native отдельно PASS: повторный saved-state modified=false; direct guarded cleanup
ровно1, SUCCEEDED/package_closed/logged_out/noDiscard. Final Save replace не нужен.
Context отдельно CLOSED: close event/pages0. OS отдельно NOT_CONFIRMED:
currentPID/starttime есть, own descendant lineage сохранён, exact-profile candidates0;
after absence не доказывает полную attribution. Kill/повторных операций не было.
Own diagnostic server package сохранён. Private evidence:
`/home/george/.cache/loginom-ai-agent/browser-recovery-scroll2-a5FVbBUQ/evidence`.
Syntax/static/diff проверки — в ignored task report. Production неизменён;
первая native cleanup UNKNOWN и S5 FAIL/deferred остаются историческими фактами.


## 2026-10-20 — third preparatory probe: busy после Files, scroll BLOCKED

Одна fresh source attempt: штатный новый stage/catalog/Save route PASS,
новый own draft/profile/UUID package. Roots служат только discovery и tab/prefix;
quiet/directory/table state берутся через existing detail routes, без новых API/hooks.
Save SUCCEEDED/verified/save_completed/path/active_identity, workflow сохранён;
continuation[] raw допустим, native saved-state modified=false. Save не отменён.
Toolbar detail перед click quiet; единственный observed Files click SUCCEEDED/
completed/cleanup_complete. Его post-read detail показал busy mask MF и
file_storage unobserved: STOP DETAIL_NOT_QUIET, до NavigationPanel/filegrid/Refresh.
Scroll и passive250/1000ms reads не достигнуты; causal timing/window факта нет.
Finally fresh tabs detail также busy; return-tab click/final Save не выполнялись.
Direct guarded native cleanup ровно1: BLOCKED/DIALOG_OR_OPERATION_OPEN,
package_closed=false/logged_out=false/noDiscard. Это отдельный UNKNOWN lifecycle,
не отказ уже confirmed Save/navigation. Own server package/profile сохранены.
Context CLOSED: close event/pages0. OS NOT_CONFIRMED: own driver/lineage сохранён,
exact-profile candidates0; after absence не заменяет attribution. Kill/повторов нет.
Private evidence: `/home/george/.cache/loginom-ai-agent/browser-recovery-scroll3-6y95uhHM/evidence`.
Syntax/static/diff checks и source audit — ignored task report/отдельный source artifact.
Busy duration/причина и virtualizer не исследованы; четвёртого live не было.
Root пересматривает подход по stop-signal; product fix не выполнялся.
S5 FAIL/deferred, первая native UNKNOWN и вторая native PASS сохраняются.


## 2026-10-20 — causal scroll slice: DONE_WITH_CONCERNS

Одна fresh source attempt после scoped GO; stock stage/pinned catalog/Save route PASS.
Штатные preparation helpers довели own пакет до ready filegrid; roots/detail и native
identity guards сохранены. Два confirmed scroll0→1000→2000: те же65 row tids/refs,
сдвиг−1000px, всеoutside_viewport/anchors0 при прежних root/folder/workflow/owner.
Первый passive UI read252.518–360.351ms от trigger: те же65 rows/anchors0.
Второй UI read1003.391–1111.997ms:65 новых row identities/35 anchors, binding прежний.
Это window update без промежуточного native жеста, не только возврат геометрии.
В measurement readiness не вызывался; только штатные50ms/post-read и два passive reads.
Concern: first whole-chain start249.772604ms, на0.227396ms раньше strict250;
сам UI read начался после250. Raw timings сохранены без округления в private report,
literal timing criterion не назван PASS; новую попытку/компенсацию не выполняли.
Native отдельно PASS: Save confirmed; initial/final saved-state modified=false,
single cleanup SUCCEEDED/package_closed/logged_out/noDiscard, final Save не нужен.
Context отдельно CLOSED/close event/pages0. OS отдельно NOT_CONFIRMED:
currentPID/lineage сохранены, exact-profile candidates0; absence не заменяет attribution.
Own diagnostic server package сохранён. Private evidence:
`/home/george/.cache/loginom-ai-agent/browser-recovery-scroll4-O5izmAHY/evidence`.
Причина/точное время native update и historical S5 целиком этим не доказаны;
S5 FAIL/deferred, first native UNKNOWN/second PASS/third BLOCKED сохранены.
Source audit/commands/checks — ignored task report и отдельный artifact; product fix,
новый API/hook, recovery, пятый live, commit/merge/release не выполнялись.


## 2026-10-20 — endpoint boundary probe: BLOCKED / STOP

Одна разрешённая fresh stock source-попытка; plan preflight GO, production/runtime/
harness неизменны. Own new empty draft/UUID, canonical Save/fail и initial
modifiedfalse PASS; catalog/stage verification и pinned Node syntax PASS.
Начальный owner outer top128/bottom960, clientHeight832/clientTop0, borders0,
scrollHeight15528/max_top14696;65 name cells/rows, last cell.bottom1688,
last row.bottom=shared immediate container.bottom1689. Это start window, не end proof.
Подтверждены три scroll0→1000→2000→3000 с тем же owner/bindings.
Четвёртый act: NOT_APPLIED/preconditions/UI_REFERENCE_OBSCURED,
effect_possiblefalse/cleanup_completetrue, ui_scroll_applied отсутствует.
Accepted wrapper назвал отказ UI_GESTURE_UNCONFIRMED/uncertaintrue;
это known no-effect refusal, не unknown native effect. Причина hit-test неизвестна.
Первый отказ остановил measurement; жест/проба не повторялись, terminal ready
не достигнут. End geometry/relation не подтверждены; S5 FAIL/deferred сохранён.
Native отдельно SUCCEEDED/own Close/logout/noDiscard; final return/Save пропущены
existing uncertain guard, initial modifiedfalse подтверждён. Context отдельно CLOSED/
close event/pages0. OS отдельно NOT_CONFIRMED: exact-profile candidates0,
attributionfalse/after remaining[]; process absence не превращён в attribution PASS.
Private evidence `/home/george/.cache/loginom-ai-agent/browser-recovery-boundary-_3o_g_rg/evidence`;
source audit/driver source/commands/raw pre-post receipts сохранены в private base.
Временные executable удалены;210строк/+41−23 в пределах plan240/60.
Полный Task1 report — ignored rendered-window/task-1-report.md. Runtime predicate
не выбран; root Step5 требует дальнейшего решения по недостаточным endpoint данным.
Исторические FAIL/UNKNOWN и native cleanup outcomes не переоценены; новых ожиданий,
recovery, API, source fix, commit/push/merge/release не было.


## 2026-10-29 — storage settle: source ready, native BR-S5 FAIL

По [отдельному плану](../../../../superpowers/plans/2026-10-29-browser-recovery-storage-settle.md)
после independent preflight GO реализованы producer native-window readiness и ожидание
в existing reader. Behavioral RED→GREEN и focused561/561 PASS,0fail/0skip;
production2файла+55/−11, source7файлов+142/−22. Acceptance harness/критерии не менялись.
Clean source `024668f7ee09613171fcae5221f2d3fc8eb70203`; fresh stock desktop/linux-x64
stage и staged-node verifyResources PASS/4753, оба source MJS byte-equal.
Manifest SHA256 `f718a0c587d5d54501c1c58f07c21269a52516d4affb8fdbe92ef7ff3b8fbafb`.

Единственный unchanged BR-S5 FAIL/exit1: recovered.result continuable вместо
completed. Execute fault×1, execution verified/owner_verified/completed,
destination absence verified/existedfalse, recovery browser calls0 подтверждены.
Четыре scroll `[1000,1000,1000,1000]`, все8 export-file steps SUCCEEDED;
read refusal storage_navigation/STORAGE_ENTRY_UNAVAILABLE/no_scroll_owner,
quiet own graph restored/lease released. Handoff/verified есть, dock_resumed нет;
download/bytes_verified/read_completed0. Current файл/SHA/lineage/CSV и финальный
Dock Save/modifiedfalse не достигнуты, completed execution их не заменяет.

Последний сохранённый table после четвёртого scroll:65 name rows/65 scroll metadata,
same exact root/owner,14 eligible anchors,top4000/max15824,rendered_window_readyfalse.
Это pending observation, само по себе оно не демонстрирует no_scroll_owner.
Failing logical table/name-discovery observation не сохранён: empty/no-scroll rows
до readiness или отсутствие eligible anchor после settlement — UNKNOWN.
Новый browser/readback/runtime для выяснения не запускался.

Native cleanup отдельно BLOCKED/UNSAVED_CHANGES/package_closedfalse/logged_outfalse,
discard не выполнялся. Managed close LOGINOM_RUNTIME_CLEANUP_FAILED/ACKfalse/exit1;
bridge_ack rejected. Context/OS inventory UNKNOWN, exit не доказывает native logout.
Private root `/home/george/.cache/loginom-ai-agent/storage-settle-s5-20261029-rqa7lc_h`,
evidence `56c297df-da4a-4077-b51d-65b00c6c5607`, attempt `b1be8f4a-3ba5-4938-9048-dc23837f9f4d`.
Raw receipts/journal/build identities/profile сохранены0700/0600; temporary stage
launcher удалён. Root проверил raw result/recovery/cleanup/close и journal618–627.
Никаких повторов S5/Export/Save/жестов, ручного cleanup/kill или upstream после
отказа не было. Independent task review: source Steps1–5 compliant/quality Approved,
mandatory0/optional0; полный Task1 BLOCKED, native S5 открыт.
Исторические FAIL/UNKNOWN и установленная/model приёмка не переоценены; release-флаг
не включён, merge/release не выполнялись.


## 2026-10-29 — captured shared-reader probe: BLOCKED

[Подплан](../../../../superpowers/plans/2026-10-29-browser-recovery-failure-observation.md)
получил plan GO; private adaptation172строки/+16−54 прошла independent source review
после M1 correction: readiness marker не называется доказательством settling.
Production/harness неизменны. Fresh stock stage/verifyResources4753PASS;
clean builder `326928c48768eb1cb7ec199cdc63272ad2abb65a`, executable runtime bytes
совпадают с предыдущей попыткой; manifest identity остаётся указанной выше.
Один standalone loginBrowser/shared-reader probe, не managed IPC/S5 acceptance.

Initial own empty draft/UUID package Save verified/save_completed/reopenedfalse/
workflow_preserved и native modifiedfalse подтверждены. Первый scroll0→1000
SUCCEEDED. Accepted table128:65rows/65same owner/36anchors/readinesstrue,
следующий exact lookup132 target не нашёл. Второй scroll136 НЕ применён:
NOT_APPLIED/preconditions/UI_EPOCH_CHANGED/effect_possiblefalse/cleanuptrue,
без ui_scroll_applied. Wrapper uncertaintrue/UI_GESTURE_UNCONFIRMED остановил probe;
raw receipt подтверждает known no-effect, не неизвестный эффект этого жеста.
no_scroll_owner NOT_REPRODUCED; A/B branch и полный exact-target поиск не доказаны.
Driver exit0 означает завершённый finally; diagnostic result остаётся BLOCKED.

Из-за uncertain guarded return/final saved-state пропущены; final replace отсутствует.
Single native cleanup независимо SUCCEEDED/package_closed/logged_out/noDiscard,
same original session/document/account/path. Context CLOSED/closeeventtrue/pages0.
OS attributionfalse/candidates0/remaining0 → OS_NOT_CONFIRMED. Эта cleanup PASS
не закрывает предыдущие UNKNOWN/BLOCKED. Повторов/Export/upload/gesture retry/kill нет.
Private root `/home/george/.cache/loginom-ai-agent/browser-recovery-failure-observation-gf7ikzl0`;
raw ledger/result, source/diffs, actual stage identities/profile сохранены0700/0600.
Temporary probe/stage executables удалены после audit. Root проверил raw128/132,
actual refusal/Save/saved-state/native cleanup/context и source/resource equality.
Product/stage/probe stderr пусты; postprocessing nullable-metadata ошибки исправлены
чтением уже сохранённых JSON, без нового native run. Incremental independent review
выполненного BLOCKED slice/cleanup: spec/quality Approved, mandatory0/optional0.
Standalone callbacks и timing отличаются от actual Export caller; дополнительная
такая проба не разрешена. Дальнейший scope — отдельный пересмотр источника missing
logical observation. Native S5 по-прежнему FAIL, upstream/release не выполнялись.


## 2026-10-29 — actual Export failure evidence: source Task1 PASS

[Подплан](../../../../superpowers/plans/2026-10-29-browser-recovery-export-failure-evidence.md)
Task1 завершён: source `99a80f68741d26bcaed3db3e8f03594cb3aebbb7`,3файла+99/−19,
production18 changed lines. Existing unavailable Error удерживает exact table/lookup/stack
в private payload; actual Export catch пишет его existing onRecord только при отказе.
Публичные failure/receipt, waiter, UI reads/gestures, bounds и mandatory journal/cleanup
не менялись. Diagnostic callback throw/wrong ACK не подменяют исходный отказ.
Focused pinnedNode183/183PASS/0fail/0skip/0warnings; behavioral RED→GREEN для раннего
sample, позднего lookup и actual journal. Реальные journal/redactor tests подтвердили
private0700/0600, отсутствие credential sentinel на диске, прежний public failure
и release/Save. Independent spec/quality review PASS, mandatory0/optional0.
Native/stage Task2 и upstream ещё не выполнялись; это retention diagnostics,
не доказанное исправление причины и не S5 PASS. Далее fresh stock stage/verify и
фактический preflight перед одной unchangedS5; все прежние FAIL/UNKNOWN сохранены.

## 2026-10-30 — actual Export failure evidence: BR-S5 FAIL, branch B captured

Fresh stock desktop/linux-x64 stage построен с clean `e9ba0d65d1f89cdd44b05ed6769394cb14f4dc72`;
staged Node verifyResources4753PASS. Independent actual artifact/invocation preflight GO,
mandatory0/optional0:355 runtime files/336MJS byte-equal, pins и unchanged harness подтверждены.
Manifest SHA256 `fdeb7b84f429bab34f411cf4e146bfab897a93b2f1d1c1b20602bb445170fb82`;
changed reader source/stage/manifest SHA256
`e645c0f0a3f9faff0e2483fbf560959e29501ef2d1a9261625f84ed3aa2894a1`.
Это новый stage; прежним артефактам новый source SHA не присвоен.

Единственный unchanged managed BR-S5:198316ms/exit1, finish continuable вместо
обязательного completed. Native execution verified/owner_verified/completed;
fault1/browser recovery calls0. В journal629 records ровно одна diagnostic запись620
с exact failing table/name_lookup/stack текущей verification operation; matching
lease/refusal623 и recovery receipt628 связывают её с текущими attempt/export/binding.
Stack `text-export-output.mjs:128:28` подтверждает ветку B/no_scroll_owner после
accepted table и следующего exact-name discovery, а не ранний отказ A.

Failing table: rendered_window_readytrue,65 name rows/один scroll owner,
top2000/max15896,0 eligible anchors/0 scroll actions/0 point_observed;
25 outside_viewport и40 point_not_observed. Table elementsTruncatedtrue:
это утверждение только об отказавшем snapshot, не всей папке или DOM.
Следующий exact-current-name lookup имеет0elements/truncatedfalse, тот же
document/workflow и другую DOM revision. Critical bindings присутствуют без redaction;
storage package_identitynull не используется для native package ownership.
Предыдущий postact sample не подменяет этот failing sample. Почему наблюдение
готового native window не дало scroll anchors, запуск ещё не доказывает.

Quiet owned graph restoration/lease release подтверждены; current file/bytes/SHA/
lineage/CSV NOT_VERIFIED, final Dock Save NOT_REACHED. Cleanup BLOCKED/UNSAVED_CHANGES,
package_closedfalse/logged_outfalse/noDiscard; managed ACKfalse/actualexit1/no signal,
bridge_ack rejected. Context closure и OS process absence UNKNOWN, exit не доказывает
logout. Upstream NOT_RUN, поскольку strictS5FAIL. Повторов, ручного cleanup/kill,
нового collector/probe/Export/Save/gesture и installed/model/release запусков не было.

Private root `/home/george/.cache/loginom-ai-agent/browser-recovery-export-failure-evidence-24e9cfb6-4244-4f3f-9830-419ddb1ff44f`;
evidence `6b6d17f1-48e6-4379-bfbd-421733568d32`, attempt `6aca78ca-1f1a-468b-bc29-49b61ddf62fc`.
Raw receipts/journal/profile и sanitized attribution/binding audit сохранены0700/0600;
temporary stage launcher удалён. Root напрямую проверил exact journal620/623/628,
row interaction counts, refusal/restore/lease и cleanup/ACK/actual exit.
Independent incremental native factual review APPROVED, mandatory0/optional0. Attribution завершает только
diagnostic slice; original S5/план5Task2 остаются открыты. Следующий product fix требует
отдельного минимального плана и independent review; прежние FAIL/UNKNOWN сохранены.


## 2026-10-30 — scroll anchor wait: source Task1 PASS

[Минимальный план](../../../../superpowers/plans/2026-10-30-browser-recovery-scroll-anchor.md)
получил independent GO, mandatory0/optional0. Source `c3ab0f517273bf8c3fc716f03df4a6359503c226`:
3файла84+/25−, production20 changed lines. Existing shared reader ждёт range-ready
и допустимый anchor либо exact target, найденный conditional name discovery;
исходный внешний fresh lookup/detail сохраняет name/binding validation. Normal path
не получает новых reads; blocked sample добавляет1 exact lookup в пределах прежнего
ready/deadline. Producer, actuator,12scroll/delta1000, API, journal и harness неизменны.
Permanent absent-target/no-anchor использует существующий timeout/cleanup путь.

Meaningful RED старого reader: no_scroll_owner до sleep; GREEN того же сценария
подтвердил fresh anchor после одного sleep100 и trace[1000,1000]. Дополнительные
source behaviors: target вне compact table без scroll, bounded permanent timeout,
cancel/owner drift, actual Export success/download1/return и late-B inner-match→
outer-absence с прежними public refusal/redaction/private journal/release1/download0.
Final focused pinnedNode231/231PASS,0fail/0skip/0warnings,10087ms;
git diff --check PASS. Independent spec/quality source review Approved, mandatory0/
optional0; reviewer прочитал сохранённые RED/GREEN/focused logs без повторов тестов.

Task1 завершён. Временность отсутствия точки и causal fix живым запуском пока
не доказаны: Task2 stage/preflight/native и full upstream NOT_RUN. Последний native
S5 FAIL/cleanup BLOCKED/context+OSUNKNOWN и все исторические ограничения сохраняются.
Следующий шаг — fresh stock stage/verify и independent actual preflight, затем
одна unchanged strict BR-S5. Модели, installed acceptance и merge/release не запускались.
