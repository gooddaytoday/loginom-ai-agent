# Локальная приёмка выбора узлов Loginom — промежуточный отчёт

Статус: приёмка не завершена. Из 18 baseline начаты две попытки; 16 не запускались.
Все 25 candidate ещё не запускались. Продолжение заблокировано неподтверждённым
cleanup профиля `analytic-evals`; решение об адресном offline-восстановлении ожидается.

## Изменение и проверки

Product skill изменён только в `SKILL.md` и `references/workflow.md`, коммит
`fdb90ca1e`: стандартные узлы и их композиции по умолчанию; JS только в явно
запрошенной части или для подтверждённого функционального пробела. Ошибка узла
не разрешает fallback на JS. Существующие JS-узлы не удаляются автоматически.

Root checks из `evals/`: 95 целевых тестов, 219 assertions, 0 failures;
`bun typecheck` и `git diff --check` — exit 0. Проверены audit, runner, graph,
fixtures и oracle. Независимый review закрыл две ошибки привязки evidence:
экспортёр CSV к сохранённому XML (`80d55e0c7`) и публичный запрос к runtime
document/workflow/node (`0d44e677a`); повторные пять регрессий прошли.

Bundled skills: 9/9 до и после; полный staging 13/13 без SKIP, host typecheck PASS.
Baseline и candidate собраны и проверены. Node/Bun/Chromium dependencies совпали;
различия Product-исходников между payload commits — ровно два skill-файла.
Время сборки исходники были заморожены. `acceptance-lock.json` закрепляет 72 файла.

Audit version: `1f1e63ba844350aa21b9722ced44579050d12eaade0b78217085d5ae797eb34d`.
Baseline skill digest: `74cc9ac0b5a22724909bd1ba3123e8f6e3abedbe85a3b87dee6596119bbfb340`.
Candidate skill digest: `ff18dc5f2b4da3d7b6c66d0419d48aae7590b2a07e0d2e50f7a01cd9f3f34261`.

## Условия и выполненные попытки

Текущий местный Loginom: `http://localhost/app/`, user, `/user`, существующий
`loginom-server-7.4.2-test`. Нового стенда нет. CLI использует frozen payload,
`openai/gpt-6-sol-fast`, `medium`; alias запрашивает API model `gpt-6-sol` и
priority tier. Фактически обслуженный tier по имени alias не предполагается.
Модельный каталог, inputs/prompts/oracle, manifest и seed закреплены в отдельных
baseline/candidate pins. Одна попытка — один процесс, без модельных retries.

Private run: `evals/results/node-selection-local/20261013T093809Z-f5d429/`.
Сырые журналы, профиль и секреты в Git не включены.

- `sales-by-category/1`, Session `ses_ecb36b60fffelEBfHHVtrg0Wbw`: CLI exit 0,
  335.392 секунды. JS nodes/calls 0/0; oracle, policy, calculation, history,
  settlement, identity, export identity и graph PASS. Артефакты сохранены.
  Исходный wrapper exit 2 относится к минимальному Task 1A; финальный offline
  audit exit 0. Исторический `attempt.json` не переписан. Evidence:
  `baseline/sales-by-category/1/selection-audit.json`.
- `abc-pareto-groups/1`, Session `ses_ecb0f6648ffeNtALKokieQR6xW`: CLI exit 1,
  wrapper exit 3, 429.086 секунды. History/provenance подтверждены; один JS apply,
  ни одного подтверждённого успешного JS. Policy failed для старого baseline;
  это измерение исходного поведения, не основание исправлять candidate skill.
  JS nodes неизвестны: пакет не сохранён. Oracle не проверен, calculation не
  подтверждён, runtime settlement false. Evidence:
  `baseline/abc-pareto-groups/1/forensic/summary.json` и `readonly-audit.json`.

Таким образом, среди двух начатых baseline один полный расчётный успех и один
oracle-pass. Это промежуточные числа, не результат всей матрицы 18/25.
Первый отказ OAuth до inference сохранён отдельно в `incidents/`; после успешной
авторизации по коду этот запланированный слот впервые дошёл до модели.

## Блокер и продолжение

`pareto-cumulative-1` осталась `AMBIGUOUS` на `output_mapping` с
`cleanup_complete:false`. Собственный package cleanup завершился
`BLOCKED/CLEANUP_OR_OPERATION_UNCONFIRMED`; runtime close отверг cleanup.
Source editors закрыты, но это не закрывает внешнюю node operation. Поздний
context read также неопределён. Resume/cancel/recover уже отказали;
`recovery_options:[]`, `internal_resume_available:false`.

CLI и runtime процессы завершены. `.writer` сохранён намеренно; отсутствие
процессов не доказывает закрытие Loginom-пакета. Штатный `loginom recover` сначала
требует свободный writer, не снимает guard и не возобновляет node operation.
Recovery UUID-записей нет. Guard, история, storage и сервер не очищались.

Продолжение требует проверенного завершения собственной Loginom-сессии и
согласованного адресного offline-восстановления профиля. Провал ABC остаётся
в знаменателе; повторять слот 1 нельзя. Следующий слот — `monthly-demand/1`, затем
остальные запланированные baseline. Candidate начинается после baseline:
сначала девять случаев, затем повторы только после чистой первой волны.

Не проверены live explicit-js/tags/recovery, candidate no-JS 18/18, сравнение
oracle-pass всей серии и обязательное содержательное review. Не проверены
Desktop/natural activation и cold reuse tags. Итоговая приёмка не заявляется.
