# Dashboard M5 — checkpoint

- Ветка `m5-acceptance`; основная source wave `98ea58b12aac0a0c7b4b4c5af891ec259d9956dd`. C7 прошёл оба installed lifecycle; scoped review закрыл F1/F2/F4/F5 и cron-часть F3, оставил N1/F3: сортировку SELinux observations.
- Текущий corrective source: только `ls -ZdU` сохраняет storage-first operand order; helper labels/private-MCS/RO/options не изменены. Новый official archive и его оба installed lifecycle пока pending.
- N1 operational RED→GREEN: реальный collector на новых собственных пустых каталогах с различимыми private/shared метками → настоящий helper1/0; native labels/global SELinux не менялись. Focused SELinux5/5, Bash syntax/ShellCheck и diff check PASS; unchanged28/helper/runtime/M4/client authority сохраняется отдельно.
- Канонический план/Approved N1 constraints и текущий отчёт — `.superpowers/sdd/2026-11-15-dashboard-m5/final-fixwave-{plan,report}-20261117.md`; [план M5](../../superpowers/plans/2026-11-15-dashboard-m5.md).
- C7 immutable/source98ea и прежние архивы не переименовываются в новый installed PASS. Клиенты `.1`, runtime/helper/checker/compose/template не изменены; rebuild клиентов не нужен.
- Native baseline восстановлен после c7, обе предыдущие VM штатно завершены с verified selected exports. Сейчас Podman снова запущен только для N1 collector/new-package path; Docker OFF, диски сохранены.
- Следующий шаг: corrective commit с staged scan/hooks → один новый official producer → SAME новый архив на обоих engines: install/full server/separate calibrated native/uninstall-preservation/export/ordinary shutdown; без повторов unchanged negative/migration/model matrix.
- Ограничения: M1 cold runtime ACKfalse/actual0 UNKNOWN retained/nonblocking; historical transport EOF/overbroad-role assertion и post-restart generated host_id-only delta сохранены в отчёте с точными границами.
- Финальные canonical statuses/checkboxes, tiny corrective review и разрешённый push — root после N1 acceptance; implementer не push/PR/merge/release/M6.
