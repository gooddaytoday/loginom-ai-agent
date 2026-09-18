# Eval-прогоны Loginom AI Agent: дизайн MVP

Пользователь подтвердил 18 сентября 2026: нужна система eval-прогонов, которая между изменениями кода агента отвечает на вопрос «агент стал строить сценарии Loginom лучше или хуже». Приоритет — минимально работающая метрика как можно скорее. Весь код живёт в `evals/`; остальной репозиторий не меняется, кроме одной ссылки в module map корневого `AGENTS.md`.

Решения, принятые в ходе brainstorming 18.09.2026:

- Судья офлайновый: harness забирает `.lgp` из хранилища Loginom и отдаёт его LLM-судье вместе с ТЗ и эталоном. Живой субагент, открывающий сценарий в браузере, и исполнение пакета — фаза 2.
- Runner собственный, на Bun, без внешних eval-фреймворков. promptfoo/Langfuse при необходимости навешиваются позже на те же JSON-результаты.
- Бэкенд судьи — `codex exec` по подписке ChatGPT (проверено 18.09.2026: `codex-cli 0.153.4`, `--output-schema`, 7 секунд на smoke). OpenAI-compatible вариант в MVP не делается.
- Агент получает краткую бизнес-формулировку задачи; полное ТЗ с таблицей узлов видит только судья.

## Факты о среде, на которые опирается дизайн

Standalone CLI (`packages/agent/src/standalone.ts`, дизайн `2026-09-17-loginom-cli-standalone-design.md`):

- `run --headless --format json --model <provider/model> --file <путь> --dir <workspace> -- "<prompt>"` пишет в stdout JSONL: события `step_start`, `text`, `reasoning`, `tool_use`, `step_finish`, `error`, каждое с `type`, `timestamp`, `sessionID` и `part`. Ошибки preflight до создания сессии — одна строка `{"type":"error","error":{"name":...}}` без `sessionID`. Прогресс и диагностика — в stderr.
- Коды выхода: 0 — сессия дошла до idle без неустранённых ошибок; 1 — runtime/provider/tool/permission (в том числе `CLI_PERMISSION_REJECTED`, `CLI_TOOL_FAILED`); 2 — аргументы или отсутствующая настройка; 3 — `PROFILE_BUSY` и конфликты состояния (только stderr); 4 — неопределённая операция Loginom (`LOGINOM_RECOVERY_REQUIRED`, `LOGINOM_CALL_UNCERTAIN`); 130 — отмена. Дизайн CLI прямо фиксирует: код 0 не доказывает правильность сценария. Пока в профиле есть неподтверждённые `recoveries`, preflight `run` возвращает 4 для любой следующей команды; их снимает `loginom recover --acknowledge --format json`.
- Профиль задаётся абсолютным `LOGINOM_AI_AGENT_CLI_PROFILE`; dev-запуск требует `LOGINOM_AI_AGENT_CLI_BUNDLE` с `bin/node` и собранным `host/node-host.mjs` (`packages/agent/src/cli/standalone-bundle.ts`). Bootstrap стирает наследуемые `LOGINOM_AI_AGENT_AUTH_CONTENT`, `LOGINOM_AI_AGENT_CONFIG*`; модель и права задаются файлом `$PROFILE/config/loginom-ai-agent.json`; auth провайдеров лежит в `$PROFILE/data/auth.json`. Один `.writer` на профиль; крах его не снимает; `loginom recover` его не трогает.
- Проектные инструкции и конфиг ищутся вверх от `--dir` до корня git-репозитория (`src/session/instruction.ts`, `src/config/paths.ts`). `LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG=1` отключает этот поиск (так делает `packages/desktop/test/loginom/desktop-oracle.mjs`); `LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT=1` отключает чтение `~/.claude/CLAUDE.md`.
- `loginom setup --stdin-json --format json` принимает `{url, username, apiKey, password}` через stdin; `apiKey` — ключ Dock, обязателен при первичной настройке. `loginom status --format json` возвращает `Loginom.View` с `state` и `recoveries`.
- Входные файлы попадают в Loginom через attachment admission агента: `--file` → snapshot → `dock_artifact_deliver` → импорт. Harness ничего не копирует в контейнер.
- Квитанция `loginom_dock_action_run` с `action_key: package.save_as | package.save_checkpoint` содержит `package_ref.path` вида `/<username>/<имя>.lgp`. Локально `.lgp` не появляется; контракта «Сценарий: URL» у агента нет.
- Права: у агента по умолчанию `"*": "allow"`, но `doom_loop` и `external_directory` — `ask`; неинтерактивный `run` сам запрещает `question`/`plan_*`, а любой запрос `ask` авто-отклоняет с `CLI_PERMISSION_REJECTED` и кодом 1. Для eval это честный `failed` (агент зациклился или полез вне workspace); `README.md` перечисляет это среди известных причин `CLI_PERMISSION_REJECTED`.

Стенд и артефакт:

- Loginom развёрнут локально в docker (`loginom-server-master`, `http://localhost/app/`, пользователь `user`, пустой пароль). Хранилище пользователя внутри контейнера — `/workdir/UserStorage/user/`; там лежат сохранённые `.lgp`, временные `.~lgp` и файлы экспорта. Файлы читаются `docker cp` независимо от блокировок Web Client.
- `.lgp` — ZIP: `PackageInfo.xml`, `PackageIndex.xml`, `Variables.xml`, `Unit_N/Unit.xml` с `<Nodes><Item DisplayName=... ><Engine xsi:type="TBGImportTextFile" ...>` и `<Links>` (пары `SourcePort`/`TargetPort` по GUID узлов). Простой пакет — 7–20 KB, `Unit.xml` около 220 строк. Распаковывается системным `unzip`.

Задачи: `~/git/agent-validation/sources/simple/*` — шесть задач с README (таблица «узел — компонент — настройка», связи, ожидаемый результат) и эталонным `.lgp`: `group-sum-qty`, `filter-active-rows`, `calc-data-double` (с `data/*.csv`), `var-sum-3-plus-5`, `date-diff-one-day`, `list-one-to-five` (без входных данных). Первые три покрываются структурными типами `dock_node_apply` (`imports.text`, `transform.group_data`, `transform.filter_data`, `transform.calculator`, `exports.text`); остальные требуют переменных или Silver Kit и ожидаемо будут низкими.

Судья: `codex exec --ephemeral --ignore-user-config --skip-git-repo-check -s read-only -C <dir> -m <model> -c project_doc_max_bytes=0 --json --output-schema <schema> -o <file> -` читает промпт из stdin, пишет финальный ответ строго по JSON-схеме, работает по подписке через `~/.codex/auth.json`. `--ignore-user-config` отключает `~/.codex/config.toml` (MCP-серверы, хуки), но не чтение `AGENTS.md` от корня git-репозитория к cwd — его отключает `project_doc_max_bytes=0` (config reference Codex). Благодаря этому рабочие папки судьи безопасно лежат внутри `evals/results/`.

## Отвергнутые варианты

- Живой судья второй CLI-сессией с `loginom_*` инструментами: минуты на задачу, стохастичность, расход токенов агента, зависимость судьи от того же CLI, который измеряется. Фаза 2.
- Гибрид с исполнением пакета (BatchLauncher `:4580` или `cold-readback.mjs`): точнее, но заметно больше работы. Фаза 2.
- promptfoo как runner: даёт Compare UI и sqlite-историю, но требует Node ≥ 22.22 (установлен 22.16), под Bun не верифицирован, assertions только `.js`, таймаут assertion при 15-минутных прогонах не проверен.
- deepeval: Python, in-process трейсинг агента, UI в Confident AI — не подходит для внешнего CLI и артефакта.
- Langfuse: хранилище и UI, а не runner; self-host тяжёлый. В `packages/core` уже есть OTLP-экспорт, поэтому подключение — естественная фаза 2.
- Судья через Loginom AI CLI: `run` требует настроенный Loginom-профиль и поднимает host, нет схемы ответа, судья и измеряемый объект ломаются вместе.
- Судья через OpenAI-compatible `fetch`: рабочий вариант, но подписка бесплатнее и `--output-schema` даёт строгий JSON. Не делается в MVP.
- Рабочая папка агента внутри репозитория: агент подхватил бы корневой `AGENTS.md` и `.loginom-ai-agent/`, и результаты зависели бы от правок правил репозитория. Workspace выносится в `/tmp`, поиск проектного конфига отключается флагом.

## Статусы, оценка и метрики

Статус задачи определяется в одном месте (`cli.ts` → `run.ts`) по единой таблице:

| Исход процесса агента | Статус | Прогон |
|---|---|---|
| лимит задачи истёк, harness послал SIGINT (затем SIGKILL) — любой код выхода после этого, включая 130 | `timeout` | продолжается |
| код 0, `.lgp` с `Unit.xml` получен | `completed` | продолжается |
| код 0, `.lgp` не получен или без `Unit.xml` | `no_artifact` | продолжается |
| код 1, 4 или 130 | `failed` | продолжается; после кода 4 — восстановление профиля (раздел «Конвейер») |
| код 2 или 3 | `harness_error` | останавливается: это конфигурация или профиль, не качество агента |
| исключение harness (docker, распаковка, запись) | `harness_error` | продолжается |

Признак `timed_out` имеет приоритет над кодом выхода: код читается и записывается в `result.json`, но статус — `timeout`.

`judge_status` задачи: `scored` — судья вернул валидный вердикт; `no_artifact` — судья не вызывался, `.lgp` нет; `skipped` — `--skip-judge` (для всех задач прогона, независимо от наличия артефакта) или статус `harness_error`; `error` — ненулевой выход, таймаут или невалидный вердикт судьи.

`score`: число 0–100 при `scored`; `0` при `no_artifact` (агент не довёл дело до сохранённого пакета — это его результат); `null` при `skipped` и `error`. Судья вызывается для любого статуса, кроме `harness_error`, если `.lgp` с `Unit.xml` получен, включая `timeout` и `failed`: score отражает качество артефакта, статус — надёжность процесса. `pass = score ≥ pass_threshold`, только при числовом score.

Метрики прогона:

- `completion_rate = completed / total`.
- `mean_score` — среднее по задачам с числовым score (`scored` и `no_artifact`); рядом выводятся `scored_count` и `excluded_count` (задачи с `null`). При `--skip-judge` метрики судьи (`mean_score`, `mean_score_completed`, `pass_rate`) равны `null`; `completion_rate`, `total_cost`, `total_duration_ms` считаются как обычно.
- `mean_score_completed` — среднее по задачам со статусом `completed` и числовым score.
- `pass_rate = pass / total`.
- `total_cost`, `total_duration_ms` — суммы по задачам.

Сравнимость прогонов требует равенства `agent_inputs_hash`, `rubric_hash`, `judge.model`, `judge.reasoning`, `judge.prompt_sha256` и `config.pass_threshold`. `compare.ts` печатает предупреждение «прогоны несравнимы» первой строкой, если хоть одно поле различается. Два прогона с `--skip-judge` (`judge.* = null` у обоих) сравнимы только по `completion_rate`; `null = null` несравнимостью не считается, метрики судьи в таблице дельт пропускаются.

## Формат задачи

`evals/tasks/<id>/`:

- `task.json` — `id`, `title`, `prompt` (краткая формулировка для агента), `inputs` (относительные пути данных, передаются через `--file`; может быть пустым — тогда `--file` не передаётся), `reference` (`reference.lgp`), `spec` (`SPEC.md`), `checklist` (массив `{id, text, weight?}`; вес по умолчанию 1), `expected_output` (текстовое описание oracle, например «2 строки: A=15, B=25»), `timeout_ms` (необязательно).
- `SPEC.md` — полное ТЗ; перенос README из `agent-validation`.
- `reference.lgp`, `data/*` — копии из `agent-validation`, чтобы eval был воспроизводим по SHA этого репозитория.

Чеклист — 5–8 бинарных пунктов о структуре и семантике, без GUID'ов и без условных формулировок: каждый пункт либо подтверждается артефактом, либо нет. Проверка результата экспорта формулируется безусловно: «экспорт выполнен, файл результата присутствует и содержит 2 строки: A=15, B=25» — отсутствие файла означает непройденный пункт, потому что выгрузка входит в задачу. Пример для `group-sum-qty`: импорт текстового файла `sales.csv` с заголовком в первой строке; группировка с ключом `Item` и суммой по `Qty`; экспорт в текстовый файл; цепочка Import → Group → Export без висячих узлов; нет лишних узлов без обоснования; файл результата содержит 2 строки, A=15, B=25; финальный ответ агента не заявляет невыполненного.

Хеши набора (sha256 по задачам в порядке `id`, файлы `data/*` — в порядке относительного пути):

- `agent_inputs_hash` — то, что видит агент: `id`, `prompt`, имена `inputs`, байты `data/*`.
- `rubric_hash` — то, что видит судья: `SPEC.md`, `checklist`, `expected_output`, `reference.lgp`.

Разделение позволяет менять рубрику и пересуживать готовые артефакты (`--judge-only`), не теряя связь с входами агента.

## Структура `evals/` и модули

```
evals/
  README.md                  предпосылки, команды, очистка хранилища, ориентир шума
  AGENTS.md                  правила модуля для агентов
  package.json               private; scripts run/compare/test/typecheck; devDependencies typescript, @types/bun
  tsconfig.json              strict, types bun
  .env.example               переменные окружения (ниже)
  .gitignore                 .env, .profile/, .bundle/, results/, node_modules/
  src/
    config.ts                .env + аргументы → EvalConfig
    task.ts                  загрузка и валидация задач, хеши набора
    profile.ts               eval-профиль CLI: создание, setup, auth, восстановление, .writer
    cli.ts                   запуск агента и разбор JSONL
    artifact.ts              получение и распаковка .lgp
    judge.ts                 подготовка папки судьи, codex exec, scoring
    report.ts                агрегация, summary.json, report.md
    run.ts                   entry: прогон
    compare.ts               entry: сравнение двух прогонов
    judge-prompt.md          шаблон инструкции судьи
    verdict.schema.json      JSON-схема ответа судьи
  script/prepare-bundle.ts   сборка dev-bundle
  tasks/<id>/                задачи
  fixtures/
    events/*.jsonl           события CLI для тестов parseEvents (синтетические до первого живого прогона)
    fake/<task-id>.jsonl     сценарии fake CLI (+ <task-id>.exit с кодом выхода), default.jsonl
    storage/*.lgp            «хранилище» для EVAL_ARTIFACT_SOURCE=dir
    fake-cli.ts              fake CLI
  test/                      bun test
  results/<run-id>/          gitignored
```

Runtime-зависимостей нет: Bun built-ins и внешние команды `docker`, `codex`, `unzip`, `git`, `pgrep`. Dev-зависимости (`typescript`, `@types/bun`) ставятся `bun install` внутри `evals/` — отдельный `evals/bun.lock`; каталог не входит в workspaces корня, root `package.json` не меняется. Команды выполняются из `evals/`: `bun run src/run.ts ...`, `bun test`, `bun typecheck`; Bun сам подхватывает `evals/.env`.

Переменные `.env`:

- Loginom: `LOGINOM_URL` (`http://localhost/app/`), `LOGINOM_USERNAME` (`user`), `LOGINOM_PASSWORD` (пусто), `LOGINOM_DOCK_API_KEY` (обязателен), `LOGINOM_CONTAINER` (`loginom-server-master`), `LOGINOM_STORAGE_DIR` (`/workdir/UserStorage/user`).
- Агент: `EVAL_AGENT_MODEL` (`provider/model`, обязателен), `EVAL_CLI_MODE` (`source` | `binary` | `fake`, по умолчанию `source`), `EVAL_CLI_BIN` (для `binary`), `EVAL_CLI_BUNDLE` (по умолчанию `evals/.bundle`), `EVAL_WORKSPACE_ROOT` (`/tmp/loginom-evals`), необязательный OpenAI-compatible провайдер: `EVAL_AGENT_PROVIDER_ID`, `EVAL_AGENT_PROVIDER_BASE_URL`, `EVAL_AGENT_PROVIDER_API_KEY`, `EVAL_AGENT_PROVIDER_MODEL_ID`.
- Артефакт: `EVAL_ARTIFACT_SOURCE` (`docker` | `dir:<path>`, по умолчанию `docker`).
- Судья: `JUDGE_MODEL` (обязателен, без дефолта), `JUDGE_REASONING` (`medium`).
- Лимиты: `EVAL_TASK_TIMEOUT_MS` (900000), `EVAL_JUDGE_TIMEOUT_MS` (300000), `EVAL_PASS_THRESHOLD` (70).

Флаги `run.ts`:

- `--only a,b` — подмножество задач; `--tasks <dir>` — другой каталог задач; `--label <text>`.
- `--timeout-ms <n>` — лимит задачи; приоритет: флаг → `task.json.timeout_ms` → `EVAL_TASK_TIMEOUT_MS` → 900000. Пауза SIGINT → 30 с → SIGKILL в лимит не входит.
- `--skip-judge` — не вызывать судью (`judge_status: skipped`).
- `--judge-only <run-id>` — пересудить готовые артефакты прогона без запуска агента.
- `--reset-profile` — удалить `evals/.profile/agent` (после проверки, что процессов на нём нет) и создать заново.
- `--dry-run` — пресет самопроверки: `EVAL_CLI_MODE=fake`, `EVAL_ARTIFACT_SOURCE=dir:fixtures/storage`, `--skip-judge`; обязательные переменные `.env` (`LOGINOM_DOCK_API_KEY`, `EVAL_AGENT_MODEL`, `JUDGE_MODEL`) не требуются, `.env` может отсутствовать; preflight проверяет только загрузку задач и наличие фикстур; профильные шаги пропускаются; при запуске вне git-репозитория `run-id` получает суффикс `nogit` вместо SHA.

Интерфейсы модулей (типы выводятся, сигнатуры показывают границы):

- `config.ts`: `loadConfig(argv) → EvalConfig`. Ошибки конфигурации — понятное сообщение и выход 2. Секреты хранятся только в памяти процесса.
- `task.ts`: `loadTasks(dir, only?) → Task[]`, `agentInputsHash(tasks) → string`, `rubricHash(tasks) → string`. Валидирует обязательные поля, уникальность `checklist[].id`, существование файлов.
- `profile.ts`: `ensureProfile(config) → { dir, cliEnv }` — создаёт профиль первой management-командой, выполняет `setup --stdin-json`, пишет `config/loginom-ai-agent.json` (`permission: {"loginom_*": "allow"}` и блок провайдера из `.env`, если задан); `assertAuth(profile, model)` — провайдер модели должен присутствовать в `$PROFILE/data/auth.json` либо быть описан блоком провайдера в конфиге, иначе печатается точная команда `providers login` и выход 2; `releaseStaleWriter(profile)` — снимает `.writer`, только если `pgrep -f <dir профиля>` пуст; `recoverIfNeeded(profile) → { recovered: boolean, view }` — `loginom status --format json`; при непустых `recoveries` выполняет `loginom recover --acknowledge --format json` и повторяет `status`. Успех — `recoveries` пусты и `state = ready` (с `recovered = true`, если acknowledge выполнялся); транзитное `starting` ожидается повторными `status` до 10 с; любое другое состояние после повтора (`recoverable-error`, `pending`, недоступный Loginom) — отказ восстановления с текстом `state`/`failure` в причине остановки прогона.
- `cli.ts`: `runAgent({ command, env, model, prompt, files, workdir, timeoutMs, outDir }) → AgentRun`, где `AgentRun = { exitCode, timedOut, durationMs, sessionId?, saveReceipts: string[], finalText?, cost, tokens, errors: string[] }`. Чистая `parseEvents(lines) → …` используется тестами. `command` для `source` — `bun run src/standalone.ts` с cwd `packages/agent`; для `binary` — `EVAL_CLI_BIN`; для `fake` — `bun fixtures/fake-cli.ts` с `EVAL_TASK_ID` в окружении.
- `artifact.ts`: `fetchArtifact({ source, candidates, since, outDir }) → Artifact | undefined`, где `Artifact = { origin: "receipt" | "instructed" | "scan", packagePath, localLgp, unpackedDir, resultFiles: string[], ambiguous: string[] }`. `source` — `docker` (`docker exec ls`, `docker cp`) или `dir:<path>` (`/<username>/<имя>` → `<path>/<имя>`). Игнорирует `.~lgp`; при `scan` берёт новейший `.lgp` с mtime позже `since`, остальные кандидаты перечисляет в `ambiguous`. После `unzip -o -q` проверяет наличие `Unit_*/Unit.xml`.
- `judge.ts`: `judgeTask({ task, run, artifact, outDir, judge }) → Verdict | JudgeError` и чистая `scoreVerdict(checklist, verdict) → { score, pass, items } | ScoreError`.
- `report.ts`: чистая `aggregate(results, config) → Metrics`; `writeSummary(runDir, summary)`; `renderReport(summary) → string`.
- `run.ts`: preflight → цикл по задачам → summary. Код выхода 0 при завершённом прогоне независимо от метрик, 2 при отказе preflight или конфигурации, 1 при остановке прогона из-за `harness_error` с остановкой или аварии harness.
- `compare.ts`: чистая `compare(a, b) → string` и entry `compare.ts <run-a> <run-b>`.

## Конвейер прогона

Preflight (до первой задачи, отказ = выход 2 с причиной): `.env` полный; `fetch(LOGINOM_URL)` отвечает 200; `docker inspect LOGINOM_CONTAINER` показывает запущенный контейнер; `unzip`, `git`, `pgrep` доступны; `codex --version` работает и `~/.codex/auth.json` существует (если не `--skip-judge`); для `source` — bundle содержит `bin/node` и `host/node-host.mjs`, для `binary` — исполняемый файл существует; `EVAL_WORKSPACE_ROOT` создаваем; git SHA и dirty-флаг прочитаны. При `--dry-run` — только загрузка задач и наличие фикстур.

`run-id = <YYYYMMDD-HHmmss>-<git short sha>[-dirty]`; вне git-репозитория вместо SHA — `nogit`. `results/<run-id>/` создаётся заранее и содержит `config.json` с параметрами прогона без секретов (для ключей — только имена переменных).

Профиль: `releaseStaleWriter` → `ensureProfile` → `assertAuth` → `recoverIfNeeded`; отказ любого шага здесь, до первой задачи, — выход 2, как у preflight. Транзитное `state = starting` сразу после `setup` не считается отказом: `recoverIfNeeded` повторяет `status` до 10 с, пока состояние не станет терминальным. Снятие stale `.writer` идёт первым: `setup`/`status` — management-команды, которые сами берут guard и после краха прошлого прогона получили бы `PROFILE_BUSY`. Один постоянный профиль `evals/.profile/agent`; прогоны последовательные, поэтому второй профиль не нужен. В режиме `fake` (`--dry-run`) все профильные шаги — этот блок, шаг 7 конвейера и `pgrep` — пропускаются.

Для каждой задачи последовательно, результаты в `results/<run-id>/<task-id>/`, workspace в `EVAL_WORKSPACE_ROOT/<run-id>/<task-id>/` (вне git-репозитория — как папка обычного пользователя):

1. Копии `inputs` в workspace. Имя пакета `eval-<run-id>-<task-id>.lgp`, путь `/<username>/eval-<run-id>-<task-id>.lgp` (плоское имя, как в oracle `runtime-acceptance.ts`). Промпт = `task.prompt` + фиксированный хвост: «Сохрани готовый пакет через package.save_as по пути `<путь>`. Если задача требует экспорт в файл, используй имя `eval-<run-id>-<task-id>.result.csv`.»
2. Запуск CLI с аргументами `run --headless --format json --model <m> [--file <abs> ...] --dir <workspace> -- "<prompt>"`. Окружение: `LOGINOM_AI_AGENT_CLI_PROFILE`, `LOGINOM_AI_AGENT_CLI_BUNDLE` (для `source`), `LOGINOM_AI_AGENT_PURE=1`, `LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG=1`, `LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT=1`; прочие `LOGINOM_AI_AGENT_*` не наследуются. Права остаются по умолчанию агента (`"*": "allow"` плюс явный `loginom_*: allow`): generic-инструменты работают во временном workspace и не влияют на Loginom. stdout → `events.jsonl`, stderr → `stderr.txt`, старт/финиш/код/таймаут → `run.json`.
3. Разбор `events.jsonl` (выполняется и после таймаута, по накопленным строкам): `sessionID` первого события с ним; квитанции `tool_use` с `part.tool === "loginom_dock_action_run"` и `part.state.input.action_key ∈ {package.save_as, package.save_checkpoint}` → `package_ref.path` из `part.state.output` (JSON-строка); последний `text` → финальный текст; суммы `cost` и `tokens` из `step_finish`; имена `error`.
4. Артефакт (выполняется для всех статусов, кроме `harness_error` с остановкой): кандидаты — пути из квитанций, затем предписанный путь, затем `scan`. `docker cp` в `artifact/package.lgp`, распаковка в `artifact/unpacked/`; заодно `eval-<run-id>-<task-id>*.result.*` в `artifact/results/`. Сохранённый `.lgp` считается целым: Loginom пишет во временный `.~lgp` и переименовывает.
5. Судья, если артефакт с `Unit.xml` получен и не `--skip-judge`.
6. `result.json`: статус, код, `timed_out`, `session_id`, `package_path`, `artifact_origin`, `artifact_ambiguous`, score, pass, `judge_status`, пункты чеклиста, длительность, стоимость, `profile_recovered`.
7. После задачи: если был таймаут — дождаться исчезновения процессов, ссылающихся на профиль (до 60 с), затем `releaseStaleWriter`; если процессы не исчезли — остановить прогон с выходом 1, профиль в неопределённом состоянии. Затем `recoverIfNeeded`; результат записывается в `profile_recovered` следующей задачи; отказ восстановления останавливает прогон с выходом 1.

После цикла — `summary.json` и `report.md`. `--judge-only <run-id>` пропускает шаги 1–4 и 7, берёт готовые `artifact/` и `result.json`, пересчитывает score, перезаписывает summary/report того же прогона, сохраняя `summary.prev.json` и `judge/verdict.prev.json`. `rubric_hash` и `judge.*` пересчитываются по текущим задачам и конфигу; `agent_inputs_hash` и данные агента берутся из прежнего summary. Если текущий `agent_inputs_hash` каталога задач отличается от записанного, печатается предупреждение — артефакты созданы под прежними входами.

Прогоны строго последовательные: один процесс агента, судья после каждой задачи. Параллелизм и совмещение судьи со следующей задачей — фаза 2.

## Судья

Папка `judge/` внутри результата задачи:

- `PROMPT.md` — из `judge-prompt.md`; `TASK.md` — промпт агента; `SPEC.md`; `checklist.json`; `expected-output.md`.
- `reference/` — распакованный эталон; `artifact/` — распакованный `.lgp` агента и файлы результата; `agent-final-message.md`; `tools-summary.md` — таблица вызванных `loginom_*` инструментов с `action_key`/типом узла и статусом.
- `verdict.schema.json`.

Команда: `codex exec --ephemeral --ignore-user-config --skip-git-repo-check -s read-only -C <abs judge/> -m $JUDGE_MODEL -c model_reasoning_effort=$JUDGE_REASONING -c project_doc_max_bytes=0 --json --output-schema <abs verdict.schema.json> -o <abs verdict.json> -` с `PROMPT.md` на stdin; пути абсолютные. События → `judge/events.jsonl`, stderr → `judge/stderr.txt`; таймаут `EVAL_JUDGE_TIMEOUT_MS`, по истечении SIGKILL и `judge_status: error`.

Схема ответа:

```json
{
  "checklist": [{ "id": "string", "passed": true, "evidence": "string" }],
  "summary": "string",
  "confidence": "high | medium | low"
}
```

`scoreVerdict`: множество `id` в ответе должно совпадать с чеклистом задачи — пропуск, дубликат или лишний `id` дают `ScoreError` и `judge_status: error`; `score = round(100 · Σ weight·passed / Σ weight)`; `pass = score ≥ pass_threshold`. Судья не выдаёт число — только бинарные решения с evidence, что ограничивает шум и позволяет пересуживать через `--judge-only` при изменении рубрики.

Правила в `judge-prompt.md`: эталон — одно правильное решение, а не единственное; иная композиция узлов с тем же смыслом засчитывается; семантику данных (колонки, агрегаты, условия, источники) проверять строго; сначала XML артефакта, финальное сообщение агента — заявление, требующее подтверждения; неинтерпретируемый артефакт → пункты непройдены с указанием причины; отсутствующий файл результата → соответствующий пункт непройден; ничего не выполнять и не изменять; evidence — ссылка на файл и атрибут.

В `summary.json` фиксируются `judge.backend = "codex"`, `codex_version`, `model`, `reasoning`, `prompt_sha256` (sha256 файла `judge-prompt.md`).

## Отчёты и сравнение

`summary.json`: `run_id`, `label`, `started_at`, `finished_at`; `agent { cli_mode, git_sha, dirty, model }`; `judge { backend, codex_version, model, reasoning, prompt_sha256 }`; `agent_inputs_hash`, `rubric_hash`, `task_ids`; `config { timeout_ms, judge_timeout_ms, pass_threshold }`; `metrics` (раздел «Статусы, оценка и метрики»); `tasks[]` — `{ id, status, exit_code, timed_out, score, pass, judge_status, judge_confidence, duration_ms, cost, package_path, artifact_origin, artifact_ambiguous, session_id, profile_recovered }`.

`report.md`: метрики шапкой (с `scored_count`/`excluded_count`); таблица задач (статус, код, score, pass, длительность, стоимость, строка резюме судьи); раздел отказов с именами ошибок из событий (в том числе `CLI_PERMISSION_REJECTED` отдельно от ошибок сценария) и первыми строками stderr.

`compare.ts <run-a> <run-b>`: проверка сравнимости; дельты метрик; таблица «score a → b», «status a → b» с ▲/▼. Результат в stdout и `results/compare-<a>-vs-<b>.md`.

## Обработка ошибок

- Отказы preflight и конфигурации останавливают прогон до первой задачи (выход 2).
- Коды 2 и 3 у задачи означают проблему harness/профиля: `harness_error`, прогон останавливается (выход 1) — иначе все следующие задачи получат тот же код не по вине агента.
- Исключения внутри задачи (`docker cp`, распаковка, запись) → `harness_error` у задачи, прогон продолжается; текст ошибки в `result.json`.
- Таймаут агента и код 4 обрабатываются шагом 7 конвейера; невозможность освободить профиль или восстановить его останавливает прогон (выход 1).
- Отказ судьи не влияет на статус задачи; `score = null`, `judge_status: error`, перезапуск через `--judge-only`.
- Секреты (`LOGINOM_DOCK_API_KEY`, ключи провайдера) не попадают в `results/`, логи и `config.json` прогона.

## Dev-bundle

`script/prepare-bundle.ts [--copy]` создаёт `evals/.bundle/`: симлинки `bin/`, `browsers/`, `runtime/` на `packages/desktop/resources/loginom/` и сборку host командой `bun script/build-node-host.ts <abs .bundle>/host` из `packages/loginom-host` (как в `packages/agent/test/cli/tui/standalone-pty.py`). Если host отвергает симлинки, `--copy` копирует каталоги. Пересборка host нужна после изменений в `packages/loginom-host`; скрипт печатает это напоминание.

## Процесс разработки: TDD

Пользователь зафиксировал 18.09.2026: весь код `evals/` разрабатывается по skill'у `/tdd` (`~/.cursor/skills/tdd/SKILL.md`). Правила применительно к harness:

- Вертикальные срезы: одно поведение → один падающий тест → минимальная реализация → зелёный → следующее поведение. Писать все тесты модуля заранее, а затем всю реализацию (горизонтальный срез) запрещено.
- Первый тест каждого модуля — tracer bullet: сквозной happy path через публичный интерфейс. Далее поведения берутся по приоритету из раздела «Тестирование harness»; он же — согласованный список того, что тестируем.
- Тесты проверяют поведение через публичные интерфейсы из раздела «Интерфейсы модулей», не внутренние функции; тест должен пережить рефакторинг внутренностей.
- Никаких моков внутренних коллабораторов и `globalThis.*`. Внешние процессы подменяются только средствами, предусмотренными дизайном: `EVAL_CLI_MODE=fake` с `fixtures/fake-cli.ts`, `EVAL_ARTIFACT_SOURCE=dir:`. `codex exec` в тестах не вызывается: проверяются содержимое папки судьи, аргументы команды и `scoreVerdict`; живой судья — приёмка.
- Рефакторинг только на зелёном; после каждого шага рефакторинга — `bun test`.
- Если реализация требует иного интерфейса или поведения, чем записано здесь, сначала правится спека, затем тест; молчаливые отклонения недопустимы.
- Коммит на каждом зелёном цикле или группе связанных циклов: `test(evals): …`, `feat(evals): …`.

## Тестирование harness

`cd evals && bun test` (из корня репозитория тесты не запускаются по правилу `do-not-run-tests-from-root`). Список ниже — приоритетный перечень поведений для TDD-циклов:

- `parseEvents` на фикстурах `events/*.jsonl`: `sessionID`, пути квитанций save, финальный текст, cost, ошибки; отдельная фикстура preflight-ошибки без `sessionID`. До первого живого прогона фикстуры синтезируются по контракту из раздела «Факты о среде»; после пункта 2 приёмки заменяются очищенными фрагментами реальных `events.jsonl`.
- `artifact` с `dir:` источником: распаковка фикстурного `.lgp` (копия простого эталона) → найден `Unit.xml`; ZIP без `Unit.xml` → `undefined`; `.~lgp` игнорируется; `scan` выбирает новейший и заполняет `ambiguous`.
- `scoreVerdict`: веса, порог, пропуск/дубликат/лишний `id` → `ScoreError`.
- `aggregate`: `no_artifact` = 0, `null` исключаются с подсчётом, `mean_score_completed`, `--skip-judge` → `mean_score = null`.
- `compare`: дельты и предупреждение о несравнимости по каждому полю.
- Статусы: таблица кодов выхода → статус и решение об остановке прогона.
- `--dry-run`: `fake-cli.ts` печатает `fixtures/fake/<EVAL_TASK_ID>.jsonl` (иначе `default.jsonl`) и завершается кодом из `<EVAL_TASK_ID>.exit` (иначе 0); квитанции в фикстурах ссылаются на `/user/fixture-<task-id>.lgp`, которые `dir:fixtures/storage` находит без привязки к `run-id`. Полный цикл проходит за секунды без Loginom, модели и квоты Codex — это CI самого harness. Фикстуры покрывают минимум: успех с артефактом, код 1 без артефакта, код 0 без артефакта.

Тесты используют реальные модули без моков; внешние команды подменяются только через конфигурацию (`fake`, `dir:`).

## Приёмка MVP

1. `--dry-run` проходит; `bun test` и `bun typecheck` зелёные.
2. Полный прогон шести задач реальным агентом: `summary.json`, `report.md`, шесть `result.json`, для задач с артефактом — `judge/verdict.json`.
3. Повторный прогон без изменений кода агента; `compare` двух прогонов. Разброс `mean_score` и `completion_rate` между ними — ориентир шума, записывается в `README.md`: дельты ниже него не считаются изменением качества.
4. `--judge-only` на первом прогоне при неизменной рубрике даёт те же score; `verdict.prev.json` позволяет сравнить evidence.

## Очистка хранилища

Пакеты `eval-<run-id>-*.lgp` и файлы результата накапливаются в хранилище Loginom. В MVP очистка ручная, команда в `README.md`: `docker exec loginom-server-master sh -c 'rm -f /workdir/UserStorage/user/eval-<run-id>-*'`. Флаг `--cleanup` — фаза 2.

## Допущения, проверяемые на первом шаге реализации

- `package.save_as` принимает плоский путь `/<username>/<имя>.lgp`; вложенные каталоги не используются.
- Dev-bundle из симлинков принимается host'ом; иначе `prepare-bundle.ts --copy`.
- ChatGPT-OAuth в standalone CLI (`providers login`) работает для выбранного `EVAL_AGENT_MODEL`; запасной путь — OpenAI-compatible провайдер из `.env`.
- Формат событий `run --format json` не изменится в текущей Codex-сессии по CLI; при изменении обновляются `cli.ts` и фикстуры.

## Вне объёма MVP (фаза 2)

Живой судья второй CLI-сессией; исполнение пакета через BatchLauncher или `cold-readback.mjs` и проверка выходных таблиц по oracle; параллельные прогоны на нескольких профилях; совмещение судьи со следующей задачей; `--judge-repeats N` с медианой; компактная JSON-сводка графа вместо сырого XML; калибровка судьи на ручных оценках; `--cleanup`; экспорт в Langfuse через существующий OTLP; расширение набора задач за счёт `sources/tasks` и чистых Silver Kit-утилит.

## Прогресс

Заполняется по ходу реализации: даты, выполненные шаги, результаты приёмки, измеренный уровень шума.
