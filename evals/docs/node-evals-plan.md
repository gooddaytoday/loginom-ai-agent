# LAB-16: реализация согласованного контракта

Цель: три небольших CSV-only кейса настройки Кросс-таблицы и независимый кодовый verdict поверх существующего harness.
Дизайн утверждён карточкой LAB-16 и NODE-EVAL-OVERRIDES.md; повторное подтверждение не требуется. Все изменения ограничены evals/.

## Исправления доказательств после review, 2026-10-07

Пользователь поручил исправить оба найденных ложных PASS. Используем успешные native request/receipt из полного events.jsonl; новые поля task/summary и LLM-судья не нужны.
Создание должно относиться к конечному document/workflow/node и предшествовать его настройкам/чтению. Одного readback готового узла с пустыми parameters недостаточно.
Для reconfigure нужен явный успешный вызов изменения Amount на avg после полного sum/read. Все успешные avg-конфигурации этого узла должны начинаться после sum/read; последующий output mapping допускается, но не заменяет переход агрегата.

- [x] Добавить в `test/node-evidence.test.ts` отрицательный случай: убрать из native fixture создание/настройку CrossTable, сохранить mapping/read/export/save; `validateNodeAttempt` должен дать FAIL. RED: пустой failures вместо creation.
- [x] В `src/node-events.ts` связать успешное создание с тем же владельцем и последующими apply/read; GREEN: evidence/sequence 6 pass, 0 fail.
- [x] Добавить в `test/node-sequence.test.ts` случай раннего avg, замаскированного поздним mapping, и подтвердить RED. Проверяется публичный `checkNodeSequence`.
- [x] Связать переход с фактическим avg request и проверить все успешные avg starts; сохранить положительный sum/read → avg/read → mapping/read. Отдельный RED→GREEN проверяет отсутствующий фактический переход при avg readback. GREEN: evidence/sequence 8 pass, 0 fail.
- [ ] Запустить весь `bun test` и `bun typecheck` из `evals/`, повторно проверить сохранённые reference evidence без новых модельных попыток, обновить документацию и checkpoint (не больше 20 строк).

## Интерфейсы и ограничения

`script/run-node-evals.ts` вызывает `main(argv, env)` из `src/run.ts` с `--skip-judge`, явным `--tasks` и repeat=1. `src/node-evals.ts` читает локальный summary и attempt evidence, возвращает PASS/0, FAIL/1 или ERROR/2 и сохраняет отдельные `code-verdict.json`/`code-report.md`. Generic summary, parseEvents, формат task и core harness не изменяются.

XML проверяется структурно: тип, единственный целевой узел, режим, роли, агрегат, data-links от текстового импорта к экспорту. Полные raw events подтверждают байты исходного CSV, execution/read/save и происхождение результата. Для reconfigure проверяется sum→read→avg apply→execute→read→save с сохранением document/workflow/node и новым execution_id. Pending apply сопоставляется с завершением по operation_id; повторные доставки дедуплицируются по tool-part ID.

Ошибка инфраструктуры, неполнота или неподтверждённый cleanup имеет приоритет ERROR; неверное обязательное доказательство — FAIL. CSV сравнивает штатный `checkOracle` с tolerance=0; строки упорядочены, колонки сравниваются по именам. Каждый required ID явно реализован; неизвестный ID даёт ERROR.

## Порядок работы

- [x] Отдельный checkout, task env, preflight обоих Rich profiles и Playwright navigation.
- [x] Три черновика вне коллекции; oracle на Decimal/stdlib до reference попыток; builder smoke подтверждён по БД.
- [x] Для каждого reference: CLI build, model/input/graph/result gate, холодное повторное выполнение через Playwright MCP, finalize; полный code validator PASS 3/3.
- [x] TDD по публичному интерфейсу валидатора: один RED→минимальный GREEN, затем новые негативы по одному; реальные временные XML/CSV/events, без globalThis и внутренних моков.
- [x] TDD runner через штатные EVAL_CLI_MODE=fake и EVAL_ARTIFACT_SOURCE=dir; обязательный skip-judge и отдельный verdict.
- [x] `bun test` 344/0 и `bun typecheck` exit0 из evals/; sensitivity 21/0, collection validation exit0; по одному live каждого case. fixed-sum ERROR cleanup сохранён; sliding-average PASS и reconfigure FAIL/no_artifact измерены после завершения unit, оба cleanup confirmed. Quality retries не выполнялись.
- [x] README, checkpoint и delivery layout с manifest SHA256 подготовлены; финальный clean SHA публикуется ordinary push HEAD:evals и remote readback, затем READY_FOR_BEN с attachment в той же карточке.
- [ ] Независимый VERDICT_BEN на frozen SHA: собственный расчёт, reference/negative/unit/typecheck и три fresh live в отдельном профиле, unit/live последовательно. До вердикта frozen SHA неизменяем.
- [ ] Rich wrap-up после ACCEPT; in_review, done только человек.
