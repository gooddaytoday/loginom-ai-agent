# Ожидание завершения CLI в evals

**Цель:** после SIGINT/timeout harness позволяет CLI слота закончить штатный
teardown до отправки SIGTERM; подтверждение очистки остаётся обязательным.

**Основание:** замечание P2 после rebase на loginom, принятое владельцем
2026-10-20. Новый CLI включает `closeSavedPackageOnShutdown`: runtime close —
45 секунд, Host graceful close — 60 секунд, полный Host teardown — 90 секунд
(`packages/loginom-host/src/node-client.ts`, `src/supervisor.ts`).

**Решение:** только для `owner.kind === "slot"` ждать 90 секунд после SIGINT
и выделять 120 секунд на весь cleanup supervisor-а. Для остальных владельцев
сохранить 30/60 секунд. Не добавлять настройки или зависимость harness от Host.
Deadline задачи, проверка владения, ACK и правила карантина не меняются.

**Файлы:** `evals/src/process-supervisor.ts`,
`evals/test/process-supervisor.test.ts`, `evals/test/cli.test.ts`,
`evals/docs/parallel-users-contract.md`.
Незавершённые staged-документы и чужой untracked-файл сохраняются.
Временные данные — только `/home/kiselev/storage/tmp/`; live-вызовов нет.

- [x] Прочитать call sites, бюджеты CLI и существующие тесты завершения.
- [x] Независимое ревью минимального плана до изменения кода: 90/120 для slot,
  30/60 для прочих владельцев; нужны новые deadlines двух HANG_AFTER_EVENTS тестов.
- [ ] RED: один тест через `superviseProcess` с owner slot, SIGINT и cleanup
  длительностью 33 секунды. Проверить код 130, отметку завершения cleanup,
  подтверждённое пустое дерево. До исправления получается 143 вместо 130.
- [ ] GREEN: заменить ожидание на `owner?.kind === "slot" ? 90_000 : 30_000`,
  общий deadline — `Date.now() + interruptGraceMs + 30_000`. Повторить тест.
- [ ] Проверить тот же сценарий по timeout, сохранив тест с SIGINT.
- [ ] Проверить ограниченное завершение зависшего слота и обычного command;
  скорректировать только существующие тестовые deadlines, если необходимо.
- [ ] Обновить пункт 24 контракта ссылкой на новые фиксированные бюджеты.
- [ ] Запустить `TMPDIR=/home/kiselev/storage/tmp EVAL_PROCESS_DENIAL_TESTS=0
  bun test --isolate --timeout 150000 test/process-supervisor.test.ts test/cli.test.ts`
  из `evals/`, затем `bun typecheck` и `git diff --check`.
- [ ] Финальное ревью изменения, проверка сохранности чужого index/worktree,
  отдельный коммит `fix(evals): allow CLI slot teardown before escalation`.

## Checkpoint

База: `e3fd25c53258571f93630aafbcec056222430d62`.
План проверен независимым агентом; следующий шаг — RED.
