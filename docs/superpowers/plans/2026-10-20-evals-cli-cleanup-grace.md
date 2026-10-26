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
`evals/test/transition.test.ts`, `evals/test/node-skill.test.ts`,
`evals/docs/parallel-users-contract.md`.
Незавершённые staged-документы и чужой untracked-файл сохраняются.
Временные данные — только `/home/kiselev/storage/tmp/`; live-вызовов нет.

- [x] Прочитать call sites, бюджеты CLI и существующие тесты завершения.
- [x] Независимое ревью минимального плана до изменения кода: 90/120 для slot,
  30/60 для прочих владельцев; нужны новые deadlines двух HANG_AFTER_EVENTS тестов.
- [x] RED: один тест через `superviseProcess` с owner slot, SIGINT и cleanup
  длительностью 33 секунды. Проверить код 130, отметку завершения cleanup,
  подтверждённое пустое дерево. До исправления: FAIL, 143 вместо 130 за 31.1 с.
- [x] GREEN: заменить ожидание на `owner?.kind === "slot" ? 90_000 : 30_000`,
  общий deadline — `Date.now() + interruptGraceMs + 30_000`. Тест PASS за 33.5 с:
  exit 130, cleanup-complete, подтверждённое пустое дерево.
- [x] Проверить тот же сценарий по timeout: PASS за 34.5 с; SIGINT — 33.5 с.
- [x] Проверить ограниченное завершение зависшего слота: оба HANG_AFTER_EVENTS
  теста CLI прошли; исходы и телеметрия сохранены.
- [x] Timeout-кейсы transition и Ctrl+C node skill прошли с новыми deadlines;
  assertions исходов сохранены.
- [x] Обычный command с прежним бюджетом завершён принудительно за 32.4 с,
  exit 143 и подтверждённая очистка; timeout теста остался 45 секунд.
- [x] Обновить пункт 24 контракта новыми фиксированными бюджетами.
- [x] Запустить `TMPDIR=/home/kiselev/storage/tmp EVAL_PROCESS_DENIAL_TESTS=0
  bun test --isolate --timeout 150000 test/process-supervisor.test.ts test/cli.test.ts
  test/transition.test.ts` из `evals/`: 85 PASS, 7 SKIP, 0 FAIL, 598 assertions.
  Proc-denial проверки пропущены по правилу отдельного окна без других агентов.
- [x] Немодельный Ctrl+C тест `test/node-skill.test.ts`: 1 PASS за 94 с.
- [x] `bun typecheck` из `evals/`: exit 0.
- [x] Независимое финальное ревью изменения: замечаний нет.
- [x] `git diff --check`, проверка сохранности чужого index/worktree,
  отдельный коммит `fix(evals): allow CLI slot teardown before escalation`.

## Checkpoint

База: `e3fd25c53258571f93630aafbcec056222430d62`.
План: `35507f49fb`; RED → GREEN подтверждён.
Результат: 86 PASS, 7 SKIP, 0 FAIL; typecheck и whitespace checks — PASS.
SIGINT/timeout слота, переходы и ограниченность command проверены;
независимое ревью — без замечаний. Новых настроек и runtime-зависимостей нет.
Исходные четыре staged-документа и чужой untracked-файл сохранены.
Live Loginom/N=2 и proc-denial здесь не запускались.
Дальнейшей работы по этому исправлению нет.
