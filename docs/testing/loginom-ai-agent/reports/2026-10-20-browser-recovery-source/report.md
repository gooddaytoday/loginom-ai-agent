# Browser recovery: остальные source-сценарии

Статус: подготовительный обычный Export и BR-S2 — PASS. BR-S4 — FAIL в проверке harness после completed; read/Save не достигнуты, native cleanup BLOCKED. BR-S5/S6 — NOT_RUN. Harness расширен для BR-S2/S4; перед повтором S4 нужна поправка ошибочного budget assertion. Это scripted source acceptance; установленный продукт и качество модели здесь не проверяются.

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
