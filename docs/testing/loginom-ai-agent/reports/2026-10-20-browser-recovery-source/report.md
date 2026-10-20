# Browser recovery: остальные source-сценарии

Статус: подготовительный обычный Export PASS; BR-S2/S4/S5/S6 ещё не запускались. Harness пока не расширен. Это scripted source acceptance; установленный продукт и качество модели здесь не проверяются.

## Обычный Export без fault — 20.10.2026

Проверены исходники `c7ef577634283347c7f60957f9901edbbf73570d`. Использован неизменный stage из [smoke-отчёта](../2026-10-20-browser-recovery-smoke/report.md), с исходной identity и resource-manifest SHA; runtime/Host/Product/Agent inputs с его origin не изменялись. Старым ресурсам новый source SHA не присваивался.

Одна managed-сессия: собственная SaveAs/fail-копия saved-A, fresh prepare, публичный existing Group с текущими Alpha35/Beta20, новый Export в собственный UUID destination под подготовленным exports-каталогом, overwrite reject. AcceptanceFault отсутствует. Параметры: UTF-8, разделитель `;`, names, без BOM, LF, decimal `.`, пустой null_marker, qualifier `"`.

Результат SUCCEEDED/completed/cleanup_complete. Текущие destination_check existed:false, execution ownership и raw download/lease receipts связаны с единственным public artifact и retained файлом; второй download не выполнялся. CSV имеет header `Total;Category`, строки `35;Alpha`, `20;Beta` и завершающие LF; поля сопоставлены по именам текущего Group. Raw размер32байта, независимо пересчитанный SHA-256 `2f73ef403757e282950b79bbdffd6ca037acdd281c71da3d2f379e844d08f140` совпал с public/raw receipt, также после shutdown.

Final Dock Save по точному собственному пути: modified:false. Native cleanup SUCCEEDED/package_closed:true/logged_out:true/unsaved_changes_discarded:false; path/save_operation_id совпали с текущим Save. Managed ACK:true/exit0/no signal; все12 наблюдённых собственных PID отсутствуют, обе собственные PGID пусты. Процессные факты не заменяют отдельную native-квитанцию.

Private evidence: `/home/george/.cache/loginom-ai-agent/browser-recovery-20261020-fixture-proof/export-mainpath-8600df10-3e12-467c-ad7f-ec34c128c997`; result.json, MCP receipts01–08, текущий execution journal, package-cleanup и runtime-close. Каталоги0700, файлы0600; server paths, node IDs, credentials и raw logs в Git не включены. Временный probe удалён. Syntax transpile PASS; package tests/typecheck не повторялись для одноразовой пробы без tracked code changes.

Это доказательство обычного Export, не BR PASS и не вход/fixture для следующих сценариев. Каждый BR получит собственный UUID destination и текущие квитанции. Исторические unknown upload/cleanup и readonly из smoke-отчёта этим результатом не закрыты.

Следующий native шаг — BR-S2 по уточнённому плану5Task2; [CI fixture follow-up](../../../../superpowers/plans/2026-10-20-browser-recovery-native-fixtures.md) принят по native Source checks. BR-S6 учитывается как отрицательная проверка, отдельно от native cleanup/shutdown.
