# Журнал переноса на OpenCode v2.3.0

## B1.2a Дерево переноса

20–21.11.2026. Ветка `b12-migration`. Дерево — v2.3.0 (`a6b15d33da`) плюс пакеты и файлы форка из точки
отсечения `a080f7725c`. Файлы форка — добавленные после базы `810c0eba1a`:
`git diff --diff-filter=A --name-only 810c0eba1a a080f7725c` (13 789 путей; переименования git сюда не входят).
Коммит слияния с двумя родителями и перемер объёма — B1.2b.

### База и коммиты

База ветки — `0907f48ba7` (`secret-scan-upstream`): точка отсечения плюс правка сканера по В-93. Сканер проверяет
только то, что добавляет или меняет форк, а файлы, совпадающие с закреплённым v2.3.0 (`.gitleaks-upstream`),
пропускает. Относительно такой базы файлы форка не меняются. Правка сканера ещё на ревью владельца; если она
изменится, ветку перенесут на новую версию.

| Коммит | Что | `bun run secrets staged` |
|---|---|---|
| `39a5ee597b` | Часть OpenCode заменена на v2.3.0; пакеты, `docs` и прочие файлы форка — как в `a080f7725c`; файлы форка внутри пакетов upstream и корневой `script/` удалены (вход ручного переноса) | код 0, `upstream_findings` 614, 26 с |
| `beaf485e5d` | Схемы `loginom` и `v1/session` перенесены в `loginom-host`, зависимость — на `@opencode/schema` | код 0, `upstream_findings` 0 |
| `69b456b79d` | Корневые `package.json`, `AGENTS.md`, `.gitignore`, `bun.lock` | код 0, `upstream_findings` 0 |
| `bb8088bd83` | Этот журнал | код 0, `upstream_findings` 0 |
| `chore(migration): carry the fork root scripts` | Корневой `script/` форка (18) и `packages/script/tsconfig.update-feed.json` возвращены как есть, журнал поправлен | код 0, `upstream_findings` 0 |

`bun run secrets range a080f7725c HEAD` после коммита со `script/`: код 0,
`{"status":"clean","commits":16,"archives":0,"current_files":0,"skipped":[],"upstream_commits":0,"upstream_findings":614,"upstream_missing":0}`, 28 с.

Первая попытка (ветка `b12-tree` от v2.3.0: `21e1119633` — защита от секретов, `20e222ad80` — журнал) остановилась:
файлы форка становились новыми добавлениями, и прежний сканер давал 1324 находки в 402 файлах. Из них 149 — ключи,
уже проверенные в форке, но с исключениями, привязанными к SHA. Остальные 1175 — личные пути в старых файлах
форка. Правило о личных путях действует с 12.11. После В-93 и смены базы находок нет. `b12-tree` больше не нужна.

### Опись: что перенесено

Способ — `git checkout a080f7725c --pathspec-from-file=<список> --pathspec-file-nul` по списку добавленных файлов:
содержимое, режимы и символические ссылки как в форке, `.gitignore` v2.3.0 не мешает (`dist`, `logs/`, `tmp`).

| Группа | Файлов |
|---|---|
| `packages/loginom-runtime` | 2204 |
| `packages/loginom-host` | 288 |
| `packages/product` | 408 |
| `packages/dashboard` (В-85) | 111 |
| `apps/loginom-site` | 48 |
| `evals` | 2698 |
| `services/loginom-ai` | 3823 |
| `docs` | 3527 |
| `scripts` | 262 |
| `dashboard`, `deploy`, `reports` | 9 + 12 + 3 |
| `.agents`, `.claude/skills` (2 ссылки), `.cursor` | 5 + 2 + 3 |
| Корневые файлы форка: `TODO-FIX.md`, `WINDOWS_IMPLEMENTATION_PLAN.md`, `eval_parallel_blockers.md`, `plan.md` | 4 |
| `.github/workflows/{loginom-client-full,loginom-macos,loginom-windows,secrets,windows-native-check}.yml`, `.github/actions/setup-loginom-inputs` | 6 |
| Корневой `script/`: `migration/` 12, `build-windows.ps1`, `test-windows-profile.ps1`, `release-notes.ts`, `set-version.ts`, `update-feed.ts` и тест; `packages/script/tsconfig.update-feed.json` (конфиг для `script/update-feed.ts`). Нужны workflow форка (`loginom-windows.yml`, `release.yml`, `windows-native-check.yml`) — B5 | 18 + 1 |
| Защита от секретов: `.gitleaks.toml`, `.gitleaks-version`, `.gitleaks-upstream`, `.gitleaksignore`, `.husky/pre-commit`, `packages/script/src/{secret-scan,install-gitleaks}.ts` и три теста в `packages/script/test` — из базы `0907f48ba7` | 10 |

«Как есть» проверено: `git diff --name-status 0907f48ba7 HEAD -- <все перенесённые каталоги и файлы>` даёт только
21 удаление `docs/upstream/README.*`. Остальное побайтно совпадает с базой.

### Опись: что не перенесено и почему

- `.github/workflows/release.yml` — есть и в v2.3.0. Оставлена версия v2.3.0, версия форка — вход B5.
- Workflows, `.github/actions/setup-bun`, `README.md`, `SECURITY.md`, `.dockerignore`, `.gitattributes`,
  `turbo.json` и прочие файлы upstream, которые форк менял, — версии v2.3.0.
- `.husky/pre-push` — версия v2.3.0 плюс одна строка защиты форка `bun run secrets push "$1"`. Блок форка
  `LOGINOM_NODE_WORKFLOW` ссылается на `packages/opencode`, его нет — вход B5.
- Переименования форка: `docs/upstream/README.*.md` (21, корневые README upstream) и `.loginom-ai-agent/`
  (37, бывший `.opencode/`). Это бренд и идентичность — B1.3/B1.4.
- Файлы форка внутри пакетов и каталогов upstream — вход ручного переноса:

| Пакет или каталог upstream | Файлов форка | Состав | Куда |
|---|---|---|---|
| `packages/opencode` (в v2.3.0 нет) | 93 | `src` 36 (`cli` 15, `product` 7, `tool` 6, …), `test` 56, `script/publish-upstream.ts.disabled` | B2 |
| `packages/desktop` | 169 | `src` 34, `test/loginom` 45, `icons`/`resources` 67, `scripts` 21, `external-names.test.ts`, `electron.vite.config.test.ts` (есть и в v2.3.0) | B4 |
| `packages/app` | 65 | `src` 17, `public`/`public-static` 39, `e2e`/`test-browser` 9 | C |
| `packages/ui` | 18 | `src/assets` 13, `src/v2` 5 | C |
| `packages/core` | 1 | `test/flag-identity.test.ts` | B1.3 |
| `packages/schema` | 2 | `src/loginom.ts` и его тест — перенесены в `loginom-host`, см. ниже | — |

### Схемы и область имён

- `@opencode-ai/schema/loginom` → `packages/loginom-host/src/loginom.ts`. Файл форка без изменений, кроме импорта
  `./schema` → `@opencode/schema/schema` (`NonNegativeInt` и `optional` в v2.3.0 есть). Тест
  `packages/schema/test/loginom.test.ts` → `packages/loginom-host/test/loginom.test.ts` без изменений: 2 pass.
- `@opencode-ai/schema/v1/session` → `packages/loginom-host/src/session-v1.ts`. Хост берёт только `MessageID`; он
  перенесён дословно, `statics` и `ascending` — из `@opencode/schema`. Полный файл (676 строк) тянет десять
  внутренних модулей схемы, чьи экспорты в v2.3.0 другие.
- В пакеты upstream ничего не положено.
- Смена области: 1 зависимость в `packages/loginom-host/package.json` (`@opencode-ai/schema` → `@opencode/schema`).
  5 импортов (`loginom` — 3, `v1/session` — 2) стали относительными из-за переноса схем. Новых импортов
  `@opencode/schema/*` — 3 (`schema` ×2, `identifier`). Остальные вхождения `@opencode-ai/` не тронуты:
  текст сторонней лицензии в `loginom-host/licenses` (2) и строки проверки имён в
  `packages/product/test/names.test.ts` (2, задача B1.3).

### Изменения корневых и общих файлов

- `package.json`: скрипты `secrets` и `secrets:install` (как в форке); workspace `apps/loginom-site`; в catalog
  `@typescript/native-preview` `7.0.0-dev.20251207.1` (пин форка). Без него `catalog:` в `loginom-host`, `product`
  и `dashboard` не разрешается. Имя, версия и `packageManager` — v2.3.0.
- `AGENTS.md`: в конец дословно добавлен раздел «Loginom AI Agent: module map and current state» форка.
- `.gitignore`: блок `# Loginom AI Agent` из семи строк форка, включая `/packages/opencode/config.json` для пакета,
  которого в v2.3.0 нет.
- `.gitleaksignore`: версия форка. В v2.3.0 файл совпадает с базой `810c0eba1a`, так что это и есть результат
  трёхстороннего слияния.
- `packages/script/package.json` — версия v2.3.0 плюс зависимости сканера форка `@zip.js/zip.js` `2.7.62` и
  `tar` `7.5.22`: `secret-scan.ts` импортирует их при проверке архивов. Скрипты `typecheck` форка не перенесены.
  Нужна запись в `catalog.json` (B1.7).
- `bun.lock`: пересобран `bun install` (+94 −6). Новые workspaces и их зависимости; `services/loginom-ai` в lockfile
  нет.
- `turbo.json`, `tsconfig.json`, `bunfig.toml` — v2.3.0 без изменений. Задачи `@loginom-ai-agent/*#test` с
  `passThroughEnv` (`LOGINOM_AI_AGENT_TEST_NODE`) из `turbo.json` форка не перенесены — вход B1.7/B5. Корневые
  `bun run typecheck` и `check` теперь видят пакеты форка и будут красными, пока B1.5 не закончена.

### Приёмка на коммите `69b456b79d`

Чистое отдельное дерево на этом коммите, удалено после проверки. Bun 1.4.4 — переносной
(`<project-root>/.claude/worktrees/b0-journal/spike/oc2/.run/cache/bun-1.4.4/bun-linux-x64`), первым в `PATH` только
для этих команд; глобальный Bun 1.4.3 не менялся. Кэш — общий, он не мешал.

- `bun install --frozen-lockfile`: код 0, 1 с, 1600 пакетов, lockfile не изменился. Первый `bun install`, который
  писал lockfile, — код 0, 6 с. Его предупреждения не связаны с переносом: 4 патча «no longer applies» (строки этих
  пакетов в `bun.lock` не менялись); `bun pm untrusted` показывает заблокированные скрипты только у зависимостей
  upstream (`@tailwindcss/oxide`, `@sentry/cli`, `workerd`, `electron-winstaller`).
- `evals` не workspace (как в форке, свой lockfile): `bun install --frozen-lockfile` в `evals` — код 0.
- Typecheck — `bun typecheck` из каталога пакета. «Модуль не найден» — TS2307, TS2305, TS2306, TS2792.

| Пакет | Код | «Модуль не найден» | Прочие ошибки |
|---|---|---|---|
| `packages/loginom-host` (`tsgo`) | 2 | 2 | 4: TS2551 ×3 (Effect 4.1), TS7006 ×1 (следствие TS2307) |
| `packages/product` (`tsgo`) | 0 | 0 | 0 |
| `packages/dashboard`, `tsconfig.web.json` | 2 | 0 | 1: TS2551 (Effect 4.1) |
| `packages/dashboard`, `tsconfig.shell.json` (запущен отдельно: в скрипте он после `&&`) | 0 | 0 | 0 |
| `evals` (`tsc` 5.8.2 из своего lockfile) | 0 | 0 | 0 |
| `packages/loginom-runtime`, `apps/loginom-site` | — | — | скрипта `typecheck` нет |
| `services/loginom-ai` | — | — | нет `package.json` в корне, не workspace |

- Импортов пакетов (`@opencode/*`, `@loginom-ai-agent/*`, npm), которые не разрешаются, — 0.
- Две TS2307 в `loginom-host` — относительные импорты в файлы форка в `packages/desktop`, которые по заданию не
  переносятся. Оставлены как есть; уйдут, когда B4 перенесёт эти файлы:
  - `script/skills-acceptance.ts:11` → `../../desktop/scripts/release/manifest`; TS7006 в строке 106 — следствие;
  - `script/system-proxy-smoke.ts:60` → `../../desktop/src/main/proxy-env`.
- Effect 4.1, вход B1.5:
  - `loginom-host/src/cli-manifest.ts:42,88` и `dashboard/src/web/server.ts:29`: `Schema.UnknownFromJsonString`
    нет, есть `fromJsonString`;
  - `loginom-host/src/session-v1.ts:8`: `Schema.isStartsWith` → `isStartingWith`. Это ломает и загрузку
    `task-scope.ts` во время выполнения, значит, и тесты `loginom-host`, которые его импортируют.

### Где решал сам

- Пакет для схем — `loginom-host`, единственный потребитель среди пакетов форка. `v1/session` — только `MessageID`,
  а не 676 строк.
- `@typescript/native-preview` — одна строка в catalog, а не правка трёх манифестов форка.
- Корневой `script/` сначала не перенёс: в списке задания его не было. При приёмке координатор указал, что это
  файлы форка вне пакетов upstream. Они возвращены отдельным коммитом вместе с `packages/script/tsconfig.update-feed.json`.
- Тесты сканера `install-gitleaks` и `secret-workflow` оставлены, как в базе, вместе с `secret-scan.test.ts`:
  относительно новой базы их удаление ослабило бы защиту. По той же причине в `pre-push` v2.3.0 добавлена строка
  `secrets push`.
- `evals` не стал workspace, как в форке. `apps/loginom-site` — workspace, как в форке.
- Две TS2307 не убраны: меньшего решения, чем дождаться B4, нет. Перенос файлов `desktop` запрещён заданием, а
  исключение `script/` из `tsconfig` скрыло бы проверку остальных скриптов.
