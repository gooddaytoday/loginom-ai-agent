# Dashboard M5 — checkpoint

- Передача на рабочий компьютер: 16 ноября 2026; ветка `dashboard-m5`, M5 не завершён. Продолжать Task 4, затем Task 5.
- Исходная принятая M4 основа M5: `77c275a68f9152efd7f5203b0f6643f11923a8ef`; Tasks 0–3 приняты: Spec Approved / Quality Approved, mandatory 0.
- Начать с [подробной передачи](dashboard-m5.md#передача-на-рабочий-компьютер), затем читать связанные план, дизайн и инструкции; локальные ignored-отчёты для понимания блокеров не требуются.
- Task 0: из предоставленного release и штатного installer подготовлен рабочий Loginom; лицензирование, HTTP/HTTPS/WSS/Integrator и installed Desktop/CLI проверены.
- Task 1: installed Desktop → snapshot → real model draft → Allow once → Host JSON → ready/live4 PASS; `.lgp` не изменён, JSON без sample; native Close/Logout и actual runtime exit проверены раздельно.
- Shell/server совпали с финальным dist; SRI, отдельный app-origin, private API и HTTP-only/HTTPS проверены без правок vendor index/client.json.
- Task 2: обязательная уникальная публикация с точным sourceHash/HTML/assets и publisher cleanup, ошибки/сигналы/concurrency/client negatives PASS.
- Task 3: ownership/lifecycle/Apache rollback, один переносимый архив, fresh offline Docker install/server и отдельный HTTPS client PASS; данные сохранены.
- Task 4 partial: один новый общий архив прошёл modern Docker/Podman server/client, rootless SELinux shared/private, MCS/durable/cron/rollback и Fedora reboot.
- Главный блокер: исходные минимумы реально FAIL — Podman нарушает network/PIDs, Docker запрещает Node clone3; точные версии и воспроизведение только в runbook.
- Минимумы не изменены. Решение владельца: проверенные современные границы / поиск более низких штатных / отдельный compatibility plan для исходных.
- Отдельное ограничение: recurring client initial `IsPackageModified(...) !== false` до idle; причина неизвестна, финальные single-run PASS не являются исправлением.
- Source/package/browser/size и адресные проверки записаны в runbook; после фактических изменений повторять затронутые, без подмены installed/source результатов.
- Независимое scoped review Task 4: Quality Approved для partial handoff, mandatory 0; Spec incomplete, полный M5 и итоговое whole-branch review ещё впереди.
- Git переносит исходники и инструкции; архивы, VM, CA/SSH keys, credentials, лицензии и raw evidence остаются приватными. Перечень повторно получаемых входов — в передаче.
- Прежние стенды/диски сохранены; primary VM остановлена для RAM. Новому компьютеру нужны собственные тестовые среды и действующее лицензирование.
- Task 5 не начинался: настоящее update/change, полная installed Desktop/CLI/CA-приёмка, итоговые CI/package gates и независимое ревью обязательны по плану.
- Владелец разрешил commit/push этой передачи в `origin/dashboard-m5`; PR/merge/tag/release и изменение требований не разрешены этим поручением.
