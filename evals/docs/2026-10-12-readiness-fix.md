# Readiness live evals после rebase — исправление

- Цель: выполнить согласованные 10 analytics + 6 CrossTable на `openai/gpt-6-luna-fast/high`, сохранив критерии и все результаты.
- Диагноз: несовместимость harness с намеренно асинхронной Help readiness CLI. Изменение `da3e691c3f2ac61fa021e4047ef3724580393c7d` добавило handle.ready; новый status возвращает process-local starting до загрузки каталога.
- Исходный live-отказ: run `20261012-074754-61705f095`, 0 модельных попыток; сохранён в [отчёте](2026-10-12-rebase-live-smoke.md). Полный новый CLI `61705f095…` был собран и проверен, поэтому проблема не связана со старой установленной сборкой.
- Решение: настроенный профиль starting без failure/recoveries проходит немодельный `loginom check` в одном CLI-процессе. Требуются exit=0, отсутствие interruption/timeout/sandbox error, точные ok=true, code=LOGINOM_CONNECTION_VALID, help.state=ready и подтверждённый process/profile cleanup.
- Binary check выполняется через существующие bubblewrap и supervisor, с отдельным временным workspace. Нет неизолированного fallback, модельных запросов или доступа агента к corpus/results.
- Исходный status не подменяется ready; успешный connection-check.json сохраняется рядом с его process cleanup. Browser warning сохраняется согласно контракту Help; реальный Loginom/native preflight остаётся обязательным.
- Pending/unconfigured/recoverable-error, failure, оставшиеся recovery и новый recovery во время check запрещают admission. Acknowledge и история каждой попытки сохраняют прежний контракт.
- Старый готовый CLI остаётся совместимым: ready проходит прежний путь без дополнительного check. Неконфигурированный starting сохраняет ограниченное старое ожидание; starting сам по себе не является доказательством готовности.
- Изменения только внутри evals/: profile.ts, разрешённая fakeCLI-фикстура и profile tests; публичные CLI/API, task data, oracle, judge prompt и рубрики не менялись.
- RED: новый process-local starting test воспроизвёл отказ старого кода (11.17s, 0 PASS / 1 FAIL). GREEN: тот же тест PASS (1.20s), исходный starting сохранён, ровно status+check, evidence подтверждено.
- Узкий набор recovery/readiness: 18 PASS / 0 FAIL (18.44s), включая ошибки check, недостаточный Help proof, pending/failure, сохранение browser warning и новый recovery. Typecheck PASS.
- Полный evals suite после исправления: 557 PASS / 0 FAIL / 0 SKIP, 2847 assertions, 568.69s; собственный PID namespace, реальные Docker fixtures. `bun typecheck` PASS.
- Следующий шаг: чистый commit исправления, новый полный CLI artifact из этого commit, свежий собственный профиль, native admission и запуск 10+6; старый отказ не переписывать и продуктовые FAIL не повторять.
