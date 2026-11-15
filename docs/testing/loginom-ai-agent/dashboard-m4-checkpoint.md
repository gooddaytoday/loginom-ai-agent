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
- Task 2 Approved без замечаний; Task 3 accepted: Fix 1 независимо проверен, оба mandatory замечания закрыты, новых дефектов нет.
- Task 3: настоящий snapshot → source builtin/built Host → JSON → builder → ready → Dashboard в minified Studio PASS; focused 41, package tests/typecheck/installer check PASS.
- Task 3 cleanup: четыре собственные native sessions закрыты разрешённым maintenance restart; 25 долговечных файлов неизменны, удалён только package lock. Host resource/exit ACK не означает native Logout.
- Fix 1: manifest/parallel-build RED→GREEN, targeted 30 и publisher 15 PASS; typecheck/build/reinstall/check/cmp PASS без новой публикации.
- Task 4 accepted (independent review 0 mandatory): источники/base сохраняются, fresh src читается через pre-chat Host, конфликт подтверждается один раз; source/UI/CLI cancellation проверки и пять package typecheck PASS — [runbook](dashboard-m4.md#task-4--продолжение-черновика-и-осознанная-замена-версии).
- Task 5: source/native failure matrix и container limits PASS; shell сохраняет старую страницу и показывает новую ошибку — [runbook](dashboard-m4.md#task-5--отказы-сохраняют-работающую-версию).
- Следующее действие: независимый review Task 5; Tasks 6–7 и установленная Desktop/CLI M4 ещё не приняты.
