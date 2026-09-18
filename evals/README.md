# Eval harness Loginom AI Agent

Измеряет, стал ли агент строить сценарии Loginom лучше или хуже: прогоняет задачи через standalone CLI, забирает `.lgp` из локального Loginom, оценивает судьёй `codex exec`. Дизайн: `docs/superpowers/specs/2026-09-18-evals-design.md`.

## Предпосылки

- Bun ≥ 1.3; preflight требует `unzip`, `git`, `pgrep` и `docker` (когда источник артефакта — `docker`).
- Локальный стенд Loginom в docker (`loginom-server-master`, `http://localhost/app/`, пользователь `user`).
- Отдельный API-ключ Dock для eval (не ключ Desktop): память OpenViking привязана к ключу. Dock должен отвечать этим ключом; preflight забирает манифест skill с `include_integrity=true`.
- Codex CLI с входом по подписке (`codex login`); судья — `gpt-6-astra`/`high`.
- Dev-bundle: `bun run prepare-bundle` (симлинки ресурсов Desktop + сборка host). Повторять после изменений в `packages/loginom-host`.

## Настройка

```bash
cd evals
bun install
cp .env.example .env   # заполнить LOGINOM_DOCK_API_KEY
bun run prepare-bundle
```

Целевой путь продукта — OAuth-модель `openai/gpt-5.6-sol` (`EVAL_AGENT_MODEL` как в `.env.example`). На этом стенде живой прогон идёт запасным путём: API-ключ провайдера `xiaomi-token-plan-sgp` и модель `xiaomi-token-plan-sgp/mimo-v2.5-pro` (раскомментировать `EVAL_AGENT_PROVIDER_*` в `.env`).

`assertAuth` пропускает вход, если блок `EVAL_AGENT_PROVIDER_*` совпадает с префиксом модели. Иначе провайдер должен быть в `$PROFILE/data/auth.json`. Два способа закрыть вход:

1. Скопировать запись нужного провайдера из Desktop `~/.local/share/loginom-ai-agent/auth.json` в `evals/.profile/agent/data/auth.json` (только нужный ключ провайдера, режим файла `0600`, никогда не коммитить).
2. Одноразовый `providers login` командой, которую harness печатает при первом запуске:

```bash
LOGINOM_AI_AGENT_CLI_PROFILE=$PWD/.profile/agent LOGINOM_AI_AGENT_CLI_BUNDLE=$PWD/.bundle \
  bun run --cwd ../packages/agent dev:cli providers login
```

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

Заполняется после первого живого `--repeat 3` (пункт 5 приёмки в спеке): по задачам `min–max score` и `completed/attempts`.
