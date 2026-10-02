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

Native checkpoint: 198 tests/typecheck/diff-check pass. Readiness probes
20261002-104121-d16624d12-dirty и 20261002-105029-f46160d7e-dirty остановлены
до dispatch кейсов. Два последующих адресных status дали положительные browser
bindings, но не смогли доказать происхождение chrome_crashpad_handler: double-fork,
собственный SID, усыновление системным reaper PID 1327 до первого 100-мс scan.
Неизвестные helpers не завершались; все наблюдённые процессы затем исчезли сами.
Guard reconciliation сохраняет evidence и выполняется после двух пустых проверок
PID/starttime и профиля; runtime исходных probes остаётся сохранённым.

Для выполнения исходного proof-of-origin контракта требуется выделенный Linux
subreaper launcher на каждый запуск: он запускает только выбранный CLI и держит
родительскую границу до финальной проверки. Использовать встроенный Bun FFI и
Linux prctl, без зависимостей/установки/systemd и без изменений продукта. Это
устраняет потерю ancestry на double-fork; argv match не становится kill authority.
Реализация и отрицательная проверка чужого helper ещё не завершены. Goal active.


## Checkpoint native control, 2026-10-02 11:59 UTC

На установленном CLI readiness probe-v5 подтвердил browser/helpers cleanup.
Полная suite: 201 pass, typecheck/diff-check pass (60545b22a).
Native run 20261002-114527-60545b22a-dirty: control no_artifact (exit 0,
Session ses_f03909bcdffeJF4g8TDRlKbveI, 49 с), cleanup confirmed; следующий
Session ses_f038fb46effepQ87RGxQqK6Fgq создал пакет group-sum-qty (232 с,
completed). После completed короткая profile-idle проверка отказала; честный
completed сохранён, run stopped/exit 1, lease/runtime/evidence сохранены.
Приёмка ещё НЕ закрыта. Измеренный control содержал реальный browser prepare,
workspace read и отказ одного tool; AMBIGUOUS из события автоматически не влияет
на бюджет/повтор и не считается восстановленным продуктовым дефектом.

Дополнительный TDD: transient owner в коротком waitProfileIdle, два пустых
финальных scan с origin ledger/subreaper receipts, relevant /proc EACCES,
management timeout, readiness failure для no_artifact/failed/timeout/completed,
rejudge preservation, отказ записи run/result с сохранением measured outcome
в summary и остановкой до второго case. Отказ result пишет дополнительный
result.persistence-failure.json, если основной путь недоступен.
Следующее: полная suite, безопасное reconciliation только собственного lease
первого control, повтор native control и адресные budget/low-liquidity.
