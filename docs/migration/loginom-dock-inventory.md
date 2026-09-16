# Инвентаризация переноса Loginom Dock

Дата снимка: 2026-09-16. Назначение: сохранить необходимые исходники и историю
при объединении разработки в `loginom-ai-agent`, затем допустить удаление старого
репозитория только после проверенного восстановления. Этот документ не является
отчётом о выполненной миграции: копирование, архивирование и удаление не проводились.
Архитектурные решения: [дизайн desktop-продукта](../superpowers/specs/2026-09-16-loginom-ai-agent-desktop-design.md).

## Границы переноса

- Перенос охватывает клиент Dock, executor, серверные изменения и сборку,
  загрузку источников знаний, landing, тесты, проверочные инструменты и документацию.
- Активная интеграция — Loginom AI Agent. Прежние интеграции Codex/Hermes сохраняются
  в архиве исходников и истории; их развитие и установка не входят в новый продукт.
- Общие изменения из ветки Cursor оцениваются отдельно. Сохранение истории Cursor
  не означает продолжение поддержки этого хоста или перенос всех его настроек.
- Состав runtime определяет граф зависимостей: нельзя перенести только `client/`
  и считать сервер, сборку, общие модули и проверочные инструменты сохранёнными.
- Живые данные сервера, опубликованные ресурсы, установленный runtime и исходники
  имеют разные версии и резервируются отдельно.

## Проверенные refs и рабочие каталоги

Исходный Git common repository: `/home/kiselev/git/loginom-dock/.git`.
Полные SHA зафиксированы локально, без `fetch`; состояние удалённых серверов
не проверялось. `origin/*` ниже означает сохранённые локальные remote-tracking refs.

| Ref | Полный SHA | Содержание относительно main |
| --- | --- | --- |
| `main`, `origin/main` | `9b46c85f68d054a27afad732d74785332098c0ba` | Базовый RC8. |
| `linux`, `origin/linux` | `a82cf65de409fe8c6735992d7ee8031e1466e1bb` | 5 коммитов: Linux runtime, acceptance и общие исправления клиента. |
| `wow-landing`, `origin/wow-landing` | `f0ecbb35a2e5e81e81821314cf6a3ba17df2beb0` | 15 коммитов, включает linux, landing и исправления упаковки. |
| `cursor` | `dfa1103fbfaa9241493a1f153b2498c2cd529e5e` | 28 коммитов; Linux-ветка не включена. |
| `codex/executor-linux` | `5e24a1d187df3e0f8a023317448203caaff01248` | 31 собственный коммит на старой базе; main содержит 243 отсутствующих здесь коммита. |
| `rl-bench` | `306ba5c1e9f419648d9c5fb9fdc3bd575b03b9a1` | Benchmark design/research и tooling на старой базе. |
| `origin/rl-bench` | `64884f42a25e9242bfa03d505c9e14fd15799b32` | Другая старая база; не заменяет актуальный main. |
| `backup/linux-before-drop-merge-20260916` | `377acea54f226d085da40bd7618bc6a7b6ffc074` | Другая история, тот же tree, что у linux. |
| `refs/stash`, `stash@{0}` | `a4f15a77049ab6d1c182f8ecc050eb06229e67de` | Незавершённые изменения клиента, тестов и документации. |

| Worktree | HEAD / состояние на снимке |
| --- | --- |
| `/home/kiselev/git/loginom-dock` | `main @9b46c85f`, чистый. |
| `/home/kiselev/.codex/worktrees/8734/loginom-dock` | `wow-landing @f0ecbb35`, чистый. |
| `/home/kiselev/.codex/worktrees/929d/loginom-dock` | Detached `306ba5c1`; совпадает с локальным `rl-bench`, чистый. |
| `/home/kiselev/.codex/worktrees/ab96/loginom-dock` | `linux @a82cf65d`; 42 untracked файла, tracked modifications отсутствуют. |

Число untracked файлов выросло с 40 до 42 между чтениями: работа продолжается.
Этот снимок не заменяет согласованную остановку изменений и повторную инвентаризацию
непосредственно перед резервированием. Detached worktree сейчас имеет named ref;
для будущих detached HEAD такое покрытие нужно подтверждать заново.

## Выбор исходной версии

Кандидат baseline клиента — актуальный `main` вместе с пятью коммитами `linux`.
Это выбор для последующей интеграции и проверки, не заявление о новой приёмке.
`wow-landing` уже содержит эти коммиты; его landing и packaging необходимо сохранить
отдельным набором изменений, даже если внешний сайт выпускается позже приложения.

В `linux` находятся передача графического окружения X11/Wayland дочернему Playwright,
browser smoke, проверка фактических параметров Hermes в acceptance и исправления
дат фильтра, mapping группировки и карточек импорта. В `wow-landing` дополнительно
изменены `deploy/loginom-dock/build-client-bundle.py`, `package-client-source.py`
и `tests/unit/test_dock_client_packaging.py`.

`cursor` не опубликован в известных origin refs. Он содержит общую абстракцию хоста,
маршрутизацию, архивирование, persistent/headless Chromium, локаль `ru-RU`, обработку
скачивания и тесты. Оценить общие исправления отдельно от Cursor-плагина. Принудительный
headless, постоянные профили и правила входа не становятся настройками нового продукта
автоматически. В истории отмечен принятый N01; N02–N08 остаются открытыми.

`codex/executor-linux` содержит старые executor/recovery изменения, техническую
матрицу, отрицательные проверки и контроль сохранности архива. Сопоставить полезные
дельты с baseline по содержанию; перенос всей старой ветки может вернуть устаревший код.
Исторические результаты приёмки сохранять с их исходными runtime pins.

В локальном и remote `rl-bench` содержимое `evals/`, `rl-benchmark.md` и
`scripts/openviking-workspace-mcp.mjs` совпадает; полные деревья различаются старой
базой. Сохранять benchmark отдельно, не заменяя им дерево продукта.
Tree `linux` и backup-ветки совпадает: `454c55fc9a259a257de1a7f184aeb818424b6c89`.

## Незавершённая работа вне обычного экспорта main

В Linux worktree не отслеживаются два плана:
`docs/plans/2026-09-15-loginom-dock-cursor-support-plan.md` и
`docs/plans/2026-09-16-loginom-dock-client-regression.md`.
Остальные 40 файлов находятся в `evals/client-regression/`: десять кейсов и CSV,
manifest, oracle/tests, prepare/control, operators, reopen/download,
документы HARNESS-V2/V3 и CONTROL-V2. До включения в новый Git проверить состав
и отсутствие секретов; наличие файлов не означает готовность harness.

Stash содержит изменения `client/lib/node-procedure.mjs`, `workspace-ui.mjs`,
их двух тестов, `tools/loginom-acceptance/node_procedure_evidence.py` и его теста;
также сохранены два untracked документа:
`docs/loginom-dock/linux-sales-debug-2026-09-11.md` и
`docs/loginom-dock/local-source-mcp-ubuntu.md`.
Не применять stash к текущим checkout для инвентаризации; будущую проверку выполнять
в отдельном восстановленном окружении с исходной базой stash.

Ignored файлы, локальные credentials, browser profiles, evidence и runtime data
не исследовались и не считаются сохранёнными. Их наличие и необходимость хранения
установить отдельно, без включения секретов в Git, публичные архивы или manifest.

## Карта сохраняемых компонентов

| Компонент | Исходные области и необходимые связи |
| --- | --- |
| Клиент и executor | `client/`, `executor/`, используемые модули `examples/memory-plugin-shared/lib/`; runtime pins, package locks, каталоги и схемы. |
| Архив прежних хостов | `plugins/loginom-dock`, `plugins/loginom-dock-hermes`, Cursor-ветка и её plugin/tools; не регистрировать автоматически в новом приложении. |
| Сервер и сборка | `openviking/`, связанные `src/`, `crates/`, `sdk/`, build/package metadata и lockfiles по фактическому графу сборки; не ограничиваться deployment scripts. |
| Развёртывание | `deploy/loginom-dock/`, нужные Docker/Compose/Caddy inputs, build/publish/backup/restore/verify tools. |
| Знания | `deploy/loginom-dock/sources.yaml`, `deploy/loginom-dock/catalog.yaml`, import/inventory/audit tools, memory templates, правила публикации skills и action catalogs. |
| Сайт | `landing/`, связанные сборочные scripts, assets и тесты из wow-landing. |
| Проверки | `client/test/`, необходимые `tests/`, `tools/loginom-acceptance/`, benchmark/regression sources и fixtures; исторические evidence отдельно от новой приёмки. |
| Документация | `docs/loginom-dock/`, `docs/plans/`, README/INSTALL, операционные инструкции и checkpoints; старые AGENTS использовать как исторический источник, не заменять ими правила нового проекта. |

Предлагаемые назначения из дизайна: `packages/loginom-runtime` для исполнения,
`packages/loginom-host` для интеграции хоста, `services/loginom-ai` для сервера
и upstream tree с первоначальным сохранением относительных путей сборки,
`apps/loginom-site` для landing, `docs/testing/loginom-ai-agent` для проверок
и handoff, `docs/migration` для учёта переноса. Это планируемые границы;
перенос в эти каталоги ещё не выполнен. Окончательный manifest должен сопоставить
каждый исходный компонент с новым путём или защищённым архивом.

Репозитории `ai-skills`, `e2e-tests`, `loginom-help` — внешние источники ресурсов.
Перенос Dock сохраняет его механизм подключения и загрузки, но сам по себе не
копирует содержимое этих репозиториев или опубликованных `viking://` ресурсов.
Отдельно записать их доступность, revisions и восстановление knowledge ingestion.
Учётные данные доступа и содержимое живой базы не входят в source inventory.

Перед выпуском отдельно сверить deployed server revision, установленный клиент,
пины catalog/skill/browser и выбранные исходники. Эти величины сейчас не проверялись.
Существующий пакет дистрибутива не считается полным архивом разработки: подтвердить
его manifest, source SHA, dirty status, набор файлов и воспроизводимость отдельно.

## Сохранение лицензий и происхождения

Сохранять `LICENSE`, `README_UPSTREAM.md`, notices, заголовки и происхождение
переносимых файлов. У клиента в `client/package.json` указан `AGPL-3.0-only`;
состав Node, Chromium и прочих зависимостей требует сохранения их license/notice
файлов в сборке. Переименование продукта не удаляет upstream attribution.
Это учёт существующих материалов, без правовой интерпретации совместимости лицензий.

## Обязательные условия резервирования и удаления

1. Перед переносом согласовать прекращение записей, повторить refs/worktree/status
   inventory и записать полный состав, SHA и контрольные суммы разрешённых файлов.
2. Перечислить branches, tags, remote refs, служебные refs, detached HEAD каждого
   worktree, все записи stash reflog и нужные reflog-only checkpoints. Сохранить
   каждому выбранному корневому объекту явный backup ref в будущем архивном репозитории;
   отдельно записать соответствие исходных refs и архивных refs.
3. Не считать `git bundle --all` самостоятельной полной копией. Он не сохраняет
   незакоммиченные/untracked/ignored файлы, metadata worktrees и историю reflog как
   журнал; прежние stash/reflog-only объекты без удерживающих refs можно потерять.
   Проверить доступность нужных parent trees stash, включая сохранённые untracked.
4. Отдельно сохранить index/worktree изменения и безопасные untracked материалы.
   Secret-bearing ignored configs, серверные credentials и нужные private evidence
   резервировать вне Git в защищённом хранилище с ограниченным доступом. Не переносить
   browser profiles и runtime caches в исходники; решение о хранении принять явно.
5. Сделать отдельную согласованную копию серверных volumes/данных, ресурсов знаний,
   deployment settings и необходимых ключей. Git-архив не заменяет серверный backup.
6. В пустом изолированном каталоге проверить архив, восстановить необходимые refs,
   detached/stash состояния и рабочие материалы; сравнить SHA/trees и файловый
   manifest. Для секретной части проверить защищённое восстановление без печати
   содержимого. Архив должен находиться вне удаляемого repo и его worktrees.
7. Проверить новую сборку/тесты и восстановление серверной части отдельными этапами;
   исключить зависимости от абсолютных путей старого checkout, его worktrees,
   установленного wrapper и кешей. Подтвердить получение внешних knowledge sources.
8. Удалять старый repo/worktrees только после подтверждения покрытия всех выбранных
   материалов и восстановления, отсутствия активных задач и обновления операционной
   документации. Переезд исходников сам по себе не разрешает удаление серверных данных.

На этом этапе выполнены только чтение Git metadata/деревьев и составление документа.
Архивы, backup refs и manifests ещё не созданы; восстановление, тесты и сборка
не выполнялись. Снимок необходимо обновить перед началом реализации миграции.
