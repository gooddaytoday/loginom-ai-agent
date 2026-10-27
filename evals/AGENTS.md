# Eval harness

## Автономные кампании

Текущие команды, standing/wakeup инструкции EvalOps и обязательный отдельный
финальный ответ EvalRunner — в [runbook](docs/autonomous-campaigns.md).
Обычные batches ведёт существующая служба; для новых кампаний periodic fallback
7200 с. Итог публикуется до архива; periodic отключается после read-back итога,
а `published`/`in_review` требуют проверенного архива и ответа исполнителя.
Исторические планы и незавершённый LAB-170 сохраняются; изменение кода не
подтверждает его установку или применение живых инструкций Multica.

## Пользовательские слоты

Правила — [контракт](docs/parallel-users-contract.md); команды —
[runbook](../docs/testing/loginom-ai-agent/parallel-evals.md), результат и текущие
проверки — [план](../docs/superpowers/plans/2026-10-16-evals-parallel.md).
N1/N2 на реальных моделях прошли техническую приёмку; качество задач отражается
честно и не является сравнением N1/N2. Старые ресурсы — по отдельному решению
владельца из [списка](../docs/testing/loginom-ai-agent/2026-10-16-evals-parallel-retained.md).
История — в [архиве](../docs/archive/2026-10-16-evals-parallel-history.md).
Proc-denial tests запускаются только с `EVAL_PROCESS_DENIAL_TESTS=1` в отдельном
окне без других агентов; остальные live-тесты — только по явному флагу.

- Весь код harness живёт здесь; вне него меняются только затронутые документы и явно разрешённый владельцем judge launcher в отдельном репозитории. Runtime-зависимостей нет; dev-зависимости ставятся `bun install` в этом каталоге.
- Разработка строго по TDD (`/tdd`): один падающий тест поведения → минимальная реализация → зелёный → коммит. Тесты через публичные интерфейсы модулей из спеки; без моков и `globalThis.*`. Внешние процессы подменяются только `EVAL_CLI_MODE=fake`, `EVAL_ARTIFACT_SOURCE=dir:`, `EVAL_JUDGE_COMMAND`.
- Команды выполняются из `evals/`: `bun test`, `bun typecheck`, `bun run src/run.ts`. Из корня репозитория тесты не запускать.
- Supervisor unit fixtures копируют Node.js из `PATH` для проверки изменения argv браузера. При отсутствии Node Bun 1.3.14 подставляет свой shim, который не меняет `/proc/.../cmdline` как Node и даёт ложные падения; обеспечить настоящий Node в тестовом `PATH`, не меняя среду и pins живого CLI/судьи.
- Контракт данных (статусы, `judge_status`, `failure_kind`, поля `summary.json`) описан в `docs/superpowers/specs/2026-09-18-evals-design.md`; при расхождении сначала правится спека.
- Секреты не попадают в `results/`, логи и сообщения ошибок. `results/`, `.profile/`, `.bundle/`, `.env` — gitignored.
- Живой судья (`codex exec`) в тестах не вызывается; проверяется через `fixtures/fake-codex.ts`.
- Отклонения от спеки, зафиксированные при реализации: `verdict.prev.json` лежит в `<attempt>/verdict.prev.json` (рядом с `judge/`, потому что `prepareJudgeDir` очищает `judge/`); логи судьи — `<attempt>/judge-events-<n>.jsonl` и `<attempt>/judge-stderr-<n>.txt`; в `summary.json` есть `loginom.container` и `loginom.storage_dir`, у попыток — `stderr_head`.
- Калибровка исключает requires_run. Positive с oracle.csv и near-miss с синтетическим CSV включают requires_result_file и oracle; чужой эталон и positive без oracle исключают result-пункты. Near-miss требует всех expected_failed и точного expected_oracle_pass; score/отказ oracle не заменяют обнаружение ошибки судьёй. Корпус и независимый пересчёт — calibration/ и script/check-calibration-corpus.py. Для подготовки требуются zip/unzip/xmllint; XML изменённых файлов проверяется после всех замен до пересборки архива и вызовов судьи. Невалидный XML или отсутствие xmllint дают exit 2. Python нужен только независимому пересчёту.
- Для новых прогонов с 2026-10-12 использовать судью `gpt-6-sol/xhigh` (`JUDGE_MODEL=gpt-6-sol`, `JUDGE_REASONING=xhigh`). Исторические результаты и pins начатых серий сохраняют прежнего судью. Для 30 новых analytic-кейсов обычная калибровка 2026-10-20 прошла: positive 100/oracle=true, foreign negative 0–25, пороги 90/40; [pins и результат](docs/2026-10-20-analytic-evals-import.md). Эта серия не содержит near-miss; полная near-miss приёмка прежних 35 на новой модели этим не подтверждается. Всего analytic-кейсов 65, near-miss покрывает 35 задач / 114 мутаций.
- Полная near-miss приёмка 2026-10-06: 183/183, gpt-6-astra/high, exit 0; SHA и хэши в [отчёте](../docs/testing/loginom-ai-agent/reports/2026-10-06-calibration-near-miss.md). При смене промпта весь корпус пересуживается; рубрики и ожидания не ослабляются ради прохождения.
- Дочерние процессы агента и судьи не наследуют `LOGINOM_*` / `EVAL_*` / `JUDGE_*` / `FAKE_CODEX_*`; агенту заново выставляются четыре базовых `LOGINOM_AI_AGENT_*`; v2 дополнительно задаёт `LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false` и только настроенный `auth.sharedDir` через `LOGINOM_AI_AGENT_SHARED_AUTH_DIR`, судье через `judge.env` передаются только несекретные настройки; секреты остаются вне окружения агента/судьи и results.
- В полном режиме preflight вызывает `checkStorage` (листинг `dir:` или docker-хранилища); ошибка — `EvalFailure` код 2.
- Если листинг остатков не удался, `storage_leftovers` в `summary.json` равен `null` (не пустой массив).
- Уточнения после review PR #61: процентные пороги конфигурации — целые `1..100`; `--version` судьи использует тот же фильтр окружения и явные overrides, что исполнение судьи; каталоги run/calibrate атомарно резервируются с уникальным суффиксом к прежнему префиксу; одинаковые basename в `inputs` запрещены до dispatch, плоские workspace-имена сохранены. Решения и проверки: [контрольная точка](docs/2026-10-12-pr61-review-fixes.md).

## Контракт изоляции live eval

- Узкое исключение для `script/run-node-selection-attempt.ts`: согласованная
  локальная приёмка node-selection использует уже настроенный местный Loginom
  и существующий CLI-профиль без очистки истории/storage. Она не вызывает общий
  `run.ts` и не публикуется как isolated benchmark. Дочернему CLI явно задаются
  PURE, отключение project config/Claude prompt/external skills/Claude skills,
  абсолютный профиль и закреплённый публичный MODELS_PATH; секреты не копируются
  в pins/evidence. Требования общего runner выше не изменяются.

- При настроенном v2 `auth.sharedDir` readiness проверяет публичный `providers status --provider <id> --format json` установленного CLI (`shared-oauth-status-v1`), а не local auth.json. Ответ допускается только при совпадающем provider, UUID generation, principal hash, boolean refresh requirement и успешном exit; ошибки не раскрывают raw provider output. Capability и немодельный status не заменяют реальное исполнение модели; отдельная forced-refresh проба не входит в новую обязательную приёмку.

- Решение и последовательность: [план](docs/2026-10-07-analytic-evals-isolation-plan.md). Отклонение от внешней спеки фиксируется здесь, чтобы изменения оставались внутри `evals/`: default `EVAL_CLI_MODE=source` сохраняется для совместимости конфигурации, но live-вызовы `main()` допускают только установленный binary CLI в обязательной Linux bubblewrap-границе. Это касается и node-evals/LAB-16; fake/dry-run, judge-only и калибровка не запускают оцениваемого агента и сохраняют свой путь.
- Агенту доступны только prompt, inputs текущей попытки, подготовленный writable-профиль и ресурсы продукта. Harness/судья, корпус, Git, исходный agent-validation, результаты и закрытый архив истории остаются вне mounts. Ошибка установки или исполнения границы — `harness_error`, остановка без судьи/retry/fallback.
- OAuth и `cli-profile.json` сохраняются на запись. После подтверждённого завершения своих процессов история **каждой** попытки (включая retry), БД с WAL/SHM и inputs переносятся в закрытый архив вне mounts. Это изменяет прежнюю политику долговечности в `profile.test.ts`: история долговечна в архиве, а не в рабочем профиле. Неопределённый cleanup или ошибка переноса запрещают следующую попытку в этом слоте.
- Live требует выделенный чистый Loginom и эксклюзивное окно endpoint без внешних отладчиков. Широкая очистка разрешена только после повторной проверки маркера подготовки, container ID, фиксированных корней и отсутствия host bind mounts. Прежняя адресная очистка остальных источников сохраняется; default container и `.env` не разрешают широкое удаление.
- Старый неизолированный и новый изолированный прогоны не являются контролируемым сравнением, даже если `compare` допускает его по модели/хэшам/судье. Архивная БД сохраняет доказательство модели LAB-16; параллельные live-приёмки на том же endpoint несовместимы с эксклюзивным окном.
