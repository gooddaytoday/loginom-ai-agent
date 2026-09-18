# Eval harness

- Весь код harness живёт здесь; остальной репозиторий не менять. Runtime-зависимостей нет; dev-зависимости ставятся `bun install` в этом каталоге.
- Разработка строго по TDD (`/tdd`): один падающий тест поведения → минимальная реализация → зелёный → коммит. Тесты через публичные интерфейсы модулей из спеки; без моков и `globalThis.*`. Внешние процессы подменяются только `EVAL_CLI_MODE=fake`, `EVAL_ARTIFACT_SOURCE=dir:`, `EVAL_JUDGE_COMMAND`.
- Команды выполняются из `evals/`: `bun test`, `bun typecheck`, `bun run src/run.ts`. Из корня репозитория тесты не запускать.
- Контракт данных (статусы, `judge_status`, `failure_kind`, поля `summary.json`) описан в `docs/superpowers/specs/2026-09-18-evals-design.md`; при расхождении сначала правится спека.
- Секреты не попадают в `results/`, логи и сообщения ошибок. `results/`, `.profile/`, `.bundle/`, `.env` — gitignored.
- Живой судья (`codex exec`) в тестах не вызывается; проверяется через `fixtures/fake-codex.ts`.
- Отклонения от спеки, зафиксированные при реализации: `verdict.prev.json` лежит в `<attempt>/verdict.prev.json` (рядом с `judge/`, потому что `prepareJudgeDir` очищает `judge/`); логи судьи — `<attempt>/judge-events-<n>.jsonl` и `<attempt>/judge-stderr-<n>.txt`; в `summary.json` есть `loginom.container` и `loginom.storage_dir`, у попыток — `stderr_head`.
