# Dashboard M4 — checkpoint

- Основа отдельного checkout: `bbef0b2e4fabda3aba524823dba20c8130419a8e`, ветка `dashboard-m4`.
- M3 завершена; принятые результаты и ограничения — [runbook M3](dashboard-m3.md), исходный checkpoint сохранён.
- Task 0: документы M4 перенесены без потери раздела M3 roadmap; разрешения владельца актуализированы, контракт не изменён.
- Собственные пары master/7.4.2 имеют отдельные сети и UserStorage volumes; реальные manifest/credentials/evidence вне Git.
- Команды, подготовка и границы проверок — [runbook M4](dashboard-m4.md).
- Оригинальные контейнеры, ROI, backup и рабочее приложение пользователя сохраняются; новый установленный прогон обязателен отдельно.
- Task 1: финальный built-host roundtrip/ACL/collision/upload+login cancel PASS на обеих версиях; `.lgp` сохранён, ACK+exit подтверждены.
- Task 1 принят: fix #1 Approved (focused 38/typecheck PASS), lifecycle #2 ADDRESSED независимым review.
- Исходный built-check: явный NODE_USE_ENV_PROXY=1 и фактический Knowledge proxy peer подтверждены; exact rights-master ACK + exit0/no signal, owned PID отсутствуют.
- Этот lifecycle прогон отделён от delivery/fix #1; исторический Knowledge ACK → SIGKILL сохранён, причина UNKNOWN и риск повтора остаются; детали — runbook.
- Task 2: проверенный JSON передаётся builtin через private Host; pending/changed/отказы сохраняют черновик, source/built-host live PASS обе версии.
- Task 2 Approved без замечаний; Task 3 реализована, ожидает независимого review.
- Task 3: настоящий snapshot → source builtin/built Host → JSON → builder → ready → Dashboard в minified Studio PASS; focused 41, package tests/typecheck/installer check PASS.
- Task 3 concern: failed view-probe пропустил Logout, Server сохранил сессию при disconnect; дальнейшее состояние и причина read-only warning не установлены. Остальные owned cleanup PASS; детали — runbook.
- Следующее действие: review Task 3; Task 4 не начата, установленная Desktop/CLI M4 не принята.
