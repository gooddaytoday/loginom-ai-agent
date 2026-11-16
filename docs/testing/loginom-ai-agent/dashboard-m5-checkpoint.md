# Dashboard M5 — checkpoint

- Возобновление: 16 ноября 2026; ветка `m5-acceptance`, M5 не завершён. После итогового scoped gate Task 4 продолжать Task 5.
- Исходная принятая M4 основа M5: `77c275a68f9152efd7f5203b0f6643f11923a8ef`; Tasks 0–3 приняты: Spec Approved / Quality Approved, mandatory 0.
- Текущий срез начат от `004a74be529500573e16f67c1fe20bacf935cf9e`; [runbook M5](dashboard-m5.md) — канонический источник входов, точных сред и результатов.
- Task 0: из предоставленного release и штатного installer подготовлен рабочий Loginom; лицензирование, HTTP/HTTPS/WSS/Integrator и installed Desktop/CLI проверены.
- Task 1: installed Desktop → snapshot → real model draft → Allow once → Host JSON → ready/live4 PASS; `.lgp` не изменён, JSON без sample; native Close/Logout и actual runtime exit проверены раздельно.
- Shell/server совпали с финальным dist; SRI, отдельный app-origin, private API и HTTP-only/HTTPS проверены без правок vendor index/client.json.
- Task 2: обязательная уникальная публикация с точным sourceHash/HTML/assets и publisher cleanup, ошибки/сигналы/concurrency/client negatives PASS.
- Task 3: ownership/lifecycle/Apache rollback, один переносимый архив, fresh offline Docker install/server и отдельный HTTPS client PASS; данные сохранены.
- Task 4: один общий архив прошёл modern Docker/Podman server/client, rootless SELinux shared/private, MCS/durable/cron/rollback и Fedora reboot; технические пункты подтверждены.
- Владелец 16 ноября принял проверенные современные стеки как нижнюю границу Dashboard; [точная политика](dashboard-m5.md#границы-поддержки-dashboard). Исходные нижние FAIL сохранены как история.
- Общие минимумы вендора Loginom не изменены и не задают поддержку Dashboard; version guard или compatibility-механизм не добавлялся.
- Отдельное ограничение: recurring client initial `IsPackageModified(...) !== false` до idle; причина неизвестна, финальные single-run PASS не являются исправлением.
- Документационный остаток Task 4 синхронизирован; новые source/installed-прогоны не выполнялись. Source/package/browser/size и адресные результаты — в runbook.
- Итоговый независимый scoped Spec/Quality gate Task 4 ожидается; прежний Quality Approved относится только к partial handoff. Полный M5 и whole-branch review ещё впереди.
- Git переносит исходники и инструкции; архивы, VM, CA/SSH keys, credentials, лицензии и raw evidence остаются приватными. Перечень повторно получаемых входов — в runbook.
- Прежние стенды/диски сохранены; primary VM остановлена для RAM. Новому компьютеру нужны собственные тестовые среды и действующее лицензирование.
- Task 5 не начинался: настоящее update/change, полная installed Desktop/CLI/CA-приёмка, итоговые CI/package gates и независимое ревью обязательны по плану.
- Текущий документационный срез — commit без push; PR/merge/tag/release требуют отдельной команды.
