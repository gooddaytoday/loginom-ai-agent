# Dashboard M5 — checkpoint

- Ветка `m5-acceptance`; итоговый source `6933632625433204e3a47e12f891bfd53e43d2ed` (следующий commit меняет только итоговые документы).
- M5/Tasks 0–5 приняты 17 ноября 2026: Whole-M5 Spec ✅ / Quality Approved; F1–F5 и corrective N1 закрыты, обязательных технических замечаний нет.
- Архив `loginom-dashboard-6492f888ee4c5f31.tar.gz`, SHA256 `ba58e2d1fe5ab342512e13d347fc6350f4d024e696f0cb35b1c29f6bbc039546`; config `8918f7eff74d389ab71c9b48ab4c82571b480d793bc9257f68d179651aa99605`.
- Один и тот же итоговый архив реально прошёл fresh offline install/full server+cleanup, отдельный native delayed-shell/live5/strict CloseLogout, uninstall/preservation и native-only на обоих движках.
- Принятые минимумы: Docker29.1.3/Compose2.40.3+ds1; rootless Podman5.6.2/podman-compose1.5.0, Fedora43/cgroupv2/crun/SELinux Enforcing.
- Source deploy/helper28/28 и SELinux5/5, Node/Bash syntax/ShellCheck PASS; для неизменённого кода сохранены browser246/246, coverage≥90%, size15590/15600 и owning package gates.
- Installed Desktop/CLI `.1` имеют отдельную payload authority; full M4/model/rights/TLS/change и настоящее vendor update7.4.1→7.4.2 сохраняют собственные исторические receipts, не переименованы в ba58 PASS.
- Последние uninstall/native-only сохранили42 Podman/39 Docker native records и native3 identities/settings; межзагрузочный generated host_id-only delta явно ограничен отдельным oracle.
- Обе собственные VM штатно OFF; QEMU отсутствуют, проверенные порты свободны, диски/backup и проверенные selected exports сохранены приватно вне Git.
- Ограничения: M1 cold close ACKfalse/actual0, причина/read UNKNOWN, nonblocking; прежние fixture/transport failures сохранены. Раскрытый ранее посторонний ключ требует отдельной замены владельцем.
- Канонические результаты/границы reuse — [runbook](dashboard-m5.md#итоговая-приёмка-17-ноября); требования/checkboxes — [план](../../superpowers/plans/2026-11-15-dashboard-m5.md).
- Технической работы M5 не осталось. Итоговые документы, обязательные scans/hooks и разрешённый push ветки/agent-kit завершают передачу; точный опубликованный SHA фиксируется в agent-kit.
- Следующий milestone — отдельно согласованные [план](../../superpowers/plans/2026-11-16-dashboard-m6.md) и [дизайн M6](../../superpowers/specs/2026-11-16-dashboard-m6-design.md); M6/PR/merge/release здесь не выполнялись.
