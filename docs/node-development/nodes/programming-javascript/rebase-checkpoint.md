# JavaScript: rebase на loginom
Дата: 2026-10-13. Запрос владельца — перенести node-javascript на текущую loginom.
База: loginom / origin/loginom 38ee045e79720d363a35666484f17804162b55a1 на момент fetch.
Исходная ветка: e14433a9816f21afdcae2e39af2b776664aac2fd; сохранена как javascript-rebase-backup.
Проверенный код после rebase: faaf775315b2bf2ebd0ac097fe1bc791a89f1cc0; последующий commit меняет только этот checkpoint и source-transforms.json.
Все 315 исходных коммитов перенесены; range-diff проверен, loginom является предком ветки.
UI-конфликт: сохранены upstream F3/semicolon ownership-проверки и JavaScript public-port deny; отмена source/context и полный MCP budget сохранены.
Host-конфликты: обычный graceful/total 30/60 с; saved-package runtime/graceful/total 45/60/90 с; start 180 с.
Сохранены оба sticky failure-флага startupCleanup.failed и shutdown.failed; clean exit обязателен, forced teardown не означает cleanup PASS.
Runtime client: 3759 PASS, 10 SKIP, 0 FAIL; runtime entry: 61 PASS, 3 SKIP, 0 FAIL.
Host: все 49 test-файлов, 362 PASS, 7 SKIP, 0 нерешённых FAIL; bun typecheck PASS; ACK без exit покрыт реальным process-тестом.
Agent CLI/attachments и HTTP API/SDK: 54 PASS, 1 SKIP, 0 FAIL; bun typecheck PASS.
Node v24.19.0, Bun 1.3.14; ci-inputs повторён с полной закреплённой Node-дистрибуцией после отсутствующего npm-cli.js в installed runtime.
Source-map и baseHash сохранены; обновлены только 4 hash/reason записи executor/workspace-ui и их тестов.
Общий source validator НЕ PASS: те же 19 исторических несоответствий из 5045 записей, новых 0; сравнение с исходным e14433a98 подтверждено.
Прежний untracked local-reacceptance-checkpoint.md сохранён побайтно: SHA256 303e92afb24da75b20c556f182553e70389a98033b50d7568d1bc82c5219ac9e.
Приватные summaries, range-diff и журналы: /tmp/javascript-rebase-20261013-tjy56jd0; в Git сырые журналы не включены.
Ограничения: source/process-проверки; platform/compiled-CLI SKIP, live Loginom/model acceptance не выполнена; установка, push, merge и выпуск не выполнялись.
Следующий шаг: отдельная команда владельца; прежняя live-приёмка остаётся на паузе, для нового SHA потребуется новый проверенный build.
