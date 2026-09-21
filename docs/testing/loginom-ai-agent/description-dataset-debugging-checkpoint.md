# Точка продолжения description/dataset

2026-09-21. Этап B завершён: 10/10 попыток на установленной 0.1.7-local.20260921.10, 7 PASS, 3 BLOCKED (D45,D48,D65). Все assistance=none. Все тестовые Desktop закрыты. Источник baseline 4270f2c93551562c5f46e1b6c27812317e81f5ff; ASAR и 20/20 исходных файлов проверены.

Этап C: исправлена точка клика частично обрезанных Visualizers; уточнены описание бюджетов/wait и managed defaults по измеренным UI-затратам. Явные deadlines, неизвестные эффекты и resume не ослаблены. 460 узких тестов и source transforms PASS. Общий macOS source-check PASS (8 групп). Кандидат .11 собран и установлен отдельно; DMG/ZIP/offline smoke/installed signature/ASAR PASS. Final ещё NOT_STARTED.

Приватные доказательства/manifest/controller: `/Users/kartamyshev/Library/Logs/loginom-description-debugging/20260921-163359`. Изолированный DEBUG_ONLY replay D48 на .10 завершён успешно (7 узлов и save), исходное перекрытие не повторилось; runtime закрыт. Запуск выполнен через replay-live.ts; evidence `/var/folders/d0/pcsq9b9j1pvgy1vd9mp9l61w0000gn/T/loginom-port-replay-8pzpCO`. Он не засчитывается как приёмка.

Далее: завершить DEBUG_ONLY, проверки и исходный commit; собрать .11 из чистого checkout по macOS runbook, проверить DMG/ZIP/offline smoke/подпись/hash, установить отдельно. Затронутые D45/D48/D65 повторить через Desktop с исходными файлами и без подсказок, затем все 10 final на одной сборке в порядке D02,D47,D23,D45,D19,D36,D24,D48,D27,D65. Если финальная серия выявит новый необходимый фикс — сохранить её исторически и повторить целиком после нового кандидата.

Модель openai/gpt-5.6-sol low; Loginom7.4.2; предел попытки 30 минут от отправки. Не повторять мутации pending. F03/F07 recovery не подтверждены. Аналитическая правильность not_checked. Не заменять пользовательскую /Applications/Loginom AI Agent.app и её профиль.

## Кандидат .11 и целевые прогоны

Source: `658b8ab953232164c9f28534e39b2990c0c85547`. Build: `/Users/kartamyshev/.cache/loginom-macos-build/description-20260921-11`. Установка: `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260921.11/Loginom AI Agent.app`. ASAR: `c535dd986706564d3487249f0ab46642b47b35597ba1e6366261b9b04702a24a`.

Активен D45-target11-a01: отправлен 19:08:16 UTC, предел 19:38:16 UTC, PID39981. node_repl: app11/page11/backend11/headers11/run11; ctl.collectAttempt(backend11,headers11,run11) сохраняет chat/receipts/metadata; секреты headers/backend не печатать. Контроллер и свежий active checkpoint находятся в приватном evidence, модуль attempt-controller.mjs. Все changed vars передавать в функции явно.

## Актуальное состояние после целевого .11

D45-target11-a01 BLOCKED: модель переопределила configure budget на 120000; Stop подтверждена, Desktop закрыт, активных UI/сценариев нет. .11 оставлен историческим, final не начинался. В исходниках user-v1 budgets скрыты и отвергаются валидатором; сроки задаёт приложение. Диагностический полный контракт сохранён. 87 узких проверок PASS; полный runtime suite 2283 PASS, 2 SKIP, 0 FAIL; source transforms 5045 PASS. Далее commit/build/install .12 и целевые D45/D48/D65, потом final10.
