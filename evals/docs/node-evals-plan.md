# LAB-16: реализация согласованного контракта

Цель: три небольших CSV-only кейса настройки Кросс-таблицы и независимый кодовый verdict поверх существующего harness.
Дизайн утверждён карточкой LAB-16 и NODE-EVAL-OVERRIDES.md; повторное подтверждение не требуется. Все изменения ограничены evals/.

## Интерфейсы и ограничения

`script/run-node-evals.ts` вызывает `main(argv, env)` из `src/run.ts` с `--skip-judge`, явным `--tasks` и repeat=1. `src/node-evals.ts` читает локальный summary и attempt evidence, возвращает PASS/0, FAIL/1 или ERROR/2 и сохраняет отдельные `code-verdict.json`/`code-report.md`. Generic summary, parseEvents, формат task и core harness не изменяются.

XML проверяется структурно: тип, единственный целевой узел, режим, роли, агрегат, data-links от текстового импорта к экспорту. Полные raw events подтверждают байты исходного CSV, execution/read/save и происхождение результата. Для reconfigure проверяется sum→read→avg apply→execute→read→save с сохранением document/workflow/node и новым execution_id. Pending apply сопоставляется с завершением по operation_id; повторные доставки дедуплицируются по tool-part ID.

Ошибка инфраструктуры, неполнота или неподтверждённый cleanup имеет приоритет ERROR; неверное обязательное доказательство — FAIL. CSV сравнивает штатный `checkOracle` с tolerance=0; строки упорядочены, колонки сравниваются по именам. Каждый required ID явно реализован; неизвестный ID даёт ERROR.

## Порядок работы

- [x] Отдельный checkout, task env, preflight обоих Rich profiles и Playwright navigation.
- [x] Три черновика вне коллекции; oracle на Decimal/stdlib до reference попыток; builder smoke подтверждён по БД.
- [ ] Для каждого reference: CLI build, model/input/graph/result gate, холодное повторное выполнение через Playwright MCP, finalize.
- [ ] TDD по публичному интерфейсу валидатора: один RED→минимальный GREEN, затем новые негативы по одному; реальные временные XML/CSV/events, без globalThis и внутренних моков.
- [ ] TDD runner через штатные EVAL_CLI_MODE=fake и EVAL_ARTIFACT_SOURCE=dir; обязательный skip-judge и отдельный verdict.
- [ ] `bun test` и `bun typecheck` из evals/; collection validation; по одному live-прогону каждого case (штатный infra retry сохранён).
- [ ] README и sanitized evidence bundle с SHA256; conventional commit; ordinary push HEAD:evals с remote readback; заморозка SHA.
- [ ] READY_FOR_BEN в той же карточке, затем завершение turn. Frozen SHA остаётся неизменным до независимого VERDICT_BEN.
