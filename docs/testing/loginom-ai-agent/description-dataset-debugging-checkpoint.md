# Точка продолжения description/dataset

2026-09-21. Этап B завершён: 10/10 попыток на установленной 0.1.7-local.20260921.10, 7 PASS, 3 BLOCKED (D45,D48,D65). Все assistance=none. Все тестовые Desktop закрыты. Источник baseline 4270f2c93551562c5f46e1b6c27812317e81f5ff; ASAR и 20/20 исходных файлов проверены.

Этап C: исправлена точка клика частично обрезанных Visualizers; уточнены описание бюджетов/wait и managed defaults по измеренным UI-затратам. Явные deadlines, неизвестные эффекты и resume не ослаблены. 460 узких тестов и source transforms PASS. Общий macOS source-check PASS (8 групп). Новый установленный кандидат и final ещё NOT_STARTED.

Приватные доказательства/manifest/controller: `/Users/kartamyshev/Library/Logs/loginom-description-debugging/20260921-163359`. Изолированный DEBUG_ONLY replay D48 на .10 завершён успешно (7 узлов и save), исходное перекрытие не повторилось; runtime закрыт. Запуск выполнен через replay-live.ts; evidence `/var/folders/d0/pcsq9b9j1pvgy1vd9mp9l61w0000gn/T/loginom-port-replay-8pzpCO`. Он не засчитывается как приёмка.

Далее: завершить DEBUG_ONLY, проверки и исходный commit; собрать .11 из чистого checkout по macOS runbook, проверить DMG/ZIP/offline smoke/подпись/hash, установить отдельно. Затронутые D45/D48/D65 повторить через Desktop с исходными файлами и без подсказок, затем все 10 final на одной сборке в порядке D02,D47,D23,D45,D19,D36,D24,D48,D27,D65. Если финальная серия выявит новый необходимый фикс — сохранить её исторически и повторить целиком после нового кандидата.

Модель openai/gpt-5.6-sol low; Loginom7.4.2; предел попытки 30 минут от отправки. Не повторять мутации pending. F03/F07 recovery не подтверждены. Аналитическая правильность not_checked. Не заменять пользовательскую /Applications/Loginom AI Agent.app и её профиль.
