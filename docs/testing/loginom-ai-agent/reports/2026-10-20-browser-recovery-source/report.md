# Browser recovery: остальные source-сценарии

Статус: подготовительный обычный Export и BR-S2 — PASS. BR-S4/S5/S6 — NOT_RUN. Harness расширен только для BR-S2. Это scripted source acceptance; установленный продукт и качество модели здесь не проверяются.

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
