# Dashboard M5 — checkpoint

- Пауза по просьбе владельца: 16 ноября 2026; ветка `m5-acceptance`, проверенный source `0e042947`. Task 4 и source/CI Task 5a приняты; Task 5b/M5 не завершены.
- Исходная принятая M4 основа M5: `77c275a68f9152efd7f5203b0f6643f11923a8ef`; Tasks 0–3 приняты: Spec Approved / Quality Approved, mandatory 0.
- Task 5b выполняется из чистого snapshot `0e0429470bb5c4761aeb43456501696d5a5f2beb`; [runbook M5](dashboard-m5.md) — канонический источник входов, точных сред и результатов.
- Task 0: из предоставленного release и штатного installer подготовлен рабочий Loginom; лицензирование, HTTP/HTTPS/WSS/Integrator и installed Desktop/CLI проверены.
- Task 1: installed Desktop → snapshot → real model draft → Allow once → Host JSON → ready/live4 PASS; `.lgp` не изменён, JSON без sample; native Close/Logout и actual runtime exit проверены раздельно.
- Shell/server совпали с финальным dist; SRI, отдельный app-origin, private API и HTTP-only/HTTPS проверены без правок vendor index/client.json.
- Task 2: обязательная уникальная публикация с точным sourceHash/HTML/assets и publisher cleanup, ошибки/сигналы/concurrency/client negatives PASS.
- Task 3: ownership/lifecycle/Apache rollback, один переносимый архив, fresh offline Docker install/server и отдельный HTTPS client PASS; данные сохранены.
- Task 4: один общий архив прошёл modern Docker/Podman server/client, rootless SELinux shared/private, MCS/durable/cron/rollback и Fedora reboot; технические пункты подтверждены.
- Владелец 16 ноября принял проверенные современные стеки как нижнюю границу Dashboard; [точная политика](dashboard-m5.md#границы-поддержки-dashboard). Исходные нижние FAIL сохранены как история.
- Общие минимумы вендора Loginom не изменены и не задают поддержку Dashboard; version guard или compatibility-механизм не добавлялся.
- Отдельное ограничение: recurring client initial `IsPackageModified(...) !== false` до idle; причина неизвестна, финальные single-run PASS не являются исправлением.
- Документационный остаток Task 4 синхронизирован; в рамках этого остатка новые source/installed-прогоны не выполнялись. Source/package/browser/size и адресные результаты — в runbook.
- Итоговый независимый scoped gate Task 4 пройден: Spec ✅ / Quality Approved, mandatory 0 (`task-4-resume-review.md`). Полный M5 и whole-branch review ещё впереди.
- Git переносит исходники и инструкции; архивы, VM, CA/SSH keys, credentials, лицензии и raw evidence остаются приватными. Перечень повторно получаемых входов — в runbook.
- Task 5b: настоящий update 7.4.1→7.4.2/server0; `.lgp`/JSON/Users/ICF сохранены, gnclient host_id изменён native. Первый client Close FAIL сохранён; target-native копия после одного Save/client0, без product fix.
- Task 5b Docker742: Desktop/CLI real model, Deny/Allow once, common no-auto/auto/no-access, Bfailed/oldAlive/Cready/manual rollback/live5 PASS. Native Save stalls и approved exact-config recovery сохранены отдельно. Change ports/cert + uninstall/preservation/native execute/Close/Logout PASS; CA snapshots/Studio/iframe все3 negative PASS, Host unknown/expired PASS; wrong-name Host и backend lookup открыты из-за Help initialize/network.
- Безопасная точка: own VM штатно выключена, UI/CLI/runtime закрыты; Dashboard удалён, native сохранён. Fresh load не начат: non-root verifier не прочитал image0600. Далее root verification→fresh offline/new ports→Podman→CA/Host/model. Plain repeat-install rediscovery остаётся semantic question; PR/merge/release — отдельная команда.
