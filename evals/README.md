# Eval harness Loginom AI Agent

Собирает сопоставимые результаты построения сценариев Loginom: прогоняет задачи через standalone CLI, забирает `.lgp`, сверяет экспорт с oracle и оценивает граф судьёй `codex exec`. `compare` вычисляет отдельные вердикты «хуже / лучше / неразличимо» по completion, oracle и структуре, с отдельным признаком «не хуже», надёжностью pass^1/pass^k и наблюдаемым правилом 3/3 → 0/3. Дизайн: `docs/superpowers/specs/2026-09-18-evals-design.md`.

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
bun run src/compare.ts <run-a> <run-b> --margin 0.5 --confidence 0.95 --k 3
bun run script/check-compare-noise.ts > /tmp/evals-compare-noise.json # offline simulation
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
дополнительно проверяется детерминированно. Колонки сопоставляются по точным
именам (регистр и пробелы значимы), порядок колонок не проверяется; недостающая,
лишняя или повторяющаяся колонка даёт провал с перечислением имён. Число и
порядок строк проверяются, текст сравнивается точно, числа — с абсолютным
допуском `oracle_tolerance`, по умолчанию 0.01.
Неверный CSV блокирует pass при любом score судьи. `oracle_pass_rate` — отдельная
ось результата; score остаётся оценкой чеклиста. Для oracle требуется ровно один
`*.result.csv`; отсутствие или несколько файлов дают провал проверки.
Калибровка исключает run/result-пункты и oracle; предупреждения дают код 1 после
сохранения отчёта.

`judge_status`: с `--skip-judge` у **всех** попыток `skipped` (score `null`), независимо от артефакта; oracle тоже пропущен. Без `--skip-judge` попытка без `.lgp` получает score 0 и `judge_status: no_artifact`. `scored` — валидный вердикт; `error` — отказ, таймаут или невалидный вердикт судьи после повтора (или убийство судьи по Ctrl+C). `harness_error` / `infra_error` / `interrupted` и Ctrl+C до старта судьи тоже дают `skipped`.

После `infra_error` та же задача с тем же номером попытки запускается ещё один
раз, после подтверждённой очистки процессов, снятия stale `.writer` и проверки
готовности профиля. Ошибка очистки останавливает прогон. `no_artifact`, `failed`,
`harness_error`, `timeout` и `interrupted` автоматически не повторяются.
Ctrl+C запрещает новые запуски.

Итоговый `<attempt>/result.json` и одна запись в `summary.tasks[].attempts[]`
описывают последний запуск. Поле `infra_retry.initial` хранит первый сбой,
а его исходные файлы находятся в `<attempt>/infra-error/`. В качество входит
только итог; `infra_error_count` и cleanup-счётчики учитывают оба запуска.
Два инфраструктурных сбоя дают `infra_error_count=2` и ни одной quality-попытки.
Report показывает оба исхода, повтор помечен явно. `--judge-only` пересуживает
итог и сохраняет исходный сбой. Результаты без `infra_retry` читаются как прежде.

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

## Вердикт compare

Сравнение читает только сохранённые `summary.json`; профиль, Loginom и judge
для него не нужны. `EVAL_RESULTS_DIR` меняет каталог входов и Markdown-отчёта.
Входные summary не переписываются. Ошибки аргументов и формы JSON дают exit 2;
штатный отчёт, включая регресс или несравнимость, даёт exit 0.
`--margin` принимает [0,1), `--confidence` — (0,1), `--k` — положительное целое.

Каждая задача имеет равный вес, пары определяются ID. Из качества исключаются
infra_error/harness_error/interrupted. Прерванный прогон, несовместимая identity
или неполное покрытие нужной оси не дают статистического вывода; причины видны
в отчёте. Oracle использует явно применимый subset из snapshot. `mean_score`
сохраняется как справочная метрика. Общего verdict по смеси осей нет.

По умолчанию запас 50 п.п., confidence=0.95. Границы Hoeffding используют
независимые группы задач и шесть односторонних хвостов; зависимость повторов
внутри задачи допустима. Интервал относится к ожидаемому падению на объявленном
наборе. При 5 задачах h=1.383834057: одинаковые 5×3 дают «неразличимо» и
«не хуже — не доказано». При 25 задачах даже полное падение не доказывает
превышение запаса; для предельного случая нужно 39 независимых задач.
«Неразличимо» не доказывает равенство. Параметры выбирают до просмотра результата.

`pass^1` — средняя доля конечных успехов; `pass^k` — среднее C(c,k)/C(n,k),
то есть все k повторов успешны. При обменности повторов это оценка совместного
успеха, при iid — p^k; при неоднородных повторах это доля успешных k-подмножеств.
По умолчанию k равен общему repeat A/B, иначе нужен `--k`. Неполнота, неизвестный
pass или старое происхождение оценки делают reliability недоступной.
Правило 3/3 → 0/3 выводится отдельно для completion/oracle/pass только при
полных сравнимых данных и repeat=3; оно не доказывает 95% регрессии всего набора.

Три core-рубрики явно размечены `axis: structure | result | report`.
`structural_score` вычисляется только по structure при полной разметке;
прежние score/pass и calibration не изменены. Run сохраняет `rubric_snapshot`
на уровне задачи и `evaluation_contract_hash` (рубрика, judge, порог) каждой оценки.
Judge-only обновляет hash только фактически переоценённых попыток; сохранённые
старые оценки блокируют соответствующие новые выводы. Legacy без snapshot/
provenance не мигрируется автоматически. Axis меняет rubric_hash; нужен новый
baseline и проверка новой рубрики живым судьёй. Внешние коллекции не размечались.

Проверено 2026-10-05 в отдельной ветке `compare-verdict`: `bun test` —
**285 pass, 0 fail, 1222 assertions, 19 файлов**; `bun typecheck` — exit 0.
`bun run script/check-compare-noise.ts` — exit 0: seed `20261005`,
44 сценария × 20 000 = **880 000 сравнений**. Ложных inferential worse/better
и ложных подтверждений NI при истинном падении > 0.5 не наблюдалось.
Односторонняя 95% Monte Carlo верхняя граница для нулевого счётчика —
**0.01498% на сценарий**; совместная MC-гарантия по сценариям не заявляется.
Частота observed guard при неизменных вероятностях составила
**0.00–100.00% сравнений** и учитывается отдельно.
В симуляции группы задач независимы, повторы независимы или полностью зависимы;
A/B независимы либо полностью спарены. Три оси полностью коррелированы.
Это проверка выбранных сценариев, а не доказательство всех возможных зависимостей.
Независимый read-only review кода и скрипта: открытых замечаний нет.
Новый live baseline после разметки рубрики не запускался.

Полный контракт: [compare design](../docs/superpowers/specs/2026-10-05-evals-compare-verdict-design.md).

## Очистка хранилища

Скопированные файлы текущей попытки удаляются автоматически (`--keep-storage`
отключает). Пакет под другим именем из квитанции копируется, но вне пространства
имён попытки не удаляется; scan также ограничен текущей попыткой. Остатки
перечислены в `report.md`; снять всё по прогону:

```bash
docker exec loginom-server-7.4.2-test sh -c 'rm -f /workdir/UserStorage/user/eval-<run-id>-*'
```

Перед запуском management/агента harness берёт эксклюзивный sibling lease
`<profile>.harness-lease`. Профиль должен быть частным Linux eval-профилем без
параллельного ручного CLI/Desktop. `EVAL_PROFILE_DIR` и `EVAL_RESULTS_DIR` задают
отдельные каталоги; по умолчанию `.profile/agent` и `results`. Lease защищает от
второго harness; атомарный handoff с произвольным внешним CLI не обеспечивается.
Профиль канонизируется через realpath до lease и dispatch: symlink и прямой
путь используют общие lease/registration, CLI environment и проверки cleanup.

Каждый agent/setup/status/recover получает отдельный Linux subreaper launcher.
Один ledger хранит identity, происхождение launcher/cli/parent/subreaper,
admission pending/allowed/refused и browser binding. PGID/SID сохраняются для
проверок и аудита; принадлежность подтверждается живой цепочкой родителей или
усыновлением этим launcher. Launcher завершается последним.
Усыновлённый процесс с потерянной parent chain при выбранном browser остаётся
pending до проверки CLI или browser/helper admission. Неизвестный executable
вне bundle и его потомки не получают сигнал через generic descendant admission.

Общий supervisor опрашивает `/proc` каждые 100 мс и сохраняет UID/PID/starttime,
наблюдённое происхождение, executable и PGID/SID. Окно запуска опрашивается каждые
10 мс до browser binding, после него интервал возвращается к 100 мс; новое окно
ускоряет тот же observer. Устаревшие scans не накапливаются. Detached Chromium требует
точного executable выбранного bundle и точного browser-profile нового runtime.
Перед каждым сигналом identity проверяется снова; числовой PGID, EOF и код 0
сами по себе не доказывают завершение. Timeout/Ctrl+C сохраняют 30 с SIGINT,
затем SIGTERM 5 с и SIGKILL; подтверждение ограничено 60 с и двумя проходами.
Неизвестный helper/owner, недоступный релевантный `/proc` и подмена writer
запрещают переход; посторонние процессы не завершаются.

До recovery acknowledgement и pruning execution journals собственных runtime
сохраняются в `<attempt>/diagnostics/` с redaction, manifest, SHA-256 и read-back.
Auth/config/browser profile в архив не входят. Отдельные management receipts и
архивы лежат в `preparation/` и `<attempt>/management/`. Только после этого
снимается неизменившийся stale `.writer` и проверяется `ready`. Pruning удаляет
только архивированные каталоги, сохраняя прежние runtime, авторизацию, БД и
долговечные stores. Ошибка архива сохраняет исходные журналы.
Connection validation использует namespace `loginom/validation` с теми же exact
binding/origin проверками. Продукт удаляет validation chat без execution journal;
наблюдённый путь остаётся в receipt и `removed_validation_directories` manifest.
Исчезновение обычного runtime до архива запрещает продолжение.

`environment_cleanup` показывает `confirmed`, `failed` или `not_run`, ссылка
`evidence` ведёт к `cleanup.json`. Отсутствующее историческое поле означает «не
проверялось». `cleanup_error` относится только к удалению storage-артефакта.
Cleanup не меняет `no_artifact`/`failed`/`timeout`/`completed`, telemetry и метрики
качества; пересудейство сохраняет его. Отчёт показывает число проверенных
попыток и ошибок отдельно. Принудительное закрытие capture обозначается
`capture_complete: false` и не подтверждает завершение процесса.

При отказе записываются результат и summary/report с `stopped_reason`, прогон
завершается кодом 1 без следующего кейса. Guard, ownership evidence и runtime
сохраняются для расследования; stale harness lease автоматически не отбирается.
После подтверждённой очистки следующий кейс получает новый CLI/Session/runtime.
AMBIGUOUS не вызывает раннего прерывания или автоматического повтора и остаётся
открытым дефектом продукта внутри прежней сессии. Локальная очистка не доказывает
отмену операции на сервере Loginom; серверные остатки требуют адресной очистки
либо изолированного стенда.

Linux-приёмка и независимые PID-аудиты должны использовать один PID namespace:
отсутствие host PID в sandbox не доказывает завершение. Проверенный контроль
перехода и честные адресные результаты описаны в
[отчёте приёмки](../docs/testing/loginom-ai-agent/reports/2026-10-02-evals-cleanup-acceptance.md).

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
