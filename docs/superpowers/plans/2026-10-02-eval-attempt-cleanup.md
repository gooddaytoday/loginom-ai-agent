# Безопасная очистка eval-попытки

Goal: сохранить неуспешный исход AMBIGUOUS и допускать следующий кейс только
после подтверждённой локальной очистки. База: evals 97354ffff.
Канонический контракт: ../specs/2026-09-18-evals-design.md, раздел
«Изоляция неудачной попытки — 2026-10-02».

## Требования и checkpoint

- [ ] Отдельный environment_cleanup; исходные метрики неизменны; legacy/rejudge.
- [ ] Общий supervisor agent/management: Linux PID/starttime ledger, browser
  binding, exclusive harness lease, identity-проверки сигналов и writer.
- [ ] Сохранение исхода при failed cleanup; stop до следующего case на всех путях.
- [ ] Redacted journal archive с hash до acknowledge/prune; partial capture.
- [ ] Отрицательные TDD process/profile/pipeline сценарии.
- [ ] Полный bun test, bun typecheck, git diff --check.
- [ ] Native controlled no_artifact → следующий успешный case.
- [ ] Native budget и low-liquidity, обычные бюджеты, current model/variant.
- [ ] Обновлены spec, README, пункт 9 и отчёт приёмки.

Начало: 2026-10-02. Goal active. Продуктовый runtime/установленный CLI не
изменять; пользовательские dirty reports не включать в коммиты.
Исходная проверка: 176 eval tests pass, typecheck и diff-check pass.
Новые native проверки ещё не выполнены. Systemd/cgroup отклонены пользователем
как новая зависимость; использовать только существующие Linux /proc/PGID.

## Checkpoint 2026-10-02, реализация продолжается

Ветка evals, commits 2a4688485–002aa3c96. Реализованы отдельные cleanup
счётчики и вывод отчёта, fail-stop конвейер с сохранением измеренного исхода,
эксклюзивный sibling harness lease, общий agent/management supervisor,
непрерывная запись CLI capture, проверка PID/starttime перед сигналом,
writer receipt и очищенный журнал с SHA-256/read-back до acknowledge/prune.
Проверены реальными дочерними процессами detached descendant, timeout с
отказом ownership (31 с с сохранением telemetry), подмена writer, неизвестный
native helper, недоступный посторонний /proc и отказ архива до recovery.

Остаются: усиление native binding/helper ancestry; строго адресный pruning
архивированных каталогов; все отрицательные lifecycle сценарии, rejudge,
полная suite и native acceptance. Новый baseline не проводился. Goal active.
Установленный CLI выбран из текущей конфигурации: 0.1.17-prod,
openai/gpt-6-sol, variant default, обычный бюджет 900000 мс. Он не менялся.
Пользовательские system-bugs.md/repository-week.md не включались в коммиты.
