# Исправления плана изоляции package-docs

Дата: 2026-10-06. Документ для агента, который дорабатывает
[план](2026-10-05-package-docs-isolation.md). Здесь собраны пробелы, найденные
при ревью плана, решения пользователя и выбранные способы устранения блокеров.
Это задание на правку плана, а не на реализацию: код, сборки, тесты и evals
в этой работе не запускать.

## 0. Исходное состояние

- Рабочее дерево `/home/kiselev/.codex/worktrees/2f7c/loginom-ai-agent`, ветка
  `docs-no-browser`. Ветка уже перенесена на `origin/loginom` `f6f9b0106`,
  HEAD `fc3d97dbf`. Ссылки вида `path:N` ниже даны для этого HEAD.
- Неотслеживаемые файлы: план, этот документ и
  [аудит](../../testing/loginom-ai-agent/skills-routing-audit-2026-10-05.md).
- Открытые PR не учитываются и не изменяются. Из PR #29 перенесены только
  решения из пункта 1.5.
- В плане заменить базу `8e1e1917c` на новую и перечитать файлы, изменённые
  upstream (этап 0).

## 1. Решения пользователя

1. **Единственный источник `loginom-automation` — приложение.** Skill лежит в
   `packages/product/skills/loginom-automation/` и поставляется с Desktop и CLI.
   Сервер Loginom Dock его больше не публикует; runtime продукта и harness evals
   его с сервера не читают. Снятие уже опубликованной записи — этап 9.
2. **Имя остаётся `loginom-automation`.** Общее имя `loginom` активировалось бы
   на любые вопросы о Loginom. Во всём плане заменить `loginom` как имя skill,
   каталога, slash-команды, профиля задачи и `run --command` на
   `loginom-automation`.
3. **CLI и TUI передают `.lgp` путём, как Desktop.** Байты пакета не кладутся
   в `data:` и не загружаются в Loginom.
4. **Итоговый отчёт пишется в рабочий каталог сессии**, а не рядом с `.lgp`.
5. **Из PR #29 перенести:** передачу корня ресурсов через `createSidecarEnv`;
   временный dev-мост через `skills.paths`; статический тест каталога skills
   (усиленный); правило «новый skill — новая папка»; постоянное правило в
   `packages/product/AGENTS.md` со ссылкой из корня; первый TDD-тест «bundled
   skill находится вне проекта» с корнем через `RuntimeFlags`, без `process.env`.
6. **Без изменений:** не создавать `loginom-scenario`; не добавлять
   `/package_docs`; только Linux Desktop и standalone CLI (`run`, TUI); TDD по
   одному поведению; перенос Python → Node; регрессия построения через evals.

## 2. Сквозные решения

Эти решения используются несколькими этапами. Внести их в раздел 2 плана и
ссылаться на них из этапов.

### 2.1. Один доверенный корень ресурсов

- Добавить в `packages/agent/src/effect/runtime-flags.ts` флаг
  `loginomResources` из `LOGINOM_AI_AGENT_RESOURCES` (имя в коде не занято).
  Значение — абсолютный путь к каталогу `resources/loginom`. Относительный или
  несуществующий путь отклоняется: bundled-источник не регистрируется,
  пользователь получает диагностику. Читать только через `RuntimeFlags`, как
  `disableExternalSkills`, а не через `Flag`.
- Из корня выводятся `skills/` (bundled skills), `bin/node` (исполнитель
  package-docs) и `resource-manifest.json` (целостность). PR #29 указывал на
  `resources/loginom/skills`; один корень вместо двух путей не даёт каталогу
  skills и Node разойтись.
- Desktop: `createSidecarEnv` (`packages/desktop/src/main/server.ts:227`,
  вызов в `spawnLocalServer`, `:74`) добавляет переменную. Значение берётся из
  `packages/desktop/src/main/loginom/desktop-service.ts:9–11`: в сборке
  `process.resourcesPath/loginom`, без упаковки
  `packages/desktop/resources/loginom` после staging.
- CLI: `standaloneRun` выставляет переменную из `standaloneBundle().resources`
  (`packages/agent/src/cli/standalone-bundle.ts`) до запуска backend `run`.
  Worker TUI наследует окружение родителя
  (`packages/agent/src/cli/cmd/tui.ts:223–225`). Standalone отклоняет
  `--attach` (`packages/agent/src/cli/standalone-run.ts:32–38`), поэтому
  backend всегда локальный и путь к файлу на диске ему доступен.
- `LOGINOM_AI_AGENT_CLI_BUNDLE` пропускает `verifyCliManifest`; bundled skills
  при этом всё равно проходят проверку из 2.3.
- В тестах корень передаётся через `RuntimeFlags.layer({ loginomResources })`,
  без изменения `process.env`.

### 2.2. Bundled-источник и зарезервированные имена

- `packages/product` получает Node-only export `./skills` по образцу
  `./cli-profile`: путь к `packages/product/skills`, зарезервированные имена
  `loginom-automation` и `package-docs`, устаревшее имя `package_docs`.
  Браузерный `src/index.ts` его не импортирует. Export используют staging
  (`loginom-host` зависит от `product`) и discovery (`agent` зависит от
  `product`).
- Discovery V1 (`packages/agent/src/skill/index.ts`):
  - bundled-источник регистрируется первым и только по записям
    `skills/<name>/SKILL.md` из `resource-manifest.json`, а не по glob каталога.
    Посторонняя папка в ресурсах bundled skill не становится;
  - зарезервированное или устаревшее имя из любого другого источника
    игнорируется с предупреждением и диагностикой для пользователя. Сейчас V1
    читает `~/.claude/skills`, `~/.agents/skills`, `.claude` и `.agents` вверх
    от каталога сессии (до корня git, без git — до `/`), config-каталоги,
    `skills.paths` и `skills.urls` (`:185–227`), и любой из них мог бы забрать
    имя продуктового skill;
  - загрузка становится последовательной в объявленном порядке. Сейчас
    `Effect.forEach(..., { concurrency: "unbounded" })` (`:240–243`), а
    совпадение имён только логируется и перезаписывает запись (`:125–139`),
    поэтому победитель случаен. Для незарезервированных имён сохранить правило
    «более поздний источник побеждает»;
  - один файл по realpath регистрируется один раз;
  - `Skill.Info` (около `:37–42`) получает `source` (`builtin`, `bundled`,
    `external`, `project`, `config`, `url`) и `digest` для bundled.
- Slash-команды: зарезервированное имя всегда принадлежит bundled skill.
  Одноимённая команда из конфига или MCP prompt игнорируется с предупреждением.
  Сейчас skill-команда молча пропускается, если имя уже занято
  (`packages/agent/src/command/index.ts:134–136`).
- В этапе 3 плана заменить семантику override («пользовательский skill заменяет
  bundled целиком и работает как обычный») этим правилом. Пункт о возврате
  встроенной версии переименованием локального файла удалить.

### 2.3. Целостность bundled skills

- Одна функция проверки в `packages/loginom-host` (владелец staging и manifest),
  например `verifyBundledSkills(resources)`:
  - сверяет sha256 каждого файла `skills/<name>/**` с `resource-manifest.json`
    и отклоняет файлы, которых нет в manifest;
  - проверяет обязательный набор: все относительные ссылки из `SKILL.md` и
    связанных `references/*.md`, плюс сгенерированные файлы, объявленные в
    frontmatter `metadata` (например, `loginom-generated: scripts/package-docs.mjs`).
    Шрифты и OFL становятся обязательными, потому что `SKILL.md` ссылается на
    них в разделе ресурсов; отдельный список в сборочных скриптах не нужен;
  - возвращает `digest`: sha256 отсортированных пар «путь, хеш» (64 hex). Это
    значение становится `Skill.Info.digest` и `skillRevision` runtime.
- Вызывают её backend при регистрации bundled-источника (sidecar Desktop и
  backend CLI) и `package_docs_run` перед запуском скрипта. Существующий
  `verifyResources` для этого не подходит: он требует, чтобы текущий процесс
  был bundled Node (`packages/loginom-runtime/src/resources.mjs:28`).
- Ошибка проверки: skill не регистрируется, пользователь видит диагностику
  «встроенный skill повреждён, переустановите приложение». Запасного пути через
  сеть или другие каталоги нет.
- Managed runtime при старте уже хеширует все файлы manifest
  (`verifyResources`), поэтому локальный skill в runtime проверяется без
  отдельного кода.
- Записать границу проверки: она защищает от повреждённой или неполной
  установки и случайной подмены, но не от того, кто может писать в каталог
  установки, потому что manifest лежит там же. Формулировку этапа 1 «подмена
  локального manifest не приводит к исполнению непроверенных инструкций»
  заменить этой.

### 2.4. Профиль задачи

- Профили: `default`, `package-docs`, `loginom-automation`. Имя `general`
  заменить: так называется субагент в `packages/agent/src/agent/agent.ts`.
  Поле `userMessageID` в `TaskScope` переименовать в `taskMessageID` — это
  сообщение, с которого началась задача.
- Профиль выводится чистой функцией из истории сессии. Новых таблиц и
  изменений публичной схемы сообщений не нужно.
- Начало задачи — последнее user message, в котором есть хотя бы одна
  несинтетическая часть и которое не является копией overflow-replay.
  Синтетические продолжения уже помечены `synthetic: true`: автопродолжение
  compaction (`packages/agent/src/session/compaction.ts`, около `:519–547`,
  плюс `metadata.compaction_continue`), итог subtask
  (`packages/agent/src/session/prompt.ts:436–452`), shell (там же, около
  `:474–492`). Overflow-replay копирует части исходного сообщения без пометки
  (`compaction.ts`, около `:468–493`): в метаданные копируемых частей добавить
  `compaction_replay_of: <id исходного сообщения>`. Сейчас цикл и admission
  берут самое позднее user message (`packages/agent/src/session/message-v2.ts:587`,
  `packages/agent/src/session/tools.ts:529`), и без этого правила compaction
  сбросит профиль посреди задачи.
- Записи активации после начала задачи, по порядку:
  - завершённая часть инструмента `skill` с
    `state.metadata.activation = { name, profile, digest }`. Её пишет
    `SkillTool` только для bundled зарезервированных skills; сейчас metadata —
    `{ name, dir }` (`packages/agent/src/tool/skill.ts`);
  - для slash-команды и `run --command`: текстовая часть с телом skill получает
    `metadata.skill_activation` с теми же полями. Текстовые части уже несут
    metadata (прецедент `compaction_continue`). Сейчас команда только вставляет
    текст (`packages/agent/src/command/index.ts:134–151`), и после restart
    профиль не из чего восстановить.
- Функция читает всю историю сессии из БД, а не окно после compaction. Поэтому
  профиль переживает compaction, restart, resume, revert и fork.
- Переходы:
  - новое начало задачи → `default`;
  - `default` → `package-docs` или `loginom-automation` после успешной
    активации. Новый набор инструментов действует со следующего provider-turn,
    потому что каталог строится на каждый ход;
  - `loginom-automation` → `package-docs` в той же задаче — только если у
    runtime чата нет незавершённой работы. Решает Host, он знает `activeWork`.
    Иначе `skill` возвращает ошибку «сначала завершите или отмените текущую
    операцию»;
  - `package-docs` → `loginom-automation` в той же задаче запрещён: `skill`
    возвращает «построение начинается новым запросом». Именно это не даёт
    документации искать сценарий в браузере;
  - повторная активация того же skill идемпотентна; обычный пользовательский
    skill профиль не меняет;
  - вызовы инструментов в ходе модели оцениваются по профилю начала хода, то
    есть по тому же снимку, что и каталог.
- Принуждение:
  1. `SessionTools.resolve` собирает каталог по набору профиля (2.5).
  2. Приватный метод HostPort `scope` (не инструмент модели): backend вызывает
     его при активации продуктового skill и в начале каждого хода. Host хранит
     scope на текущем run и сверяет с ним `tools`, `call` и `admit` до создания
     runtime, записи в журнал и upload; отказ — `LOGINOM_SCOPE_DENIED`. Один
     `acquire` живёт на весь цикл (`packages/agent/src/session/prompt.ts:1125`),
     повторный даёт `LOGINOM_CALL_BUSY`, поэтому новый run не создаётся.
  3. Субагенты: `task` создаёт дочернюю сессию, которая делает свой
     `LoginomHost.acquire` и получает полный каталог `loginom_*`
     (`packages/agent/src/tool/task.ts:156–212`). Поэтому в обоих продуктовых
     профилях `task` скрыт и отклоняется. В `default` дочерняя сессия —
     обычная сессия со своим профилем.
- Профиль не хранить в `session.permission`: поле `tools` в `prompt()`
  записывает его насовсем (`packages/agent/src/session/prompt.ts:1099–1106`),
  и он наследуется субагентами. `Permission.disabled` скрывает инструмент
  только при последнем правиле `* deny`
  (`packages/agent/src/permission/index.ts:204–213`) и для allowlist не подходит.

### 2.5. Инструменты по профилям

- `default`: обычные инструменты, Help (`find`, `search`, `read`, `grep`,
  `glob`, `list`, `tree`) и безбраузерная `loginom_dock_diagnostics`. Без
  `loginom_dock_prepare`, остальных `loginom_dock_*` и `package_docs_run`.
  System prompt уже обещает справку и диагностику без prepare
  (`packages/agent/src/session/prompt.ts:1328–1331`); без них справочные
  вопросы сломаются.
- `package-docs`: allowlist — `read`, `glob`, `grep`, `list`, инструменты
  записи (`edit`, `write`, patch), `todowrite`/`todoread`, `question` при
  включённом флаге, `skill`, Help, `loginom_dock_diagnostics`,
  `package_docs_run`. Всё остальное скрыто: `bash`, `task`, `webfetch`,
  `websearch`, MCP и plugin инструменты (среди них может быть браузер,
  например Playwright MCP), прочие `loginom_dock_*`. Именно allowlist, а не
  список запретов.
- `loginom-automation`: всё, что доступно сейчас, кроме `task` и
  `package_docs_run`. До создания runtime чата — Help и статическое определение
  `dock_prepare`; после — полный каталог runtime чата.

### 2.6. Справка отдельно от браузера

- На каждое поколение подключения — два вида дочерних процессов:
  - knowledge (`packages/loginom-runtime/src/knowledge-entry.mjs`): без
    Playwright и Chromium, получает только API key;
  - runtime чата (существующий `managed-entry.mjs`): создаётся лениво первым
    `dock_prepare` в профиле `loginom-automation`.
- Readiness с браузером удалить: `packages/loginom-host/src/host.ts:85–89`
  запускает его в `prepare`, `packages/loginom-runtime/src/managed-entry.mjs:104`
  входит в Loginom с `keepOpen: true`, `packages/loginom-host/src/host-port.ts:7–20`
  направляет туда справку и часть Dock-инструментов.
- `phase: ready` означает «учётные данные применены, knowledge-процесс прочитал
  каталог справки». Браузер при этом не запускается. Состояние браузерного
  входа хранится отдельно: `unknown`, `verified` или `failed`; его обновляют
  явная проверка и старт runtime чата.
- Сохранение настроек требует успешной проверки ключа справки. Результат
  проверки входа в веб-интерфейс показывается отдельно и при неудаче даёт
  предупреждение, а не отказ. Сейчас `save` принимает только `validationId`
  от `checkConnection`, то есть `checkKnowledge` плюс `loginBrowser`
  (`packages/loginom-runtime/src/connection-check.mjs:124–126`), и при
  недоступном веб-сервере Loginom справку впервые не настроить. Правило
  одинаково для мастеров Desktop и CLI.
- Knowledge-процесс обслуживает конкурентные запросы с отменой по id запроса;
  `interrupt` run отменяет только его запросы справки. Сейчас `interrupt` без
  runtime чата readiness не трогает (`host-port.ts:138–142`), а
  `managed-entry.mjs:192` отклоняет второй вызов при активном первом. Ошибки
  справки не пишутся в журнал неопределённых операций. При смене поколения
  старый knowledge-процесс закрывается вместе со своими запросами. Пароль в него
  не передаётся: сейчас supervisor получает подключение вместе с паролем
  (`packages/loginom-host/src/supervisor.ts:14`).
- Маршрутизация вызовов: Help — всегда в knowledge-процесс, даже если runtime
  чата уже есть; `dock_diagnostics` — безбраузерный вариант (ключ справки,
  локальная ревизия skill, состояние подключения и браузера);
  `dock_action_describe`, `dock_workspace_observe`, `dock_node_read`,
  `dock_operation_inspect` — только runtime чата. Метод `tools` (сейчас всегда
  поднимает readiness, `host-port.ts:112–115`) возвращает каталог по scope из
  2.5 и браузер не запускает.

## 3. Правки по этапам

### Этап 0. Окружение и базовые данные

- Записать новую базу и перечитать файлы, изменённые upstream:
  `packages/loginom-host/src/connection/connection-service.ts` (сохранённый URL
  стенда восстанавливается без миграции), `packages/loginom-host/src/node-client.ts`
  (бюджет старта поднят до 180 с, потому что старт ждал входа в браузер),
  `packages/loginom-host/script/build-cli.ts` (`--no-archive`), новые
  `packages/loginom-host/script/verify-cli-candidate.ts` и
  `script/cli-source-snapshot.ts`, `packages/desktop/scripts/release/artifact.test.ts`,
  `packages/loginom-runtime/client/lib/user-results.mjs` (CrossTable в
  `userWorkflowInstructions`), `packages/loginom-host/AGENTS.md`.
- Baseline CLI собирать из чистого detached worktree на SHA до изменений. В
  текущем дереве неотслеживаемые файлы дают `sourceDirty: true` (snapshot
  учитывает `git ls-files --others`), а `write-manifest.ts` Desktop на грязном
  дереве падает. Кандидатов CLI проверять `verify-cli-candidate.ts`.
- Обновить данные evals: harness в `/home/kiselev/git/loginom-ai-agent` уже на
  `f4fe42248` (в плане `91984c36d`); `agent-validation` закоммичен как
  `d5fb803` (в плане «незакоммиченные изменения на `0ad81c691`»). Пересчитать
  `agent_inputs_hash` и `rubric_hash`. Harness закрепить отдельным detached
  worktree: основной checkout продолжает меняться.
- Baseline evals снимать, пока сервер ещё публикует `loginom-automation`:
  baseline CLI скачивает его в `dock_prepare`.

### Этап 1. Каталог skills, staging и локальный источник

- Перенести `services/loginom-ai/skills/loginom-automation/` в
  `packages/product/skills/loginom-automation/` с тем же именем, а
  `.loginom-ai-agent/skills/package_docs/` — в
  `packages/product/skills/package-docs/` (имя и каталог `package-docs`;
  контракт `package_docs.structure.v1` не трогать).
- Description `loginom-automation`: создание, изменение и выполнение сценария в
  Loginom. Явно указать, что справочные вопросы о Loginom решаются справкой без
  этого skill, а документация по локальному `.lgp` — через `package-docs`.
- Текст skill собирать по runtime этой ветки после rebase: действующий
  `userWorkflowInstructions` из `user-results.mjs` (уже с CrossTable), а не
  тексты Dock-плагинов. Убрать неподдерживаемые raw UI, clipboard и
  Playwright, `node.add`/`link.create` через action API, обязательный Save As
  вопреки `package.save_checkpoint`, model `budget_ms`. Сохранить `sources.md`,
  URI справки и атрибуцию исходных материалов.
- В этот же этап перенести копирование `packages/product/skills/` в
  `resources/loginom/skills/` внутри `stageResources` до инвентаризации
  manifest. Electron-builder уже поставляет `resources/loginom`, менять его не
  нужно. Без этого шага runtime из следующего пункта не найдёт skill до этапа 3.
- Runtime: во всех режимах (managed `user-v1`, а также classic и diagnostic,
  которыми пользуется приёмочный инструментарий) заменить удалённый транспорт
  `createSkillLoader(skillTransport(config))` в
  `packages/loginom-runtime/client/lib/bridge.mjs` на локальный источник
  `<resources>/skills/loginom-automation`. Файлы уже проверены
  `verifyResources`; `skillRevision` — digest из 2.3 (64 hex, хуки его
  принимают); `skillPath` — локальный каталог; сеть не используется. Managed
  prepare перестаёт отдавать статический `userWorkflowInstructions` (он теперь
  в `SKILL.md`), но сохраняет `compactKnowledgeBundle`, `input_artifacts` и
  загрузку закреплённого action catalog.
- `client/lib/diagnostics.mjs`: проверку удалённого manifest skill заменить
  локальной; недоступность Skills API больше не влияет на `ok`.
- Переписать тексты для модели, которые станут ложными: `prepareTool.description`
  (`client/lib/skill.mjs:171–173`), MCP-инструкции и выдачу полного `SKILL.md`
  в `bridge.mjs` (около `:185–187`, `:280`, `:292`), `client/lib/hermes-router.mjs:20`,
  `client/lib/host-inputs.mjs:110`, фразу «then follow its verified
  instructions» в `packages/agent/src/session/prompt.ts:1330`. Добавить строку:
  браузерные инструменты Loginom появляются после загрузки `loginom-automation`.
- Снять публикацию со стороны репозитория: удалить исходную копию и
  `services/loginom-ai/deploy/loginom-dock/publish-skill.py` (или оставить его
  только отказом с объяснением). Обновить
  `packages/loginom-runtime/tools/loginom-acceptance/audit.py:65`,
  `replacement_session_evidence.py` (ожидает путь `skill-<revision>/SKILL.md`),
  `docs/migration/source-map.json`, документацию в
  `services/loginom-ai/docs/loginom-dock/`. Общий Skills API сервера остаётся.
  `verify-source-search.py` проверяет источник справки `ai-skills`, а не
  опубликованный skill, — его не трогать.
- Временный dev-мост из PR #29: в `.loginom-ai-agent/loginom-ai-agent.jsonc`
  добавить `"skills": { "paths": ["packages/product/skills"] }`. Относительный
  путь разрешается от каталога сессии, а не от файла конфига
  (`packages/agent/src/skill/index.ts:213`), поэтому мост работает только при
  открытии корня репозитория. Удаляется на этапе 3.
- Статический тест skills разместить в
  `packages/agent/test/skill/bundled-skills.test.ts`, а не в `packages/product`.
  Парсер frontmatter, которым пользуется discovery, лежит в `core`
  (`packages/agent/src/config/markdown.ts` вызывает
  `@loginom-ai-agent/core/config/markdown`), а `core` зависит от `product`,
  поэтому импорт из тестов `product` дал бы цикл. Тест проверяет:
  - разбор frontmatter тем же `ConfigMarkdown.parse`;
  - правила имени из спецификации: строчные буквы, цифры и дефис, без дефиса в
    начале и конце и без двойного дефиса, до 64 символов, совпадение с
    каталогом (тест PR #29 пропускал `package_docs`);
  - непустой `description` до 1024 символов, `compatibility` до 500, только
    поля `name`, `description`, `license`, `allowed-tools`, `metadata`,
    `compatibility`;
  - существование всех относительных ссылок из `SKILL.md` и связанных
    references, кроме объявленных сгенерированных файлов;
  - совпадение набора каталогов со списком зарезервированных имён из `product`;
  - понятные сообщения о том, как исправить ошибку.
- `skills-ref validate` в CI не ставить: это демонстрационная Python-библиотека,
  ссылки на ресурсы она не проверяет. Допустима разовая сверка версией,
  закреплённой по SHA, с записью в отчёт реализации.
- Тесты runtime: локальный источник без сетевых вызовов (транспорт-заглушка
  падает при любом обращении к `/api/v1/skills`); отсутствующий или изменённый
  файл skill даёт локальную ошибку prepare; диагностика работает без удалённого
  manifest. Fixtures `client/test/support/{bridge-contract,package-cleanup-bridge}.mjs`
  перевести на настоящий локальный bundle; подменять только внешние MCP и
  браузер.
- Готово, когда: в `packages/product/skills/` по одной записи
  `loginom-automation` и `package-docs`; в репозитории `/loginom-automation`
  и `/package-docs` работают через dev-мост; staging кладёт оба skill в
  `resources/loginom/skills/`; runtime не обращается к Skills API; статический
  тест зелёный.

### Этап 2. Генератор на Node и `package_docs_run`

- Контракт инструмента:

  ```ts
  type PackageDocsRun =
    | { operation: "extract"; lgp: string }
    | { operation: "skeleton"; lgp: string }
    | { operation: "emit"; lgp: string; format?: "pdf" | "docx" | "md" }
  ```

  Пути выбирает backend по каталогу сессии и пакету. Рабочие файлы лежат в
  `<каталог сессии>/.work/package-docs/<stem>-<8 hex от realpath>/`:
  `structure.json` и черновик `report.md` со скелетом и `PLACEHOLDER_*`.
  Итог — `<каталог сессии>/<stem>.lgp_report.<ext>`; если файл уже есть,
  выбирается `<stem>.lgp_report-2.<ext>` и далее. Запись идёт во временный
  файл того же каталога с эксклюзивной публикацией, существующий файл никогда
  не перезаписывается. В ответе инструмента — фактический путь. Формат по
  умолчанию — `pdf`.
- Модель заполняет плейсхолдеры правкой `report.md` обычными инструментами
  записи внутри каталога сессии, затем вызывает `emit`. `emit` отказывает,
  если остался хоть один `PLACEHOLDER_*` или нет обязательных разделов.
- Чтение `.lgp`: путь пакета, приложенного в user messages этой сессии,
  разрешён без запроса — вложение и есть согласие пользователя. Это тот же
  принцип, что у admission исходных байтов: путь от модели файл не авторизует.
  Путь, введённый текстом, проходит обычные `read` и `external_directory`:
  запрос в Desktop и TUI; в `run` такой запрос отклоняется автоматически
  (`packages/agent/src/cli/cmd/run.ts:856–868`), и ошибка должна советовать
  `--file`.
- Запись проверяется `ctx.ask({ permission: "edit", ... })`, поэтому
  пользовательские запреты и агент `plan` соблюдаются. `--auto` для `run` не
  нужен: всё пишется внутри `--dir`.
- Исполнитель: `<resources>/bin/node` и скрипт
  `<resources>/skills/package-docs/scripts/package-docs.mjs`; argv массивом,
  без shell; `cwd` — каталог сессии; минимальное окружение, таймаут, отмена по
  сигналу; хеш скрипта сверяется перед запуском (2.3). Без Loginom lease и без
  браузера.
- Размещение: реализация в `packages/loginom-host/src/package-docs/` (TS),
  сборка `packages/loginom-host/script/build-package-docs.ts` через `Bun.build`
  с `target: "node"` по образцу `build-node-host.ts`. Тонкий инструмент в
  `packages/agent/src/tool/package-docs.ts` добавляется в `SessionTools.resolve`
  только для профиля `package-docs`. В `packages/agent/src/tool/registry.ts`
  его не регистрировать: builtin-инструменты не фильтруются по профилю, а
  агент по умолчанию имеет `"*": "allow"`. Через `loginom.call` тоже не
  проводить.
- `stageResources` собирает `package-docs.mjs` в
  `resources/loginom/skills/package-docs/scripts/` до инвентаризации manifest.
  Шрифты искать от корня skill через `import.meta.url` (`../assets/fonts`), как
  Python ищет их от `scripts/`. Metafile сборки передать в
  `collect-build-notices.ts`.
- Зависимости: ZIP — `@zip.js/zip.js` 2.7.62 (уже есть у `agent` и `desktop`),
  объявить прямой зависимостью `loginom-host`; XML — `@xmldom/xmldom`.
  Библиотеки PDF и DOCX не нужны: собственный писатель Python (subset TTF,
  Identity-H, ToUnicode) переносится на `node:zlib`. Golos OFL добавить в
  `THIRD_PARTY_NOTICES`. Сохранить особенности чтения ZIP: имена без учёта
  регистра, разделители `/` и `\`.
- Сначала циклы паритета. Oracle: нормализованный `structure.v1`, текст скелета
  без строки локального времени, текст PDF через ToUnicode, `word/document.xml`;
  байты ZIP и PDF не сравнивать. Затем отдельные изменения поведения с тестами,
  которые падают на текущем Python и не питаются его выходом:
  - незаменённый `PLACEHOLDER_*` не создаёт файл (обязательно);
  - отсутствующий индексированный `Unit.xml` — явная ошибка (рекомендуется);
  - статистика по полному дереву либо явная пометка усечения (рекомендуется).
  Если последние два пункта не берутся, записать их как известные ограничения.
- Переписать `SKILL.md` package-docs: команды `python3` заменить на
  `package_docs_run`; выход — в каталог сессии; добавить раздел ресурсов со
  ссылками на шрифты и OFL; объявить `scripts/package-docs.mjs` в `metadata`
  как сгенерированный файл.
- В CI проверять PDF и DOCX без poppler: сигнатура `%PDF`, кириллица в
  ToUnicode, содержимое `word/document.xml`. Визуальный просмотр эталона —
  вручную.

### Этап 3. Bundled-источник в Desktop и CLI

- Реализовать 2.1–2.3. Удалить dev-мост из `.loginom-ai-agent/loginom-ai-agent.jsonc`.
- Правило «новый skill — новая папка»: `stageResources` копирует весь
  `packages/product/skills/`, manifest покрывает его автоматически,
  обязательные файлы выводятся из самого skill.
- По данным ревью команды `serve`, `web`, `acp`, `attach`, `mcp` в
  standalone-бинарник не входят, поэтому корень ресурсов нужен только `run` и
  TUI.
- Релизные проверки: `verify-artifact.ts` для DEB и AppImage дополнительно
  прогоняет функцию из 2.3 внутри артефакта. AppImage `package:linux` собирает
  всегда, `release.yml` проверяет его статически; формулировку «если
  распространяется также AppImage» убрать. Установленный запуск AppImage
  Docker-матрица не покрывает — отметить отдельно.
- V2-регистрацию (`packages/core/src/plugin/skill.ts`) убрать из критерия
  готовности: в Desktop V2 включается только `LOGINOM_AI_AGENT_SIDECAR_V2=1`,
  CLI его не использует.
- Готово, когда: установленные Desktop и CLI (`run`, TUI) с чистыми профилями,
  чистым `HOME` и пустым каталогом вне git видят оба skill с `source: bundled`;
  посторонний `loginom-automation` в `~/.agents/skills` игнорируется с
  диагностикой; повреждённый файл skill не даёт его зарегистрировать. Чистый
  `HOME` обязателен: без git обход вверх доходит до `/`.

### Этап 4. Справка без Chromium

- Реализовать 2.6.
- `run` (`packages/agent/src/cli/standalone-run.ts:72–83`): до модели остаётся
  только строгий recovery (код 4). Обязательные `hasApiKey` и `ready` убрать,
  потому что профиль задачи до ответа модели неизвестен. Контракт кодов
  сохранить, но проверять лениво: если run закончился без результата из-за
  ошибки конфигурации или подключения в продуктовой операции, код и имя ошибки
  те же, что сейчас (2 и `LOGINOM_CONFIG_REQUIRED`, 1 и
  `LOGINOM_CONNECTION_NOT_READY`). При `--command loginom-automation` профиль
  известен заранее, поэтому раннюю проверку ключа и готовности справки
  оставить. TUI не менять.
- Обновить правило `packages/agent/AGENTS.md` «Loginom preflight is mandatory
  for standalone run» и progress в
  `docs/superpowers/specs/2026-09-17-loginom-cli-standalone-design.md`.
- Старт не ждёт браузера, а `host.settled()` не ждёт сети. Бюджет 180 с в
  `node-client.ts` оставить как верхнюю границу.
- Статусы для пользователя: `packages/app/src/components/settings-loginom-state.ts`,
  уведомления о готовности и `loginom status` в CLI показывают готовность
  справки и состояние браузерного входа раздельно; тексты через i18n.
- Сохранить правило upstream: сохранённый URL стенда восстанавливается как есть.
- Тесты: старт без Chromium; справка при недоступном веб-сервере Loginom;
  сохранение при неудачном браузерном входе даёт предупреждение; конкурентная
  справка из двух чатов и отмена одного; смена поколения; в старт
  knowledge-процесса не попадает пароль.

### Этап 5. Профиль задачи и вложения

- Реализовать 2.4 и 2.5.
- Admission убрать из `SessionTools.resolve`
  (`packages/agent/src/session/tools.ts:529–547`). В профиле
  `loginom-automation` перед первым вызовом `loginom_dock_*` в ходе backend
  передаёт в `admit` все ещё не загруженные `data:`-вложения всех user messages
  сессии, каждое под id своего сообщения. Host уже идемпотентен по сообщению
  (`packages/loginom-runtime/src/managed-entry.mjs:170–181`,
  `packages/loginom-host/src/inputs.ts:29–32`) и отклоняет `admit` вне
  `loginom-automation`. Так CSV, приложенный до просьбы построить сценарий, не
  теряется. `.lgp` в admission не попадает. О загруженных файлах модель
  по-прежнему узнаёт из `input_artifacts` в ответе `dock_prepare`.
- `.lgp` путём в CLI и TUI:
  - `run --file x.lgp` создаёт `file:`-часть с абсолютным путём и MIME
    `application/x-loginom-package`. Сейчас при `LOGINOM_AI_AGENT_CLI_ROOT`
    байты уходят в `data:` (`packages/agent/src/cli/cmd/run.ts:409–432`), MIME
    `.lgp` определяется как `application/octet-stream`
    (`packages/core/src/fs-util.ts:225`), пакет распознаётся только в ветке
    `file:` (`packages/agent/src/session/prompt.ts:817`), а любая `data:`-часть
    с именем уходит в admission до модели;
  - TUI: вставка пути к `.lgp` создаёт такую же часть (сейчас
    `readLocalAttachment` принимает только изображения и PDF,
    `packages/tui/src/component/prompt/local-attachment.ts:44`);
    `@`-упоминание `.lgp` получает тот же MIME;
  - желательно: native picker Desktop для `.lgp` передаёт только путь, не
    читая байты в renderer (`packages/desktop/src/renderer/index.tsx`, около
    `:193`; общий лимит вложений 20 MiB).
- Ошибочные и устаревшие вызовы Dock: их нет в каталоге, и они не исполняются;
  Host дополнительно отказывает до runtime, журнала и upload.
- Пункт о «существующей очереди» переписать: в V1 очереди нет, очередь из
  корневого `AGENTS.md` относится к V2. Новое сообщение сохраняется, текущий
  вызов Loginom не прерывается, цикл подхватывает сообщение на следующей
  итерации, и оно начинает новую задачу с `default`. Открытый браузер остаётся.
  Нужен тест на гонку «сообщение пришло в момент выхода из цикла».
- Пункт «обновление каталога должно доходить до Desktop и CLI/TUI» удалить:
  каталог хода живёт только в backend, а клиенты кэшируют лишь список
  slash-команд (`packages/tui/src/context/sync.tsx:523`,
  `packages/app/src/context/global-sync/bootstrap.ts:282`).
- Составной запрос переформулировать. Выгрузки сохранённого пакета из Loginom
  на локальный диск в продукте нет: `dock_artifact_deliver` загружает файлы в
  Loginom, а не обратно. Поэтому после построения агент сообщает путь пакета
  в Loginom и просит приложить локальный `.lgp`, и только затем пишет
  документацию. Пункт «передать подтверждённый локальный `.lgp`» в этой
  итерации невыполним.
- Агент `plan`: `emit` отклоняется разрешением `edit` с понятной ошибкой.
- Старые сессии после обновления не содержат записей активации и начинают с
  `default`; чтобы продолжить сценарий, нужно снова активировать
  `loginom-automation`.
- Тесты `packages/agent/test/session/task-scope.test.ts`: вывод профиля из
  истории; автопродолжение и overflow-replay не сбрасывают профиль; итог
  subtask и shell — тоже; slash-активация переживает restart; каждая строка
  переходов из 2.4; `task` скрыт и отклоняется в продуктовых профилях; Host
  отклоняет вызовы вне scope; документация с `.lgp` и PNG не вызывает admission
  и не создаёт runtime чата.

### Этап 6. Выбор skill и полный результат

- Имена в матрице: `/loginom-automation`, `run --command loginom-automation`.
- Добавить близкие отрицательные запросы для `loginom-automation`: справочные
  вопросы о Loginom («что делает узел…», «как настроить…») и обычный разговор
  должны оставаться в `default`. Это проверка того, ради чего сохранено имя.
- Составной запрос проверять по новой формулировке из этапа 5.
- TUI: `.lgp` прикрепляется вставкой пути или `@`-упоминанием; `--file` и
  `--command` у TUI нет.

### Этап 7. Регрессия построения через evals

- Доработки harness — отдельными коммитами в ветке `evals` в отдельном
  worktree, до baseline; оба прогона — на одном закреплённом SHA. Основной
  checkout пользователя не трогать.
  1. Preflight не требует удалённого `loginom-automation`
     (`/home/kiselev/git/loginom-ai-agent/evals/src/preflight.ts:113–130`,
     `dockSkillRevision`). Проверка `/health` остаётся; источник и ревизия
     skill пишутся из ответа `dock_prepare`.
  2. В `run.json` записывать имя активированного skill и разделять причины
     неуспеха: не выбран `loginom-automation` до первых Dock-вызовов или не
     построен пакет. Сейчас `evals/src/cli.ts` хранит только имя инструмента.
  3. Ошибку подключения Host до первого успешного вызова Loginom считать
     инфраструктурной: после этапа 4 она возникает уже после хода модели.
- Блокирующий критерий — регрессия по стабильным кейсам baseline при любой
  причине; разбивка «выбор skill / построение» нужна для анализа. Допуск на
  лишний ход между активацией skill и `dock_prepare` и на рост числа вызовов
  записать до прогонов.
- Повторы infra-ошибок: с `f4fe42248` harness сам повторяет такую попытку один
  раз, хранит исходную в `infra_retry.initial`, а compare проверяет историю.
  Ручные повторы поверх запрещены; формулировки этапа 7 об этом обновить.
- Смену `skill_revisions` compare пометит как смену окружения — это ожидаемо,
  отметить в отчёте.
- `check_reference.py` для сверки с `oracle.csv` требует
  `~/.config/loginom-eval-case/env` (`AGENT_REPO` и другие ключи).

### Этап 8. Установленные Linux Desktop и CLI

- Новые имена в матрице и командах раздела 4.
- Готового счётчика запусков Chromium нет: наблюдатель окон работает только с
  X11 и только в headed-режиме. Нужна проверка по `/proc` и `--user-data-dir`
  внутри профиля продукта, включая старт и справку; в Desktop отделять Electron.
- Scripted oracle добавляет `loginom_` к каждому имени
  (`packages/loginom-host/script/oracle-provider.ts:129`) и не может вызвать
  `skill`. Менять вызывающий код (`packages/desktop/test/loginom/runtime-acceptance.ts`,
  `packages/loginom-host/script/desktop-cli-independence.ts`, transport), чтобы
  первым шагом шла обычная активация `loginom-automation`.
- Добавить шаги runbook, которых нет в матрице: `chrome-sandbox` с режимом 4755
  и владельцем root, `.writer` и `PROFILE_BUSY`, обновление CLI как остановка,
  удаление и новая установка, отказ `write-manifest.ts` на грязном дереве.
- Проверка обновления: старые сессии начинают с `default`.
- В разделе 4 плана заменить `packages/product/test/skills.test.ts` на
  `packages/agent/test/skill/bundled-skills.test.ts`.

### Этап 9. Снятие серверной публикации (после выпуска)

- Удалить запись `viking://agent/skills/loginom-automation` на серверах Dock
  только когда выполнены все условия: вышел выпуск с локальным skill;
  поддерживаемые установленные версии её уже не читают (прежние версии
  скачивают её в `dock_prepare`, и без неё построение сценариев у них
  сломается); baseline evals снят.
- До удаления предупредить владельца Loginom Dock: Codex- и Hermes-плагины Dock
  читают этот URI в `dock_prepare`. Репозиторий Dock в этом плане не меняется.
- Удаление — отдельная команда с явным подтверждением пользователя.

## 4. Документация и постоянные правила

- `packages/product/AGENTS.md` — владелец правила о skills: где они лежат; что
  их получают Desktop и CLI через общий staging; какие имена зарезервированы;
  как проверяется целостность; что новый skill — это новая папка и зелёный
  статический тест. В модульной карте корневого `AGENTS.md` добавить ссылку.
- `packages/agent/AGENTS.md`: момент admission (только в `loginom-automation`,
  перед первой сценарной операцией), новые правила `run`, профиль задачи.
- `packages/loginom-host/AGENTS.md`: knowledge-процесс, значение `ready`,
  проверка scope.
- `packages/loginom-runtime/AGENTS.md`: локальный источник skill, отсутствие
  сетевой загрузки.
- `packages/desktop/AGENTS.md`: `LOGINOM_AI_AGENT_RESOURCES` в окружении sidecar.
- Progress CLI-дизайна, Linux checkpoint и runbooks — по итогам этапа 8.

## 5. Первые TDD-циклы

1. Bundled skill находится вне проекта. Фикстура ресурсов строится тем же
   кодом инвентаризации, что и `stageResources` (без Node и Chromium). Корень
   передаётся `RuntimeFlags.layer({ loginomResources })`, каталог сессии
   пустой и вне git, `HOME` чистый. `Skill.all()` содержит оба skill с
   `source: "bundled"`.
2. Одноимённый skill из `.agents/skills` игнорируется с диагностикой.
3. Один realpath регистрируется один раз (dev-мост).
4. Изменённый файл bundled skill не даёт его зарегистрировать.
5. Запрос документации с `.lgp` и PNG: scripted LLM активирует `package-docs`,
   Host не получает `admit` и не создаёт runtime чата.

Каждый цикл — RED по ожидаемой причине, минимальная реализация, GREEN; запись
в progress плана.
