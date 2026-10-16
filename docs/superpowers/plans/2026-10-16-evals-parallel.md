# Parallel evals: короткий план реализации

> Исполнение последовательно в этой сессии. Новый код — по skill `tdd`,
> один unit RED → минимальная реализация → GREEN → отдельный коммит.

**Goal:** один реальный N=2 на трёх небольших задачах с судьёй, безопасной
очисткой своих файлов и общей сводкой.
**Architecture:** существующие harness и общая очередь, один выделенный Server,
два пользователя/профиля/workspace/архива, одно admin-соединение и judge gate.
**Tech Stack:** Bun/TypeScript, установленный CLI, Loginom Server/Studio, VPN Codex.
**Spec:** [дизайн](../../plans/2026-10-11-evals-parallel-design.md),
[контракт](../../../evals/docs/parallel-users-contract.md).

## Общие ограничения и решения

- Агент `openai/gpt-6-luna/high`, судья `gpt-6-sol/xhigh`.
- Задачи: `filter-active-rows`, `calc-data-double`, `group-sum-qty`, repeat=1.
- Одна server lock с долговечной бронью, profile locks, judge-home lock; без user lock.
- Внутри run карантин без recovery; здоровый слот продолжает очередь.
- Prepare создаёт недостающее/проверяет права; run только проверяет, Pool=0 до работы.
- Сессии закрываются по точным native именам пользователя; readback и проверка
  открытых файлов в своём root обязательны до удаления; SessionBackup только читать.
- Никаких новых эпох, процессных описей/телеметрии, FD/kernel receipts,
  server-storage archives и исследовательских операций в рабочем admin-драйвере.
- Subreaper, pid+starttime перед сигналом, marker v2, изоляция секретов сохраняются.
- Блокер сквозного пути/изменение требования/удаление кроме собственных временных
  файлов текущего хода — запрос владельцу и ожидание, без обхода через blockers.
- Предлагается новая acceptance pair `loginom-evals-acceptance-20261016-server`
  / `loginom-evals-acceptance-20261016-studio`, private root
  `/home/kiselev/.local/state/loginom-evals/acceptance-20261016/`, config `slots.json`.
  Username eval-a/eval-b, раздельные a/b profile/work/history, новый judge-codex.
  Эти имена/root отсутствовали при чтении 2026-10-16; перед созданием перепроверить.
  Старый judge-home retained; его reservation и все прежние стенды не трогать.
- Новая пара создаётся после утверждения плана, с новым loopback-портом/сетью,
  marker v2 и private state. Старые profiles/auth/archives не перезаписываются.
- Чужие правки не включать в коммиты. Два незавершённых code-diff server archive
  сохраняются замороженными. При утверждении плана запросить отдельное решение:
  разрешена ли отмена только этих собственных незакоммиченных hunks в
  `evals/src/attempt-finalization.ts` и `evals/test/native-agent-run-integration.test.ts`
  перед работой; committed mechanisms пока сохраняются до успешного N=2.

## 1. Документы и решение до реализации

- [x] Переписать дизайн/контракт на месте, сократить runbook, перенести прежние
  тексты с точной проверкой сохранности в один архив; старый план оставить ссылкой.
- [x] Проверить текущие Docker resources, roots и reservations на чтение; составить
  [перечень удержанного](../../testing/loginom-ai-agent/2026-10-16-evals-parallel-retained.md).
- [x] Независимое ревью плана/документов: Approved; замечание порядка startup
  исправлено (единственный admin открывается до процедуры остатков).
- [ ] Показать владельцу план/перечень и **дождаться ответа до реализации**.
- [x] Сохранить предложенную редакцию документов отдельным коммитом
  `docs(evals): simplify parallel run requirements and plan`.

## 2. Минимальное владение и подготовка

**Files:** `evals/src/slots.ts`, `lease.ts`, `environment-preparation.ts`,
`environment-finalization.ts`, `user-environment.ts`, `script/parallel-env.ts`.
**Unit tests:** `slots.test.ts`, `lease.test.ts`, `parallel-env.test.ts`.

- [ ] RED: один server guard/reservation, два profile locks и judge-home lock;
  повторный controller отказан, user lock не нужен, неизвестная бронь не стирается.
- [ ] RED: prepare создаёт только недостающее/проверяет права; verify/run отказывают
  на missing user, ACL drift, Pool!=0 и непустой SessionBackup без исправлений/delete.
- [ ] GREEN: переиспользовать рабочие lease/preparation primitives; исключить user
  lock из нового пути. Одна повторяемая startup-процедура сверяет остатки прошлого
  run; неизвестность сохраняет карантин. Не расширять recovery/epoch API.
- [ ] Проверить `bun run test test/slots.test.ts test/lease.test.ts test/parallel-env.test.ts`
  и `bun typecheck` из `evals/`; коммит `refactor(evals): simplify run ownership and preparation`.

## 3. Рабочий admin и безопасное завершение слота

**Files:** `evals/src/loginom-admin.ts`, `script/loginom-admin-driver.mjs`,
`src/attempt-finalization.ts`, `src/artifact.ts`, `src/profile-archive.ts`.
**Unit tests:** `loginom-admin.test.ts`, `artifact.test.ts`, `profile-archive.test.ts`.

- [ ] RED: точные native имена всех сессий eval-a закрываются через один заранее
  открытый admin; eval-b/admin сохраняются; readback still-present запрещает delete.
- [ ] RED: неизвестное владение/root, активный открытый файл или непустой/нечитаемый
  SessionBackup оставляют файлы неизменными; история/inputs сохраняются вне mounts.
- [ ] GREEN: в новом пути заменить actor-ledger admission точным пользователем,
  архивировать профиль/результаты, закрыть свои сессии, перечитать и непосредственно
  проверить открытые файлы перед очисткой своего root. Не развивать замороженный
  server-storage archive diff; до решения об отмене этих hunks файл не редактировать.
- [ ] Исключить research phases из рабочих операций admin-драйвера; не вводить
  заменяющий probe protocol. Их окончательное удаление — только после N=2.
- [ ] Проверить `bun run test test/loginom-admin.test.ts test/artifact.test.ts test/profile-archive.test.ts`
  и `bun typecheck`; коммит `feat(evals): close slot user sessions before cleanup`.

## 4. Процессы и выделенный судья

**Files:** `evals/src/process-supervisor.ts`, `judge-environment.ts`, `judge.ts`;
`/home/kiselev/git/codex-vpn-lockdown/bin/codex` в другом репозитории.
**Unit tests:** `process-supervisor.test.ts`, `judge-environment.test.ts`;
новый `verify/test_codex_home.py` рядом с существующими verify tests wrapper repo.

- [ ] RED/GREEN: полностью прочитанная чужая ancestry не сигналится и не карантинится;
  ошибка чтения отказывает; own descendant проходит subreaper/pid+starttime guards.
- [ ] Проверить `bun run test test/process-supervisor.test.ts test/judge-environment.test.ts`
  и `bun typecheck`; отдельный коммит `fix(evals): ignore proven foreign process ancestry`.
- [ ] RED/GREEN wrapper unit: разрешённый canonical caller CODEX_HOME с тем же
  lockdown-конфигом сохраняется; outside/symlink/mismatch не допускаются;
  отсутствие caller home сохраняет прежнее поведение и сетевые ограничения.
- [ ] Проверить `python3 -m unittest discover -s verify -p test_codex_home.py`
  и `bash -n bin/codex` в wrapper repo. Отдельным маленьким коммитом
  `fix(codex): preserve validated eval judge home` включить только свои hunks,
  сохранив имеющиеся чужие правки bin/codex и других файлов.

## 5. Очередь, ресурсы и сводка: открыть настоящий slots path

**Files:** `evals/src/run.ts`, `scheduler.ts`, `report.ts`, `parallel-acceptance.ts`,
`parallel-resources.ts`, `parallel-resource-budget.ts`.
**Unit tests:** `parallel-run.test.ts`, `scheduler.test.ts`, `parallel-users-acceptance.test.ts`.

- [ ] RED: два слота проходят агент→судья→cleanup→summary; crash A карантинит
  только A, B продолжает очередь; SIGINT прекращает выдачу; license denial
  останавливает весь run. Артефакты/results не пропадают при ошибке cleanup; unit-проверка env и outputs
  агента/судьи подтверждает отсутствие всех секретов, включая пароли слотов.
- [ ] RED: запись бюджета до dispatch, host/container CPU/RAM, диск/OOM,
  licence/provider errors определяют приёмку; процессная телеметрия не gate;
  missing mandatory sample не PASS, скрытый 429/успешный retry не скрывает отказ.
- [ ] GREEN: подключить подготовленные слоты к существующим runSlotQueue и judge
  gate, убрать `SLOTS_ADMISSION_UNAVAILABLE` для этого пути. Run не вызывает
  создание/исправление пользователей; использовать новый judge-home/VPN wrapper.
- [ ] Проверить `bun run test test/parallel-run.test.ts test/scheduler.test.ts test/parallel-users-acceptance.test.ts`
  и `bun typecheck`; логические изменения сохранять отдельными коммитами
  `feat(evals): execute prepared user slots` / `refactor(evals): bound run resource acceptance`.

## 6. Четыре live A/B сценария, затем N=1 → утверждение → N=2

**Files:** новый `evals/test/parallel-slots-live.test.ts`, существующие task inputs,
private config/budget/results вне Git; операторские команды в runbook.

- [ ] Создать только новый acceptance стенд и private config; закрепить binary SHA,
  task/rubric hashes, модели, timeouts и бюджет/условия до N=1 dispatch.
- [ ] Перед первым нетемпоральным удалением показать конкретные пути/файлы владельцу
  и получить разрешение; это отдельный gate, не подразумевается утверждением плана.
- [ ] Ровно четыре обязательных A/B сценария: взаимная невидимость файлов,
  close A сохраняет B, delete A после close/readback, unknown ownership без delete.
  Остальные live tests только явным флагом; native и proc-negative unit не совмещать.
- [ ] Сохранить live результат без skip и коммит `test(evals): qualify required slot isolation cases`.
- [ ] Реальный N=1 с агентом/судьёй на трёх задачах; по замеру предложить числовые
  пороги CPU/RAM/диска и **дождаться утверждения владельца до N=2**.
- [ ] Записать утверждённый бюджет до реального N=2, выполнить run на тех же tasks/
  models/pins. Проверить перекрытие двух слотов, judge settings, полную summary,
  только свою очистку, отсутствие обязательных ресурсных/лицензионных/provider отказов.

## 7. Один проход удаления неиспользуемого после успешного N=2

- [ ] Составить точный список orphaned mechanisms/tests, показать владельцу
  и дождаться разрешения на удаления; старые incident/evidence не включать молча.
- [ ] Убрать неиспользуемые recovery epochs/user-lock/process inventories/telemetry/
  receipt chains/server-storage archive code и их тесты, сохранив обязательные guards.
- [ ] `bun run test:unit`, `bun typecheck` из `evals/`, `git diff --check`;
  коммит `refactor(evals): remove unused parallel research mechanisms`.
- [ ] Проверить итог по каждому правилу контракта; обновить короткий checkpoint.

## Checkpoint

1. 2026-10-16: решения владельца заменяют прежние цель/дизайн/план.
2. Нормативные документы сокращены; полные прежние тексты сохранены в одном архиве.
3. Удержанные 12 research pairs/старые incidents не удалялись и не освобождались.
4. Два code-diff server-storage archive и чужой untracked review сохранены без изменений.
5. Новый runtime путь не реализован; N=1/N=2 и реальный судья не запускались.
6. Независимое ревью: Approved; исправлен порядок admin/startup.
7. Следующий gate: ответ владельца на план/перечень и судьбу двух code-diff.
