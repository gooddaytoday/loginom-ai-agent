# Eval-прогоны Loginom AI Agent: дизайн MVP

Пользователь подтвердил 18 сентября 2026: нужна система eval-прогонов, которая между изменениями кода агента отвечает на вопрос «агент стал строить сценарии Loginom лучше или хуже». Приоритет — минимально работающая метрика как можно скорее. Весь код живёт в `evals/`; остальной репозиторий не меняется, кроме одной ссылки в module map корневого `AGENTS.md`. Реализация ведётся строго через TDD (skill `tdd`: одна проверка поведения → минимальная реализация → следующая).

Решения brainstorming 18.09.2026:

- Судья офлайновый: harness забирает `.lgp` из хранилища Loginom и отдаёт его LLM-судье вместе с ТЗ и эталоном. Живой субагент, открывающий сценарий в браузере, и исполнение пакета — фаза 2.
- Runner собственный, на Bun, без внешних eval-фреймворков. promptfoo/Langfuse при необходимости навешиваются позже на те же JSON-результаты.
- Бэкенд судьи — `codex exec` по подписке ChatGPT (проверено 18.09.2026: `codex-cli 0.153.4`, `--output-schema`, 7 секунд на smoke). OpenAI-compatible вариант в MVP не делается.
- Агент получает краткую бизнес-формулировку задачи; полное ТЗ с таблицей узлов видит только судья.

Решения grilling-сессии 18.09.2026:

- `--repeat N` (по умолчанию 1) входит в MVP: результаты хранятся по попыткам, метрики считаются по попыткам (оценка pass@1). Быстрый прогон — N=1, честное сравнение — N=3.
- Измеряется продуктовая модель `openai/gpt-5.6-sol` через OAuth ChatGPT (Desktop реально работает на ней); одноразовый интерактивный `providers login` в eval-профиле. Запасной путь — `xiaomi-token-plan-sgp/mimo-v2.5-pro` по API-ключу.
- Судья — `gpt-6-astra`, reasoning `high`: другое поколение, чем у агента (меньше self-preference), точнее на XML-семантике.
- Score оценивает результат: XML артефакта, файлы экспорта и результаты выполнения узлов из квитанций агента (свидетельство работоспособности). Процесс (число вызовов, ошибки, время, стоимость) — отдельные метрики, в score не входят.
- Отдельный API-ключ Dock для eval: инструменты `loginom_remember/write/edit/add_resource/forget` пишут в глобальную User memory OpenViking, привязанную к ключу, и иначе «опыт» утекает между прогонами. Вызовы memory-tools считаются и показываются.
- Автоочистка хранилища Loginom после копирования артефакта (`--keep-storage` отключает).
- MVP-набор — три core-задачи, покрываемые структурными типами `dock_node_apply`; задачи с калькулятором переменных и Silver Kit — фаза 2.

## Факты о среде, на которые опирается дизайн

Standalone CLI (`packages/agent/src/standalone.ts`, дизайн `2026-09-17-loginom-cli-standalone-design.md`):

- `run --headless --format json --model <provider/model> --file <путь> --dir <workspace> -- "<prompt>"` пишет в stdout JSONL: события `step_start`, `text`, `reasoning`, `tool_use`, `step_finish`, `error`, каждое с `type`, `timestamp`, `sessionID` и `part`. Ошибки preflight до создания сессии — одна строка `{"type":"error","error":{"name":...}}` без `sessionID`. Прогресс и диагностика — в stderr.
- Коды выхода: 0 — сессия дошла до idle без неустранённых ошибок; 1 — runtime/provider/tool/permission (в том числе `CLI_PERMISSION_REJECTED`, `CLI_TOOL_FAILED`, ошибки провайдера); 2 — аргументы или отсутствующая настройка; 3 — `PROFILE_BUSY` и конфликты состояния (только stderr); 4 — неопределённая операция Loginom (`LOGINOM_RECOVERY_REQUIRED`, `LOGINOM_CALL_UNCERTAIN`); 130 — отмена. Дизайн CLI прямо фиксирует: код 0 не доказывает правильность сценария. Пока в профиле есть неподтверждённые `recoveries`, preflight `run` возвращает 4 для любой следующей команды; их снимает `loginom recover --acknowledge --format json`.
- Профиль задаётся абсолютным `LOGINOM_AI_AGENT_CLI_PROFILE`; dev-запуск требует `LOGINOM_AI_AGENT_CLI_BUNDLE` с `bin/node` и собранным `host/node-host.mjs` (`packages/agent/src/cli/standalone-bundle.ts`). Bootstrap стирает наследуемые `LOGINOM_AI_AGENT_AUTH_CONTENT`, `LOGINOM_AI_AGENT_CONFIG*`; модель и права задаются файлом `$PROFILE/config/loginom-ai-agent.json`; auth провайдеров лежит в `$PROFILE/data/auth.json` (`{"openai": {"type": "oauth", ...}}`). Один `.writer` на профиль; крах его не снимает; `loginom recover` его не трогает.
- Проектные инструкции и конфиг ищутся вверх от `--dir` до корня git-репозитория (`src/session/instruction.ts`, `src/config/paths.ts`). `LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG=1` отключает этот поиск (так делает `packages/desktop/test/loginom/desktop-oracle.mjs`); `LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT=1` отключает чтение `~/.claude/CLAUDE.md`.
- `loginom setup --stdin-json --format json` принимает `{url, username, apiKey, password}` через stdin; `apiKey` — ключ Dock, обязателен при первичной настройке. `loginom status --format json` возвращает `Loginom.View` с `state` (`unconfigured | ready | pending | starting | recoverable-error`) и `recoveries`.
- Входные файлы попадают в Loginom через attachment admission агента: `--file` → snapshot → `dock_artifact_deliver` → импорт. Harness ничего не копирует в контейнер.
- Квитанция `loginom_dock_action_run` с `action_key: package.save_as | package.save_checkpoint` содержит `package_ref.path` вида `/<username>/<имя>.lgp`. Квитанции `loginom_dock_node_apply`, `loginom_dock_node_resume`, `loginom_dock_node_wait` содержат статус узла, `output.ports[]` с `row_count` и `sample` (≤ 10 строк) и `configuration.readback`. Квитанция `loginom_dock_prepare` содержит `manifest_sha256` закреплённого каталога действий. Локально `.lgp` не появляется; контракта «Сценарий: URL» у агента нет.
- Права: у агента по умолчанию `"*": "allow"`, но `doom_loop` и `external_directory` — `ask`; неинтерактивный `run` сам запрещает `question`/`plan_*`, а любой запрос `ask` авто-отклоняет с `CLI_PERMISSION_REJECTED` и кодом 1. Для eval это честный `failed` (агент зациклился или полез вне workspace); `README.md` перечисляет это среди известных причин `CLI_PERMISSION_REJECTED`.
- `loginom_*` инструменты добавляются в список модели из каталога Dock без фильтра по permission (`src/session/tools.ts:534-540`): deny на инструмент не скрывает его, а превращает вызов в `CLI_PERMISSION_REJECTED`. Поэтому изоляция памяти делается отдельным ключом, а не запретом.
- В Desktop-БД (`~/.local/share/loginom-ai-agent/loginom-ai-agent.db`) ответы ассистента распределены: `openai/gpt-5.6-sol` — 63 (OAuth), `xiaomi-token-plan-sgp/mimo-v2.5-pro` — 22 (API). OAuth-модель в Desktop работает; в standalone CLI живой OAuth помечен «acceptance pending».

Dock (OpenViking):

- `Product.knowledgeEndpoint = https://loginom.duckdns.org/mcp`; `GET https://loginom.duckdns.org/health` отвечает 200 без ключа; `GET /api/v1/skills/loginom-automation` требует Bearer API-ключ и возвращает манифест skill с полем `revision` — по нему runtime закрепляет skill (`packages/loginom-runtime/client/lib/skill.mjs`). Skill и знания живут вне репозитория и меняются независимо от кода агента.
- `remember` сохраняет глобальную User memory OpenViking (`services/loginom-ai/docs/loginom-dock/shared-project-memory.md`), scope — учётная запись/ключ Dock.

Стенд и артефакт:

- Loginom развёрнут локально в docker (`loginom-server-master`, образ по digest, `http://localhost/app/`, пользователь `user`, пустой пароль). Хранилище пользователя внутри контейнера — `/workdir/UserStorage/user/`; там лежат сохранённые `.lgp`, временные `.~lgp` и файлы экспорта. Файлы читаются `docker cp` и удаляются `docker exec rm` независимо от блокировок Web Client.
- `.lgp` — ZIP: `PackageInfo.xml`, `PackageIndex.xml`, `Variables.xml`, `Unit_N/Unit.xml` с `<Nodes><Item DisplayName=... ><Engine xsi:type="TBGImportTextFile" ...>` и `<Links>` (пары `SourcePort`/`TargetPort` по GUID узлов). Простой пакет — 7–20 KB, `Unit.xml` около 220 строк. Распаковывается системным `unzip`.

Задачи: `~/git/agent-validation/sources/simple/*` — README с таблицей «узел — компонент — настройка», связями и ожидаемым результатом, `data/*.csv`, эталонный `.lgp`. В MVP входят три задачи, покрываемые структурными типами `dock_node_apply` (`imports.text`, `transform.group_data`, `transform.filter_data`, `transform.calculator`, `exports.text`): `group-sum-qty` (A=15, B=25), `filter-active-rows` (2 строки A, C), `calc-data-double` (Double=20, 40). `var-sum-3-plus-5`, `date-diff-one-day`, `list-one-to-five` требуют калькулятора переменных или Silver Kit через медленный UI-путь `dock_ui_action` — фаза 2.

Судья: `codex exec --ephemeral --ignore-user-config --skip-git-repo-check -s read-only -C <dir> -m gpt-6-astra -c model_reasoning_effort=high -c project_doc_max_bytes=0 --json --output-schema <schema> -o <file> -` читает промпт из stdin, пишет финальный ответ строго по JSON-схеме, работает по подписке через `~/.codex/auth.json`. В Codex доступны `gpt-6-astra`, `gpt-5.6-sol/terra/luna`, `gpt-5.5`. `--ignore-user-config` отключает `~/.codex/config.toml` (MCP-серверы, хуки), но не чтение `AGENTS.md` от корня git-репозитория к cwd — его отключает `project_doc_max_bytes=0` (config reference Codex). Благодаря этому рабочие папки судьи безопасно лежат внутри `evals/results/`.

## Отвергнутые варианты

- Живой судья второй CLI-сессией с `loginom_*` инструментами: минуты на задачу, стохастичность, расход токенов агента, зависимость судьи от того же CLI, который измеряется. Фаза 2.
- Гибрид с исполнением пакета (BatchLauncher `:4580` или `cold-readback.mjs`): точнее, но заметно больше работы. Фаза 2.
- promptfoo как runner: даёт Compare UI и sqlite-историю, но требует Node ≥ 22.22 (установлен 22.16), под Bun не верифицирован, assertions только `.js`, таймаут assertion при 15-минутных прогонах не проверен.
- deepeval: Python, in-process трейсинг агента, UI в Confident AI — не подходит для внешнего CLI и артефакта.
- Langfuse: хранилище и UI, а не runner; self-host тяжёлый. В `packages/core` уже есть OTLP-экспорт, поэтому подключение — естественная фаза 2.
- Судья через Loginom AI CLI: `run` требует настроенный Loginom-профиль и поднимает host, нет схемы ответа, судья и измеряемый объект ломаются вместе.
- Судья через OpenAI-compatible `fetch`: рабочий вариант, но подписка бесплатнее и `--output-schema` даёт строгий JSON. Не делается в MVP.
- Судья той же модели, что агент (`gpt-5.6-sol`): дешевле по квоте, но self-preference. Судья `gpt-6-astra medium`: быстрее, но пользователь выбрал точность `high`.
- Рабочая папка агента внутри репозитория: агент подхватил бы корневой `AGENTS.md` и `.loginom-ai-agent/`, и результаты зависели бы от правок правил репозитория. Workspace выносится в `/tmp`, поиск проектного конфига отключается флагом.
- Deny на memory-tools в eval-профиле: инструменты остаются видимы модели, попытка запомнить превращается в `CLI_PERMISSION_REJECTED` и `failed` — штраф за поведение, которое в продукте разрешено. Общий ключ Dock с Desktop: память утекает между прогонами и в рабочие сессии пользователя.
- Отдельный пользователь Loginom для eval: полная изоляция хранилища, но требует создания учётной записи и проверки доступности Silver Kit; автоочистка под `user` закрывает потребность MVP.
- Все шесть задач по умолчанию или поле `tier`: при `--repeat 3` три «тяжёлые» задачи дают до 2.25 ч почти гарантированных нулей за прогон. В MVP только три core-задачи; добавление задачи — новая папка без изменений кода.
- Score с пунктами о процессе («без повторных ошибок tools»): смешивает качество сценария и стиль работы; процесс измеряется отдельными счётчиками.

## Статусы, оценка и метрики

Единица измерения — **попытка** (`attempt`): один запуск агента на одной задаче. Прогон с `--repeat N` содержит `N × tasks` попыток.

Статус попытки определяется в одном месте (`cli.ts` → `run.ts`) по единой таблице:

| Исход процесса агента | Статус | Прогон |
|---|---|---|
| лимит попытки истёк, harness послал SIGINT (затем SIGKILL) — любой код выхода после этого, включая 130 | `timeout` | продолжается |
| harness получил Ctrl+C во время попытки — агент остановлен тем же путём | `interrupted` | завершается: summary с `interrupted: true` |
| код 0, `.lgp` с `Unit.xml` получен | `completed` | продолжается |
| код 0, `.lgp` не получен или без `Unit.xml` | `no_artifact` | продолжается |
| код 1, 4 или 130 | `failed` | продолжается; после кода 4 — восстановление профиля (раздел «Конвейер») |
| код 2 или 3 | `harness_error` | останавливается: это конфигурация или профиль, не качество агента |
| исключение harness (docker, распаковка, запись) | `harness_error` | продолжается |

Признаки `timed_out` и `interrupted` имеют приоритет над кодом выхода: код читается и записывается в `result.json`, но статус — `timeout`/`interrupted`.

`failure_kind` у попыток `failed` — по именам `error`-событий и stderr, первое совпадение сверху: `permission` (`CLI_PERMISSION_REJECTED`), `recovery` (`LOGINOM_RECOVERY_REQUIRED`, `LOGINOM_CALL_UNCERTAIN`, код 4), `cancelled` (`CLI_CANCELLED`, код 130), `provider` (имена ошибок провайдера: `APIError`, `ProviderAuthError`, `ProviderModelNotFoundError`, HTTP 4xx/5xx в тексте ошибки, `rate limit`), `tool` (`CLI_TOOL_FAILED`), иначе `other`. Список имён провайдерных ошибок живёт в `cli.ts` и пополняется по фикстурам реальных прогонов.

Счётчики попытки из `events.jsonl`: `tool_calls` (все `tool_use`), `loginom_tool_calls`, `tool_errors` (`tool_use` со `state.status = "error"`), `memory_tool_calls` (`loginom_remember`, `loginom_forget`, `loginom_write`, `loginom_edit`, `loginom_add_resource`), `cost`, `tokens`, `duration_ms`.

`judge_status` попытки: `scored` — судья вернул валидный вердикт; `no_artifact` — судья не вызывался, `.lgp` нет; `skipped` — `--skip-judge` (для всех попыток прогона, независимо от наличия артефакта), статус `harness_error` или `interrupted`, а также Ctrl+C до старта судьи (шаги 3–4); `error` — ненулевой выход, таймаут или невалидный вердикт судьи после повтора, либо судья убит по Ctrl+C во время работы (без повтора).

`score`: число 0–100 при `scored`; `0` при `no_artifact` (агент не довёл дело до сохранённого пакета — это его результат); `null` при `skipped` и `error`. Судья вызывается для любого статуса, кроме `harness_error` и `interrupted`, если `.lgp` с `Unit.xml` получен, включая `timeout` и `failed`: score отражает качество артефакта, статус — надёжность процесса. `pass = score ≥ pass_threshold`, только при числовом score.

Метрики прогона (по всем попыткам, кроме `interrupted`; `total` = их число):

- `completion_rate = completed / total`.
- `mean_score` — среднее по попыткам с числовым score (`scored` и `no_artifact`); рядом `scored_count` и `excluded_count` (попытки с `null`). При `--skip-judge` метрики судьи (`mean_score`, `mean_score_completed`, `pass_rate`) равны `null`; остальные считаются как обычно.
- `mean_score_completed` — среднее по попыткам `completed` с числовым score.
- `pass_rate = pass / total`.
- `failure_kinds` — счётчик по видам; `memory_tool_calls`, `tool_errors`, `tool_calls` — суммы; `total_cost`, `total_duration_ms`.
- По задачам: `tasks[].attempts[]` и агрегаты задачи (`completion_rate`, `mean_score`, `min_score`, `max_score`, `pass_rate`) — разброс между попытками одной задачи и есть ориентир шума.

Сравнимость прогонов требует равенства `agent.model`, `agent_inputs_hash`, `rubric_hash`, `judge.model`, `judge.reasoning`, `judge.prompt_sha256` и `config.pass_threshold`. `compare.ts` печатает предупреждение «прогоны несравнимы» первой строкой, если хоть одно поле различается. Различие `dock.skill_revision`, `dock.action_manifest_sha256` или `loginom.image_digest` — отдельное предупреждение «изменилось окружение», без запрета сравнения: Dock-skill — часть агента, которую команда меняет намеренно. Разное `repeat` допустимо и показывается в шапке. Два прогона с `--skip-judge` (`judge.* = null` у обоих) сравнимы только по `completion_rate`; `null = null` несравнимостью не считается, метрики судьи в таблице дельт пропускаются.

## Формат задачи

`evals/tasks/<id>/`:

- `task.json` — `id`, `title`, `prompt` (краткая формулировка для агента), `inputs` (относительные пути данных, передаются через `--file`; может быть пустым — тогда `--file` не передаётся), `reference` (`reference.lgp`), `spec` (`SPEC.md`), `checklist` (массив `{id, text, weight?, requires_result_file?}`; вес по умолчанию 1; `requires_result_file` по умолчанию `false` — помечает пункты, проверяемые по файлу экспорта, и исключает их из чеклиста при `--calibrate`; входит в `rubric_hash` как часть `checklist`), `expected_output` (текстовое описание oracle, например «2 строки: A=15, B=25»), `timeout_ms` (необязательно).
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
  README.md                  предпосылки, команды, известные причины failed, ориентир шума
  AGENTS.md                  правила модуля для агентов (в т.ч. TDD и запуск тестов из evals/)
  package.json               private; scripts run/compare/test/typecheck; devDependencies typescript, @types/bun
  tsconfig.json              strict, types bun
  .env.example               переменные окружения (ниже)
  .gitignore                 .env, .profile/, .bundle/, results/, node_modules/
  src/
    config.ts                .env + аргументы → EvalConfig
    task.ts                  загрузка и валидация задач, хеши набора
    preflight.ts             проверки окружения и сбор идентификаторов (git, codex, Dock, Loginom)
    profile.ts               eval-профиль CLI: создание, setup, auth, восстановление, .writer
    cli.ts                   запуск агента и разбор JSONL
    artifact.ts              получение, распаковка и очистка .lgp
    judge.ts                 подготовка папки судьи, codex exec, scoring
    report.ts                агрегация, summary.json, report.md
    run.ts                   entry: прогон, --judge-only, --calibrate
    compare.ts               entry: сравнение двух прогонов
    judge-prompt.md          шаблон инструкции судьи
    verdict.schema.json      JSON-схема ответа судьи
  script/prepare-bundle.ts   сборка dev-bundle
  tasks/<id>/                задачи
  fixtures/
    events/*.jsonl           события CLI для тестов parseEvents (синтетические до первого живого прогона)
    fake/<task-id>.jsonl     сценарии fake CLI (+ <task-id>.exit с кодом выхода), default.jsonl
    storage/*.lgp            «хранилище» для EVAL_ARTIFACT_SOURCE=dir
    fake-cli.ts              fake CLI (run + management-команды loginom по файлу состояния)
    fake-codex.ts            fake judge для тестов judgeTask: пишет вердикт из FAKE_CODEX_VERDICT в файл -o, код из FAKE_CODEX_EXIT
    verdicts/*.json          готовые вердикты для тестов judgeTask
  test/                      bun test
  results/<run-id>/          gitignored
```

Runtime-зависимостей нет: Bun built-ins и внешние команды `docker`, `codex`, `unzip`, `git`, `pgrep`. Dev-зависимости (`typescript`, `@types/bun`) ставятся `bun install` внутри `evals/` — отдельный `evals/bun.lock`; каталог не входит в workspaces корня, root `package.json` не меняется. Команды выполняются из `evals/`: `bun run src/run.ts ...`, `bun test`, `bun typecheck`; Bun сам подхватывает `evals/.env`.

Переменные `.env` (в `.env.example` — выбранные значения):

- Loginom: `LOGINOM_URL` (`http://localhost/app/`), `LOGINOM_USERNAME` (`user`), `LOGINOM_PASSWORD` (пусто), `LOGINOM_CONTAINER` (`loginom-server-master`), `LOGINOM_STORAGE_DIR` (`/workdir/UserStorage/user`).
- Dock: `LOGINOM_DOCK_API_KEY` (обязателен; **отдельный ключ для eval**, не ключ Desktop), `LOGINOM_DOCK_BASE_URL` (`https://loginom.duckdns.org`).
- Агент: `EVAL_AGENT_MODEL` (`openai/gpt-5.6-sol`, обязателен), `EVAL_CLI_MODE` (`source` | `binary` | `fake`, по умолчанию `source`), `EVAL_CLI_BIN` (для `binary`), `EVAL_CLI_BUNDLE` (по умолчанию `evals/.bundle`), `EVAL_WORKSPACE_ROOT` (`/tmp/loginom-evals`), необязательный OpenAI-compatible провайдер для запасного пути: `EVAL_AGENT_PROVIDER_ID`, `EVAL_AGENT_PROVIDER_BASE_URL`, `EVAL_AGENT_PROVIDER_API_KEY`, `EVAL_AGENT_PROVIDER_MODEL_ID`.
- Артефакт: `EVAL_ARTIFACT_SOURCE` (`docker` | `dir:<path>`, по умолчанию `docker`).
- Судья: `JUDGE_MODEL` (`gpt-6-astra`, обязателен, без дефолта в коде), `JUDGE_REASONING` (`high`), `EVAL_JUDGE_COMMAND` (`codex`; в тестах — `bun fixtures/fake-codex.ts`; строка разбивается по пробелам, дальше добавляются аргументы `exec …`).
- Лимиты: `EVAL_REPEAT` (1), `EVAL_TASK_TIMEOUT_MS` (900000), `EVAL_JUDGE_TIMEOUT_MS` (300000, на каждый вызов судьи), `EVAL_PASS_THRESHOLD` (70), `EVAL_CALIBRATION_POSITIVE_MIN` (90), `EVAL_CALIBRATION_NEGATIVE_MAX` (40).

Значения в скобках у обязательных `LOGINOM_DOCK_API_KEY`, `EVAL_AGENT_MODEL`, `JUDGE_MODEL` — содержимое `.env.example`, а не дефолт в коде: без них `loadConfig` завершается с выходом 2 (кроме режимов, где они не нужны — ниже).

Флаги `run.ts`:

- `--only a,b` — подмножество задач; `--tasks <dir>` — другой каталог задач; `--label <text>`.
- `--repeat N` — число попыток на задачу; приоритет: флаг → `EVAL_REPEAT` → 1.
- `--timeout-ms <n>` — лимит попытки; приоритет: флаг → `task.json.timeout_ms` → `EVAL_TASK_TIMEOUT_MS` → 900000. Пауза SIGINT → 30 с → SIGKILL в лимит не входит.
- `--skip-judge` — не вызывать судью (`judge_status: skipped`).
- `--keep-storage` — не удалять артефакты из хранилища Loginom после копирования.
- `--judge-only <run-id>` — пересудить готовые артефакты прогона без запуска агента.
- `--calibrate` — калибровка судьи без агента и без Loginom (раздел «Калибровка судьи»).
- `--reset-profile` — удалить `evals/.profile/agent` (после проверки, что процессов на нём нет) и создать заново.
- `--dry-run` — пресет самопроверки: `EVAL_CLI_MODE=fake`, `EVAL_ARTIFACT_SOURCE=dir:fixtures/storage`, `--skip-judge`; обязательные переменные `.env` (`LOGINOM_DOCK_API_KEY`, `EVAL_AGENT_MODEL`, `JUDGE_MODEL`) не требуются, `.env` может отсутствовать; preflight проверяет только загрузку задач и наличие фикстур; профильные шаги и очистка хранилища пропускаются; при запуске вне git-репозитория `run-id` получает суффикс `nogit` вместо SHA.

Режимы без агента — `--judge-only` и `--calibrate` — используют сокращённый preflight: загрузка задач, `codex --version`, наличие `~/.codex/auth.json`, обязательный `JUDGE_MODEL`; Loginom, docker, Dock, bundle, `LOGINOM_DOCK_API_KEY`, `EVAL_AGENT_MODEL` и профильный блок не проверяются и не запускаются. Поля `Environment`, которые в текущем режиме не собирались, равны `null` и так же записываются в `summary.json`.

Интерфейсы модулей (типы выводятся, сигнатуры показывают границы):

- `config.ts`: `loadConfig(argv) → EvalConfig`. Ошибки конфигурации — понятное сообщение и выход 2. Секреты хранятся только в памяти процесса.
- `task.ts`: `loadTasks(dir, only?) → Task[]`, `agentInputsHash(tasks) → string`, `rubricHash(tasks) → string`. Валидирует обязательные поля, уникальность `checklist[].id`, существование файлов.
- `preflight.ts`: `preflight(config) → Environment`, где `Environment = { git: { sha, dirty } | null, codex: { version } | null, dock: { skillRevision } | null, loginom: { imageDigest } | null }`; `null` — проверка в этом режиме не выполнялась. Отказ — `PreflightError` с причиной (выход 2 в `run.ts`). Набор проверок по режимам перечислен в разделах «Флаги» и «Конвейер».
- `profile.ts`: `ensureProfile(config) → { dir, cliEnv }` — создаёт профиль первой management-командой, выполняет `setup --stdin-json`, пишет `config/loginom-ai-agent.json` (`permission: {"loginom_*": "allow"}` и блок провайдера из `.env`, если задан); `assertAuth(profile, model)` — провайдер модели должен присутствовать в `$PROFILE/data/auth.json` либо быть описан блоком провайдера в конфиге, иначе печатается точная команда `providers login` для этого профиля и выход 2; `releaseStaleWriter(profile)` — снимает `.writer`, только если `pgrep -f <dir профиля>` пуст; `recoverIfNeeded(profile) → { recovered: boolean, view }` — `loginom status --format json`; при непустых `recoveries` выполняет `loginom recover --acknowledge --format json` и повторяет `status`. Успех — `recoveries` пусты и `state = ready` (с `recovered = true`, если acknowledge выполнялся); транзитное `starting` ожидается повторными `status` до 10 с; любое другое состояние после повтора (`recoverable-error`, `pending`, недоступный Loginom) — отказ восстановления с текстом `state`/`failure` в причине остановки прогона.
- `cli.ts`: `runAgent({ command, env, model, prompt, files, workdir, timeoutMs, outDir, signal }) → AgentRun`, где `AgentRun = { exitCode, timedOut, interrupted, durationMs, sessionId?, saveReceipts: string[], nodeReceipts: string[], actionManifestSha256?, finalText?, cost, tokens, errors: string[], failureKind?, counters: { toolCalls, loginomToolCalls, toolErrors, memoryToolCalls } }`. Чистая `parseEvents(lines) → …` используется тестами. `command` для `source` — `bun run src/standalone.ts` с cwd `packages/agent`; для `binary` — `EVAL_CLI_BIN`; для `fake` — `bun fixtures/fake-cli.ts` с `EVAL_TASK_ID` в окружении. `signal` — AbortSignal harness'а для Ctrl+C.
- `artifact.ts`: `fetchArtifact({ source, candidates, resultPattern, since, outDir }) → Artifact | undefined`, где `Artifact = { origin: "receipt" | "instructed" | "scan", packagePath, localLgp, unpackedDir, resultFiles: string[], ambiguous: string[] }`; `cleanupArtifact({ source, artifact })` удаляет из хранилища ровно те файлы, которые были скопированы (`packagePath` и `resultFiles`), ничего по маске. `source` — `docker` (`docker exec ls`, `docker cp`, `docker exec rm -f`) или `dir:<path>` (`/<username>/<имя>` → `<path>/<имя>`; для `dir:` очистка не выполняется). Игнорирует `.~lgp`; при `scan` берёт новейший `.lgp` с mtime позже `since`, остальные кандидаты перечисляет в `ambiguous`. После `unzip -o -q` проверяет наличие `Unit_*/Unit.xml`.
- `judge.ts`: `judgeTask({ task, run?, artifact, outDir, judge, signal }) → Judged | JudgeError`, где `Judged = { verdict, score, pass, items, attempts: 1 | 2 }`. `judgeTask` сам вызывает `scoreVerdict` и повторяет `codex exec` один раз при ненулевом выходе, таймауте, невалидном JSON или `ScoreError`; `EVAL_JUDGE_TIMEOUT_MS` действует на каждый вызов. `run` отсутствует при калибровке — тогда `agent-final-message.md`, `tools-summary.md`, `node-readbacks.md` содержат заглушку «недоступно: калибровка». Чистая `scoreVerdict(checklist, verdict) → { score, pass, items } | ScoreError` тестируется отдельно.
- `report.ts`: чистые `aggregate(attempts, config) → Metrics` и `aggregateTask(attempts) → TaskMetrics`; `writeSummary(runDir, summary)`; `renderReport(summary) → string`.
- `run.ts`: preflight → профиль → цикл попыток → summary. Код выхода 0 при завершённом или прерванном по Ctrl+C прогоне независимо от метрик, 2 при отказе preflight/конфигурации/профильного блока, 1 при остановке прогона из-за `harness_error` с остановкой или аварии harness.
- `compare.ts`: чистая `compare(a, b) → string` и entry `compare.ts <run-a> <run-b>`.

## Конвейер прогона

Preflight (до первой попытки, отказ = выход 2 с причиной): `.env` полный; `fetch(LOGINOM_URL)` отвечает 200; `docker inspect LOGINOM_CONTAINER` показывает запущенный контейнер и даёт `loginom.image_digest`; `unzip`, `git`, `pgrep` доступны; `fetch(LOGINOM_DOCK_BASE_URL/health)` отвечает 200 и `GET /api/v1/skills/loginom-automation` с Bearer eval-ключом возвращает манифест с `revision` → `dock.skill_revision` (иначе падение Dock выглядело бы как регрессия агента); `codex --version` работает и `~/.codex/auth.json` существует (если не `--skip-judge`); для `source` — bundle содержит `bin/node` и `host/node-host.mjs`, для `binary` — исполняемый файл существует; `EVAL_WORKSPACE_ROOT` создаваем; git SHA и dirty-флаг прочитаны. При `--dry-run` — только загрузка задач и наличие фикстур.

`run-id = <YYYYMMDD-HHmmss>-<git short sha>[-dirty]`; вне git-репозитория вместо SHA — `nogit`. `results/<run-id>/` создаётся заранее и содержит `config.json` с параметрами прогона без секретов (для ключей — только имена переменных).

Профиль: `releaseStaleWriter` → `ensureProfile` → `assertAuth` → `recoverIfNeeded`; отказ любого шага здесь, до первой попытки, — выход 2, как у preflight. Снятие stale `.writer` идёт первым: `setup`/`status` — management-команды, которые сами берут guard и после краха прошлого прогона получили бы `PROFILE_BUSY`. Один постоянный профиль `evals/.profile/agent`; попытки последовательные, поэтому второй профиль не нужен. В режиме `fake` (`--dry-run`) все профильные шаги — этот блок, шаг 7 конвейера и `pgrep` — пропускаются.

Порядок попыток — round-robin: попытка 1 для всех задач, затем попытка 2 и т.д. Сбой Dock или провайдера размазывается по задачам, а Ctrl+C после первого круга оставляет полное покрытие задач. Результаты попытки — в `results/<run-id>/<task-id>/<attempt>/` (`attempt` = 1..N), workspace — в `EVAL_WORKSPACE_ROOT/<run-id>/<task-id>/<attempt>/` (вне git-репозитория — как папка обычного пользователя):

1. Копии `inputs` в workspace. Имя пакета `eval-<run-id>-<task-id>-<attempt>.lgp`, путь `/<username>/eval-<run-id>-<task-id>-<attempt>.lgp` (плоское имя, как в oracle `runtime-acceptance.ts`). Промпт = `task.prompt` + фиксированный хвост на естественном языке, без имён инструментов: «Сохрани готовый пакет как `<путь>`. Если задача требует выгрузку в файл, назови его `eval-<run-id>-<task-id>-<attempt>.result.csv`. Уточняющих вопросов не задавай — принимай разумные решения самостоятельно и доведи задачу до конца.»
2. Запуск CLI с аргументами `run --headless --format json --model <m> [--file <abs> ...] --dir <workspace> -- "<prompt>"`. Окружение: `LOGINOM_AI_AGENT_CLI_PROFILE`, `LOGINOM_AI_AGENT_CLI_BUNDLE` (для `source`), `LOGINOM_AI_AGENT_PURE=1`, `LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG=1`, `LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT=1`; прочие `LOGINOM_AI_AGENT_*` не наследуются. Права остаются по умолчанию агента (`"*": "allow"` плюс явный `loginom_*: allow`): generic-инструменты работают во временном workspace и не влияют на Loginom. stdout → `events.jsonl`, stderr → `stderr.txt`, старт/финиш/код/таймаут → `run.json`.
3. Разбор `events.jsonl` (выполняется и после таймаута или Ctrl+C, по накопленным строкам): `sessionID` первого события с ним; квитанции `tool_use` с `part.tool === "loginom_dock_action_run"` и `part.state.input.action_key ∈ {package.save_as, package.save_checkpoint}` → `package_ref.path` из `part.state.output` (JSON-строка); квитанции `loginom_dock_node_apply`, `loginom_dock_node_resume`, `loginom_dock_node_wait` со `state.status = "completed"` → `nodeReceipts` (JSON `state.output` как есть; квитанция длиннее 8 KB усекается до 8 KB с пометкой `…[truncated]`; при превышении 64 KB суммарно сохраняются последние квитанции, старшие отбрасываются с записью числа отброшенных); `manifest_sha256` из первой квитанции `loginom_dock_prepare`; последний `text` → финальный текст; суммы `cost` и `tokens` из `step_finish`; имена `error`; счётчики; `failure_kind`.
4. Артефакт (для всех статусов, кроме `harness_error` с остановкой и `interrupted`): кандидаты — пути из квитанций, затем предписанный путь, затем `scan`. `docker cp` в `artifact/package.lgp`, распаковка в `artifact/unpacked/`; заодно `eval-<run-id>-<task-id>-<attempt>*.result.*` в `artifact/results/`. Сохранённый `.lgp` считается целым: Loginom пишет во временный `.~lgp` и переименовывает. После успешного копирования, если не `--keep-storage`, — `cleanupArtifact`; ошибка очистки записывается в `result.json` (`cleanup_error`) и не меняет статус.
5. Судья, если артефакт с `Unit.xml` получен и не `--skip-judge`.
6. `result.json`: статус, код, `timed_out`, `interrupted`, `failure_kind`, `session_id`, `package_path`, `artifact_origin`, `artifact_ambiguous`, `cleanup_error`, `action_manifest_sha256`, score, pass, `judge_status`, `judge_attempts`, пункты чеклиста, длительность, стоимость, счётчики, `profile_recovered`.
7. После попытки: если был таймаут или Ctrl+C — дождаться исчезновения процессов, ссылающихся на профиль (до 60 с), затем `releaseStaleWriter`; если процессы не исчезли — остановить прогон с выходом 1, профиль в неопределённом состоянии. Затем `recoverIfNeeded`; результат записывается в `profile_recovered` следующей попытки; отказ восстановления останавливает прогон с выходом 1.

Ctrl+C: первый SIGINT harness'а во время работы процесса агента (шаг 2) переводит текущую попытку в `interrupted` (агент останавливается процедурой SIGINT → 30 с → SIGKILL). Если процесс агента уже завершился, статус попытки не меняется: на шагах 3–4 попытка доводится до записи `result.json` (судья пропускается, `judge_status: skipped`); на шаге 5 судья прерывается SIGKILL без повтора, `judge_status: error`. В обоих случаях далее выполняется шаг 7 (результат `recoverIfNeeded` пишется в `summary.interrupted_cleanup`), затем `summary.json` с `interrupted: true` и `report.md` по завершённым попыткам; новые попытки не стартуют. Второй SIGINT во время ожидания — немедленный выход 130 без summary.

Остановка прогона по `harness_error` (коды 2/3, отказ восстановления профиля, неисчезнувшие процессы профиля на шаге 7) также пишет `summary.json` и `report.md` по завершённым попыткам с полем `stopped_reason` и завершает процесс с выходом 1.

Ctrl+C в `--judge-only`: текущий вызов судьи убивается (`judge_status: error` у этой попытки), остальные попытки не пересуживаются и сохраняют прежние результаты; `summary.prev.json` уже сохранён, новый summary пишется с `interrupted: true`.

После цикла — `summary.json` и `report.md`. `--judge-only <run-id>` пропускает шаги 1–4 и 7, берёт готовые `artifact/` и `result.json` каждой попытки, пересчитывает score, перезаписывает summary/report того же прогона, сохраняя `summary.prev.json` и `judge/verdict.prev.json`. `rubric_hash` и `judge.*` пересчитываются по текущим задачам и конфигу; `agent_inputs_hash` и данные агента берутся из прежнего summary. Если текущий `agent_inputs_hash` каталога задач отличается от записанного, печатается предупреждение — артефакты созданы под прежними входами.

Попытки строго последовательные: один процесс агента, судья после каждой попытки. Параллелизм и совмещение судьи со следующей попыткой — фаза 2.

## Судья

Папка `judge/` внутри результата попытки:

- `PROMPT.md` — из `judge-prompt.md`; `TASK.md` — промпт агента; `SPEC.md`; `checklist.json`; `expected-output.md`.
- `reference/` — распакованный эталон; `artifact/` — распакованный `.lgp` агента и файлы результата; `agent-final-message.md`; `tools-summary.md` — таблица вызванных `loginom_*` инструментов с `action_key`/типом узла и статусом; `node-readbacks.md` — квитанции выполнения узлов (`nodeReceipts`) как JSON-блоки: статус узла, `output.ports[]` с `row_count` и `sample`, `configuration.readback`.
- `verdict.schema.json`.

Команда: `codex exec --ephemeral --ignore-user-config --skip-git-repo-check -s read-only -C <abs judge/> -m $JUDGE_MODEL -c model_reasoning_effort=$JUDGE_REASONING -c project_doc_max_bytes=0 --json --output-schema <abs verdict.schema.json> -o <abs verdict.json> -` с `PROMPT.md` на stdin; пути абсолютные. События → `judge/events.jsonl`, stderr → `judge/stderr.txt`; таймаут `EVAL_JUDGE_TIMEOUT_MS`, по истечении SIGKILL. Ненулевой выход, таймаут или невалидный вердикт → один повтор; повторный отказ → `judge_status: error`. `judge_attempts` = 1 или 2.

Схема ответа:

```json
{
  "checklist": [{ "id": "string", "passed": true, "evidence": "string" }],
  "summary": "string",
  "confidence": "high | medium | low"
}
```

`scoreVerdict`: множество `id` в ответе должно совпадать с чеклистом задачи — пропуск, дубликат или лишний `id` дают `ScoreError` (считается невалидным вердиктом и ведёт к повтору); `score = round(100 · Σ weight·passed / Σ weight)`; `pass = score ≥ pass_threshold`. Судья не выдаёт число — только бинарные решения с evidence, что ограничивает шум и позволяет пересуживать через `--judge-only` при изменении рубрики.

Правила в `judge-prompt.md`: эталон — одно правильное решение, а не единственное; иная композиция узлов с тем же смыслом засчитывается; семантику данных (колонки, агрегаты, условия, источники) проверять строго; порядок доказательств — XML артефакта и файлы результата, затем `node-readbacks.md` как свидетельство выполнения (совпадающие `row_count`/`sample` подтверждают пункты о данных), финальное сообщение агента — лишь заявление, требующее подтверждения; неинтерпретируемый артефакт → пункты непройдены с указанием причины; отсутствующий файл результата → соответствующий пункт непройден; ничего не выполнять и не изменять; evidence — ссылка на файл и атрибут.

В `summary.json` фиксируются `judge.backend = "codex"`, `codex_version`, `model`, `reasoning`, `prompt_sha256` (sha256 файла `judge-prompt.md`).

## Калибровка судьи

`run.ts --calibrate` проверяет рубрику и судью до трат на агента, без Loginom и docker. Для каждой задачи создаются две синтетические попытки в `results/<run-id>-calibrate/<task-id>/{positive,negative}/`: `positive` — артефакт = распакованный собственный `reference.lgp`; `negative` — артефакт = `reference.lgp` следующей задачи по кругу (при одной задаче `negative` пропускается). `agent-final-message.md`, `tools-summary.md`, `node-readbacks.md` содержат пометку «недоступно: калибровка», файлы результата отсутствуют. Судья вызывается как обычно. В каталоге калибровки пишутся `config.json` и `calibration.json` (структурированный аналог отчёта: `judge.*`, `rubric_hash`, по задачам `positive_score`/`negative_score` и пункты); обычный `summary.json` не создаётся — калибровка не является прогоном и в `compare` не участвует. Отчёт `calibration.md`: таблица задач с `positive_score` и `negative_score`; ожидание — `positive ≥ 90` и `negative ≤ 40` (пороги в конфиге `EVAL_CALIBRATION_POSITIVE_MIN`/`EVAL_CALIBRATION_NEGATIVE_MAX`); нарушение — предупреждение с именами пунктов, на которых судья ошибся. Пункт о файле результата в `positive` ожидаемо непройден (эталон файл не содержит) — рубрика калибровки учитывает это, исключая пункты с `requires_result_file: true` из чеклиста для калибровки; поле необязательное в `task.json`, по умолчанию `false`.

## Отчёты и сравнение

`summary.json`: `run_id`, `label`, `started_at`, `finished_at`, `interrupted`, `interrupted_cleanup`, `stopped_reason`; `agent { cli_mode, git_sha, dirty, model }`; `judge { backend, codex_version, model, reasoning, prompt_sha256 }`; `dock { skill_revision, action_manifest_sha256: string[] }` (уникальные значения по всем попыткам); `loginom { image_digest }`; `agent_inputs_hash`, `rubric_hash`, `task_ids`; `config { repeat, timeout_ms, judge_timeout_ms, pass_threshold, keep_storage }`; `metrics` (раздел «Статусы, оценка и метрики»); `tasks[]` — `{ id, metrics: TaskMetrics, attempts: [{ attempt, status, exit_code, timed_out, interrupted, failure_kind, score, pass, judge_status, judge_attempts, judge_confidence, duration_ms, cost, counters, package_path, artifact_origin, artifact_ambiguous, cleanup_error, action_manifest_sha256, session_id, profile_recovered }] }`. Поля окружения, не собранные в текущем режиме, — `null`.

`report.md`: метрики шапкой (с `scored_count`/`excluded_count`, `failure_kinds`, `memory_tool_calls`); таблица задач с агрегатами и разбросом (`min_score`–`max_score`, `completed/attempts`); таблица попыток (статус, код, `failure_kind`, score, pass, длительность, стоимость, строка резюме судьи); раздел отказов с именами ошибок из событий (в том числе `CLI_PERMISSION_REJECTED` и провайдерные отдельно) и первыми строками stderr; предупреждение, если `memory_tool_calls > 0`; раздел «Остатки в хранилище» — файлы `eval-<run-id>-*`, которые harness видел (`docker exec ls` в конце прогона), но не удалял, с готовой командой очистки.

`compare.ts <run-a> <run-b>`: проверка сравнимости и окружения; предупреждение о неполном покрытии, если у одного из прогонов `interrupted: true` или `stopped_reason` (разный `total`); дельты метрик; таблица по задачам «completion a → b», «mean_score a → b» с ▲/▼ и разброс; `repeat` обоих прогонов в шапке. Результат в stdout и `results/compare-<a>-vs-<b>.md`.

## Обработка ошибок

- Отказы preflight, конфигурации и профильного блока останавливают прогон до первой попытки (выход 2).
- Коды 2 и 3 у попытки означают проблему harness/профиля: `harness_error`, прогон останавливается (выход 1) — иначе все следующие попытки получат тот же код не по вине агента.
- Исключения внутри попытки (`docker cp`, распаковка, запись) → `harness_error` у попытки, прогон продолжается; текст ошибки в `result.json`.
- Таймаут агента, Ctrl+C и код 4 обрабатываются шагом 7 конвейера; невозможность освободить профиль или восстановить его останавливает прогон (выход 1).
- Ошибка очистки хранилища не меняет статус попытки; `cleanup_error` в `result.json`, повторная очистка — командой из `README.md`.
- Отказ судьи после повтора не влияет на статус попытки; `score = null`, `judge_status: error`, перезапуск через `--judge-only`.
- Секреты (`LOGINOM_DOCK_API_KEY`, ключи провайдера) не попадают в `results/`, логи и `config.json` прогона.

## Dev-bundle

`script/prepare-bundle.ts [--copy]` создаёт `evals/.bundle/`: симлинки `bin/`, `browsers/`, `runtime/` на `packages/desktop/resources/loginom/` и сборку host командой `bun script/build-node-host.ts <abs .bundle>/host` из `packages/loginom-host` (как в `packages/agent/test/cli/tui/standalone-pty.py`). Если host отвергает симлинки, `--copy` копирует каталоги. Пересборка host нужна после изменений в `packages/loginom-host`; скрипт печатает это напоминание.

## Процесс разработки: TDD

Пользователь зафиксировал 18.09.2026: весь код `evals/` разрабатывается по skill'у `/tdd` (`~/.cursor/skills/tdd/SKILL.md`). Правила применительно к harness:

- Вертикальные срезы: одно поведение → один падающий тест → минимальная реализация → зелёный → следующее поведение. Писать все тесты модуля заранее, а затем всю реализацию (горизонтальный срез) запрещено.
- Первый тест каждого модуля — tracer bullet: сквозной happy path через публичный интерфейс. Далее поведения берутся по приоритету из раздела «Тестирование harness»; он же — согласованный список того, что тестируем.
- Тесты проверяют поведение через публичные интерфейсы из раздела «Интерфейсы модулей», не внутренние функции; тест должен пережить рефакторинг внутренностей.
- Никаких моков внутренних коллабораторов и `globalThis.*`. Внешние процессы подменяются только средствами, предусмотренными дизайном: `EVAL_CLI_MODE=fake` с `fixtures/fake-cli.ts`, `EVAL_ARTIFACT_SOURCE=dir:`, `EVAL_JUDGE_COMMAND="bun fixtures/fake-codex.ts"`. Живой `codex exec` в тестах не вызывается: проверяются содержимое папки судьи, аргументы команды, `scoreVerdict` и логика повтора через fake-codex; живой судья — приёмка.
- Рефакторинг только на зелёном; после каждого шага рефакторинга — `bun test`.
- Если реализация требует иного интерфейса или поведения, чем записано здесь, сначала правится спека, затем тест; молчаливые отклонения недопустимы.
- Коммит на каждом зелёном цикле или группе связанных циклов: `test(evals): …`, `feat(evals): …`.

## Тестирование harness

`cd evals && bun test` (из корня репозитория тесты не запускаются по правилу `do-not-run-tests-from-root`). Список ниже — приоритетный перечень поведений для TDD-циклов:

- `parseEvents` на фикстурах `events/*.jsonl`: `sessionID`, пути квитанций save, `nodeReceipts`, `action_manifest_sha256`, финальный текст, cost, ошибки, счётчики, `failure_kind`; отдельная фикстура preflight-ошибки без `sessionID`. До первого живого прогона фикстуры синтезируются по контракту из раздела «Факты о среде»; после пункта 3 приёмки заменяются очищенными фрагментами реальных `events.jsonl`.
- `artifact` с `dir:` источником: распаковка фикстурного `.lgp` (копия эталона) → найден `Unit.xml`; ZIP без `Unit.xml` → `undefined`; `.~lgp` игнорируется; `scan` выбирает новейший и заполняет `ambiguous`; `cleanupArtifact` для `dir:` ничего не делает.
- `scoreVerdict`: веса, порог, пропуск/дубликат/лишний `id` → `ScoreError`.
- `aggregate`/`aggregateTask`: `no_artifact` = 0, `null` исключаются с подсчётом, `interrupted` исключаются, `mean_score_completed`, `--skip-judge` → `mean_score = null`, агрегаты задачи по попыткам (`min/max_score`).
- `compare`: дельты, предупреждение о несравнимости по каждому полю, предупреждение об изменении окружения (`dock.*`, `loginom.image_digest`).
- Статусы: таблица кодов выхода → статус и решение об остановке прогона; приоритет `timed_out`/`interrupted`.
- `--dry-run`: `fake-cli.ts` печатает `fixtures/fake/<EVAL_TASK_ID>.jsonl` (иначе `default.jsonl`) и завершается кодом из `<EVAL_TASK_ID>.exit` (иначе 0); квитанции в фикстурах ссылаются на `/user/fixture-<task-id>.lgp`, которые `dir:fixtures/storage` находит без привязки к `run-id`. Полный цикл с `--repeat 2` проходит за секунды без Loginom, модели и квоты Codex — это CI самого harness. Фикстуры покрывают минимум: успех с артефактом, код 1 без артефакта, код 0 без артефакта.

Тесты используют реальные модули без моков; внешние команды подменяются только через конфигурацию (`fake`, `dir:`).

## Приёмка MVP

1. `--dry-run --repeat 2` проходит; `bun test` и `bun typecheck` зелёные.
2. `--calibrate` на трёх задачах: `positive ≥ 90`, `negative ≤ 40`; иначе правится рубрика/промпт судьи до выполнения условия.
3. Один полный прогон трёх задач реальным агентом с `--repeat 3` (9 попыток, ≤ 2.25 ч): `summary.json`, `report.md`, девять `result.json`, для попыток с артефактом — `judge/verdict.json`; скопированные `.lgp` и файлы результата удалены из хранилища Loginom, остатки (`.~lgp`, файлы попыток без артефакта, кандидаты из `ambiguous`) перечислены в `report.md` и снимаются командой из `README.md`.
4. `--judge-only` на этом прогоне при неизменной рубрике даёт те же score; `verdict.prev.json` позволяет сравнить evidence.
5. В `README.md` записывается ориентир шума из пункта 3: по каждой задаче `min–max score` и `completed/attempts`; дельты между прогонами ниже этого разброса не считаются изменением качества.

## Допущения, проверяемые на первом шаге реализации

- `package.save_as` принимает плоский путь `/<username>/<имя>.lgp`; вложенные каталоги не используются.
- Dev-bundle из симлинков принимается host'ом; иначе `prepare-bundle.ts --copy`.
- ChatGPT-OAuth в standalone CLI (`providers login`) работает для `openai/gpt-5.6-sol`; запасной путь — OpenAI-compatible провайдер из `.env`.
- Отдельный eval-ключ Dock выдан пользователем и имеет доступ к тем же skill/знаниям, что ключ Desktop.
- Формат событий `run --format json` не изменится в текущей Codex-сессии по CLI; при изменении обновляются `cli.ts` и фикстуры.

## Вне объёма MVP (фаза 2)

Задачи `var-sum-3-plus-5`, `date-diff-one-day`, `list-one-to-five` и чистые Silver Kit/ETL-утилиты из `agent-validation`; живой судья второй CLI-сессией; исполнение пакета через BatchLauncher или `cold-readback.mjs` и проверка выходных таблиц по oracle; параллельные попытки на нескольких профилях; совмещение судьи со следующей попыткой; `--judge-repeats N` с медианой; компактная JSON-сводка графа вместо сырого XML; калибровка судьи на ручных оценках; отдельный пользователь Loginom для eval; экспорт в Langfuse через существующий OTLP.

## Прогресс

- 2026-09-18: brainstorming и grilling завершены, решения зафиксированы выше; спека прошла ревью. Реализация не начата.
