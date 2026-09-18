# Выбор исходников Loginom AI Agent

Дата: 2026-09-16. Состояние реализации: F1/F2 выполнены для исходников;
первичный импорт F3 выполнен и побайтно проверен. Интеграция/ребрендинг продолжаются.

## Зафиксированный источник

Выбран `refs/heads/wow-landing` commit
`f0ecbb35a2e5e81e81821314cf6a3ba17df2beb0`. Он включает main
`9b46c85f68d054a27afad732d74785332098c0ba` и Linux
`a82cf65de409fe8c6735992d7ee8031e1466e1bb`. Относительно Linux добавляет
сайт, его тесты и исправления упаковки; runtime Linux не заменяется старой веткой.

Снимок SHA256: `06ad2c58ea3144cdd283837c58926adfba682da50310843ddbfc291a29f81d18`.
Повторное чтение refs/status/metadata до и после архива не выявило изменений.
Исходные worktrees не блокировались и не изменялись. Это стабильный снимок
исходников, не обещание остановки остальных задач или сохранения будущих изменений.

## Состав и решения

- `client`, `executor`, shared memory library и Loginom acceptance tools →
  `packages/loginom-runtime` с сохранением относительных путей.
- `landing` → `apps/loginom-site`.
- Серверные исходники, Rust/C++, Studio, deployment, знания, fixtures и документация →
  `services/loginom-ai`; внутренние относительные пути сохранены.
- `LICENSE` и `README_UPSTREAM.md` сохранены также рядом с runtime. Лицензии не менялись.
- Root AGENTS, старые host integrations/marketplaces, GitHub workflows и plugin
  examples → архив. Их инструкции и автозапуск не активируются в новом проекте.
- Ветка Cursor целиком сохранена в истории: generic host identity/router/download
  изменения рассматриваются при D1/D2 по контракту нового host. Cursor hooks,
  claims и plugin registration не импортируются в активный desktop.
- `codex/executor-linux`, `rl-bench`, backup branch и все служебные refs сохранены
  в истории без merge поверх актуального baseline. Старые PASS остаются историческими.
- Два stash состояния/родительские деревья сохраняются через reflog roots; в реальном
  источнике сейчас одна запись stash. Проверка двух stash выполнена отдельно fixture.
- Все 42 untracked Linux-файла сохранены в закрытом архиве без объявления готовыми.
  После оценки regression harness можно импортировать отдельным проверяемым изменением.

[Source map](source-map.json) содержит 5655 записей (включая две копии notices),
4951 активный файл, Git blob/tree/commit и SHA256. `archive` указывает на
`history.bundle`; точный объект определяется `commit` + `sourcePath`, не копией файла.
Импорт использует только сохранённые Git-объекты и не читает старый checkout.

## Проверки

- `python3 -m unittest test_inventory test_archive test_sources` из `script/migration`:
  6 tests PASS. Включены detached/reflog-only commit, staged/unstaged, два stash с
  untracked parents, symlink, private file, source drift, tampering/path escape,
  отказ overwrite и восстановление при недоступном оригинальном source path.
- Реальный restore: 45 refs, 97 history roots, 4 worktrees, 107 архивных файлов — PASS.
- `verify_sources.py --map ../../docs/migration/source-map.json --root ../..`:
  4951 imported files PASS до дальнейших преобразований.
- Локально проверено отсутствие действующего ключа из конфигурации Dock в активных
  импортируемых blobs. Значение не выводилось. Это проверка известного ключа,
  не утверждение об автоматическом распознавании всех возможных исторических секретов.

## Ограничения и следующий шаг

Runtime dependency install, тесты Dock в новом layout, product identity, desktop
интеграция и Linux сборка ещё не подтверждены. Рабочие server volumes не копировались.
История и приватная часть архива не предназначены для публикации.
Активные `.dock` diagnostic данные сохранены на исходных местах и исключены из
этого source-only архива; перед retirement нужен их отдельный согласованный снимок.
Следующий этап: связать новые workspace packages и реализовать F4/F5, затем D1–D7/R1–R7.

## Обновление RC9 2026-09-18

Источник: `/home/kiselev/git/loginom-dock` `main` =
`83c52ebb653e6bd7df294d4e24fc5545cb955b14` (RC9, предок — `f0ecbb35`).
Карта пересобрана из живых Git-объектов
(`build_source_map.py --repository /home/kiselev/git/loginom-dock
--ref 83c52ebb653e6bd7df294d4e24fc5545cb955b14`), не из нового архивного
снимка. Раздел 2026-09-16 выше сохранён как история исходного импорта.

Существующий архив `/home/kiselev/backups/loginom-migration/20260916-source-01`
содержит `f0ecbb35`, но не `83c52ebb` (`git cat-file -e` не находит объект).
Перед выводом старого репозитория нужен новый архивный снимок. `plugins/*`
остаются в disposition `archive` и не импортируются.

Поле `ref` в новой карте равно SHA `83c52ebb…`: `--ref` задан как commit,
а не как `refs/heads/wow-landing`.

### Состав карты

[Source map](source-map.json): 5749 записей, 5045 активных
(1190 runtime, 3821 loginom-ai, 34 loginom-site) и 704 archive.

### Слияние

Трёхстороннее применение 188 файлов runtime и 5 документов.
Два реальных конфликта:

- `client/lib/artifact-delivery.mjs`: локальный повтор `allowStaleFolder` и
  getter `unsettled` совмещены с upstream `navigationStep` /
  `preUploadResume` / `dock_artifact_delivery_resume`; после matched
  no-effect `UI_EPOCH_CHANGED` сбрасывается `navigationUncertain`.
- `client/test/action-catalog.test.mjs`: пути монорепозитория и
  `validateActionParameters`.

Автослияние с сохранёнными локальными адаптациями:

- `bridge.mjs`: `browserTransport`, `hasActiveWork`/`hasUnsettledWork`,
  затем `prepared.state.loginom_account ?? config.replayLoginUser` для
  acceptance cleanup;
- `executor.mjs`: lifecycle facades;
- `workspace-ui.mjs`: `MF;MainMenuForm`.

### Трансформации

`source-transforms.json`: 23 записи, собраны на HEAD `1988be3b6`.
Назначения:

- `packages/loginom-runtime/client/lib/artifact-delivery.mjs`
- `packages/loginom-runtime/client/lib/bridge.mjs`
- `packages/loginom-runtime/client/lib/executor.mjs`
- `packages/loginom-runtime/client/lib/session.mjs`
- `packages/loginom-runtime/client/lib/workspace-ui.mjs`
- `packages/loginom-runtime/client/test/action-catalog-lifecycle.test.mjs`
- `packages/loginom-runtime/client/test/action-catalog.test.mjs`
- `packages/loginom-runtime/client/test/artifact-delivery.test.mjs`
- `packages/loginom-runtime/client/test/executor.test.mjs`
- `packages/loginom-runtime/client/test/hooks.test.mjs`
- `packages/loginom-runtime/client/test/landing-cycle.test.mjs`
- `packages/loginom-runtime/client/test/landing-motion.test.mjs`
- `packages/loginom-runtime/client/test/landing-pointer.test.mjs`
- `packages/loginom-runtime/client/test/landing-transition.test.mjs`
- `packages/loginom-runtime/client/test/landing-variants.test.mjs`
- `packages/loginom-runtime/client/test/landing-voids.test.mjs`
- `packages/loginom-runtime/client/test/landing.test.mjs`
- `packages/loginom-runtime/client/test/user-results.test.mjs`
- `packages/loginom-runtime/client/test/workspace-ui.test.mjs`
- `packages/loginom-runtime/tools/loginom-acceptance/date-time-public-fixture-schema.mjs`
- `packages/loginom-runtime/tools/loginom-acceptance/test_provenance.py`
- `services/loginom-ai/deploy/loginom-dock/build-action-catalog.mjs`
- `services/loginom-ai/deploy/loginom-dock/publish-action-catalog.py`

### Проверки 2026-09-18

- `verify_sources.py --transforms`: PASS 5045.
- `python3 -m unittest test_inventory test_archive test_sources`: 6 OK.
- Client suite на pinned Node 24.19.0
  `/home/kiselev/.loginom-dock/current/runtime/node`: 2246 тестов,
  2244 PASS / 1 FAIL (устаревший `user-results`, исправлен в `1988be3b6`)
  / 1 SKIP. После фикса файлы `user-results` / `user-workflow` /
  `node-contracts` — 23 PASS.
- Runtime src: 11, затем 28 PASS после тестов start-input.
- Python-аудиторы: 786 тестов, 2 FAIL / 15 ERROR / 1 SKIP — все
  предшествующие (Python 3.10 `fromisoformat` Z / csv NUL; archived
  `plugins/`; путь документов `packages/loginom-runtime/docs/...` vs
  `services/loginom-ai/docs`).
- Host: 50 pass / 3 skip / 0 fail + typecheck OK.
- Agent tools: 3 pass.
- Desktop observed-click: 4 pass + typecheck OK.
- Product: 4 PASS.

### Продукт и host

`runtimeLockSha256` =
`e05c8ba33f055e321f04760d55eb9e23b00bfe011fe5a68a1118461cc2ae095a`
(lock version rc.8→rc.9, зависимости не менялись). Остальные пины без
изменений.

`runtime-acceptance.ts` больше не использует `dock_ui_action`; закрытие
пакета идёт через `acceptanceCleanupPackage` + `package-cleanup.json`
после `package.save_checkpoint`. `prompt.ts` и `inputs.ts` не менялись.
`managed-entry` проверяет `acceptanceCleanupPackage` в
`src/start-input.mjs`; `replayLoginUser` остаётся null (`config.mjs`
запрещает его без `replayBootstrap`); bridge берёт наблюдаемый
`loginom_account`.

### Ещё не закрыто

Живая Loginom runtime-acceptance нового runtime и приёмка установленных
артефактов остаются pending. Новый архивный снимок `83c52ebb` ещё не
снят. Экологические падения Python-аудиторов на 3.10 не чинились.
