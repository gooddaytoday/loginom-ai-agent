# Dashboard M5 — checkpoint

- Ветка `m5-acceptance`; FIX_BASE `0f4f8889888ed73ffeee237f06b1729915d688bc`. Source fixwave F1–F5 выполнена; M5 открыт до новой установленной приёмки и scoped review.
- Контракт: [план M5](../../superpowers/plans/2026-11-15-dashboard-m5.md), final findings/Approved constraints и текущий отчёт — `.superpowers/sdd/2026-11-15-dashboard-m5/final-fixwave-report-20261117.md`.
- Source:28 deploy/helper tests, pinned Node syntax, Bash syntax/ShellCheck и diff check PASS. Runtime TS, M4, клиенты `.1`, модель/ACL/CA/vendor-история не изменены; прежняя authority сохраняется отдельно.
- F1: unmanaged uninstall RED→отказ с сохранением; candidate/site/dangling symlink отказывают; no-site uninstall0 сохранил55 native файлов и3 native identity/network.
- F2: persisted operator case сохранён; canonical runtime URL/header/path. Actual normal и strict multi-host full server0; strict separate app domain/HTTPS/SRI/headers/cleanup проверены.
- F3: missing own exact cron старый false PASS0→новый отказ1 без пробы; cron восстановлен exact, native3 identity/StartedAt и Dashboard IDs сохранены. Actual Enforcing/shared labels PASS; Disabled/Permissive/private-MCS helper cases PASS.
- F4: actual configured absolute ActualStorage при сохранённом старом default — install0/publisher RO/native live5. Relative/absolute/ambiguous XML/mount tests PASS; physical native root/ancestors исключены после realpath/symlink admission.
- F5: actual delayed-shell RED→async GREEN; native доступен до ответа shell, затем installed ready/live5 и strict Close/Logout/browser completion0; runtime shell не менялся.
- Source fixtures изменённого распакованного561 не являются новым official artifact PASS. Immutable561/configcf61 и прежние engine/client результаты не переименованы.
- Docker VM OFF: selected27 source receipts экспортированы/everySHA verified перед ordinary poweroff, QEMU absent/ports free/disk retained. Native ActualStorage clone намеренно сохранён; original Settings/metadata/default на месте в private backup.
- Podman VM RUNNING/rootless/Enforcing: source strict server/native0, own cron после final safe refusal восстановлен. Source backup/receipts и own app leaf приватны; trust stores/global policies не менялись.
- Следующий шаг: clean source commit → один official producer → SAME новый архив на Podman и Docker, affected checks/server+native/uninstall/preservation → восстановить Docker original Settings/удалить только own clone → безопасно выключить обе VM → один scoped review.
- Ограничения: M1 cold runtime ACKfalse/actual0 остаётся UNKNOWN; старый6-role StartedAt composite FAIL retained, exact delta NOT_CAPTURED. Old Podman setup SSH EOF UNKNOWN/own transport closed255 при remote installer absent/ready11; install не повторялся.
- Source auxiliary logs с non0600 приведены600; raw credentials/Env не выводились. Final status/checkbox/runbook closure и разрешённый push делает root после приёмки; worker не push/PR/merge/release/M6.
