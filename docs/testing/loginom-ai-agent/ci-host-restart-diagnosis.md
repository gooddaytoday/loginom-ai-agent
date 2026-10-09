# CI: журнал при исчерпании перезапусков runtime

Checkpoint 2026-10-06: ветка `txt-delivery`, PR #36; базовый SHA `911a39e07828dda644c6b21d08af4fe03576c5e1`.
Падение: [unit push](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/37499611949/job/112392931671), `host-port.test.ts:542`.
Лимит перезапусков соблюдён, но вместо пустого recovery-каталога остался один `.json`.
Причина: выход процесса между первой проверкой runtime и повторной проверкой после `journal.begin`.
Повторная проверка исчерпывает лимит и бросает `LOGINOM_RUNTIME_UNAVAILABLE` до dispatch; catch пропускал очистку admission.
Исправление: при таком отказе второго lookup удаляется только запись текущего admission; прежние записи сохраняются.
Лимит перезапусков, результаты неопределённых вызовов и strict recovery не ослаблены.
Детерминированный тест завершает реальный IPC-процесс после настоящего `journal.begin`, до второго lookup.
До исправления: новый вариант `during-admission` воспроизводит тот же оставшийся `.json`.
После исправления: `after-call` и `during-admission` — 60/60 PASS за 30 повторов каждого; Bun 1.3.14, Node 24.19.0, macOS arm64.
`bun typecheck` из `packages/loginom-host` — PASS.
Полный локальный набор: 124 PASS, 8 SKIP, 1 FAIL в неизменённом `system-proxy-io.test.ts` (`linux readers`, timeout вместо read-failed).
Этот Linux-ориентированный тест отдельно повторяет тот же FAIL на Mac; его причина здесь не установлена.
Следующий шаг: CI на новом SHA, включая Linux unit и Windows Chromium; результаты старого SHA не подтверждают новый.
Разбор постороннего трафика Mozilla и граница исторических доказательств: [chromium-direct.md](chromium-direct.md).
