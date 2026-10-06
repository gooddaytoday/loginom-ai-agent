# Eval harness

- Весь код harness живёт здесь; остальной репозиторий не менять. Runtime-зависимостей нет; dev-зависимости ставятся `bun install` в этом каталоге.
- Разработка строго по TDD (`/tdd`): один падающий тест поведения → минимальная реализация → зелёный → коммит. Тесты через публичные интерфейсы модулей из спеки; без моков и `globalThis.*`. Внешние процессы подменяются только `EVAL_CLI_MODE=fake`, `EVAL_ARTIFACT_SOURCE=dir:`, `EVAL_JUDGE_COMMAND`.
- Команды выполняются из `evals/`: `bun test`, `bun typecheck`, `bun run src/run.ts`. Из корня репозитория тесты не запускать.
- Контракт данных (статусы, `judge_status`, `failure_kind`, поля `summary.json`) описан в `docs/superpowers/specs/2026-09-18-evals-design.md`; при расхождении сначала правится спека.
- Секреты не попадают в `results/`, логи и сообщения ошибок. `results/`, `.profile/`, `.bundle/`, `.env` — gitignored.
- Живой судья (`codex exec`) в тестах не вызывается; проверяется через `fixtures/fake-codex.ts`.
- Отклонения от спеки, зафиксированные при реализации: `verdict.prev.json` лежит в `<attempt>/verdict.prev.json` (рядом с `judge/`, потому что `prepareJudgeDir` очищает `judge/`); логи судьи — `<attempt>/judge-events-<n>.jsonl` и `<attempt>/judge-stderr-<n>.txt`; в `summary.json` есть `loginom.container` и `loginom.storage_dir`, у попыток — `stderr_head`.
- Калибровка исключает requires_run. Positive с oracle.csv и near-miss с синтетическим CSV включают requires_result_file и oracle; чужой эталон и positive без oracle исключают result-пункты. Near-miss требует всех expected_failed и точного expected_oracle_pass; score/отказ oracle не заменяют обнаружение ошибки судьёй. Корпус и независимый пересчёт — calibration/ и script/check-calibration-corpus.py. Для подготовки требуются zip/unzip/xmllint; XML изменённых файлов проверяется после всех замен до пересборки архива и вызовов судьи. Невалидный XML или отсутствие xmllint дают exit 2. Python нужен только независимому пересчёту.
- Полная near-miss приёмка 2026-10-06: 183/183, gpt-6-astra/high, exit 0; SHA и хэши в [отчёте](../docs/testing/loginom-ai-agent/reports/2026-10-06-calibration-near-miss.md). При смене промпта весь корпус пересуживается; рубрики и ожидания не ослабляются ради прохождения.
- Дочерние процессы агента и судьи не наследуют `LOGINOM_*` / `EVAL_*` / `JUDGE_*` / `FAKE_CODEX_*`; агенту заново выставляются только четыре `LOGINOM_AI_AGENT_*`, судье можно явно передать ключи через `judge.env`.
- В полном режиме preflight вызывает `checkStorage` (листинг `dir:` или docker-хранилища); ошибка — `EvalFailure` код 2.
- Если листинг остатков не удался, `storage_leftovers` в `summary.json` равен `null` (не пустой массив).
