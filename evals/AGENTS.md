# Eval harness

## Контракт пользовательских слотов — 2026-10-13

Для нового режима нормативен [контракт v2](docs/parallel-users-contract.md), фактический статус —
[runbook](../docs/testing/loginom-ai-agent/parallel-evals.md). Реализация начата; live v2 ещё не квалифицирован. Без
EVAL_SLOTS_FILE остаётся legacy exclusive; прежние инструкции широкой очистки,
миграции стенда и R/operations/stand.lease ниже относятся только к legacy.
V2 создаёт новую пару на lg-pc-75 со своей сетью/портом; dev/legacy/remote
стенды, исторические results и pins начатых серий сохраняются. Marker по
/workdir/.loginom-evals-isolated.json имеет kind loginom-evals-users/version 2;
совместимый v1 не создаётся, старые broad-cleanup executors на новой паре запрещены.

Standalone prepare/verify выпускают доказанно чистые durable reservations и OS
guards; readiness не резервирует среду. Crash освобождает guard, но retained
reservation запрещает новый run. Recover требует incident/lineage/recovery-only
CAS и новых proofs; отсутствие PID не разрешает takeover. Постоянный root
/var/lib/loginom-evals/locks создаётся разовым bootstrap, prepare только проверяет
его; stateDir и env/config не переносят global fence. Архив history/БД/WAL/SHM/inputs
предшествует server close/readback; удаление только своего user root/backups
требует closure proof. Unknown outcome сохраняет данные/fence; restart сервера
для слота и широкая очистка запрещены. Admission failure до попыток — exit 2
и preparation receipt без measured summary; карантин после dispatch — summary/exit 1.

Node-evals выбирает архив по доверенному slot_id без fallback.
interrupted_cleanup — null без interrupted попыток, иначе OR profile_recovered
только interrupted попыток. Приёмка: немодельные session/ACL/backup/process
gates, затем полный LLM N=2 → N=1 и node-evals с неизменными pins/условиями.
Новые eval-прогоны используют openai/gpt-6-luna/high и судью gpt-6-sol/xhigh;
исторические модели/defaults ниже описывают прежние серии. Admin secrets/state
остаются вне mounts/env/results; shared model OAuth и private judge CODEX_HOME
проверяются отдельно. Skip и исторический PASS не доказывают готовность v2.

- Весь код harness живёт здесь; остальной репозиторий не менять. Runtime-зависимостей нет; dev-зависимости ставятся `bun install` в этом каталоге.
- Разработка строго по TDD (`/tdd`): один падающий тест поведения → минимальная реализация → зелёный → коммит. Тесты через публичные интерфейсы модулей из спеки; без моков и `globalThis.*`. Внешние процессы подменяются только `EVAL_CLI_MODE=fake`, `EVAL_ARTIFACT_SOURCE=dir:`, `EVAL_JUDGE_COMMAND`.
- Команды выполняются из `evals/`: `bun test`, `bun typecheck`, `bun run src/run.ts`. Из корня репозитория тесты не запускать.
- Контракт данных (статусы, `judge_status`, `failure_kind`, поля `summary.json`) описан в `docs/superpowers/specs/2026-09-18-evals-design.md`; при расхождении сначала правится спека.
- Секреты не попадают в `results/`, логи и сообщения ошибок. `results/`, `.profile/`, `.bundle/`, `.env` — gitignored.
- Живой судья (`codex exec`) в тестах не вызывается; проверяется через `fixtures/fake-codex.ts`.
- Отклонения от спеки, зафиксированные при реализации: `verdict.prev.json` лежит в `<attempt>/verdict.prev.json` (рядом с `judge/`, потому что `prepareJudgeDir` очищает `judge/`); логи судьи — `<attempt>/judge-events-<n>.jsonl` и `<attempt>/judge-stderr-<n>.txt`; в `summary.json` есть `loginom.container` и `loginom.storage_dir`, у попыток — `stderr_head`.
- Калибровка исключает requires_run. Positive с oracle.csv и near-miss с синтетическим CSV включают requires_result_file и oracle; чужой эталон и positive без oracle исключают result-пункты. Near-miss требует всех expected_failed и точного expected_oracle_pass; score/отказ oracle не заменяют обнаружение ошибки судьёй. Корпус и независимый пересчёт — calibration/ и script/check-calibration-corpus.py. Для подготовки требуются zip/unzip/xmllint; XML изменённых файлов проверяется после всех замен до пересборки архива и вызовов судьи. Невалидный XML или отсутствие xmllint дают exit 2. Python нужен только независимому пересчёту.
- Для новых прогонов с 2026-10-12 использовать судью `gpt-6-sol/xhigh` (`JUDGE_MODEL=gpt-6-sol`, `JUDGE_REASONING=xhigh`). Исторические результаты и pins начатых серий сохраняют прежнего судью. Калибровка новой модели пока не выполнена; прежняя приёмка не подтверждает её качество.
- Полная near-miss приёмка 2026-10-06: 183/183, gpt-6-astra/high, exit 0; SHA и хэши в [отчёте](../docs/testing/loginom-ai-agent/reports/2026-10-06-calibration-near-miss.md). При смене промпта весь корпус пересуживается; рубрики и ожидания не ослабляются ради прохождения.
- Дочерние процессы агента и судьи не наследуют `LOGINOM_*` / `EVAL_*` / `JUDGE_*` / `FAKE_CODEX_*`; агенту заново выставляются только четыре `LOGINOM_AI_AGENT_*`, судье можно явно передать ключи через `judge.env`.
- В полном режиме preflight вызывает `checkStorage` (листинг `dir:` или docker-хранилища); ошибка — `EvalFailure` код 2.
- Если листинг остатков не удался, `storage_leftovers` в `summary.json` равен `null` (не пустой массив).
- Уточнения после review PR #61: процентные пороги конфигурации — целые `1..100`; `--version` судьи использует тот же фильтр окружения и явные overrides, что исполнение судьи; каталоги run/calibrate атомарно резервируются с уникальным суффиксом к прежнему префиксу; одинаковые basename в `inputs` запрещены до dispatch, плоские workspace-имена сохранены. Решения и проверки: [контрольная точка](docs/2026-10-12-pr61-review-fixes.md).

## Контракт изоляции live eval

- Решение и последовательность: [план](docs/2026-10-07-analytic-evals-isolation-plan.md). Отклонение от внешней спеки фиксируется здесь, чтобы изменения оставались внутри `evals/`: default `EVAL_CLI_MODE=source` сохраняется для совместимости конфигурации, но live-вызовы `main()` допускают только установленный binary CLI в обязательной Linux bubblewrap-границе. Это касается и node-evals/LAB-16; fake/dry-run, judge-only и калибровка не запускают оцениваемого агента и сохраняют свой путь.
- Агенту доступны только prompt, inputs текущей попытки, подготовленный writable-профиль и ресурсы продукта. Harness/судья, корпус, Git, исходный agent-validation, результаты и закрытый архив истории остаются вне mounts. Ошибка установки или исполнения границы — `harness_error`, остановка без судьи/retry/fallback.
- OAuth и `cli-profile.json` сохраняются на запись. После подтверждённого завершения процессов/recovery история **каждой** попытки (включая retry), БД с WAL/SHM и inputs переносятся в закрытый архив вне mounts. Это изменяет прежнюю политику долговечности в `profile.test.ts`: история долговечна в архиве, а не в рабочем профиле. Pending recovery или ошибка переноса запрещают следующую попытку.
- Live требует выделенный чистый Loginom и эксклюзивное окно endpoint без внешних отладчиков. Широкая очистка разрешена только после повторной проверки маркера подготовки, container ID, фиксированных корней и отсутствия host bind mounts. Прежняя адресная очистка остальных источников сохраняется; default container и `.env` не разрешают широкое удаление.
- Старый неизолированный и новый изолированный прогоны не являются контролируемым сравнением, даже если `compare` допускает его по модели/хэшам/судье. Архивная БД сохраняет доказательство модели LAB-16; параллельные live-приёмки на том же endpoint несовместимы с эксклюзивным окном.
