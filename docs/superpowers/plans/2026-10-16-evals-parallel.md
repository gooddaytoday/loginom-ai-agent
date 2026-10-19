# Параллельные evals: выполнение утверждённой цели

Нормативен [контракт](../../../evals/docs/parallel-users-contract.md).
План и поправки владельца утверждены; повторное согласование не требуется.
Команды — [runbook](../../testing/loginom-ai-agent/parallel-evals.md),
история решений и проверок — [единый архив](../../archive/2026-10-16-evals-parallel-history.md).

## Выполнение

- [x] 1. Переписать дизайн/контракт, собрать один архив и перечень удержанных
  ресурсов; получить независимое ревью плана и утверждение владельца.
- [x] 2. Один server lock, отдельные profile/home locks; подготовка пользователей
  и run без user lock. Секреты остаются в закрытом controller/runtime.
- [x] 3. Supervisor cleanup, полная чужая ancestry без сигналов; exact session
  close/readback, Pool/backup, прямой FD/maps guard, автоматическая очистка своего.
- [x] 4. VPN-судья с выделенным прежним home и ограниченным systemd unit;
  проверенные входные значения, login status, ожидание завершения без root signals.
- [x] 5. Production prepare → агенты → судья → cleanup → summary;
  единый startup после отказа, карантин внутри run, здоровый слот продолжает очередь.
- [x] 6. Четыре native A/B, полный N=1, утверждение бюджета и реальный N=2.
  N1 DE1Srz: exit 0, три score100/cleanup confirmed, resources/limits PASS.
  N2 J5IglH: exit 0, три cleanup confirmed, оба слота closed, leftovers[],
  resources/limits PASS, 583 samples/0miss, перекрытие 227,208 с.
  Честные оценки N2: calc0(no_artifact), filter100, group100; качество вне этой цели.
- [x] 7a. Удалить неиспользуемые slot epochs/recover, user locks, inventories,
  receipt/accounting chains, server-storage archive и fixture-only runtime/tests.
  Прямые supervisor/FD/maps, общий ресурсный timeline и VPN unit сохраняются.
  Generic CAS recovery остаётся для реально используемого pair provisioning.
- [x] 7b. Завершить targeted и полный unit-набор, typecheck, native A/B,
  независимое финальное ревью и `git diff --check`; сохранить отдельный коммит.
  - [x] Связанные проверки: 114 тестов, 614 утверждений, отказов нет.
  - [x] Typecheck и четыре native A/B после удаления кода.
  - [x] Независимое финальное ревью: обязательных замечаний нет.
  - [x] Полный unit: 910 pass, 18 skip, 0 fail; 4564 утверждения, 76 файлов.
    Proc-denial tests отключены при работающих других агентах.
  - [x] Финальный diff check и коммит удаления `9ef761ced7`.
- [x] 7c. Свести повторённые правила к контракту; оставить операторские команды
  и короткие ссылки в дизайне, AGENTS, блокерах и плане.

Удаление старых стендов и инцидентов — отдельное решение владельца по
[единому списку](../../testing/loginom-ai-agent/2026-10-16-evals-parallel-retained.md).
Они сохранены; A00yuH не удалять. Это не препятствует завершению утверждённой
технической приёмки. Ограничения удаления — контракт п.20/24/26.

## Проверенные pins и evidence

Agent `openai/gpt-6-luna/high`, judge `gpt-6-sol/xhigh`, repeat=1;
три задачи `filter-active-rows,calc-data-double,group-sum-qty`.
CLI source `c8a85da7281a93ff7f3d91ec5fb5e57cc65c6a90`,
binary SHA256 `364dd428b29df745d5f8392f6f90c4b725de4879a958eb4824daee5a33e67552`.
N1/N2 CLI/model/input/rubric/judge pins сравнены и совпадают.
Бюджет N2 утверждён до dispatch: 25 границ, SHA256
`7b43211ba891232286e05e61c1844534cc7306ce03aa29aaa26077ce651380d7`.
Private state `/home/kiselev/.local/state/loginom-evals/acceptance-20261016/`:
`evidence/n2-accepted-20261019.json`, `n2-budget-approved-20261019.json`,
`results/20261019-090750-761dcc77b7-dirty-J5IglH/summary.json`.
Финальные проверки: `evidence/step7-verification-20261019/result.json`.
Исходные неуспешные результаты не переписывались.

## Checkpoint

1. Ветка evals-parallel; приёмочный harness 761dcc77b7, финальное удаление кода 9ef761ced7.
2. N1 DE1Srz и N2 J5IglH приняты; все обязательные гарантии подтверждены.
3. N2: 583 samples/0miss, перекрытие 227208 мс, три cleanup confirmed, четыре брони released.
4. N2 score 0/100/100; no_artifact — честная ошибка качества, её исправление вне цели.
5. Финальные четыре native A/B прошли: live-ab-fac76e9c-394f-4718-b9ad-8aa8bd7d3cd5.
6. Supervisor, server/profile/home fencing, Pool/backup, FD/maps и VPN unit сохраняются.
7. План выполнен: 114 targeted, 910 unit/18skip/0fail, typecheck, diff check и ревью Passed/Approved.
8. Старые 12 пар/инциденты и A00yuH сохранены; чужой незакоммиченный обзор не трогать.
9. Вопрос владельцу только при действительной необходимости по контракту п.33.
10. После ревью исправлены offline units, native archive reader и partial release:
    `28799f2679`, `23962b6a1c`, `d32e182da2`; тесты и детали —
    [план исправлений](2026-10-19-evals-parallel-review-fixes.md). Это source-проверки без нового live N2.
