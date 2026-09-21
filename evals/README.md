# Eval harness Loginom AI Agent

Измеряет, стал ли агент строить сценарии Loginom лучше или хуже: прогоняет задачи через standalone CLI, забирает `.lgp` из локального Loginom, оценивает судьёй `codex exec`. Дизайн: `docs/superpowers/specs/2026-09-18-evals-design.md`.

## Предпосылки

- Bun ≥ 1.3; preflight требует `unzip`, `git`, `pgrep` и `docker` (когда источник артефакта — `docker`).
- Локальный стенд Loginom в docker (`loginom-server-master`, `http://localhost/app/`, пользователь `user`).
- Отдельный API-ключ Dock для eval (не ключ Desktop): память OpenViking привязана к ключу. Dock должен отвечать этим ключом; preflight забирает манифест skill с `include_integrity=true`.
- Codex CLI с входом по подписке (`codex login`); судья — `gpt-6-astra`/`high`.
- Dev-bundle: `bun run prepare-bundle` (полная копия ресурсов Desktop `packages/desktop/resources/loginom`, ~570 МБ, + сборка host). Симлинки не подходят: runtime проверяет, что realpath каждого файла манифеста лежит внутри bundle. Повторять после изменений в `packages/loginom-host` или ресурсах.

## Настройка

```bash
cd evals
bun install
cp .env.example .env   # заполнить LOGINOM_DOCK_API_KEY
bun run prepare-bundle
```


`--reset-profile` удаляет весь каталог eval-профиля, включая скопированный `auth.json`. После сброса скопируйте запись провайдера снова.

В режиме `source` harness засевает каталог моделей `.profile/agent/cache/models.json` из `packages/product/models.json` (native-сборка несёт его внутри).

Текущий стенд использует `EVAL_AGENT_MODEL=xiaomi-token-plan-sgp/mimo-v2.5-pro`. Это провайдер из каталога моделей агента, поэтому `EVAL_AGENT_PROVIDER_*` не нужен. `assertAuth` закрывается копированием **только** записи `"xiaomi-token-plan-sgp"` из `~/.local/share/loginom-ai-agent/auth.json` в `evals/.profile/agent/data/auth.json` (создать `data/`, если нет; режим `0600`; никогда не коммитить). Профиль eval появляется после первого запуска: прогон один раз, получить ошибку `assertAuth`, затем скопировать из корня репозитория:

```bash
mkdir -p evals/.profile/agent/data && jq '{"xiaomi-token-plan-sgp": .["xiaomi-token-plan-sgp"]}' ~/.local/share/loginom-ai-agent/auth.json > evals/.profile/agent/data/auth.json && chmod 600 evals/.profile/agent/data/auth.json
```

Целевой путь продукта — OAuth-модель `openai/gpt-5.6-sol`: одноразовый `providers login` командой, которую harness печатает при первом запуске:

```bash
LOGINOM_AI_AGENT_CLI_PROFILE=$PWD/.profile/agent LOGINOM_AI_AGENT_CLI_BUNDLE=$PWD/.bundle \
  bun run --cwd ../packages/agent dev:cli providers login
```

Третий путь — `EVAL_AGENT_PROVIDER_*` для произвольного OpenAI-совместимого endpoint: раскомментировать **и** заполнить все четыре значения, затем задать `EVAL_AGENT_MODEL=<EVAL_AGENT_PROVIDER_ID>/<EVAL_AGENT_PROVIDER_MODEL_ID>`.

## Команды

```bash
bun test && bun typecheck                    # самопроверка harness
bun run src/run.ts --dry-run --repeat 2      # весь цикл на фикстурах, без Loginom/модели/квоты
bun run src/run.ts --calibrate               # калибровка судьи на эталонах (без агента)
bun run src/run.ts --repeat 3 --label base   # живой прогон
bun run src/run.ts --judge-only <run-id>     # пересудить готовые артефакты
bun run src/compare.ts <run-a> <run-b>       # сравнить два прогона
```

Флаги: `--only`, `--tasks`, `--label`, `--repeat`, `--timeout-ms`, `--skip-judge`, `--keep-storage`, `--judge-only <run-id>`, `--calibrate`, `--reset-profile`, `--dry-run`.

Несовместимы (отклоняются с кодом 2): `--judge-only` с `--skip-judge`, `--dry-run` или `--calibrate`; `--calibrate` с `--skip-judge` или `--dry-run`.

Пункт чеклиста с `"requires_run": true` (как `honest-report`) не проверяется на калибровке: без прогона агента его нельзя оценить. То же для `"requires_result_file": true`.

## Что означают статусы

`completed` — код 0 и `.lgp` получен; `no_artifact` — код 0 без пакета; `failed` — код 1/4/130 (`failure_kind`: permission/recovery/cancelled/provider/tool/other); `timeout`; `interrupted` (Ctrl+C, не считается); `harness_error` — проблема harness/профиля, коды 2/3 останавливают прогон.

`judge_status`: с `--skip-judge` у **всех** попыток `skipped` (score `null`), независимо от артефакта. Без `--skip-judge` попытка без `.lgp` получает score 0 и `judge_status: no_artifact`. `scored` — валидный вердикт; `error` — отказ, таймаут или невалидный вердикт судьи после повтора (или убийство судьи по Ctrl+C). `harness_error` / `interrupted` и Ctrl+C до старта судьи тоже дают `skipped`.

Артефакты попытки: `<attempt>/judge/` (входы судьи и `verdict.json`), `<attempt>/judge-events-<n>.jsonl`, `<attempt>/judge-stderr-<n>.txt`. После `--judge-only`: `<attempt>/verdict.prev.json` (рядом с `judge/`) и `results/<run>/summary.prev.json`.

Известные причины `CLI_PERMISSION_REJECTED` (→ `failed/permission`): агент запросил `question`, зациклился (`doom_loop`) или обратился вне workspace (`external_directory`) — в headless-режиме такие запросы отклоняются автоматически.

## Сравнимость

`compare` предупреждает, если различаются модель агента, входы задач, рубрика, судья или порог. Смена Dock-skill/образа Loginom — отдельное предупреждение «изменилось окружение».

## Очистка хранилища

Скопированные артефакты удаляются автоматически (`--keep-storage` отключает). Остатки перечислены в `report.md`; снять всё по прогону:

```bash
docker exec loginom-server-master sh -c 'rm -f /workdir/UserStorage/user/eval-<run-id>-*'
```

## Ориентир шума

Заполняется после первого живого `--repeat 3` (пункт 5 приёмки в спеке): по задачам `min–max score` и `completed/attempts`. Пока не измерен — живой прогон отложен (см. ниже).

## Состояние приёмки (2026-09-18)

- `--dry-run --repeat 2` и `bun test` (95 тестов) — PASS.
- `--calibrate` живым судьёй `gpt-6-astra`/high — PASS: positive 100/100/100, negative 0/0/0 при порогах 90/40, ~40 с на вызов. Рубрика (`rubric_hash`) заморожена как baseline; менять `SPEC.md`/`checklist` после этого — значит терять сравнимость с будущими прогонами.
- Живой прогон агентом — **отложен**: профиль совместимости Dock-исполнителя `loginom-7.4.2-linux-chromium-ru` требует `bg.app.Version` ровно `7.4.2`, а локальный docker-стенд отдаёт `7.5.0-alpha+build.41839`, поэтому `dock_prepare` возвращает `INCOMPATIBLE / UI_BUILD_MISMATCH` и агент не может построить сценарий. Нужен стенд 7.4.2. Корпоративный `http://logi-test-plan.bg.local/app/` подходит по версии, но его хранилище недоступно через `docker cp` — для него потребуется источник артефакта через Web Client (Файловое хранилище → «Скачать») или смонтированное хранилище.
