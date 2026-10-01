# Eval harness Loginom AI Agent

Собирает сопоставимые результаты построения сценариев Loginom: прогоняет задачи через standalone CLI, забирает `.lgp`, сверяет экспорт с oracle и оценивает граф судьёй `codex exec`. `compare` показывает наблюдаемые дельты и ограничения выборки; статистический вердикт «лучше/хуже» пока не вычисляет. Дизайн: `docs/superpowers/specs/2026-09-18-evals-design.md`.

## Предпосылки

- Bun ≥ 1.3; Linux; preflight требует `unzip`, `git`, `pgrep`, `ps` и `docker` (когда источник артефакта — `docker`), минимум 1 GiB свободного места для evals и workspace.
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

`EVAL_AGENT_VARIANT=default` задаёт явный аргумент `--variant`; для reasoning low
укажите `EVAL_AGENT_VARIANT=low`. Настройка интерактивного CLI в `state/model.json`
не используется. Summary записывает переданный вариант: текущий JSON-поток CLI
не подтверждает фактически выбранный reasoning. В binary-режиме сохраняются
realpath/SHA256 исполняемого файла и source metadata соседнего manifest; git
harness записывается отдельно. Без manifest версия/source остаются неизвестными.

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

`completed` — код 0 и `.lgp` получен; `no_artifact` — код 0 без пакета; `failed` — код 1/4/130 (`failure_kind`: permission/recovery/cancelled/provider/tool/other); `timeout`; `interrupted` (Ctrl+C); `harness_error` — проблема harness/профиля; `infra_error` — известная ошибка запуска host/профиля до сессии, инструментов и токенов. Неизвестный сбой не исключается только из-за отсутствия sessionID. Коды 2/3 без подтверждённой стартовой причины останавливают прогон.

`interrupted`, `harness_error`, `infra_error` исключаются из метрик качества и
разброса; инфраструктурные и судейские сбои показываются отдельно. Расходы
непрерванных запусков сохраняются. `pass_rate` считается по оценённым попыткам,
отказ судьи с `pass=null` его не снижает. Доказанный провал oracle сохраняет
`pass=false` и входит в знаменатель даже при отказе судьи; `score=null` и
`judge_status: error` при этом сохраняются. Если измеренных попыток нет, показатель
равен `null`, а в Markdown выводится «—».

`pass` требует порога баллов и всех обязательных `checklist.required` и
`requires_result_file` пунктов. У задач с `oracle.csv` весь экспортный CSV
дополнительно проверяется детерминированно: все заголовки, строки, порядок и
значения; абсолютный числовой допуск `oracle_tolerance` по умолчанию 0.01.
Неверный CSV блокирует pass при любом score судьи. `oracle_pass_rate` — отдельная
ось результата; score остаётся оценкой чеклиста. Для oracle требуется ровно один
`*.result.csv`; отсутствие или несколько файлов дают провал проверки.
Калибровка исключает run/result-пункты и oracle; предупреждения дают код 1 после
сохранения отчёта.

`judge_status`: с `--skip-judge` у **всех** попыток `skipped` (score `null`), независимо от артефакта; oracle тоже пропущен. Без `--skip-judge` попытка без `.lgp` получает score 0 и `judge_status: no_artifact`. `scored` — валидный вердикт; `error` — отказ, таймаут или невалидный вердикт судьи после повтора (или убийство судьи по Ctrl+C). `harness_error` / `infra_error` / `interrupted` и Ctrl+C до старта судьи тоже дают `skipped`.

Артефакты попытки: `<attempt>/judge/` (входы судьи и `verdict.json`), `<attempt>/judge-events-<n>.jsonl`, `<attempt>/judge-stderr-<n>.txt`. После `--judge-only`: `<attempt>/verdict.prev.json` (рядом с `judge/`) и `results/<run>/summary.prev.json`.

`--judge-only` пересчитывает oracle у ранее оценённых `no_artifact` по текущей
рубрике: при наличии oracle отсутствие артефакта даёт `false`, без oracle — `null`.
Явный `--tasks` сохраняется в `summary.config.tasks_dir` и используется следующим
пересудейством без этого флага. Исходный `config.json` и `agent_inputs_hash`
сохраняют происхождение артефактов.

Известные причины `CLI_PERMISSION_REJECTED` (→ `failed/permission`): агент запросил `question`, зациклился (`doom_loop`) или обратился вне workspace (`external_directory`) — в headless-режиме такие запросы отклоняются автоматически.

## Сравнимость

`compare` предупреждает, если различаются модель/variant агента, входы (включая
хвост промпта), рубрика/oracle, модель/reasoning/промпт/схема судьи, лимиты задач
или порог. Смена бинарника/source — измеряемое изменение агента. Смена
Dock-skill/образа Loginom — предупреждение об окружении. Неравное число измеренных
или оценённых попыток отмечается отдельно; знаковые дельты сами по себе не
доказывают улучшение или регрессию. Старые неизвестные поля не считаются равными
известным. После изменения рубрик и правил хеширования нужен новый baseline.

`--judge-only` берёт каталог задач из сохранённого summary/config; явный `--tasks`
имеет приоритет. Каталоги без `task.json` пропускаются с предупреждением;
невалидный существующий task.json и явно выбранная отсутствующая задача дают отказ.

## Очистка хранилища

Скопированные файлы текущей попытки удаляются автоматически (`--keep-storage`
отключает). Пакет под другим именем из квитанции копируется, но вне пространства
имён попытки не удаляется; scan также ограничен текущей попыткой. Остатки
перечислены в `report.md`; снять всё по прогону:

```bash
docker exec loginom-server-7.4.2-test sh -c 'rm -f /workdir/UserStorage/user/eval-<run-id>-*'
```

CLI запускается в отдельной группе процессов; `.writer` снимается только после
её завершения. После копирования результатов и recovery очищаются диагностические
`runtime/generations/*/chats/*/attempts` (включая readiness), сохраняя авторизацию,
БД и долговечные stores. Pending recovery/connection, живая группа, владельцы
профиля по Linux `/proc` и симлинки защищены от удаления. Неопределённый orphan
host блокирует cleanup; незарегистрированные процессы не завершаются.
Сбой cleanup останавливает дальнейшие попытки с объяснением.

## Ориентир шума

Живой `--repeat 3`, run `20260922-112519-5c294179a` (2026-09-22). Дельты между прогонами ниже этого разброса не считаются изменением качества.

| Задача | min–max score | completed/attempts |
|---|---|---|
| calc-data-double | 0–0 | 0/3 |
| filter-active-rows | 0–0 | 0/3 |
| group-sum-qty | 0–0 | 0/3 |

## Состояние приёмки (2026-09-22)

- `--dry-run --repeat 2` и `bun test` (95 тестов) — PASS.
- `--calibrate` живым судьёй `gpt-6-astra`/high — PASS: positive 100/100/100, negative 0/0/0 при порогах 90/40, ~40 с на вызов. Рубрика (`rubric_hash`) заморожена как baseline; менять `SPEC.md`/`checklist` после этого — значит терять сравнимость с будущими прогонами.
- Живой прогон `20260922-112519-5c294179a` (`--repeat 3 --label baseline`) на контейнере `loginom-server-7.4.2-test`. Страница стенда сообщает `bg.app.Version` ровно `7.4.2`. Агент `xiaomi-token-plan-sgp/mimo-v2.6-pro`, судья `gpt-6-astra`/high. Completion 0/9, mean score 0; по каждой задаче score 0–0 и 0/3. Пакетов `.lgp` нет. `--judge-only` на этом run-id повторил те же score. Рубрика не менялась.
