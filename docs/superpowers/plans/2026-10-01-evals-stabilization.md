# Минимальная стабилизация evals

**Цель:** устранить подтверждённые ошибки измерения и запуска из отчёта
`docs/testing/loginom-ai-agent/reports/2026-10-01-evals-system-bugs.md`.

**Подход:** существующие публичные интерфейсы, без новых зависимостей;
вертикальные циклы TDD: один падающий тест поведения, минимальное изменение,
зелёная проверка. Контракт закреплён в уточнении от 2026-10-01 канонической
спеки `docs/superpowers/specs/2026-09-18-evals-design.md`.

Пользователь уже разрешил перепроверку и безопасное исправление подтверждённых
дефектов, сохраняя минимальный объём. Дополнительное подтверждение не требуется.

- [x] Параметры и идентичность агента: `config`, `task`, `preflight`, `rejudge`;
  тесты variant, бинарника/симлинка/manifest, пустых каталогов, хешей и
  восстановления внешнего каталога задач. Команды из `evals/`:
  `bun test test/config.test.ts test/task.test.ts test/preflight.test.ts test/rejudge.test.ts`.
- [x] Достоверность оценки: `report`, `judge`, `oracle`, `calibrate`, `compare`;
  тесты ошибочного CSV, обязательных result-пунктов, знаменателей и предупреждений.
  `bun test test/report.test.ts test/judge.test.ts test/oracle.test.ts test/calibrate.test.ts test/compare.test.ts`.
- [x] Устойчивость попытки: `cli`, `profile`, `artifact`, `run` и fake CLI;
  тесты дочернего процесса без пути профиля, stale writer после exit 1,
  нескольких JSON-квитанций, постороннего пакета, recovery последней попытки
  и безопасной очистки runtime. `bun test test/cli.test.ts test/profile.test.ts test/artifact.test.ts test/run.test.ts`.
- [x] Интеграция, полный `bun test`, `bun typecheck`, smoke CLI с fake агентом
  и судьёй; обновить README и отчёт с подтверждениями и ограничениями.

P1 перепроверен в owning-модуле: разрешённое пользователем исправление ограничено
внешним таймаутом `start`, используя существующий transport budget. Guard и
жизненный цикл продукта не меняются. P2 требует отдельного дизайна восстановления
неопределённой операции и здесь не исправляется. E15 (`--resume`), near-miss генератор
и статистический критерий решения отложены как отдельные возможности.
Исторические результаты не переписываются; после изменения правил нужен новый
baseline. Коммиты — после интеграционных проверок, только файлы этой задачи.

Приёмка: evals `bun test` — 170 PASS, 0 FAIL (536 assertions); `bun typecheck`
и `git diff --check` — PASS. Smoke dry-run/rejudge — 6 попыток; replay исходных
CSV — 9/9 PASS, near-miss — 9/9 FAIL, контроль PASS. P1 — real pinned Node
RED timeout30s → GREEN start31s/close/exit0, два старых теста PASS,
host package typecheck PASS. Живой analytic-прогон и новый baseline не выполнялись.
