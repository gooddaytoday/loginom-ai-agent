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

## B1.2b Коммит слияния и перемер

21.11.2026. Ветка `oc2-migration` от `b12-migration` (`43b449d65a`).

### Коммит слияния

`3e6a995f9a` `chore(migration): record OpenCode v2.3.0 as the merged upstream` (В-83). Первый родитель —
`b12-migration` (`43b449d65a`), второй — v2.3.0 (`a6b15d33da`). Дерево `b12-migration` (`4360dd1c3a`) не менялось:

```sh
M=$(git commit-tree "b12-migration^{tree}" -p b12-migration -p a6b15d33da -F <сообщение>)
git merge --ff-only "$M"
```

Проверки на `3e6a995f9a`, Bun 1.4.4 первым в `PATH`:

| Команда | Вывод |
|---|---|
| `git diff b12-migration oc2-migration \| wc -c` | `0` |
| `git merge-base oc2-migration a6b15d33da` | `a6b15d33daf6ab7d35569f6d711fdb630b9f04e7` |
| `git merge-base oc2-migration a080f7725c` | `a080f7725ccf60b721d571c68b38e81375b806f2` |
| `bun --no-install packages/script/src/secret-scan.ts range a080f7725c oc2-migration` | код 0, 26 с: `{"status":"clean","commits":17,"archives":0,"current_files":0,"skipped":[],"upstream_commits":6784,"upstream_findings":614,"upstream_missing":0,"elapsed_ms":26377}` |

`commits` 17 — это 11 коммитов `secret-scan-upstream`, 5 коммитов B1.2a и слияние. 6784 коммита истории v2.3.0
пропущены по закреплению В-93. После коммита этого журнала `git diff b12-migration oc2-migration` показывает только
журнал.

### Перемер: способ

Числа исследования (15,4 тыс. и 21 тыс.) посчитал скрипт `rehome.py` сессии исследования LAB-1478. В репозиторий он
не попал. Скрипт восстановлен по журналу сессии, правила не менялись, добавлены только параметры. На старой точке он
даёт ровно числа исследования: 65/8 381, 308/7 051, 95/16 294, 157/4 856 (файлов/строк).

Входы. `O` — база форка `810c0eba1a` (v1.19.5), `F` — форк, `U` — upstream:

```sh
git diff --name-status --no-renames O F   # файлы форка: A, M, D
git diff --numstat --no-renames O F       # строки, добавленные форком
git diff --name-status -M -l30000 O U     # судьба файлов базы в upstream: D, R, M
git ls-tree -r --name-only U              # каталоги upstream
```

Правила:
- Пакеты upstream: `opencode`, `desktop`, `app`, `ui`, `tui`, `core`, `session-ui`, `cli`, `server`, `schema`,
  `script`, `sdk`, `plugin`. Пакеты только форка (`loginom-*`, `product`, `dashboard`) переносятся как есть и не
  считаются.
- Код — `.ts`, `.tsx`, `.mjs`, `.js`, `.cjs`, `.css`. Тест — путь содержит `/test/`, `.test.` или `/e2e/`.
- Строки — добавленные форком по `numstat`. Удалённые не считаются.
- Новый файл (A): «места нет», если его каталога нет в `U`; иначе «каталог есть».
- Правка (M или D): «места нет», если `U` удалил или переименовал файл (D или R); иначе «файл сохранился».
- Число исследования: для кода — новые файлы и правки с пометкой «места нет», для тестов — то же. «Каталог есть» и
  «файл сохранился» — трёхсторонний перенос, в 15,4 и 21 тыс. не входят.

Точки: старая — `9d482b7ebf` / v2.2.7 (`fedc6f208a`), новая — `a080f7725c` / v2.3.0 (`a6b15d33da`). Перекрёстные
`a080f7725c` / v2.2.7 и `9d482b7ebf` / v2.3.0 пофайлово совпадают со своими точками. Значит, переход v2.2.7 → v2.3.0
(192 коммита) это число не меняет: весь рост — код форка.

Таблицу 2b (CAT) пересчитал второй скрипт той же сессии, `catfate.py`. Он берёт маски `catalog.json` из `F` и тот
же `diff -M O U` и считает файлы форка со статусом M, D или T.

### Итог

Файлов / строк.

| | `9d482b7ebf` / v2.2.7 | `a080f7725c` / v2.3.0 | Разница |
|---|---|---|---|
| Код, новые, места нет | 65 / 8 381 | 72 / 9 302 | +921 |
| Код, правки, места нет | 308 / 7 051 | 330 / 7 971 | +920 |
| **Код — число исследования** | **15 432** | **17 273** | **+1 841 (+12%)** |
| Тесты, новые, места нет | 95 / 16 294 | 104 / 19 804 | +3 510 |
| Тесты, правки, места нет | 157 / 4 856 | 163 / 5 934 | +1 078 |
| **Тесты — число исследования** | **21 150** | **25 738** | **+4 588 (+22%)** |
| Трёхсторонне: код, новые, каталог есть | 13 / 2 398 | 15 / 2 518 | +120 |
| Трёхсторонне: код, правки, файл сохранился | 61 / 803 | 62 / 1 056 | +253 |
| Трёхсторонне: тесты, новые + правки | 19 / 3 384 + 28 / 544 | 24 / 4 749 + 29 / 703 | +1 524 |

Вне списка пакетов метода форк правил код в `enterprise` (2 файла / 11 строк), `http-recorder` (1 / 2), `sdk-next`
(1 / 10) и `web` (1 / 1), одинаково в обеих точках.

### По областям исследования

Строки раздела 2 исследования. Файлов / строк, старая точка → новая.

| Область | Код, новые | Код, правки | Тесты, новые | Тесты, правки | Куда |
|---|---|---|---|---|---|
| Новые файлы `opencode/src` | 33 / 5 233 → 36 / 5 696 | — | 44 / 9 300 → 48 / 11 603 | — | B2 |
| — швы `ProductHooks` (`product`) | 6 / 792 → 7 / 894 | | | | B2.1–B2.5 |
| — инструменты (`tool`) | 5 / 2 806 → 6 / 3 032 | | | | B2.5, B2.9 |
| — CLI (`cli`) | 14 / 1 208 → 15 / 1 342 | | | | B2.7, B2.9 |
| — `session`, `util`, `standalone.ts` | 8 / 427 → 8 / 428 | | | | B2 |
| Правки `opencode` в удалённых файлах (CAT-04…08) | — | 88 / 1 253 → 99 / 1 595 | — | 93 / 3 886 → 95 / 4 423 | B2 |
| Desktop | 20 / 1 963 → 20 / 1 984 | 90 / 1 026 → 90 / 974 | 45 / 6 439 → 49 / 7 597 | 7 / 278 → 7 / 303 | B4 |
| App (`packages/app`) | 8 / 746 → 12 / 1 183 | 105 / 4 536 → 114 / 5 104 | 5 / 347 → 6 / 396 | 52 / 667 → 56 / 1 183 | C |
| UI (`packages/ui`) | 4 / 439, без изменений | 3 / 35, без изменений | 1 / 208, без изменений | — | C |
| Ядро, TUI, прочие (`core`, `tui`, `cli`, `session-ui`, `sdk`) | — | 22 / 201 → 24 / 263 | — | 5 / 25, без изменений | B1.3, B1.7 |

Desktop в существующем каталоге `main/` (трёхсторонне, новые): 8 / 1 839 → 10 / 1 957. Это `update-policy`,
`proxy-relay*`, `system-proxy`, `log-retention`, `proxy-env`, `shutdown`, `fatal-exit`, а с B1.1 ещё
`dashboard-target` и `deep-links`.

### По пакетам

«Код» и «тесты» — число исследования, «трёхсторонне» — «каталог есть» и «файл сохранился». Строк, старая точка → новая.

| Пакет | Код | Тесты | Трёхсторонне, код | Трёхсторонне, тесты |
|---|---|---|---|---|
| `opencode` | 6 486 → 7 291 | 13 186 → 16 026 | — | — |
| `desktop` | 2 989 → 2 958 | 6 717 → 7 900 | 2 366 → 2 713 | 2 149 → 2 939 |
| `app` | 5 282 → 6 287 | 1 014 → 1 579 | 63 → 69 | 604 → 1 078 |
| `ui` | 474 | 208 | 58 | 0 → 9 |
| `core` | 78 → 121 | 8 | 31 → 49 | 180 → 312 |
| `tui` | 28 | 17 | 134 | 266 |
| `session-ui` | 65 → 84 | — | — | — |
| `sdk`, `cli`, `server` | 28, 2, 0 | — | 0, 7, 4 | — |
| `schema` | — | — | 63 → 65 | 55 |
| `script` | — | — | 475 | 674 → 793 |
| **Итого** | **15 432 → 17 273** | **21 150 → 25 738** | **3 201 → 3 574** | **3 928 → 5 452** |

`schema` и `script` закрыты в B1.2a: схема перенесена в `loginom-host`, сканер секретов взят из базы.

### Сверка с описью B1.2a

Опись считала добавленные файлы форка в пакетах upstream (`--diff-filter=A`, с поиском переименований). Метод
считает только код и без переименований. Пути метода проверены по дереву `oc2-migration`:
- файлов «места нет» в дереве нет;
- из «каталог есть» в дереве только файлы `script`, перенесённые из базы, и `desktop/electron.vite.config.test.ts`
  в версии v2.3.0;
- в файлах «файл сохранился» лежит версия v2.3.0.

| Опись B1.2a | Файлов | Код по методу | Строк: код; тесты |
|---|---|---|---|
| `packages/opencode` | 93 | 84 (src 36, test 48), места нет | 5 696; 11 603 |
| `packages/desktop` | 169 | 92: места нет 20 + 49, каталог есть 10 + 13 | 1 984 + 1 957; 7 597 + 2 799 |
| `packages/app` | 65 | 26: места нет 12 + 6, каталог есть 2 + 6 | 1 183 + 39; 396 + 1 012 |
| `packages/ui` | 18 | 5, места нет | 439; 208 |
| `packages/core` | 1 | 1, каталог есть (`flag-identity.test.ts`) | —; 100 |
| `packages/schema` | 2 | 2, перенесены в `loginom-host` | закрыто |
| Нет в описи: правки форка в файлах upstream, в дереве версия v2.3.0 | — | места нет 330 + 163, файл сохранился 62 + 29 | 7 971 + 1 056; 5 934 + 703 |

Остальные файлы описи — не код: иконки, ресурсы, `public`, фикстуры, `AGENTS.md`. Ещё 4 файла метод видит как
новые, а опись — как переименования. Это `opencode/bin/loginom-ai-agent`, темы `loginom-ai-agent.json` в `tui` и `ui`
(бренд, B1.3/B1.4) и тест `app/e2e/performance/unit/timeline-fixture.test.ts` (68 строк, входит в строку `app`). В
описи их нет, в дереве тоже.

Итого два числа:
- сравнимое с 15,4 и 21 тыс.: код **17 273**, тесты **25 738**;
- весь вход ручного переноса после B1.2a: код **20 325** = 17 273 + 1 996 (новые, каталог есть: `desktop` 1 957,
  `app` 39) + 1 056 (правки в сохранившихся файлах). Тесты **30 352** = 25 738 + 3 755 + 156
  (`electron.vite.config.test.ts`) + 703.

### Что выросло и почему

Число исследования, строк.

| Отрезок | Коммитов | Код, новые | Код, правки | Тесты, новые | Тесты, правки |
|---|---|---|---|---|---|
| `9d482b7ebf` → `6adfe42cea` (12–17.11) | 784 | +316 | +68 | +604 | +64 |
| `6adfe42cea` → `a080f7725c` (B1.1) | 237 | +605 | +852 | +2 906 | +1 014 |
| v2.2.7 → v2.3.0 | 192 | 0 | 0 | 0 | 0 |
| **Итого** | | **+921** | **+920** | **+3 510** | **+1 078** |

- **Дашборды узлов (В-85) — почти весь рост B1.1.** Часть файлов в `6adfe42cea..a080f7725c` меняли только коммиты со
  словом `dashboard` в заголовке. На них приходится +1 378 из +1 457 строк кода и +3 506 из +3 920 строк тестов.
  - `opencode`: +748 кода и +2 676 тестов, это весь рост пакета за B1.1. Новые файлы — `tool/dashboard.ts` 226,
    `product/dashboard-session.ts` 71, `cli/standalone-dashboard.ts` 20. Правки — `cli/cmd/run.ts` +62,
    `standalone-run.ts` +57, `tool/external-directory.ts` +51, `session/session.ts` +44, `runtime.stdin.ts` +44,
    `cli/cmd/import.ts` +35 и другие.
  - `app`: +611 кода и +477 тестов (`dashboard-links.ts` 147, `prompt-input/submit.ts` +119 и другие).
  - `desktop`: +353 теста (`dashboard-chat.ts`). Код — `dashboard-target.ts` 52 и `deep-links.ts` 28 — лёг в
    существующий каталог, трёхсторонне.
  - Сам `packages/dashboard` (56 файлов / 4 816 строк кода, 32 / 7 803 тестов) переносится как есть и в число не
    входит.
- Без дашбордов за B1.1: +35 строк кода и +410 тестов; ещё +44 и +4 — в файлах, которые меняли обе группы коммитов.
  Тесты — почти все Desktop: мастер первого подключения, `windows-sidecar-smoke`, `settings-ux`.
- `9d482b7ebf` → `6adfe42cea`: +384 строки кода (из них `app` +304) и +668 тестов (`desktop` +416).

Таблица 2b исследования, файлы форка в файлах upstream: всего · не тронуты · изменены · переехали · удалены.

| Запись | `9d482b7ebf` / v2.2.7 | `a080f7725c` / v2.3.0 |
|---|---|---|
| CAT-01 манифесты | 10 · 0 · 8 · 0 · 2 | 10 · 0 · 8 · 0 · 2 |
| CAT-02 CI, сборка | 46 · 2 · 14 · 3 · 27 | 47 · 3 · 14 · 3 · 27 |
| CAT-03 бренд | 669 · 251 · 325 · 1 · 92 | 669 · 75 · 47 · 452 · 95 |
| CAT-04…08 агент | 197 · 0 · 0 · 6 · 191 | 210 · 0 · 0 · 6 · 204 |
| CAT-09 Desktop | 96 · 1 · 9 · 2 · 84 | 97 · 1 · 10 · 2 · 84 |
| CAT-10 app, UI | 126 · 3 · 20 · 10 · 93 | 141 · 4 · 20 · 11 · 106 |
| CAT-11 TUI | 35 · 2 · 26 · 0 · 7 | 35 · 2 · 26 · 0 · 7 |
| CAT-12 ядро | 51 · 2 · 29 · 1 · 19 | 53 · 2 · 30 · 1 · 20 |
| **Итого** | **1230 · 261 · 431 · 23 · 515** | **1262 · 87 · 155 · 475 · 545** |

В отличие от числа исследования, здесь переход v2.2.7 → v2.3.0 важен. Перекрёстные точки дают:
- `a080f7725c` / v2.2.7 — 1262 · 263 · 433 · 24 · 542;
- `9d482b7ebf` / v2.3.0 — 1230 · 85 · 153 · 474 · 518.

В v2.3.0 `packages/web` переехал в `services/site`, вместе с ним 451 файл бренда CAT-03.

### Поправка оценки (предложение, план не менялся)

Правило перевода. Фаза 2 таблицы spike (7–11 дней) опирается на объём `opencode` старой точки: 6,5 тыс. строк кода и
13,2 тыс. строк тестов. Это ≈ 1,1–1,7 дня на тысячу строк кода с тестами. Desktop и бренд к строкам не привязаны,
там оценка экспертная.

| Задача | В плане | Предложение | Δ | Основание |
|---|---|---|---|---|
| B2.5 инструменты | в фазе 2 | без изменений | 0 | 2 806 строк в обеих точках |
| B2.1–B2.5, B2.7 без дашбордов | 7–11 | 7–11 | 0 | рост `opencode` вне дашбордов: +57 строк кода и +164 тестов, ≈ 1% |
| B2.9 дашборды, плагинная часть | 3–5 | 2–3 | −1…−2 | Измерено: 748 строк кода и 2 676 тестов в `opencode`. По правилу — 0,8–1,3 дня, по доле тестов (20% от 13,2 тыс.) — 1,4–2,2. Плюс день на связку с `packages/dashboard` и сессию из CLI. 2–3 дня — если все 748 строк уйдут в B2.9. Файлы, названные в B2.9, дают 338 строк; `run.ts`, `standalone-run.ts`, `import.ts` (+154) — B2.9 или B2.7a. Ещё 256 строк ни в какой задаче не названы: `external-directory`, `session.ts`, `runtime.stdin`, `prompt.ts`, `tools.ts`, `tool-contributor`, `grep`, `glob` и другие. Им нужна задача на checkpoint B1 |
| B4 Desktop | 8–14 | 8,5–15 | +0,5…+1 | Desktop-часть дашбордов (`dashboard-target.ts`, `deep-links.ts`, `dashboard-chat.ts`: 80 строк кода, 626 тестов) в 8–14 не входила. Ручной код Desktop не вырос (2 989 → 2 958), тесты +1,2 тыс. |
| B1.4 бренд | фаза 1: 3–5 | фаза 1: 2,5–4 | −0,5…−1 | CAT-03 на v2.3.0: изменены 47 и не тронуты 75 файлов вместо 325 и 251. 451 файл переехал в `services/site`, а `services/` B1.4 не трогает. Это только файлы upstream, которые форк уже правил. Новые файлы v2.3.0, которым нужен бренд, не мерились |
| App/UI | этап C | этап C | 0 в B | +1 005 строк кода (+19%) и +565 тестов — вход этапа C |
| **Итого B** | **44,5–75** | **43,5–73** | **−1…−2** | |

Предложение: В-88 (45–75) не менять. Перемер сдвигает оценку на −1…−2 дня. Работа, добавленная по итогам B0 (B1.3,
B2.3b, B2.6a, B4), здесь не оценена: это не объём кода, её оценят на checkpoint B1.

### Где решал сам и что не проверено

- Способ подсчёта восстановлен, поэтому своего способа нет: обе точки посчитаны правилами `rehome.py` и
  `catfate.py`. Скрипты лежат вне репозитория: задание разрешает менять только журнал.
- Рост привязан к дашбордам по слову `dashboard` в заголовке коммита. Это эвристика.
- Не перемерялись: пробное слияние (916 путей, раздел 3 исследования), счётчики идентичности `OPENCODE_*` и новые
  файлы v2.3.0, которым нужен бренд (B1.4).
- Метод, как и исследование, не считает не-код: подсказки `.txt`, иконки, `json`.
- Хук `pre-commit` в новом рабочем дереве не срабатывает: `core.hooksPath` — `.husky/_`, а этот каталог создаёт
  `husky` при `bun install`. Перед коммитом журнала `bun run secrets staged` (Bun 1.4.4) запущен вручную.

## B1.5 Bun 1.4.4, Effect 4.1, TS 6

21.11.2026. Ветка `b15-toolchain` от `oc2-migration` (`2c3e19df86`), отдельное рабочее дерево. Решение В-84.
Bun 1.4.4 — переносной (`<project-root>/.claude/worktrees/b0-journal/spike/oc2/.run/cache/bun-1.4.4/bun-linux-x64`),
первым в `PATH` только для этих команд; глобальный Bun 1.4.3 не менялся. Node — 24.19.0 (`<node 24.19.0>`, как в
B1.1). `bun install --frozen-lockfile` — код 0, 1600 пакетов; `.husky/_` появился, хук `pre-commit` срабатывал на
каждом коммите.

### Коммиты

| Коммит | Что | `bun run secrets staged` |
|---|---|---|
| `7819862a3b` `fix(loginom-host): use the Effect 4.1 schema names` | `session-v1.ts`, `cli-manifest.ts` | `clean` |
| `e6ab45f02e` `fix(dashboard): decode JSON bodies with Effect 4.1 fromJsonString` | `dashboard/src/web/server.ts` | `clean` |
| `9b47f3d861` `chore(loginom-host): check types with the v2.3.0 toolchain` | `package.json`, `tsconfig.json`, `bun.lock` | `clean` |
| `0962f217a0` `fix(loginom-host): pass the v2.3.0 lint rules` | `errors.ts`, два теста | `clean` |
| `5706f9d98a` `fix(loginom-runtime): pass the v2.3.0 lint rules` | 5 файлов `tools/loginom-acceptance`, `client/test/artifact-download.test.mjs` | `clean` |
| `f8f306869a` `chore(lint): keep a frozen evidence snippet out of oxlint` | новый корневой `.eslintignore` | `clean` |

Вне `loginom-host`, `loginom-runtime` и `dashboard` изменены только `.eslintignore` (новый), `bun.lock` и этот
журнал. Пакеты upstream и `.oxlintrc.json` не менялись.

### Версии

- **Effect** — `effect: catalog:` (4.1.0) был уже с B1.2a. Поменялись имена API, по образцу кода v2.3.0:
  `Schema.isStartsWith` → `Schema.isStartingWith`; `Schema.UnknownFromJsonString` →
  `Schema.fromJsonString(Schema.Unknown)` (`loginom-host/src/cli-manifest.ts` ×2, `dashboard/src/web/server.ts` ×1).
  `git grep` по всему дереву, кроме `docs` и `*.md`, после правки находит старые имена только в
  `script/ast-grep/rule-tests/no-json-parse-cast-test.yml`; ещё одно — в `AGENTS.md`. Оба файла — v2.3.0 как есть,
  не трогал.
- **TypeScript**, `loginom-host`, как в `packages/schema` v2.3.0:
  - devDependencies: `@typescript/native-preview` (пин форка `7.0.0-dev.20251207.1`) → `@typescript/native` и
    `typescript` из catalog;
  - скрипты: `typecheck` `tsgo --noEmit` → `bun check --no-script`; добавлен `typecheck:tsc` `tsc --noEmit`.
  - В v2.3.0 `typescript` — это `@typescript/typescript6` 6.0.2 с командой `tsc6` (сам сообщает `Version 6.0.3`), а
    `tsc` — из `@typescript/native` (`Version 7.1.0-beta`). Ни один скрипт v2.3.0 не вызывает `tsc6`. Поэтому
    «TS 6» здесь — зависимость `typescript` из catalog плюс ручной прогон `tsc6`. `loginom-host` проверен всеми:
    `bun check`, `tsc`, `tsc6` и прежним `tsgo` — 0 ошибок.
  - `tsconfig.json` (база `@tsconfig/node22`) не менялся, кроме `exclude` (ниже).
- **Bun** — `@types/bun: catalog:` (1.4.3) и override `bun-types` 1.4.4 уже как в v2.3.0. Сторонние материалы
  `loginom-host/licenses/bun` ещё на 1.3.14 — это B1.6.
- **`loginom-runtime`** — нечего поднимать: в `package.json` нет зависимостей и инструментов TS. Клиент живёт на своём
  npm-lockfile и Node 24.19.0.
- **catalog** не менялся. `@typescript/native-preview` в нём остаётся: им пользуются `product` и `dashboard`, их
  инструменты не трогались.
- **`bun.lock`** — `bun install` после правки манифеста: «no changes» в пакетах, в файле +2 −1, только блок
  `packages/loginom-host`:

```diff
-        "@typescript/native-preview": "catalog:",
+        "@typescript/native": "catalog:",
+        "typescript": "catalog:",
```

  Разница с v2.3.0: `git diff --shortstat a6b15d33da HEAD -- bun.lock` — `95 insertions(+), 6 deletions(-)` (B1.2a
  давала +94 −6). Сдвиг подъёма `@modelcontextprotocol/sdk` 1.32.2 → 1.29.0, `@hono/node-server`, `@xmldom/xmldom`,
  `cookie` — из B1.2a. Потребители upstream сохраняют прежние версии вложенными записями, например
  `@textjs/app/@modelcontextprotocol/sdk` 1.32.2.

### Typecheck до и после

«До» — `2c3e19df86`, «после» — `f8f306869a`. Команды запускались из каталога пакета.

| Пакет | Команда | До | После |
|---|---|---|---|
| `loginom-host` | `tsgo --noEmit` (прежний скрипт) | 6: TS2307 ×2, TS2551 ×3, TS7006 ×1 | 0 |
| `loginom-host` | `bun check --no-script` (новый `typecheck`) | 6, те же | 0, `No type errors in 170 files` |
| `loginom-host` | `tsc6 --noEmit -p .` | 6, те же | 0 |
| `loginom-host` | `tsc --noEmit` (новый `typecheck:tsc`) | — | 0 |
| `dashboard` | `tsgo -p tsconfig.web.json` | 1: TS2551 | 0 (и `tsc6` — 0) |
| `dashboard` | `tsgo -p tsconfig.shell.json` | 0 | 0 |

### Lint

`oxlint` до правок: 18 ошибок (510 предупреждений; предупреждения код не меняют). После: `Found 510 warnings and 0
errors`.

| Ошибки | Где | Решение |
|---|---|---|
| `no-restricted-globals` ×12 (`Reflect.ownKeys`) | `loginom-runtime/tools/loginom-acceptance`: `javascript-native-zero` 3, `javascript-calibration-wizard` 2, `javascript-native-details-discovery` 1, `javascript-native-input-binding` 2, `javascript-native-roundtrip-binding` 4 | Настоящая рефлексия: считаются собственные строковые и символьные ключи нативных объектов Loginom. Подавление с причиной одной строкой в начале каждого файла: `/* oxlint-disable no-restricted-globals -- Genuine reflection: … */`. Построчное подавление попало бы внутрь функций, которые уходят на страницу через `toString()`, и изменило бы их код. Строки этих файлов сдвинулись на одну; дизайн-документы JS-узла ссылаются на номера строк |
| `no-restricted-globals` ×2 (`Reflect.get` в ловушке `Proxy`) | `loginom-runtime/client/test/artifact-download.test.mjs:99,167` | `target[key]`: это то же, что `Reflect.get(target, key)` без receiver |
| `no-restricted-globals` ×1 | `loginom-host/src/errors.ts:108` | Типизированный доступ: `const fields: { actual?: unknown; limit?: unknown } = source && typeof source === "object" ? source : {}`. Результат `hostFailure` сверен с `HEAD` на шести входах, включая унаследованное свойство: совпадает |
| `no-restricted-globals` ×1 | `loginom-host/test/managed-work-entry.test.ts:246` | `"details" in error ? error.details : undefined` |
| `Identifier resources has already been declared` | `loginom-host/test/cli-install-native.mjs:48` | Первое объявление переименовано в `resourceManifest`. До правки скрипт не разбирался вовсе: `node --check` давал `SyntaxError: Identifier 'resources' has already been declared` |
| `Expected , or } but found ]` | `services/loginom-ai/docs/loginom-dock/node13-live-preflight/frozen-v2/full-change.mjs` | Файл не правился: в нём действительно не хватает `}`, а его sha256 закреплён в `frozen-v2/manifest.json`. Новый корневой `.eslintignore` с одним этим путём и причиной. `oxlint` читает `.eslintignore` по умолчанию, `.oxlintrc.json` upstream не менялся |

Остальные шаги `bun run lint` (`ast-grep`, `sdk-docs`, `check-greys`) проходили и до правок: код 0.

### TS2307 в `loginom-host/script`

Меньшее решение: в `loginom-host/tsconfig.json` добавлен `exclude` ровно двух файлов, а не каталога `script/`.
Остальные скрипты по-прежнему проверяются. Их никто из проверяемых файлов не импортирует: тест
`skills-acceptance.test.ts` запускает скрипт отдельным процессом.

Вернуть в B4, когда будут перенесены файлы `packages/desktop`:
- убрать `exclude` из `packages/loginom-host/tsconfig.json`;
- `script/skills-acceptance.ts:11` → `../../desktop/scripts/release/manifest`. TS7006 в строке 106 должна уйти вместе с
  этим импортом. От того же файла зависят 24 падения `test/skills-acceptance.test.ts`;
- `script/system-proxy-smoke.ts:60` → `../../desktop/src/main/proxy-env`.

### Тесты: база и итог

Пары «файл + имя» сравнивались по JUnit (`bun test --reporter=junit`, `node --test --test-reporter=junit`). Формат —
прошло / упало / пропущено.

| Набор | B1.1, `a080f7725c`, Bun 1.4.3 | База, `2c3e19df86` | После, `f8f306869a` | Новые падения |
|---|---|---|---|---|
| `loginom-host`, `bun test` | 534 / 2 / 12 | 395 / 64 / 12 и 10 ошибок загрузки, 471 тест, 255 с | 500 / 38 / 12, 550 тестов, 275 с | 0 |
| `loginom-runtime/client`, `node --test` | не гонялся | 9790 / 39 / 100, 9929 тестов, 454 с | 9790 / 39 / 100, 470 с | 0, набор упавших тот же |
| `loginom-runtime/tools/loginom-acceptance` (покрывает 5 правленых файлов) | не гонялся | 18833 / 8 / 0, 208 с | 18833 / 8 / 0, 191 с | 0 |
| `loginom-runtime/test` | не гонялся | 115 / 0 / 7, 7 с | 115 / 0 / 7, 7 с | 0 |

`loginom-host`:
- В базе 10 файлов не загрузились: `TypeError: Schema.isStartsWith is not a function`. После правки появились 89
  тестов, 17 перестали падать, новых падений относительно базы нет.
- `task-scope.ts` грузится: `test/task-scope.test.ts` — 18 / 0. Прямой вызов: `Info` принимает `msg_01`, отвергает
  `ses_01`, `permits("package-docs", "loginom-automation")` — `false`, `MessageID.ascending()` начинается с `msg_`.
- 550 тестов = 548 из B1.1 + 2 из `loginom.test.ts`, перенесённого в B1.2a. 38 падений против 2 в B1.1:
  - 2 — базовые падения стенда из B1.1: `managed-work-entry` «Expected refusal» (случай `denied`, `chmod 0` под root) и
    `cli-manifest` «archive verification preserves manifest modes under a private umask»;
  - 24 — `skills-acceptance.test.ts`: `Cannot find module '../../desktop/scripts/release/manifest'`, B4;
  - 9 — `skills-acceptance-turns.test.ts` (8) и `package-docs.test.ts` «native Calculator expressions…» (1): читают
    `packages/opencode/test/cli/package-docs-routing/` (`cases.json`, `fixtures/edit-source.lgp`), B2;
  - 3 — `bundled-ripgrep.test.ts`: сверяет текст `packages/core/src/ripgrep/binary.ts` и импортирует
    `packages/core/src/effect/layer-node.ts`. В v2.3.0 формат первого другой, второго файла нет. Это не Effect и не
    TS, в B1.5 не чинилось.
- Текст ошибок после правки прочитан у всех 38, причины — перечисленные выше. `cli-manifest` «…private umask» падает
  потому, что `verifyCliManifest` не отклоняет архив (`Received promise that resolved`), а не на разборе JSON. Оба
  места с `fromJsonString` проходят тесты `CLI manifest verifies complete payload…` и `Windows manifest requires
  matching resources…` (ветки `LOGINOM_MANIFEST_RESOURCE_INVALID` и `LOGINOM_MANIFEST_INVALID`).

`loginom-runtime`:
- Команды как в CI форка, `--test-concurrency=3` вместо значения по умолчанию из-за соседнего агента. Браузер для
  тестов (`LOGINOM_DOCK_TEST_BROWSER`) не задан, как в B1.1.
- 39 падений клиента одинаковы до и после, причины не разбирались. 34 из них — в `*.integration.test.mjs`
  (`loop-procedure` 12, `text-export-next` 11, `workspace-ui-export-combo` 6, `workspace-ui-export-owner-scan` 3,
  `lgd-import` 1, `node-port-output-datetime` 1). Остальные 5: `bridge`, `imports-database-procedure`,
  `log-regression-context`, `text-export-modes`, `variant-port-native`.
- 8 падений `tools`: `fault-wrappers` 6, `javascript-cold-source` 1, `javascript-native-datetime` 1, тоже одинаковы.
- Тесты `artifact-download.test.mjs` — 44 / 0 после правки.

### Команды и вывод

Из каталога пакета, Bun 1.4.4 первым в `PATH`:

```sh
cd packages/loginom-host && LOGINOM_AI_AGENT_TEST_NODE=<node 24.19.0> xvfb-run -a bun test --reporter=junit --reporter-outfile=<файл>
#  500 pass / 12 skip / 38 fail / Ran 550 tests across 65 files. [274.00s]
cd packages/loginom-host && bun run typecheck && bun run typecheck:tsc && ../../node_modules/.bin/tsc6 --noEmit -p .
#  $ bun check --no-script / ✓ No type errors in 170 files / $ tsc --noEmit / код 0 у всех трёх
cd packages/dashboard && bun typecheck   # код 0
```

`loginom-runtime`, Node 24.19.0 первым в `PATH`; клиенту перед этим нужен шаг `install` из `procedure.md`
(`npm ci --ignore-scripts --omit=dev --no-audit --fund=false --workspaces=false` в `client`, `added 100 packages`):

```sh
cd packages/loginom-runtime/client && node --test --test-concurrency=3 test/*.test.mjs
#  # tests 9929 / # pass 9790 / # fail 39 / # skipped 100
cd packages/loginom-runtime && node --test --test-concurrency=3 tools/loginom-acceptance/*.test.mjs
#  # tests 18841 / # pass 18833 / # fail 8
cd packages/loginom-runtime && node --test --test-concurrency=3 test/*.test.mjs
#  # tests 122 / # pass 115 / # fail 0 / # skipped 7
```

Полный `bun run check` из корня, один раз, на `f8f306869a`, чистое дерево: **код 0, 44 с** (`/usr/bin/time`: максимум
памяти одного процесса — 704 МБ; свободно было около 9 ГБ):

```text
$ bun run lint && bun run typecheck
Found 510 warnings and 0 errors.
sdk-docs: 270 declarations, 1009 members and 292 parameters documented in 21 files; 11 guide blocks match their source; 0 problem(s)
$ bun turbo typecheck --concurrency=3
@loginom-ai-agent/loginom-host:typecheck: ✓ No type errors in 170 files [360.80ms]
 Tasks:    38 successful, 38 total
Cached:    0 cached, 38 total
  Time:    30.734s
```

Хук `pre-push` целиком (`secrets push` и проверка версии Bun) не запускался: push не делался.

### Где решал сам и что не проверено

- **Инструменты TS.** В `loginom-host` взяты инструменты `packages/schema`. Это больший вариант: меньший — оставить
  `tsgo` с пином `native-preview` и добавить только `typescript` из catalog, он тоже даёт 0 ошибок. Выигрыш —
  пакет форка проверяется тем же `bun check` (и в CI — тем же `tsc`), что и пакеты upstream, а в манифесте
  остаются только версии из catalog. TS 6 в обоих вариантах — зависимость и ручной `tsc6`. Коммит `9b47f3d861`
  несёт и `exclude` для TS2307, поэтому замену инструментов не откатить одним `git revert`.
- **`.eslintignore`** вместо строки в `ignorePatterns`: задание запрещает менять конфиг lint upstream. Это новый
  корневой файл форка. При синхронизации его нужно учесть в `catalog.json` (B1.7).
- **Подавление `Reflect`** в `tools` — одно на файл, а не на строку: так код, уходящий на страницу, не меняется.
  Цена — правило выключено на весь файл.
- **Не чинил, записываю**:
  - `bundled-ripgrep.test.ts` (3 падения) завязан на внутренности `packages/core`, изменившиеся в v2.3.0: в
    `binary.ts` другой формат записи целей, `effect/layer-node.ts` удалён;
  - падения от отсутствующих файлов `packages/opencode` (B2) и `packages/desktop` (B4);
  - материалы `licenses/bun` на 1.3.14 (B1.6);
  - хэш `client/test/artifact-download.test.mjs` в `docs/migration/source-transforms.json` устарел ещё до B1.5:
    файл на `2c3e19df86` даёт `27753281…`, записано `6417439d…`. Не пересчитывал.
- В v2.3.0 есть `@opencode/schema/v1/session` с тем же `MessageID` (`isStartingWith("msg")`). `session-v1.ts` можно
  было бы заменить импортом, но это пересмотр решения B1.2a. Оставлено как есть.
- **Не проверено**:
  - браузерные тесты клиента с закреплённым Chromium и `desktop/test/loginom` (B4);
  - `turbo typecheck:tsc` по всему дереву (CI v2.3.0), в который теперь входит и `loginom-host`, — только
    `typecheck:tsc` в самом `loginom-host`;
  - тесты `packages/dashboard`: правка там только для typecheck;
  - Windows и macOS.

## B1.3a Идентичность и U5

21.11.2026. Ветка `b13a-identity` от `oc2-migration` (`2c3e19df86`). Rust `process-daemon` и системные каталоги
OpenCode (`/etc/opencode`, `%ProgramData%\opencode`, MDM-plist) — B1.3b, здесь не трогались. Bun 1.4.4 переносной
(`<project-root>/.claude/worktrees/b0-journal/spike/oc2/.run/cache/bun-1.4.4/bun-linux-x64`), первым в `PATH` только
для своих команд и `git commit`. `bun install --frozen-lockfile`: код 0, 1600 пакетов, `.husky/_` появился, хук
`pre-commit` срабатывал на каждом коммите.

### Коммиты

| Коммит | Что | `bun run secrets staged` |
|---|---|---|
| `b319b3e695` | `apply-identity.py`: пакеты v2 в `SOURCES`, новый путь `flag-identity` в `EXCLUDED` | код 0, `clean` |
| `66fae55ab3` | Каталог продукта `loginom-ai-agent` вместо `opencode`; тесты upstream с путями `opencode` | код 0, `clean` |
| `7ba8671268` | Шов U5 в CLI и Desktop, тесты, запись каталога CAT-13 | код 0, `clean` |
| `b86a3b1997` | `names.test.ts` на новых путях, `flag-identity.test.ts` возвращён в `cli` | код 0, `clean` |
| `dfc697f765` | Правило о службе в `AGENTS.md` | код 0, `clean` |
| `4eaa299b4b` | Этот журнал | код 0, `clean` |
| следующие два | Правки после ревью: тесты по навыку `unit-tests`; В-87 в `AGENTS.md` как требование; дополнения журнала | |

### Правки файлов upstream

Все — в новой записи каталога **CAT-13** «Product storage root and own background service (U5)». В `catalog.json` она
стоит перед CAT-09 и CAT-12, иначе файлы забрали бы `packages/desktop/**` и `packages/**`. В `catalog.md` — раздел
`## CAT-13` в формате остальных. `catalog-check.py` против `810c0eba1a` красный и до правки, каталог переводит B1.7;
прогон против v2.3.0 — в разделе «Тесты».

| Файл | Строк | Что |
|---|---|---|
| `util/src/global.ts` | +3 −1 | `const app = "loginom-ai-agent"`: данные, конфиг, состояние, кэш, журналы (`data/log`), `tmp` |
| `client/src/service-probe.ts` | +1 −1 | `fallback()`: регистрация по умолчанию в `<state>/loginom-ai-agent/service.json` |
| `desktop/src/main/native/logging.ts` | +6 −1 | Desktop собирает журналы службы из `loginom-ai-agent/log` |
| `cli/src/services/service-config.ts` | +21 −5 | U5: `identity()`, параметр `service` у `filename`, `defaultPort`, `legacyFilename`; без переноса чужого `service.json` |
| `desktop/src/main/service/sidecar-probe.ts` | +4 −1 | U5: зонд при старте ищет `serviceFile()` |
| `desktop/src/main/service/background-service.ts` | +5 −3 | U5: `serviceFile()` раньше канала `local`; каталог `service-local.json` — `loginom-ai-agent` |

Новый файл форка (в каталог не входит): `desktop/src/main/service/service-identity.ts`, 13 строк, `serviceFile()`.

Шов U5 общего вида: запускающий задаёт `LOGINOM_AI_AGENT_SERVICE_IDENTITY` и `LOGINOM_AI_AGENT_SERVICE_PORT`.
- Имя очищается как имя канала (`[^a-zA-Z0-9._-]` → `-`). Регистрация в `<state>/loginom-ai-agent/` и конфиг с паролем
  в `<config>/loginom-ai-agent/` называются `service-<identity>.json`.
- Порт берётся как задан, без свёртки win32 в блок `0x7000`: продукт выбирает порт ниже `0x8000`, тогда он одинаков на
  Linux и Windows. `service set port` (поле `port` конфига) по-прежнему главнее. Без порта — порт канала upstream:
  совпадение двух identity даёт явную ошибку «port … is already in use», а не подхват чужой службы.
- Под identity служба не переносит в свой файл `service.json` и хешированные файлы канала. В spike этого не было видно:
  из исходников канал `local`, а в нём перенос выключен. В установленной сборке (`latest`) `migrateRegistration`
  скопировал бы чужой `service.json` той же версии в `service-<identity>.json` — подхват чужой службы.
- Переключатель spike `LOGINOM_SPIKE_U5_DESKTOP` убран, имена `LOGINOM_SPIKE_*` не используются.

Кто задаёт identity и порт в установленном Desktop и в профиле CLI — **не сделано**, это B4 (Desktop) и B2.7c (профили
CLI). Сейчас шов включается только окружением запуска, как в spike. Desktop должен задать identity до
`startSidecarProbe` (`desktop/src/main/index.ts`): зонд читает окружение при старте.

### `apply-identity`

`SOURCES`: добавлены `ai`, `client`, `util`, `plugin[^/]*` (`plugin`, `plugin-browser`, `plugins`), `gui-plugins`,
`simulation`, `script`; убраны `opencode` и `enterprise` — в дереве v2.3.0 их нет. `theme` не добавлен: единственное
совпадение — имя темы `opencode.json` в тесте, это бренд. В `EXCLUDED` путь `packages/core/test/flag-identity.test.ts`
заменён на `packages/cli/test/flag-identity.test.ts`; `.github/archived/` в дереве нет, строка оставлена.

`python3 -I scripts/upstream-sync/apply-identity.py --repo . --check`: до правки `would change: 298 files`, после —
`335` (+37: `gui-plugins` 21, `client` 5, `simulation` 4, `plugin` 3, `script` 2, `util` 2; в `ai` только ключ
провайдера).

`merge_oracle.py` берёт `wants()` из этого же скрипта. Тесты процедуры на `oc2-migration` и на ветке одинаковы:
`python3 -I scripts/upstream-sync/test_tools.py` — `Ran 60 tests`, `OK`; `python3 -I scripts/upstream-sync/test_acceptance.py`
— `Ran 12 tests`, `OK` (109 и 107 с).

**Прогон скрипта по файлам: ни одного файла.** Каталоги данных скрипт не меняет вовсе — это константа `app`, правка
вручную. Остальное он менял бы во всём файле сразу, а набор не замыкается ни по одному имени:
- `util/src/global.ts`: `OPENCODE_CONFIG_DIR` читают ещё `cli/src/index.ts`, `cli/src/server-process.ts`,
  `tui/src/mini/theme.ts`, а `core/script/test.ts` и тесты `cli`/`tui` его задают;
- `cli/src/database-path.ts`: импорт `OPENCODE_CHANNEL` из `version.ts` — у него 27 упоминаний в `src`, у
  `OPENCODE_VERSION` — 43;
- `cli/src/server-process.ts`: `OPENCODE_PASSWORD` читает `cli/src/env.ts`, ставит `cli/src/services/standalone.ts`.
  Переименование в одном файле оставило бы пароль в окружении инструментов;
- `core/src/config/discovery.ts`: `opencode.json` и `.opencode` ищут ещё навыки, TUI и тесты `core`.

Поэтому имена `OPENCODE_*`, файлы `opencode.db`, `opencode-<канал>.db`, `opencode.json(c)`, `.opencode`, `opencode.log` —
в B1.4, массовым прогоном.

### Тесты

Новые:
- `packages/cli/test/service-identity.test.ts`, 5 тестов: разбор identity и порта, одинаковый порт на `linux` и
  `win32`; перенос чужих файлов под identity в каналах `latest` и `preview-a` (канал задаётся `bun --define`, как в
  сборке; без identity тот же перенос идёт — тест не пустой); проверка S5 (ниже).
- `packages/desktop/src/main/service/service-identity.test.ts`, 5 тестов: путь `serviceFile()` по окружению (в
  отдельном процессе: тестовых параметров в модуле Desktop нет по `packages/desktop/AGENTS.md`); настоящий
  `Service.discover` из `@opencode/client/service` с двумя поддельными службами той же версии — `service.json` чужой
  службы подхватывается, если его назвать, а по `serviceFile()` — нет, пока нет своей регистрации; своя находится.
- `packages/cli/test/flag-identity.test.ts`, 3 теста: CLI запускается сам (`debug paths`), с унаследованными
  `OPENCODE_CONFIG_DIR`, `OPENCODE_DB`, `OPENCODE_DISABLE_CHANNEL_DB`, `OPENCODE_TEST_HOME`, `OPENCODE_PASSWORD`,
  `OPENCODE_SERVER_PASSWORD`. Данные, кэш, состояние и журналы остаются в каталогах продукта — проходит. Два теста —
  `test.failing` до B1.4: сейчас конфиг, домашний каталог, БД и пароль идут за `OPENCODE_*`, а `LOGINOM_AI_AGENT_*` не
  читаются. Когда B1.4 переименует читателей, тесты станут красными и пометку надо снять. Не покрыты: `OPENCODE_CONFIG`,
  `OPENCODE_CONFIG_CONTENT`, `OPENCODE_DISABLE_PROJECT_CONFIG` читаются только внутри `serve`. Из теста форка выпали
  `OPENCODE_SERVER_USERNAME`, `OPENCODE_PURE`, `OPENCODE_PERMISSION`, `OPENCODE_TUI_CONFIG`: v2 их не читает.

`names.test.ts`: область `@opencode/*`; пакет агента — `@opencode/cli` в `packages/cli`; в `SOURCES` проверки
`OPENCODE_*` те же пакеты v2, `opencode` убран. Проверка `OPENCODE_*` помечена `test.failing` до B1.4: нарушений 387 до
правки и 446 после расширения `SOURCES`. Остальные проверки — зелёные.

Тесты upstream, где путь `opencode` записан литералом, переведены на `loginom-ai-agent`: `cli` — 7 файлов и
`script/service-smoke.ts`, `core/test/preload.test.ts` и `core/script/test.ts`, `server/test/fetch.test.ts`,
`util/test/global.test.ts`. В последнем добавлена проверка, что каталогов `opencode` нет.

Полные наборы, `oc2-migration` (отдельное чистое дерево в scratchpad) → `b13a-identity`:

| Пакет | Команда | До | После |
|---|---|---|---|
| `cli` | `bun test --timeout 60000` | 399 pass, 0 fail | 407 pass, 0 fail: +5 `service-identity`, +3 `flag-identity` |
| `core` | `bun run script/test.ts` | 7115 pass, 3 fail | 7115 pass, 3 fail — те же: `ShellParse > extracts static directory targets…` и два теста `flock` на недоступный для записи корень (прогон под root) |
| `desktop` | `bun test --timeout 30000` | 523 pass, 0 fail | 528 pass, 0 fail: +5 `service-identity` |
| `server` | `bun test` | 127 pass, 0 fail | 127 pass, 0 fail |
| `tui` | `bun test --timeout 30000` | 1672 pass, 1 fail | 1672 pass, 1 fail — то же: `the art stops every frame when hidden…` |
| `util` | `bun test` | 145 pass, 0 fail | 145 pass, 0 fail |
| `client` | `bun test` | 262 pass, 0 fail | 262 pass, 0 fail |
| `product` | `bun test` | 50 pass, 11 fail | 53 pass, 8 fail: ушли 3 падения `names.test.ts`; 7 падений `repo-paths.test.ts` и 1 `automation-routing.test.ts` — как на `oc2-migration` |

В падающем и до правки тесте `repo-paths` «catalog.json describes every file…» к 646 файлам без записи добавилось
`entries without divergent files: CAT-13`: проверка идёт против `810c0eba1a`, где пакетов v2 нет. Против v2.3.0
(`python3 -I scripts/upstream-sync/catalog-check.py --against a6b15d33da --summary`) у CAT-13 ровно 6 файлов, у CAT-12 —
10 тестов upstream; пустыми остаются CAT-04…CAT-11 v1 — это перевод каталога, B1.7.

Typecheck (`bun typecheck` из каталога пакета) до и после — 0 ошибок в `util`, `client`, `cli`, `core`, `product`,
`desktop`, `server`. `bun typecheck` в `desktop` тесты не проверяет, поэтому новый тест запускался отдельно.

Отдельные прогоны после коммитов:

```text
$ cd packages/cli && bun test test/service-identity.test.ts test/flag-identity.test.ts
 8 pass
 0 fail
 68 expect() calls
Ran 8 tests across 2 files. [9.26s]
$ cd packages/desktop && bun test src/main/service/service-identity.test.ts
 5 pass
 0 fail
 13 expect() calls
Ran 5 tests across 1 file. [54.00ms]
$ cd packages/product && bun test test/names.test.ts
 9 pass
 0 fail
 21 expect() calls
Ran 9 tests across 1 file. [642.00ms]
```

### Проверка `s5`

Перенесена в тест пакета: `packages/cli/test/service-identity.test.ts`. Службы — настоящие процессы
`bun src/index.ts serve --service` из исходников, с изолированными `HOME`, `USERPROFILE`, `TMPDIR`, `XDG_*`, как в
`env.ts`. Вместо пауз 6 и 12 с — опрос файла регистрации. Сценарии с identity `loginom-ai-agent-desktop` и
`loginom-ai-agent-cli-work` и явными свободными портами:
- два продукта в разных каталогах;
- два профиля в общих каталогах.

В обоих: обе службы живы, слушают свои порты, у регистраций разные `pid`, `/api/info` отвечает по своему паролю,
`service.json` не появляется, в общих каталогах ровно два файла `service-<identity>.json`. Базовые строки spike (без
U5) отдельно не повторялись. Подхват в общих каталогах без identity покрывает тест upstream «concurrent service
processes elect one server».

Две службы поднимаются за 2–3 с, весь файл — 7–9 с. Без шва регистрация называлась бы `service-local.json`, а
`identity()` и тест переноса до правки падали (проверено: 0 pass, 3 fail).

Защита от переноса проверена мутациями, каждая откатывалась `git checkout`:
- убрано `&& !identity()` в `paths` — падают оба случая, `latest` и `preview-a`;
- убрано `service ||` в `legacyFilename` — падает `preview-a`.

После ревью тесты приведены к навыку `.opencode/skills/unit-tests`: опрос ограничен сроком 30 с, а не числом попыток;
оба порта выбираются, пока заняты оба, иначе второй мог совпасть с только что освобождённым первым; таймауты тестов с
двумя службами — 60 с с комментарием; пробы `flag-identity` идут параллельно.

Для B2.7c:
- в сценарии «общие каталоги» у двух служб одна БД `opencode-local.db`. Тест доказывает, что службы не подхватывают
  друг друга, а не то, что профилям можно делить каталоги;
- identity и порт наследуют дочерние процессы службы. CLI, запущенный из терминала Desktop, получит identity Desktop,
  поэтому загрузчик профиля должен задавать обе переменные всегда, а не «если пусто».

### Каталоги и пароль службы

В тесте S5 рекурсивный обход изолированного корня не находит ни одного каталога `opencode` или `.opencode`. В `data`,
`config`, `state`, `cache` и `tmp` есть `loginom-ai-agent`, журналы — `data/loginom-ai-agent/log`. Пароль лежит в
конфиге службы и в регистрации. Тест проверяет, что он совпадает с паролем регистрации и что у обоих файлов права
`0600` (на Windows права не проверяются).

Ручной прогон CLI, корень — временный каталог в scratchpad:

```text
$ LOGINOM_AI_AGENT_SERVICE_IDENTITY=loginom-ai-agent-cli-work LOGINOM_AI_AGENT_SERVICE_PORT=24680 \
  HOME=<root> TMPDIR=<root>/tmp XDG_{DATA,CONFIG,STATE,CACHE}_HOME=<root>/… bun run src/index.ts debug paths
home       <root>
data       <root>/data/loginom-ai-agent
cache      <root>/cache/loginom-ai-agent
config     <root>/config/loginom-ai-agent
state      <root>/state/loginom-ai-agent
tmp        <root>/tmp/loginom-ai-agent
bin        <root>/cache/loginom-ai-agent/bin
log        <root>/data/loginom-ai-agent/log
repos      <root>/data/loginom-ai-agent/repos
db         <root>/data/loginom-ai-agent/opencode-local.db
$ … bun run src/index.ts service start
http://127.0.0.1:24680
$ find <root> -type d -name '*opencode*' | wc -l
0
$ ls <root>/{data,config,state,cache,tmp}
data: loginom-ai-agent
config: loginom-ai-agent
state: loginom-ai-agent
cache: bun loginom-ai-agent
tmp: loginom-ai-agent
$ ls -l <root>/config/loginom-ai-agent <root>/state/loginom-ai-agent
-rw------- service-loginom-ai-agent-cli-work.json
-rw------- service-loginom-ai-agent-cli-work.json
$ cat <root>/state/loginom-ai-agent/service-loginom-ai-agent-cli-work.json   # пароль скрыт
{"id": "3c400ed1-bd3c-487d-a0a9-61b97f7f8606", "version": "local", "url": "http://127.0.0.1:24680", "pid": 2311071, "password": "<redacted>"}
$ … bun run src/index.ts service status
http://127.0.0.1:24680
$ … bun run src/index.ts service stop
$ ls <root>/state/loginom-ai-agent
(пусто)
```

То же `debug paths` на `oc2-migration`: `data <root>/data/opencode`, `config <root>/config/opencode`,
`state <root>/state/opencode`, `db <root>/data/opencode/opencode-local.db`.

### Правило в `AGENTS.md`

Было: «Desktop and CLI own independent backend v1 processes and profiles. … do not introduce service discovery, client
leases, or Desktop profile migration». Стало: профили раздельные; на OpenCode 2 у каждого продукта и профиля своя
фоновая служба с U5 (В-79, CAT-13) — свой `service-<identity>.json` и явный порт, клиент находит только службу своей
identity; служба должна останавливаться вместе с приложением (В-87; v2.3.0 этого пока не делает, добавят B2.3b и
B4); не вводить службу, общую для Desktop и CLI, аренды
клиентов и перенос профиля Desktop. Первое предложение (проект `standalone CLI`, `c37913ab5`) не менялось.

### Заметки по Windows для B4.1

- Bun на Windows берёт домашний каталог из `USERPROFILE`, `HOME` не учитывает (B0.2, проверено на стенде). Тесты и
  обвязки задают оба.
- Без `XDG_*` корни v2 строятся от домашнего каталога (`util/src/global-roots.ts`): после B1.3a данные —
  `%USERPROFILE%\.local\share\loginom-ai-agent`, состояние и регистрация службы —
  `%USERPROFILE%\.local\state\loginom-ai-agent\service-<identity>.json`, а не `%APPDATA%`. Профили CLI 0.4 лежат в
  `%APPDATA%\com.loginom.aiagent\cli\profiles\…` (`product/src/cli-profile.ts`): перенос и выбор корня — B3 и B4.1.
- Desktop на Windows всегда удаляет `XDG_STATE_HOME` (`desktop/src/main/lifecycle/environment.ts`,
  `preferApplicationEnvironment`: оболочка входа на win32 не читается). Регистрация тогда в `%USERPROFILE%\.local\state\`.
  `serviceFile()` Desktop и `Global` CLI считают путь одинаково (`XDG_STATE_HOME`, пустое — как отсутствующее, иначе
  домашний каталог), если identity задана до запуска службы. По коду: зонд `startSidecarProbe` идёт раньше
  `preferApplicationEnvironment`. Если окно запущено с `XDG_STATE_HOME`, зонд посмотрит в другой каталог и не найдёт
  службу, тогда её найдёт `ensure`. Не проверялось.
- Порт U5 задаётся явно и не сворачивается, номера для Desktop и профилей CLI выбирают B4 и B2.7c ниже `0x8000`.
- `SIGTERM` на Windows жёсткий, файл регистрации остаётся (B0.2); служба поверх устаревшего файла поднимается.

### Где решал сам

- Identity и порт — две переменные окружения, их задаёт запускающий. Другие варианты: порт из конфига службы (некому
  записать его в B1.3a) или хеш (не «явно»).
- Каталог — литерал `loginom-ai-agent` в трёх файлах upstream, а не `productSlug(channel)`. `util`, `client` и
  `desktop` не зависят от `@loginom-ai-agent/product`, а канала продукта (prod/beta/dev) в дереве v2 ещё нет. Разведение
  хранилищ beta и dev по каналу (`packages/product/AGENTS.md`) — когда появится канал продукта (B4, B5).
- `apply-identity` не прогонялся ни по одному файлу (выше почему). Охрана `OPENCODE_*` в `names.test.ts` и
  `flag-identity.test.ts` сохранена как `test.failing`, а не сужением `SOURCES` или `ALLOWED`.
- `flag-identity.test.ts` — в `packages/cli/test`: в v2 эти переменные читает процесс CLI.
- Шов Desktop — в новом файле форка: его можно загрузить в тесте без `electron`, а правки upstream сводятся к вызовам.
- В CAT-13 вошли и файлы каталога продукта: это одна правка идентичности. Тесты upstream в запись не внесены, их
  относят CAT-09 и CAT-12.

### Найдено, не чинил

- `guarantees.md` (G2, «Как запускать»), `adr-0001-modular-integration.md` и раздел CAT-12 в `catalog.md` ссылаются на
  `packages/core/test/flag-identity.test.ts`. Перевод этих документов — B1.7.
- `repo-paths.test.ts`: 7 падений на `oc2-migration`, в том числе «the agent package keeps the upstream directory»
  (`packages/opencode`) — B1.4, B1.7. `automation-routing.test.ts`: 1 падение там же.
- `core/src/project.ts` и `core/src/git.ts`: кэш id проекта — файл `.git/opencode` в репозитории пользователя (B1.4).
- `tui/src/theme/assets/opencode.json` — тема, на неё ссылаются по имени. Массовый `apply-identity` заменит ссылки на
  `loginom-ai-agent.json`, а файл темы останется прежним — B1.4.
- `desktop/perf/startup.bench.ts` ищет службу в `opencode/service*.json` — бенчмарк не правился.
- В `XDG_CACHE_HOME` при запуске из исходников появляется `bun` — кэш самого Bun, не продукта.
- `desktop/src/main/storage/install-state.ts` считает onboarding пройденным, если в userData Electron есть каталог
  `opencode` или `opencode.settings`. Это след прежней установки OpenCode Desktop, а не корень хранилища CLI. Служба
  пишет в userData только в режиме разработки `OPENCODE_DESKTOP_ISOLATED_SERVER`, и теперь в `loginom-ai-agent`.
  Onboarding и userData — B4, не правилось.
- Остальные пакеты (`gui-plugins`, `sdk`, `app`, `plugin`, `session-ui`, `simulation`, `ai`, `schema`, `script`):
  grep по путям `opencode` находит только фикстуры и id провайдера. Чтений каталога `Global` с литералом нет, их тесты
  не запускались.

### Не проверено

- Windows и macOS: всё запускалось на Linux. Права `0600` на Windows не имеют смысла (ACL профиля).
- Собранный CLI: S5 и каталоги проверены из исходников (канал `local`); канал `latest` — только `bun --define` в
  тесте переноса.
- Вызовы в `sidecar-probe.ts` и `background-service.ts` под Electron: только typecheck. Окно Desktop с U5 — B4.

## B1.7 Процедура синхронизации на v2

21.11.2026. Ветка `b17-sync` от `oc2-migration` (`04ac42625f`), отдельное рабочее дерево. Bun 1.4.4 переносной
(`<project-root>/.claude/worktrees/b0-journal/spike/oc2/.run/cache/bun-1.4.4/bun-linux-x64`) и Node 24.19.0 — первыми в
`PATH` только для своих команд и `git commit`; глобальный Bun 1.4.3 не менялся. `bun install --frozen-lockfile`: код 0,
1600 пакетов, `.husky/_` появился, хук `pre-commit` срабатывал на каждом коммите.

### Коммиты

| Коммит | Что | `bun run secrets staged` |
|---|---|---|
| `6be6bf1ed7` `feat(upstream-sync): let a catalog entry name the task that brings it back` | `catalog-check.py`, `test_tools.py` | `clean` |
| `b39e433f40` `fix(upstream-sync): run the sync procedure on the OpenCode 2 tree` | `sync-upstream.sh`, `selftest.sh` | `clean` |
| `7cd383f9de` `docs(upstream-sync): move the catalog to OpenCode v2.3.0` | `catalog.json`, `catalog.md` | `clean` |
| `d2a13173d4` `docs(upstream-sync): move guarantees, procedure, contract and ADR to OpenCode 2` | `guarantees.md`, `procedure.md`, `acceptance-contract.md`, `adr-0001-modular-integration.md` | `clean` |
| `05374fa0bb` `fix(loginom-runtime): resolve acorn for client code loaded from the workspace` | `packages/loginom-runtime/package.json`, `bun.lock` (+3 строки) | `clean` |
| `f9f3dd7d3a` `docs(upstream-sync): set the test Node first and state when the pin moves` | `guarantees.md`, `procedure.md` (правки после ревью) | `clean` |
| следующий | Этот журнал | `clean` |

Файлы OpenCode не менялись, кроме `bun.lock` (CAT-01). Изменены скрипты и документы `upstream-sync`, манифест пакета форка
`loginom-runtime` и этот журнал.

### Каталог

- `against` — `a6b15d33daf6ab7d35569f6d711fdb630b9f04e7` (v2.3.0).
- Записи с расхождениями на v2: CAT-01 (3 файла), CAT-02 (5), CAT-03 (1, `AGENTS.md`), CAT-12 (10), CAT-13 (6) — всего
  25 файлов. Маски — пути v2. Маски 0.4, которых нет ни в v2, ни в дереве (`packages/web/**`, `packages/opencode/**`,
  `docs/upstream/**`, `github/**`, `infra/**`, `perf/**`, `CONTEXT.md`, `packages/app/src/i18n/**`), убраны.
- Записи CAT-04…CAT-11 — правки 0.4, которых на v2 ещё нет. Каждая несёт поле `pending` с задачей или этапом. Маски —
  пакеты v2, где они уже есть (`desktop`, `app`, `ui`, `session-ui`, `tui`), иначе `[]`.
- `catalog-check.py`: запись с `pending` может не иметь расхождений; `pending` — непустая строка; запись с `pending` и
  расхождениями — ошибка (правка пришла: опиши её, сними `pending`). Сводка печатает задачу рядом с записью. Три теста
  `CatalogCheckPending` в `test_tools.py`. Клетка контракта «fork adds a file / described» не меняется: у такой записи
  нет `pending`, и она по-прежнему пустая.
- `catalog.md` описывает состояние v2. Полный текст записей 0.4 — `git show a080f7725c:docs/upstream-sync/catalog.md`.
  Правило подъёма Bun (на него ссылается B1.6) оставлено в CAT-02 дословно, с поправкой на В-84.
- CAT-13 из B1.3a сохранена. `apply-identity.py` (`SOURCES` B1.3a) и `verify-accepted.py` не менялись: для v2 в них
  нечего править. Как шлюз читает коммит переноса — в документах, ниже.

### Каждая запись CAT → задача B или этап

«0.4» — файлов форка в файлах upstream на точке отсечения против `810c0eba1a` (масками `catalog.json` точки отсечения;
совпадает с таблицей 2b B1.2b). «v2» — файлов против v2.3.0 сейчас.

| Запись | 0.4 | v2 | Куда |
|---|---|---|---|
| CAT-01 Манифесты | 10 | 3 | Корень и `packages/script` — B1.2a, сделано. Версия, лицензия и автор Desktop — B4; манифест пакета агента (`bin.loginom-ai-agent`, `dev:cli`, `prepare:release`) — B2.7a, B5.2; `app` — C |
| CAT-02 CI, сборка | 47 | 5 | Workflows форка, задачи turbo с `passThroughEnv`, `release.yml`, блок `LOGINOM_NODE_WORKFLOW` в `pre-push` — B5.1, B5.2. Комплект сторонних материалов Bun — B1.6. Сборка CLI (standalone, метаданные, `User-Agent`) — B2.7a. Скрипты и `electron-builder.config.ts` Desktop — B4. Скрипт `install` — B1.4 |
| CAT-03 Бренд | 669 | 1 | Бренд файлов upstream, `.opencode` → `.loginom-ai-agent`, README — B1.4. Значки и ресурсы Desktop — B4. Словари и `public` — C. Документация сайта (451 файл `packages/web` переехал в `services/site`) не брендируется — решение плана |
| CAT-04 Каналы upstream | 6 | 0, `pending` | `installationNode`, `update-notifier` — B2.7d; обновление Desktop — B4.1 |
| CAT-05 Сессия, инструменты | 89 | 0, `pending` | B2.2 (G1), B2.3 (G3, G4), B2.5, B2.6, B2.9. Правки дашбордов в `session` и `tool` без задачи (256 строк, B1.2b) — **предложение** B2.9 |
| CAT-06 Скиллы, команды | 4 | 0, `pending` | B2.4 (G6, U3) |
| CAT-07 Провайдеры, плагины, прокси | 22 | 0, `pending` | Встроенные плагины и U1 — B2.1. Прокси CLI `standalone-proxy.ts` — B2.7a. Системный прокси службы — B4.1. Исправления 0.4 в `transform.ts`, кодах OAuth, WebSocket план не называет — **предложение** B2.1: проверить по тестам 0.4, нужны ли они на v2.3.0 |
| CAT-08 CLI, воркер, конфиг | 89 | 0, `pending` | B2.7a–d, B2.8 (U4), B3.2 (конфиг 0.4) |
| CAT-09 Desktop | 97 | 0, `pending` | B4 (правки U5 — в CAT-13) |
| CAT-10 App, UI | 141 | 0, `pending` | Этап C |
| CAT-11 TUI | 35 | 0, `pending` | Слово-знак, имя продукта в обновлении, тема — B1.4. `local-attachment.ts` — B2.5d. `cli/tui/loginom-bridge.ts` (мост порта Host воркера TUI) — B2.3: Host живёт в плагине службы. Задачи на TUI в плане нет — **предложение** |
| CAT-12 Ядро | 53 | 10 | `OPENCODE_*` → `LOGINOM_AI_AGENT_*`, имена файлов БД и конфига — B1.4 |
| CAT-13 U5 (новая) | — | 6 | B1.3a, сделано. Identity и порт в Desktop и профилях CLI — B4, B2.7c; каталоги по каналу — B1.4 |

Итого: 5 записей с расхождениями на v2 (CAT-01, 02, 03, 12, 13), 8 — `pending`: в B2 — 5 (CAT-04…08), в B4 — 1 (CAT-09),
этап C — 1 (CAT-10), B1.4 и B2 — 1 (CAT-11). Без задачи по плану было три куска — CAT-07 (исправления провайдеров),
CAT-11 (TUI), дашборд-правки CAT-05; им назначены задачи с пометкой «предложение». Новые правки upstream этапа B,
предложение, куда записывать: U1 — CAT-07, U3 — CAT-06, U4 — CAT-08, мягкая остановка службы (B2.3b) — CAT-13.

### Процедура и скрипты

- **Уже слитый тег.** `prepare` на v2.3.0 падал: `measure-conflicts.sh` честно отказывает без `MERGE_HEAD` («после merge
  нет MERGE_HEAD — измерение недействительно», код 1). Теперь `prepare` проверяет `git merge-base --is-ancestor` и на
  таком теге слияния не начинает: 0 путей, `rehearsal/` — сам коммит форка, код 0. Защиту `MERGE_HEAD` в
  `measure-conflicts.sh` не трогал. Новый случай в `selftest.sh`: синтетический форк после слияния `v1.1.0`.
- **`check` на v2.** Убраны шаги `httpapi` (`packages/opencode`, `test:httpapi` в v2 нет) и `tests-desktop` (в v2
  `turbo test` включает `desktop#test`; `draft-store.test.ts` нет). Добавлены `npm ci` шаблона дашбордов в `install`,
  `check-generated-protocol` (как `check-test.yml`) и `build-cli` до `build-desktop`: сборка Desktop v2 без
  `packages/cli/dist` скачивает опубликованный CLI. Куча V8 по умолчанию — 4096 МБ, как `release.yml` v2. Имена шагов
  сохраняют префиксы `--skip`.
- **`procedure.md`.** Bun 1.4.4 (В-84); тег по умолчанию `v2.3.0`; случай «тег уже в форке»; правила классов
  конфликтов — 0.4; до B1.4 синхронизация с новым тегом не идёт (решение 10), потому что `apply-identity` на части
  файлов не замкнёт имена; блок `identity-docs` убран (документация — `services/site`, не брендируется); `pending` в
  правиле каталога; шаги `check` v2; ложные падения `tests-turbo` до B5.1.
- **Правило В-93** — пункт 8 шага 2 и компенсация в шаге 5: `secrets range` с кодом 0 считается только с закреплением
  нового тега; SHA сверяют `git ls-remote https://github.com/anomalyco/opencode.git 'refs/tags/vX.Y.Z*'`; смена — с
  ревью владельца и попадает в `loginom` раньше PR синхронизации (PR-проверка читает файл из базовой ветки); правка в
  коммите слияния — `deviation` с записью `PROCEDURE-2`. Сверка текущего закрепления:

```text
$ git ls-remote https://github.com/anomalyco/opencode.git 'refs/tags/v2.3.0*'
a6b15d33daf6ab7d35569f6d711fdb630b9f04e7	refs/tags/v2.3.0
```

  Тег лёгкий, SHA совпадает с `.gitleaks-upstream`.
- **`acceptance-contract.md`** — раздел «Коммит переноса на OpenCode 2»: родители ровно форк и upstream — первый
  `43b449d65a` (точка отсечения `a080f7725c`, правка сканера B1.2s, коммиты переноса B1.2a), второй `v2.3.0`
  (`a6b15d33da`). Прогон шлюза на нём:

```text
$ python3 -I scripts/upstream-sync/verify-accepted.py --repo . --fork 43b449d65adb383d5b1e8a11b07fb5ccd243c021 \
    --upstream a6b15d33daf6ab7d35569f6d711fdb630b9f04e7 --merge 3e6a995f9a253b85aba9e819b3bae0a1b2ad78c6
merge 3e6a995f9a253b85aba9e819b3bae0a1b2ad78c6  oracle tree abc7f98d7f2936d3104d74c9ca07ec7e64c42409
| conflict | 13 | 2 |
| deviation | 0 | 0 |
| equal to the oracle | 24865 | |
… 11 × FAIL conflict, 22 × FAIL stale-record
RESULT: REJECTED          # код 1, 41 с; база слияния 055d95bb7e
```

  Записан как факт: коммит принят В-83 и приёмкой B1.2, не шлюзом. Не чинил: `merge-decisions.json` в дереве — от
  синхронизации 0.4 с v1.19.4, при следующей синхронизации его пишут заново (сказано в процедуре).
- **ADR-0001** — раздел «Перенос на OpenCode 2»: что из решений 1–8 действует на v2; путь `flag-identity.test.ts` —
  `packages/cli/test` (решения 2 и 7); решение 5 — исключение `pending`; Bun — пересмотрено В-84.

### `guarantees.md`

- Таблица G1–G6 по дереву v2: код и тесты, которые есть (`loginom-host`, `product`, `cli`), задача, которая переносит
  остальное, мутация 0.4 с пометкой «на v2 не перемерялась». Пути `packages/opencode/...` из документа убраны: тест
  `repo-paths` проверяет каждый путь в обратных кавычках. Версия 0.4 — `git show a080f7725c:docs/upstream-sync/guarantees.md`.
- `flag-identity.test.ts` — `packages/cli/test/flag-identity.test.ts`.
- «Как запускать»: `export LOGINOM_AI_AGENT_TEST_NODE` первой строкой, `npm ci` шаблона дашбордов,
  `LOGINOM_AI_AGENT_TEST_NODE` для `loginom-host` и `dashboard` (205 падений вместо 38 — по B1.5, не перемерял), тесты
  `dashboard`. `bun turbo test` переменную не передаёт до B5.1.
- Тесты дашбордов на дереве v2, `bun run test` в `packages/dashboard`, Node 24.19.0:

| Шаблон | `test:coverage:web` | `test:coverage:workers` | `node --test` (8 файлов) |
|---|---|---|---|
| без `npm ci` | 50 / 0 | 17 / 19, скрипт останавливается | не запускался |
| с `npm ci` | 50 / 0 | 36 / 0 | 92 / 3 / 1 пропущен |

  Три падения — `folder.test.mjs` «a partial source copy is retried completely…» и два его подтеста: под root
  `chmod 0` не даёт `EACCES` (базовое падение стенда, записано в документе).

### Приёмка

Все три — на `d2a13173d4`; на итоговом `f9f3dd7d3a` повторены (ниже), Bun 1.4.4 и Node 24.19.0 первыми в `PATH`, из корня рабочего дерева.

1. **`catalog-check.py` с новым каталогом — зелёный.**

```text
$ python3 -I scripts/upstream-sync/catalog-check.py --summary      # код 0
against a6b15d33daf6: 25 divergent upstream files
  CAT-01: 3
  CAT-02: 5
  CAT-03: 1
  CAT-04: 0 (pending: B2.7d, B4.1)
  CAT-05: 0 (pending: B2.2, B2.3, B2.5, B2.6, B2.9)
  CAT-06: 0 (pending: B2.4)
  CAT-07: 0 (pending: B2.1, B2.7a, B4.1)
  CAT-08: 0 (pending: B2.7, B2.8, B3.2)
  CAT-13: 6
  CAT-09: 0 (pending: B4)
  CAT-10: 0 (pending: stage C)
  CAT-11: 0 (pending: B1.4, B2.3, B2.5d)
  CAT-12: 10
```

   До правки, на `04ac42625f`, против v2.3.0: `PROBLEM: entries without divergent files: CAT-04, CAT-05, CAT-06,
   CAT-07, CAT-08, CAT-09, CAT-10, CAT-11`, код 1; против `against` 0.4 (`810c0eba1a`) — 646 файлов без записи.

2. **`selftest.sh` на новом дереве — зелёный.** `TMPDIR` — каталог в scratchpad; под root, поэтому самотест проверяет
   и отказ `check` под root.

```text
$ scripts/upstream-sync/selftest.sh
SELFTEST PASS                    # код 0, 2 мин; до правок на 04ac42625f — тоже PASS
```

   Внутри: `test_tools.py` (в том числе три новых теста `CatalogCheckPending`), `test_acceptance.py` (клетки контракта
   и мутации шлюза), `test_stand.sh`, док-тест `procedure.md` от `pin` до `accepted` (`RESULT: ACCEPTED`; шагов `env`,
   `pin`, `prepare`, `resolve`, `load`, `identity`, `catalog`, `commit`, `check`, `accepted`) и новый случай уже
   слитого тега.

3. **Пробная синхронизация на v2.3.0 без изменений — пустой результат.** Оба адреса — локальный репозиторий, тег
   `v2.3.0` есть в нём.

```text
$ scripts/upstream-sync/sync-upstream.sh pin --tag v2.3.0 --upstream-url <repo>
UPSTREAM_TAG=v2.3.0
UPSTREAM_SHA=a6b15d33daf6ab7d35569f6d711fdb630b9f04e7
$ scripts/upstream-sync/sync-upstream.sh prepare --fork-sha d2a13173d4b38d31db7c8988b9105386de74c9e3 --tag v2.3.0 \
    --upstream-sha a6b15d33daf6ab7d35569f6d711fdb630b9f04e7 --out <scratchpad>/b17-trial2 --fork-url <repo> --upstream-url <repo>
unmerged paths: 0 (v2.3.0 is already in the fork, nothing to merge)
next: nothing; v2.3.0 is already merged, so there is no merge commit to check or accept      # код 0
$ wc -l < measure/unmerged-paths.txt                       # 0
$ git -C rehearsal rev-parse HEAD                          # d2a13173d4b38d31db7c8988b9105386de74c9e3
$ git -C rehearsal status --porcelain | wc -l              # 0
$ git -C rehearsal rev-parse -q --verify MERGE_HEAD        # код 1: слияния нет
$ python3 -I scripts/upstream-sync/catalog-check.py --repo rehearsal --against a6b15d33da…   # код 0, 25 файлов
$ python3 -I scripts/upstream-sync/verify-accepted.py --repo rehearsal --fork d2a13173d4… --upstream a6b15d33da…
ERROR: d2a13173d4… has parents ['7cd383f9de…'], not exactly the fork … and upstream …     # код 2: принимать нечего
```

   До правки `prepare` на том же входе (`--fork-sha 04ac42625f…`) завершался кодом 1: `ОШИБКА: после merge нет
   MERGE_HEAD — измерение недействительно`.

Полный `bun run check` из корня, один раз, на `d2a13173d4`: код 0, 13 с. `Found 522 warnings and 0 errors`, `sdk-docs`
— 0 problem(s), `turbo typecheck` — `Tasks: 38 successful, 38 total`, все 38 из кэша turbo (TS эта задача не меняла).

### `packages/product`: до и после

`bun test` в `packages/product`. До — `04ac42625f`: 53 pass, 8 fail. После — `f9f3dd7d3a`: 56 pass, 5 fail, без `npm ci` клиента `loginom-runtime` (каталог `client/node_modules` убран на время
прогона). На `d2a13173d4`, до правки манифеста: 56/5 с `npm ci` клиента и 55/6 без него.

| Падение | Итог | Чьё |
|---|---|---|
| `catalog.json describes every file in which the fork differs from upstream` | **зелёное** | B1.7: каталог против v2.3.0 |
| `files named in guarantees.md and the scripts it relies on exist` | **зелёное** | B1.7: документ по дереву v2 |
| `every installed node handler has one routing row and one bounded reference` (`acorn`) | **зелёное** | B1.7: `"acorn": "8.15.0"` в `packages/loginom-runtime/package.json` (workspace). Тест грузит `client/lib` из workspace; `acorn` объявлен в `client/package.json` и его npm-замке, но в 0.4 пакет лежал в корневом `node_modules`, а на дереве v2 Bun его туда не кладёт. Версия — как в замке клиента; манифест `loginom-runtime` не копируется в ресурсы (`stage-resources.ts` берёт `client/package.json` и ставит замок `npm ci`) |
| `workspace packages > the agent package keeps the upstream directory` | красное | B1.4: тест ждёт `opencode` в `packages/opencode`, на v2 пакет агента — `@opencode/cli` в `packages/cli` |
| `workspace packages > turbo task keys name existing workspace packages` | красное | B1.4: `turbo.json` v2 с комментариями (JSONC), `JSON.parse` падает. Задачи форка в `turbo.json` — B5.1 |
| `workspace packages > --filter arguments …` | красное | B1.4: синтаксис turbo `@opencode/cli^...` и ложное `--filter name]` в `packages/codemode/script/bench.ts`; B5.1: `loginom-macos.yml` (`loginom-ai-agent`, `@opencode-ai/desktop`), `secrets.yml` (`@opencode-ai/script`) |
| `CI triggers > path filters match tracked files …` | красное | B5.1: `loginom-windows.yml`, `windows-native-check.yml` (пути `packages/opencode`, `desktop/src/main/apps*`) |
| `path literals in build and CI code > …` | красное | B5.1: `loginom-windows.yml`, `windows-native-check.yml`, `script/test-windows-profile.ps1`. B2.7a: `evals/src/{cli,profile}.ts`, `evals/test/cli.test.ts`, `loginom-host/script/build-cli.ts`, `scripts/node-acceptance/tests/required-checks.test.mjs`. B2.7a и B4: `loginom-host/script/skills-acceptance.ts`. B1.4: устаревшие пути в файлах самого v2.3.0 (`patches/install-korean-ime-fix.sh` → `packages/opencode`, `script/release.ts` → `packages/console`) — исключения теста |

B6.3 (пути в модульных `AGENTS.md`) из этих падений не получил ни одного: `repo-paths` `AGENTS.md` не проверяет.

### Где решал сам

- **`pending` вместо удаления записей.** Задание просит «запись с задачей или этапом». Меньший вариант без правки
  скрипта — таблица в `catalog.md` без записей в `catalog.json` — не давал бы записи. С `pending` ослаблено правило
  ADR «пустая запись — ошибка»: пустой может быть только запись с задачей, и она краснеет, как только правка придёт.
  **Спорное**, для владельца.
- **Описания 0.4 убраны из `catalog.md` и `guarantees.md`**, вместо них — ссылка на точку отсечения. Они описывали
  файлы, которых в v2 нет. Оставлено правило подъёма Bun: на него ссылается приёмка B1.6.
- **`acorn` — зависимость пакета форка `loginom-runtime`**, а не шаг стенда и не корневой `package.json` (файл OpenCode).
  Сначала был выбран шаг стенда (`npm ci` клиента); по ревью проверен манифест workspace — тест зелёный на чистой
  установке, `bun install --frozen-lockfile` проходит. Цена: версия `acorn` записана в двух манифестах (`loginom-runtime`
  и `client`), при подъёме — обе.
- **`check` правлен по v2** (шаги выше), хотя `check` не запускался: под root он отказывает, полный прогон — тяжёлый.
- **`turbo.json` не правил.** `passThroughEnv` для `loginom-host` и `dashboard` — B5.1 (B1.2a записала это входом
  B1.7/B5). Цена до B5.1: `tests-turbo` в `check` даёт ложные падения этих пакетов; процедура и `guarantees.md` это
  называют.
- **Синхронизация с новым тегом — после B1.4**, выведено из решения 10 и B1.3a, записано в процедуре.
- **Противоречие плана**: приёмка B1.4 — «`repo-paths.test.ts` зелёный», а три из пяти оставшихся падений лечат B5.1 и
  B2.7a. Предложение владельцу: в приёмке B1.4 — проверки самого теста (каталог пакета агента, JSONC, `^...`, исключения
  путей v2.3.0), остальное — в приёмке B5.1 и B2.7a.

**Итоговый повтор на `f9f3dd7d3a`** (после правки манифеста `loginom-runtime` и формулировок):

```text
$ python3 -I scripts/upstream-sync/catalog-check.py --summary     # код 0
against a6b15d33daf6: 25 divergent upstream files                  # состав по записям — как выше
$ scripts/upstream-sync/sync-upstream.sh prepare --fork-sha f9f3dd7d3ae3b400fd4bfb29e0b0e157fb0def3c --tag v2.3.0 …
unmerged paths: 0 (v2.3.0 is already in the fork, nothing to merge)   # код 0; rehearsal = f9f3dd7d3a, чистое, MERGE_HEAD нет
$ scripts/upstream-sync/selftest.sh
SELFTEST PASS                                                       # код 0, 2 мин
$ cd packages/product && bun test                                  # без client/node_modules
 56 pass
 5 fail
```

### Найдено, не чинил

- `conflict-classes.py`: правила классов — пути 0.4; на v2 почти любой конфликт попадёт в `unclassified` (код 4, в
  `prepare` не роняет). Дополнить после первой настоящей синхронизации.
- `compat-snapshot.ts` на дереве v2 работает (38 имён `LOGINOM_AI_AGENT_*`, 26 workflow), но `agentDir` падает на
  `packages/agent`, которого нет. Для сравнения двух снимков v2 это одинаково с обеих сторон.
- `stand.sh` убирает пустой `packages/sdk/js/openapi.json` — в v2 такого каталога нет, правило мёртвое и безвредное.
- `apply-identity.py` переименовывает `opencode.db`, но не `opencode-<канал>.db` v2 — это B1.4 (массовый прогон).
- `.gitignore` форка держит `/packages/opencode/config.json` для пакета, которого в v2 нет (B5.1 или B2).

### Не проверено

- `sync-upstream.sh check` на дереве v2 целиком: под root отказывает, шаги правлены по `check-test.yml`, `check.yml` и
  `release.yml` v2 без прогона. Шаг `build-cli` не запускался.
- `loginom-host` без `LOGINOM_AI_AGENT_TEST_NODE` (205 падений) — число из B1.5, не перемерялось.
- Мутации G1–G6 на дереве v2 не перемерялись: в документе числа 0.4 с пометкой.
- Хук `pre-push` целиком (`secrets push`): push не делался. `bun run check` — код 0 на `d2a13173d4`, typecheck из кэша
  turbo; после него менялись только документы и манифест `loginom-runtime` (+3 строки, `bun install --frozen-lockfile` — код 0).
- Строгий `pending` покраснит `catalog-check`, если параллельная ветка до слияния внесёт правку в `desktop`, `app`, `ui`,
  `session-ui` или `tui`: такой ветке нужно снять `pending` у CAT-09, CAT-10 или CAT-11 и описать правку.

## B1.3b Системные каталоги и `process-daemon`

21.11.2026. Ветка `b13b-system` от `oc2-migration` (`10ea14e6f6`: B1.7 и B1.3a уже влиты), отдельное рабочее дерево.
Bun 1.4.4 переносной (`<project-root>/.claude/worktrees/b0-journal/spike/oc2/.run/cache/bun-1.4.4/bun-linux-x64`) —
первым в `PATH` только для своих команд и `git commit`. `bun install --frozen-lockfile`: код 0, 1600 пакетов, `.husky/_`
появился, хук `pre-commit` срабатывал на каждом коммите. Для Rust: `rustup` поставил пин пакета 1.90.0 в `~/.rustup`
(и сам обновился 1.29.1 → 1.29.3, `rustup --version` — 1.29.3), Zig 0.16.0 (версия из `check-process-daemon.yml`, sha256 сверен с ziglang.org) —
в scratchpad, в `PATH` только для `cargo`. Ghostty `build.rs` берёт с GitHub сам. В репозиторий из этого ничего не попало.

### Коммиты

| Коммит | Что | `bun run secrets staged` |
|---|---|---|
| `e1d07cf418` | `core`: системный каталог и MDM продукта, тесты | код 0, `clean` |
| `d2d7275d1b` | `process-daemon`: каталог состояния, сокетов и переменная продукта | код 0, `clean` |
| `a03ca6fd23` | Каталог: CAT-13 и CAT-12 | код 0, `clean` |
| следующий | Этот журнал | |

### Правки файлов upstream

Исходники — в **CAT-13** явными путями (иначе их забрала бы CAT-12 по `packages/**`), тест upstream — в CAT-12.

| Файл | Строк | Что |
|---|---|---|
| `core/src/config/discovery.ts` | +12 −7 | `const app = "loginom-ai-agent"`, `const preferenceDomain = "com.loginom.aiagent.managed"`: `/etc/<app>`, `%ProgramData%\<app>`, `/Library/Application Support/<app>`, `/Library/Managed Preferences[/<user>]/<preferenceDomain>.plist` |
| `core/test/config/config.test.ts` | +6 −6 | Ожидания двух тестов upstream (`systemDirectory`, `preferencePaths`) — на пути продукта |
| `process-daemon/src/daemon.rs` | +6 −5 | Корень состояния по умолчанию `<state>/loginom-ai-agent/pty`; юнит-тест |
| `process-daemon/src/daemon/unix.rs` | +8 −7 | `LOGINOM_AI_AGENT_PTY_SOCKET_DIR` вместо `OPENCODE_PTY_SOCKET_DIR` (чтение, две ошибки, комментарий), каталог сокетов `loginom-ai-agent-pty-<uid>`; юнит-тесты |
| `process-daemon/src/client.rs` | +1 −1 | Справка `help`: путь по умолчанию |

Новый файл форка (в каталог не входит): `core/test/config/product-system.test.ts`, 3 теста.

**`.rs` и `apply-identity`: правило в каталоге, не шаг скрипта.** Скрипт переименовал бы только `OPENCODE_*`, а пути
`opencode/pty` и `opencode-pty-<uid>` — литералы, их всё равно править руками. Расширение `SOURCES` и `TEXT` сдвинуло
бы `--check` и `merge_oracle.py` (он берёт `wants()` из скрипта). Правило — в CAT-13: файлы, что переименовано и что
нет, проверка `cargo test`, новые пути и `OPENCODE_*` в коде `process-daemon` upstream приводить вручную.

### Тесты

`product-system.test.ts`:
- `systemDirectory` для `linux`, `win32` (`ProgramData`), `darwin` — пути продукта, сегмента `opencode` нет;
- `preferencePaths` — `com.loginom.aiagent.managed.plist`, без `opencode`;
- настоящие файлы: во временном `ProgramData` лежат `opencode/opencode.json` (deny `shell:opencode-policy`) и
  `loginom-ai-agent/opencode.json` (deny `shell:product-policy`). `Config` с `system` из
  `systemDirectory("win32", { ProgramData })` загружает только политику продукта. Подменить корень `discovery`
  позволяет только на Windows (`ProgramData`); `/etc` и `/Library` — литералы, для них проверка по функции путей.

На `discovery.ts` upstream (файл подменялся на время прогона и возвращался) все три красные:

```text
Expected: "/etc/loginom-ai-agent"
Received: "/etc/opencode"
Expected to contain: "shell:product-policy"
Received: [ "shell:opencode-policy" ]
 0 pass
 3 fail
```

После правки:

```text
$ cd packages/core && bun test test/config/product-system.test.ts
 3 pass
 0 fail
 8 expect() calls
```

`process-daemon` (`cargo test`, toolchain 1.90.0) до и после — одинаково: lib 82, `ghostty-effects` 5, `ownership` 12,
`pipe` 23, `playground` 3, `rows` 1, `runtime` 8 (+1 ignored), `service` 12, `transport-retained` 1; Windows-тесты на
Linux пустые. Итого 147 passed, 0 failed, 1 ignored. Изменённые проверки:
`runtime_root_avoids_temporary_directories`, `socket_root_preserves_default_uid_directory`,
`socket_root_uses_dedicated_child_of_explicit_directory`.

```text
$ cargo fmt --check                                            # код 0
$ cargo clippy --all-targets --all-features -- -D warnings     # код 0
$ cargo test                                                   # код 0
$ cargo build                                                  # код 0
$ HOME=<tmp> target/debug/opencode-pty daemon --name probe     # без XDG_STATE_HOME, 4 с
<tmp>/.local/state/loginom-ai-agent/pty/probe
/tmp/loginom-ai-agent-pty-0/a2ba983bd34cf46418e676ba6adb79d4.sock
```

`core` полностью, `bun run script/test.ts` на `a03ca6fd23`: 7118 pass, 3 fail (`Ran 7475 tests across 323 files`).
На `oc2-migration` — 7115 pass, 3 fail (B1.3a выше); +3 — новые тесты. Падения те же:
`ShellParse > extracts static directory targets…`, `util.effect-flock > fails on unwritable lock roots`,
`util.flock > fails clearly on unwritable lock roots` (прогон под root). Новый файл по навыку `unit-tests`:
`bun run script/test.ts test/config/product-system.test.ts --rerun-each 10` — 30 pass, 0 fail. `bun typecheck` в
`packages/core` — `No type errors in 1,980 files across 2 projects`, код 0.

`names.test.ts` и `flag-identity.test.ts` эти имена не ловят (`.rs` и системные каталоги не сканируют) и не менялись:
`packages/product` `bun test test/names.test.ts` — 9 pass, 0 fail; `packages/cli` `bun test test/flag-identity.test.ts`
— 3 pass, 0 fail. Пометки `test.failing` на месте. `packages/product` `bun test` — 56 pass, 5 fail, те же пять, что в
разборе B1.7 выше (`repo-paths`: B1.4, B5.1, B2.7a).

`bun run check` из корня на `a03ca6fd23` (документы журнала не проверяет) — код 0: `oxlint` `Found 522 warnings and 0
errors` (в новых и изменённых файлах предупреждений нет), `Tasks: 38 successful, 38 total`, `Cached: 32 cached`.

`python3 -I scripts/upstream-sync/catalog-check.py --summary` — код 0, 30 расходящихся файлов (на `10ea14e6f6` — 25),
CAT-13: 6 → 10, CAT-12: 10 → 11. До правки `catalog.json` проверка тоже давала код 0, но CAT-12: 15 — маска
`packages/**` молча забирала исходники; поэтому пути явные.

### Где решал сам

- **Литералы, не импорт `Product`.** `core` не зависит от `@loginom-ai-agent/product`; импорт добавил бы правку
  манифеста и `bun.lock` (CAT-01). Как в `util/src/global.ts` B1.3a: литерал с комментарием `Fork (CAT-13)`. Значения —
  `Product.slug` и `Product.channels.prod`.
- **Идентификатор MDM — `com.loginom.aiagent.managed`.** У OpenCode приложение `ai.opencode.desktop`, политика —
  `ai.opencode.managed`; у продукта единственный reverse-DNS — канал prod `com.loginom.aiagent`, к нему тот же суффикс.
  **Спорное**: сам `com.loginom.aiagent` — домен настроек Desktop, поэтому отдельный суффикс. Каналы beta и dev — B1.4.
- **Имя файла в системном каталоге осталось `opencode.json(c)`** (`names`): это B1.4, вместе с остальными чтениями.
- **В `process-daemon` переименовано только то, что видно продукту во время работы:** каталог состояния, каталог
  сокетов, переменная `…_PTY_SOCKET_DIR`. Не менялись: имя crate и бинарника `opencode-pty` (его ищут `core`, сборка
  CLI и `CARGO_BIN_EXE_opencode-pty` в тестах), именованный канал Windows `\\.\pipe\opencode-pty-<instance>` (уникален
  по 128-битному id экземпляра, на Linux не компилируется), `OPENCODE_ZIG_CPU` в `build.rs` (его задаёт
  `release-process-daemon.yml`: правка только в `build.rs` молча сняла бы baseline CPU; workflows — B5), тестовые
  `OPENCODE_PTY_*_TEST_CHILD` и тексты сообщений.
- **`README.md` пакета не правил** — он в CAT-03 (`packages/*/*.md`), бренд документов — B1.4. Сейчас README описывает
  `OPENCODE_PTY_SOCKET_DIR` и пути `opencode`.
- Название CAT-13 в `catalog.json` не менял, раздел дополнен.

### Найдено, не чинил

- **Продукт пока запускает бинарник `opencode-pty` из npm `@opencode/pty@0.5.2`**, а не из `packages/process-daemon`:
  `core/src/persistent-pty/pty-binding.ts` (`binaryPath`), сборка CLI — `cli/script/opencode-pty.ts`, свой бинарник
  только через `OPENCODE_PTY_BIN`. Правка Rust действует только в своём бинарнике. План собирает Rust-часть только
  для Windows (B5.1, `loginom-windows.yml`), а каталог сокетов и переменная живут в `daemon/unix.rs`; на Windows —
  именованный канал. Сборки своего бинарника для Linux и macOS нет ни в одной задаче плана, поэтому требование «каталог
  сокетов не совпадает с OpenCode» до поставляемого продукта не доходит: сокеты продукта — в `/tmp/opencode-pty-<uid>`,
  общем с OpenCode каталоге, переменная — `OPENCODE_PTY_SOCKET_DIR`. Смягчение: каталог состояния продукт задаёт сам
  (`--runtime-dir <state>/pty` из `Global`, после B1.3a — `loginom-ai-agent`), а имя сокета — хеш этого каталога, так что
  файлы не совпадают. **Вопрос владельцу:** собирать `process-daemon` для Linux и macOS (B2.7a или B5) или принять
  общий каталог сокетов с бинарником upstream.
- Другого источника управляемой политики нет: `core/src/config/managed.ts` — только класс документа, источники —
  `sources.system` и `sources.preferences` из `discovery.ts` (`config.ts`). `git grep "opencode-pty-"` в `.ts`/`.mjs` —
  только временные каталоги тестов и скрипты сборки npm, путь сокетов нигде не зашит.
- Бинарник ставится в `<bin>/opencode-pty/` (`core/src/persistent-pty/binary.bun.ts`) — каталог `Global.bin` уже
  продукта, имя подкаталога — бренд, B1.4.

### Не проверено

- Windows и macOS: всё на Linux. Ветка `win32` и `darwin` в `discovery` — по функциям путей; Rust на Windows
  (`daemon/windows.rs`, `transport/windows.rs`) не компилировался — B5.1.
- MDM-plist на настоящем macOS (`plutil`) не проверялся.
- Собранный CLI со своим бинарником `process-daemon` — не собирался (выше).

## B1.6 Генератор комплекта сторонних материалов Bun

21.11.2026. Ветка `b16-bun-notices` от `oc2-migration` (`04ac42625f`), отдельное рабочее дерево. Решение В-84, правило —
запись LAB-306 в `catalog.md`. Bun 1.4.4 переносной, первым в `PATH` только для своих команд, глобальный 1.4.3 не
менялся. `bun install --frozen-lockfile` — 1600 пакетов, `.husky/_` есть, хук `pre-commit` срабатывал на каждом
коммите.

### Коммиты

| Коммит | Что | `bun run secrets staged` |
|---|---|---|
| `da295943b1` `feat(loginom-host): generate the Bun third-party bundle from upstream pins` | `script/bun-notices.ts`, строка в `loginom-host/AGENTS.md` | `clean` |
| `3a16e95b28` `chore(loginom-host): regenerate the Bun third-party bundle for 1.4.4` | `licenses/bun` (56 файлов), `test/bun-notices.test.ts`, `.gitleaksignore` +51 | `clean`, архивов 5 |
| `2232acf6c3` `refactor(loginom-host): drop an unused import from bun-notices` | одна строка импорта | `clean` |
| `2e5e67a99d` `docs(migration): record B1.6 Bun notice generator and its acceptance` | этот раздел, запись в конце `catalog.md` | `clean` |
| `2349b5481a` `fix(loginom-host): keep Bun notice files byte-exact on every checkout` | `licenses/.gitattributes` (`bun/** -text`), таймауты 30 с трём тестам | `clean` |
| последний `docs` | уточнения раздела после ревью | |

`bun run secrets range 04ac42625f 2349b5481a` — `clean`, 5 коммитов, 5 архивов.

### Генератор

`bun script/bun-notices.ts generate <версия> <кэш> <новый каталог>`, Linux, Bun той же версии. Скачанный код только
читается как текст, не запускается.

1. Тег `bun-v1.4.4` → `38afee6c84fcf48c0edb2466aa4b27d287a59c30` (GitHub API). Если запущенный Bun другой версии или
   ревизии — `LOGINOM_BUN_NOTICE_REVISION_MISMATCH` до скачиваний.
2. Архив Bun (codeload). Из него читаются рецепты `scripts/build/deps/*.ts` (24 файла), `ci-images/spec.ts`,
   `rust-toolchain.toml`, `Cargo.lock`, `sqlite3_local.h`. Незнакомая форма рецепта — `LOGINOM_BUN_RECIPE_UNKNOWN`.
   Пины сверяются с `process.versions`: 12 зависимостей, `uwebsockets`/`usockets`, `node`, `icu`, `sqlite`; ещё
   `sqlite_source_id()`. Расхождение — `LOGINOM_BUN_PIN_RUNTIME_MISMATCH`.
3. 21 архив зависимостей с `github-archive` (codeload). Тексты лицензий берутся из архива: корневые
   LICENSE/COPYING/COPYRIGHT/NOTICE/AUTHORS/PATENTS и пути, отобранные вручную в первом комплекте
   (`picohttpparser.c`, два файла WebKit). Каждый текст сверяется с raw.githubusercontent, если тот его отдаёт.
4. WebKit `d6375c72…`: `git fetch --depth 1` в голый репозиторий, затем `git archive` с отключёнными атрибутами. Каждый
   из 470 896 файлов и ссылок сверен с деревом `26b64acb…` по blob и режиму.
5. ICU 78.3: версия и sha256 взяты из `icu/source.json` дерева WebKit, `LICENSE` побайтно равен тегу `release-78.3`.
6. Node 26.3.0: headers и исходник (из него берётся `LICENSE`) сверены по `SHASUMS256.txt` и пину в `spec.ts`. Исключения
   openssl/uv — по рецепту.
7. rust-src nightly-2026-09-15 сверен по `.sha256`. Крейты: 31 из его `library/Cargo.lock` и 180 из `Cargo.lock` Bun,
   с static.crates.io, sha256 по lock.
8. Из архива Bun собираются `src/js`, sqlite и остальной `src`: USTAR и gzip, детерминированно, с инвентарями.
   Sha baseline-zip берутся из `SHASUMS256.txt` релиза.

Перед переименованием каталога результат проверяется `verify`. `verify [<комплект>] [<входы companion>]` работает без
сети:
- ревизия и `process.versions` текущего Bun;
- согласованность коммитов во всех файлах;
- хэши `native/`, лишних файлов там нет;
- состав каждого архива `native/` по его инвентарю;
- размер, sha256 и число записей каждого архива companion, тексты лицензий внутри них, крейты по `Cargo.lock`.

Формат сверен со старым комплектом:
- tar-слой генератора пересобирает tar четырёх старых архивов `native/` байт в байт;
- записи companion пяти неизменных пинов (highway, libspng, libwebp, zlib, zstd) и 44 общих крейта совпали со старыми
  побайтно, включая `entries` и `verifiedNoticeFiles` (у libwebp 0: raw отвечает 404).

### Размеры

- Оценка до скачивания: WebKit — около 2 ГБ pack плюс около 2 ГБ архива (старый — 1,98 ГБ), остальное — около 0,5 ГБ.
  Пик около 5 ГБ, свободно было 31 ГБ.
- Скачано 2,26 ГБ:
  - shallow pack WebKit — 1,86 ГБ;
  - 25 архивов companion — 243 МБ;
  - исходник Node — 122,5 МБ;
  - 211 крейтов — 29 МБ.
- Кэш на диске — 4,3 ГБ, вместе с архивом WebKit (1,99 ГБ), собранным здесь.
- Companion — 28 архивов, 2 265 703 936 байт. В git его нет, как и прежде.
- Закоммичено: `licenses/bun` вырос с 14,2 до 26,1 МБ, 56 файлов. Самый большой — `src-native.tar.gz`, 19,4 МБ (`src`
  Bun стал Rust, 109 МБ без сжатия).

### Приёмка

| Проверка | Linux (здесь) | Windows (`winstand`, `C:\lab\b16-bun-notices`, удалена) | macOS |
|---|---|---|---|
| Генерация | PASS, 5 мин; повтор без сети (`unshare -n`) после коммита — `git diff --exit-code` чистый. Архив WebKit повтор берёт из кэша; отдельный `git archive` даёт тот же sha256 `02e8c4dd…` | — | — |
| `verify` комплекта и 28 архивов, без сети | PASS: notices 49, archives 28, crates 211, 29 с | PASS, 47 с | не проверено |
| `build-bun-source-companion.ts` | PASS, 28 архивов | PASS, 41 с | не проверено |
| `build-webkit-source-companion.ts` | PASS | PASS, 63 с | не проверено |
| Независимая проверка `SHA256SUMS` | `sha256sum -c`: 28/28 и 1/1 OK | `Get-FileHash`: 28/28 и 1/1 | не проверено |
| sha baseline-zip из `source.json` | linux и windows совпали (тесты `native-resource-candidates` с архивами: 7/7) | zip сверен, Bun `1.4.4+38afee6c8` | — |
| `test/bun-notices.test.ts` | 5/5 | 5/5 | не проверено |
| Отказ на чужой ревизии | генератор с тегом 1.3.14; `verify`, `build-cli.ts` под Bun 1.4.3; тест — генератор, verify, оба сборщика | тест 5/5 | не проверено |

Офлайн: на Linux команды шли в сетевом namespace без сети. На Windows сеть стенда не отключалась: у команд был мёртвый
прокси `127.0.0.1:9`, и они сеть не используют. На стенд файлы попали через scp, байт в байт. Checkout с
`core.autocrlf=true` превращал `LICENSE.md` в CRLF, и `verify` на нём падал бы. Поэтому `licenses/.gitattributes`
снимает `text` с `bun/**`. После этого такой checkout побайтно равен индексу (56 файлов), `verify` на нём проходит.

`loginom-host`, `bun test`: 505 / 12 / 38, 555 тестов. В B1.5 было 500 / 12 / 38 из 550. Пять новых тестов проходят;
38 падений те же по файлам и причинам: skills-acceptance 24, skills-acceptance-turns 8, bundled-ripgrep 3,
package-docs 1, cli-manifest 1, managed-work-entry 1. `bun typecheck` и `typecheck:tsc` — 0 ошибок.

### Сборка CLI

```sh
cd packages/loginom-host && LOGINOM_AI_AGENT_NODE_SOURCE=x LOGINOM_AI_AGENT_BROWSER_SOURCE=x bun script/build-cli.ts <новый каталог>
# до правки (1.3.14): error: LOGINOM_BUN_NOTICE_REVISION_MISMATCH  at build-cli.ts:44:9
# после: проверка ревизии пройдена, baseline-zip скачан и сверен, дочерний baseline Bun снова прошёл проверку;
#   затем: error: No such file or directory  path: ".../packages/opencode"
# под глобальным Bun 1.4.3: error: LOGINOM_BUN_NOTICE_REVISION_MISMATCH
```

До конца CLI на этом дереве не собирается: `build-cli.ts` вызывает `packages/opencode/script/build.ts`, а
`packages/opencode` в v2.3.0 нет. Это не B1.6. Перед запуском нужен `npm ci` клиента `loginom-runtime`, иначе импорт
`yaml` падает раньше проверки ревизии. Копирование notices в артефакт (`build-cli.ts`, строки 117–135) не выполнялось;
`verify` проверяет те же поля `source.json`, `native/sources.json` и `webkit-source.json`.

### Где решал сам

- **`lolhtml-crates.json` → `bun-crates.json`.** В 1.4.4 lol-html — форк `oven-sh/lol-html`, cargo path-зависимость Bun.
  c-api не собирается, его крейты закреплены в корневом `Cargo.lock` Bun. Формат прежний; компонент `bun-crates`
  (180 крейтов) заменил `lolhtml-crates`. Код эти файлы не читает.
- **README сборщика** (`build-bun-source-companion.ts`) говорит о «lol-html crate bundle». Теперь это неточно, но
  сборщики не правились: они принимают результат как есть.
- **`.gitleaksignore` +51 — общий файл защиты, файл upstream; правка в рамках CAT-02.** Хук `secrets staged` нашёл
  53 совпадения в трёх новых архивах `native/`:
  - примеры домашних каталогов в комментариях Bun и SQLite;
  - идентификаторы SQLite и V8, похожие на ключи.

  Каждое прочитано, все ложные. По образцу старого комплекта отпечатки привязаны к blob архива, пути внутри, правилу и
  строке.
- **«Офлайн-проверка на трёх ОС»** здесь — `verify`, оба сборщика, `SHA256SUMS` и тест. Офлайн-проверка Desktop+CLI из
  `catalog.md` не делалась: CLI на дереве не собирается, Desktop — B4.
- **Сжатие.** tar старого формата воспроизводится байт в байт. Сжатые байты другие: старые архивы сжаты zlib 1.3
  (Python), новые — zlib-ng закреплённого Bun. Поэтому повтор детерминирован на том же Bun. Архив WebKit зависит от
  версии git (2.43.0), она записана в `generation`.
- **Тексты лицензий** берутся из проверенных архивов, а не по raw-ссылкам. В записях появилось поле `archivePath`,
  `url` пишется, только если raw отдал те же байты.
- **`remaining` companion.** Строка «Upstream test submodules are not included» заменена списком архивов с
  `.gitmodules`: hdrhistogram, lolhtml, lsquic, picohttpparser. Генератор не может проверить, что это только тесты.
- **`catalog.md`.** Слова «генератора нет» устарели. Сама запись LAB-306 не правилась: в конец файла добавлен раздел
  B1.6 (рядом B1.7 переделывает каталог). `catalog.json` не менялся.
- **Тест `bun-notices` требует Bun 1.4.4 `38afee6c`**, как и `build-cli.ts`. Под другим Bun первый тест падает с
  `LOGINOM_BUN_NOTICE_REVISION_MISMATCH`.

### Найдено, не чинил

- `windows-native-check.yml` и `secrets.yml` закреплены на Bun 1.3.14. `check-test.yml` берёт версию из
  `package.json`.
- `build-cli.ts` ссылается на отсутствующий `packages/opencode` (см. выше).

### Не проверено

- macOS: машины нет.
- Сборка CLI до конца и офлайн-проверка Desktop+CLI.
- `verify` не считает записи `rust-src` (`.tar.xz`) ни на одной ОС: их считает генератор, `verify` проверяет размер и sha256.
- Rebuild/relink и юридический аудит. `status: incomplete` и `remaining` сохранены.

## B1.4a Бренд: механический прогон `apply-identity`

22.11.2026. Ветка `b14a-identity-script` от `oc2-migration` (`4b65c9ba94`), отдельное рабочее дерево. Bun 1.4.4
переносной (`<project-root>/.claude/worktrees/b0-journal/spike/oc2/.run/cache/bun-1.4.4/bun-linux-x64`) и Node 24.19.0 —
первыми в `PATH` только для своих команд и `git commit`. `bun install --frozen-lockfile`: код 0, 1600 пакетов,
`.husky/_` появился, хук `pre-commit` срабатывал на каждом коммите. Базовые прогоны тестов — в отдельном чистом дереве
`oc2-migration` в scratchpad. Ручные правки бренда — отдельные задачи по таблице в конце раздела. `services/` не
трогались.

### Коммиты

| Коммит | Что | `bun run secrets staged` |
|---|---|---|
| `4d79e5942f` `fix(upstream-sync): keep apply-identity from breaking code on the OpenCode 2 tree` | `apply-identity.py`, `test_tools.py` | `clean` |
| `af97f62a44` `chore(security): ignore reviewed fixture paths in lines apply-identity renames` | `.gitleaksignore`, +8 отпечатков | `clean` |
| `abe1f24221` `chore(identity): apply product names to the OpenCode 2 tree with apply-identity` | 330 файлов, только вывод скрипта | `clean` (с отпечатками) |
| `fd0526066c` `test(identity): drop test.failing from the OPENCODE_* guards …` | `names.test.ts`, `flag-identity.test.ts` | `clean` |
| `67ed7b618f` `docs(upstream-sync): describe the apply-identity run in the catalog and the procedure` | `catalog.json`, `catalog.md`, `procedure.md`, `guarantees.md`, `adr-0001-modular-integration.md` | `clean` |
| `27da0b969a` `docs(upstream-sync): keep per-entry file counts out of the catalog` | `catalog.md`: числа файлов по записям — в этот журнал | `clean` |
| `eb1ab715e6` `test(core): spell the cased config directory fixture with the product name` | `core/test/config/discovery.test.ts`, `catalog.md` (CAT-12) | `clean` |
| `af918a7717` `fix(upstream-sync): rename .opencode in regular expressions and templates too` | `apply-identity.py`, `test_tools.py` | `clean` |
| `656428d33a` `chore(identity): rerun apply-identity after the regular expression rule` | 2 файла, только вывод скрипта | `clean` |
| `8f8a4984b5` `docs(gui-plugins): keep the README source block in step with the renamed settings file` | `gui-plugins/README.md` (тем же скриптом по явному пути), `catalog.md` (CAT-03), `procedure.md` | `clean` |
| следующий | этот журнал | |

### Прогон

```text
$ python3 -I scripts/upstream-sync/apply-identity.py --repo .          # скрипт после правки
changed: 330 files
$ python3 -I scripts/upstream-sync/apply-identity.py --repo . --check  # повторный прогон
would change: 0 files                                                 # код 0
$ git diff --shortstat af97f62a44 abe1f24221
 330 files changed, 1174 insertions(+), 1174 deletions(-)
$ git show --shortstat 656428d33a      # повторный прогон после правки правила (ниже)
 2 files changed, 2 insertions(+), 2 deletions(-)
```

На `oc2-migration` скрипт до правки менял 337 файлов, после — 330: минус 8 файлов, где вся правка была порчей, минус 2
исключённых файла, плюс 3 файла, которые он теперь покрывает. Замены по пакетам и правилам (счёт правилами самого скрипта по тексту до прогона):

| Пакет | Файлов | `OPENCODE_*` | `.opencode` | `opencode.json` | `opencode.db` | `opencode.settings` | `opencode.updater` | Всего |
|---|---|---|---|---|---|---|---|---|
| `cli` | 54 | 284 | 11 | 11 | 5 | 6 | 0 | 317 |
| `core` | 73 | 99 | 65 | 127 | 4 | 0 | 0 | 295 |
| `app` | 72 | 131 | 6 | 139 | 0 | 0 | 0 | 276 |
| `desktop` | 32 | 81 | 5 | 1 | 0 | 21 | 4 | 112 |
| `.github` | 22 | 81 | 0 | 0 | 0 | 0 | 0 | 81 |
| `gui-plugins` | 21 | 45 | 15 | 3 | 0 | 1 | 2 | 66 |
| `tui` | 18 | 32 | 7 | 1 | 0 | 5 | 0 | 45 |
| `server` | 11 | 4 | 0 | 19 | 6 | 0 | 0 | 29 |
| `script` (пакет) | 2 | 12 | 0 | 0 | 0 | 0 | 0 | 12 |
| `script/` (корень) | 4 | 9 | 1 | 0 | 0 | 0 | 0 | 10 |
| `schema` | 5 | 4 | 1 | 3 | 0 | 0 | 0 | 8 |
| `client` | 5 | 6 | 0 | 1 | 0 | 0 | 0 | 7 |
| `plugin` | 3 | 0 | 0 | 4 | 0 | 2 | 1 | 7 |
| `simulation` | 4 | 5 | 0 | 0 | 0 | 0 | 0 | 5 |
| `util` | 2 | 4 | 0 | 0 | 0 | 0 | 0 | 4 |
| `ui` | 2 | 3 | 0 | 0 | 0 | 0 | 0 | 3 |
| всего | 330 | 800 | 111 | 309 | 15 | 35 | 7 | 1277 |

109 разных имён `OPENCODE_*`; чаще всего `OPENCODE_VERSION` (137), `OPENCODE_WORKTREE_BASE` и `_PATH` (по 66),
`OPENCODE_CHANNEL` (51), `OPENCODE_CONFIG_DIR` (26). `package.json` пакетов скрипт не изменил (CAT-01 — те же 3 файла).

**`util/src/global.ts` (для B1.4c).** Скрипт меняет две строки, каталог `app` не трогает:
`process.env.OPENCODE_TEST_HOME` → `LOGINOM_AI_AGENT_TEST_HOME` (стр. 19) и `OPENCODE_CONFIG_DIR` →
`LOGINOM_AI_AGENT_CONFIG_DIR` (стр. 81).

### Что пришлось поправить в скрипте

Первый прогон (337 файлов) просмотрен по правилам и по контексту каждого совпадения. Порча:

| Что | Где | Правка правила |
|---|---|---|
| `.opencode` как свойство: `registered()?.opencode`, `...opencode }`, `allThemes().opencode` — синтаксическая ошибка или другой смысл | `tui/test/keymap.test.tsx`, `core/test/voice.test.ts`, `tui/test/theme.test.ts` | перед `.opencode` не может стоять `\w $ . ? ! ) ]` |
| экранированный хост upstream `console\.opencode\.ai` в регулярном выражении | `core/src/console-access.ts` | обратная косая после `.opencode` — только не перед `.`; путь Windows `\\.opencode\\bin` меняется по-прежнему |
| URL upstream `https://formulae.brew.sh/api/formula/opencode.json` | `cli/src/services/updater.ts` и его тест | имена файлов внутри `http(s)://…` не меняются |
| файл темы `theme/assets/opencode.json`, `assets/v2/opencode.json`: импорт несуществующего файла | `tui/src/theme/index.ts`, три теста `tui`, комментарий; `packages/theme/test` импортирует старый путь | путь с сегментом `assets/` не меняется |
| имя сразу после `\n` не ловил `\b`: кадр регистрации SSH начинался с `LOGINOM_AI_AGENT_SSH_REGISTRATION_BEGIN`, а печать конца и разбор ждали `OPENCODE_SSH_REGISTRATION_END` | `gui-plugins/src/ssh/bootstrap.ts` (стр. 15, 49), `bootstrap.test.ts`, `command.test.ts` | имя начинается и после `\n`, `\r`, `\t` |
| `[\\/]\.opencode[\\/]` в регулярном выражении и `` `${path.sep}.opencode${path.sep}` `` не менялись (правило останавливалось на `[` и `$`): корень конфига проекта искался по старому каталогу (тест `gui-plugins` упал), отрицательная проверка путей наблюдателя в тесте `core` стала пустой. Найдено полным прогоном тестов | `gui-plugins/src/details/config-file.ts`, `core/test/config/config.test.ts` | после `.opencode` допустимы `[` и `$`; коммиты `af918a7717`, `656428d33a` |
| `OPENCODE_ZIG_CPU` и `OPENCODE_REAL_ZIG` переименованы в workflows, а читает их только `process-daemon` (`build.rs`, `script/release-bin/zig` — скрипт их не обрабатывает): сборка молча теряла бы baseline CPU | `.github/workflows/release-process-daemon.yml` | имена в списке `UNPROCESSED_READERS`, как ключи провайдеров |

Покрытие и исключения:
- `SOURCES`: `packages/*/*.config.test.ts` и `packages/*/vite.js`. Конфиги Desktop читают `LOGINOM_AI_AGENT_CHANNEL`,
  `_TARGET`, `_TEST_ONBOARDING`, а их тесты (`electron-builder.config.test.ts`, `electron.vite.config.test.ts`) задавали
  старые имена; `app/vite.js` читал `OPENCODE_CHANNEL`, который больше никто не задаёт. `vite.icons.ts` не добавлен: его
  заполнители `OPENCODE_FAVICON` парные с `index.html`, а `.html` скрипт не берёт.
- `EXCLUDED`: `tui/test/cli/tui/inline-tool-wrap-snapshot.test.tsx` — образец вывода `grep` с `OPENCODE_DB`;
  переименование удлиняет строку, и снимок `.snap` с переносами падает (2 теста). `core/drizzle.config.ts` — путь к БД
  разработчика upstream в его домашнем каталоге: изменённая строка стала бы для сканера секретов строкой форка.
- Первая версия защиты путей `assets/` (`[\w./-]*\bassets/…`) давала квадратичный перебор на длинных словах: `--check`
  не завершился за 2 минуты. Окончательное правило `\bassets/[\w./-]*` — 8 с на всё дерево.

Тесты — класс `ApplyIdentityRules` в `test_tools.py`, 7 тестов, каждый случай взят из файла, где он произошёл. На
скрипте до правки — `FAILED (failures=6)`, седьмой (регулярные выражения) на `4d79e5942f` — `FAILED (failures=1)`;
после — `OK`. Полные наборы — в «Итоговой проверке» ниже.

### Замыкание имён

Для каждого имени, которое переименовал прогон, искал старое написание в остальных файлах (кроме `services/` и
`docs/`). Оставшиеся пары:

| Где старое имя | Имена | Решение |
|---|---|---|
| `process-daemon/build.rs`, `script/release-bin/zig` | `OPENCODE_ZIG_CPU`, `OPENCODE_REAL_ZIG` | не переименовываются с обеих сторон (`UNPROCESSED_READERS`) |
| `desktop/*.config.test.ts`, `app/vite.js` | `OPENCODE_CHANNEL`, `_TARGET`, `_TEST_ONBOARDING` | покрыты `SOURCES` |
| `tui/test/…/inline-tool-wrap-snapshot.test.tsx` и `.snap` | `OPENCODE_DB`, `OPENCODE_DEV` (текст образца) | `EXCLUDED` |
| `app/index.html` и `app/vite.icons.ts` | `OPENCODE_FAVICON`, `OPENCODE_APPLE_TOUCH_ICON` | пара целиком вне прогона, согласована |
| корневой `package.json` (`dev:live`, `dev:vite:live`) | `OPENCODE_TUI_CHANNEL`, `OPENCODE_PASSWORD` | ручная задача Р-12 |
| `nix/opencode.nix`, `nix/desktop.nix` | `OPENCODE_VERSION`, `_CHANNEL`, `_CLI_NAME`, `_DISABLE_MODELS_FETCH` | ручная задача Р-12 |
| `strobe.json`, `desktop/perf/startup.bench.ts` | `OPENCODE_DB`, `OPENCODE_CONFIG_DIR`, `OPENCODE_TEST_HOME` и др. | ручная задача Р-12 |
| `cli/test/flag-identity.test.ts` | унаследованные `OPENCODE_*` | так задумано (`EXCLUDED`) |

Остаточный просмотр на `99b6395761`, по файлам, которые берёт скрипт, без усечения: каждое `.opencode` после
допустимого символа и каждое `OPENCODE_` без границы слова, кроме URL, путей `assets/` и списка оставленных имён.
`.opencode` осталось в 8 местах: класс CSS `.opencode-pierre-file-tree`, служебные файлы `.opencode-probe`
(`core/src/git.ts`) и `.opencode-version` (`core/src/skill/discovery.ts`, пишет и читает сам) — бренд, к Р-14;
фикстура `.opencode-test-missing`; id пакета winget upstream `anomaly\.opencode_` и хост `console\.opencode\.ai` —
так и надо; конец фразы в комментарии `formatter.test.ts`. `OPENCODE_` без границы — только `VITE_OPENCODE_*`
(43 места: переменные сборки веб-приложения, задаёт и читает покрытый код) — не трогались. Правило менять не
пришлось.

Не пары: `turbo.json` (`OPENCODE_DISABLE_SHARE` никто не читает), `app/perf/tabs.bench.ts` (`OPENCODE_PERF_SESSION`
задаёт и читает сам), тестовые `OPENCODE_PTY_*` в `process-daemon/tests`, `sdks/vscode` (`OPENCODE_CALLER` в v2 не
читается), `patches/install-korean-ime-fix.sh`.

### Сканер секретов

Изменённые строки больше не совпадают с файлом закреплённого v2.3.0, поэтому сканер (В-93) их проверяет. Первый
`bun run secrets staged` на прогоне дал 8 находок в 7 строках, например
`{"file":"packages/app/e2e/regression/settings.spec.ts","line":31,"rule":"personal-home-path"}`, статус `findings`.

Все восемь — искусственные домашние каталоги тестов upstream (пользователи `test`, `kit`, `me`, `new`) в строках, где
скрипт поменял имя файла конфига или установки. Разобраны построчно и записаны в `.gitleaksignore` отпечатками без
коммита (`файл:правило:строка`) с причиной; такой отпечаток действует и в `staged`, и в `range`. Девятая находка —
настоящий путь разработчика upstream в `core/drizzle.config.ts`: такие данные исключать нельзя, файл исключён из
скрипта (выше). После этого `staged` на каждом коммите ветки — `clean`;
`bun run secrets range oc2-migration HEAD` после коммита прогона — `{"status":"clean","commits":3, …}`.

Отпечатки привязаны к номерам строк: если upstream изменит эти файлы, сканер найдёт строки снова, и разбор повторяется.

### Каталог

- `catalog.json`: у CAT-09, CAT-10, CAT-11 снято `pending`. Прогон дал расхождения в `desktop`, `app`, `ui` и `tui`, а
  запись с `pending` и расхождениями `catalog-check.py` отклоняет; B1.7 предписывает для этого случая снять `pending` и
  описать правку. Маски не менялись.
- `catalog.md`: в разделах CAT-09…CAT-12 — «Назначение» с правками `apply-identity` (без чисел файлов: документ их не хранит), политика
  `merge` + `apply-identity.py`; прежний текст `pending` перенесён в «Не перенесено из 0.4» с задачей (B4, этап C,
  B2.3, B2.5d). CAT-02 — правки скрипта, оставленные имена `process-daemon`, блок отпечатков `.gitleaksignore`,
  устаревшие `OPENCODE_*` в `nix`, корневом `package.json` и `strobe.json`. CAT-03 — правки скрипта лежат в записях
  пакетов, видимый бренд и README — ручные задачи. CAT-13 — имена конфига `loginom-ai-agent.json(c)` и
  `.loginom-ai-agent` в `discovery.ts` (закрыта строка «имя файла в системном каталоге — B1.4»), переименования в пяти
  файлах записи, каталоги по каналу — B1.4c. Шапка «Имена» и правило «Для всех записей» — без «до B1.4».
- Распределение 330 файлов прогона по записям: CAT-02 — 46, CAT-09 — 21, CAT-10 — 74, CAT-11 — 18, CAT-12 — 166,
  CAT-13 — 5. Ещё `packages/gui-plugins/README.md` — CAT-03 (блок кода, который сверяет `sdk-docs`).
- Документы процедуры, где «до B1.4» стало неправдой: `procedure.md` (правило 3 шага 2: что команда оставляет, находки
  сканера), `guarantees.md` (G2 и строки охранных тестов), `adr-0001-modular-integration.md` (решение 2).

```text
$ python3 -I scripts/upstream-sync/catalog-check.py --summary     # код 0
against a6b15d33daf6: 344 divergent upstream files
  CAT-01: 3
  CAT-02: 49
  CAT-03: 2
  CAT-04: 0 (pending: B2.7d, B4.1)
  CAT-05: 0 (pending: B2.2, B2.3, B2.5, B2.6, B2.9)
  CAT-06: 0 (pending: B2.4)
  CAT-07: 0 (pending: B2.1, B2.7a, B4.1)
  CAT-08: 0 (pending: B2.7, B2.8, B3.2)
  CAT-13: 10
  CAT-09: 21
  CAT-10: 74
  CAT-11: 18
  CAT-12: 167
```

До правки каталога, на коммите прогона: `PROBLEM: pending entries with divergent files (describe the change, drop
pending): CAT-09, CAT-10, CAT-11`, код 1.

### Ручные правки по задачам

Не больше пяти файлов на задачу. «Откуда» — где пункт найден. Видимые строки — решение по каждой строке (CAT-03);
имена услуг upstream («OpenCode Console», «OpenCode Zen», «OpenCode Go») — не бренд продукта, их судьба — решение
владельца, не переименование.

| Задача | Пакет | Файлы | Что менять | Откуда |
|---|---|---|---|---|
| Р-1 | `product` | `test/repo-paths.test.ts` | три падения B1.4: пакет агента — `@opencode/cli` в `packages/cli`, а не `packages/opencode`; `turbo.json` v2 — JSONC, читать без `JSON.parse`; синтаксис `--filter …^...` и ложное `--filter name]` в `codemode/script/bench.ts`; исключения для устаревших путей в файлах самого v2.3.0 (`patches/install-korean-ime-fix.sh`, `script/release.ts`). Падения B5.1 и B2.7a не входят | B1.7 |
| Р-2 | `cli` | `src/commands/commands.ts`, `src/commands/handlers/{default,uninstall,upgrade,pair}.ts` | `OpenCode` в описаниях команд и сообщениях → `Loginom AI Agent` (`Product.name`) | grep строк |
| Р-3 | `cli` | `src/acp/{error,service,translate}.ts`, `src/services/update-preflight.tsx` | `OpenCode` в сообщениях ACP (метод входа «OpenCode Login») и экране обновления | grep строк |
| Р-4 | `tui` | `src/app.tsx`, `src/attention.ts`, `src/mini/runtime.lifecycle.ts`, `src/mini/footer.prompt.tsx`, `src/util/tool-display.ts` | заголовок терминала, уведомления, подсказки | grep строк |
| Р-5 | `tui` | `src/component/{dialog-update,terminal-pane,error-component}.tsx`, `src/config/index.tsx`, `src/util/error-details.ts` | диалог обновления (0.4: «имя продукта в пункте и диалоге обновления»), ошибки | CAT-11, grep |
| Р-6 | `tui` | `src/mini/footer.permission.tsx`, `src/routes/session/permission.tsx`, `src/feature-plugins/sidebar/footer.tsx`, `src/component/{usage,dialog-go-upsell}.tsx` | «Tell OpenCode…», бесплатные модели, OpenCode Console и Go: переименовать или скрыть — решение владельца | grep строк |
| Р-7 | `tui` | `src/logo.ts`, `src/component/logo.tsx`, `src/routes/home.tsx`, `src/feature-plugins/home/footer.tsx` | слово-знак и главная страница — `Product.wordmark` «Loginom AI» | CAT-11 (0.4) |
| Р-8a, Р-8b | `tui`, `theme` | а: `src/theme/assets/opencode.json`, `src/theme/assets/v2/opencode.json`, `src/theme/index.ts` (и комментарий в `error-component.tsx` из Р-5); б: `test/theme.test.ts`, `test/cli/tui/theme-mode.test.tsx`, `test/theme/v2/v1-migrate.test.ts`, `packages/theme/test/theme.test.ts` | тема по умолчанию `opencode`: оставить имя темы upstream или переименовать — решение; скрипт её больше не трогает | B1.3a, прогон |
| Р-9 | `desktop` (B4) | `src/main/constants.ts`, `src/main/windows/{early,appearance}.ts`, `src/renderer/index.html`, `src/renderer/migration-status.tsx` | `APP_NAME` по каналам, заголовки окон | grep строк |
| Р-10 | `desktop` (B4) | `electron-builder.config.ts`, `src/main/lifecycle/{environment,deep-link,index}.ts`, `src/main/lifecycle/deep-link.test.ts` | схема `opencode` → `Product.scheme` (`loginom-ai-agent`): `schemes`, `setAsDefaultProtocolClient`, разбор `opencode://`; вход OpenCode Console через `opencode://console/authorized` — решение | B0.4 |
| Р-11 | `desktop` (B4) | `package.json`, `script/pack.ts`, `resources/windows/installer.nsh` | кэш обновлятора `%LOCALAPPDATA%\@opencodedesktop-updater` (из имени пакета в `updaterCacheDirName`); `customUnInstall` удаляет ключ протокола и копию установщика | B0.4 |
| Р-12 | корень | `package.json` (`dev:live`, `dev:vite:live`), `nix/opencode.nix`, `nix/desktop.nix`, `strobe.json`, `packages/desktop/perf/startup.bench.ts` | старые `OPENCODE_*` и `opencode service` в инструментах разработчика | замыкание имён |
| Р-13 | `cli`, `util`, `core` | `cli/src/database-path.ts`, `util/src/observability/logging.ts`, `core/test/logging.test.ts`, `core/test/effect/observability.test.ts`, `cli/script/service-smoke.ts` | файлы БД `opencode-<канал>.db` и журнала `opencode.log`, `opencode-<канал>.log` (правило `opencode.db` их не ловит) | B1.7, прогон |
| Р-14 | `core` | `src/project.ts`, `src/git.ts`, `test/project.test.ts`, `test/git.test.ts` | кэш id проекта `.git/opencode` в репозитории пользователя | B1.3a |
| Р-15 | `util` | `src/observability.ts`, `src/observability/otlp.ts`, `core/test/effect/observability.test.ts` | имя клиента и службы телеметрии `opencode` — решение | grep |
| Р-16 | `process-daemon` | `Cargo.toml`, `Cargo.lock`, `src/daemon/windows.rs`, `src/transport/windows.rs` | имя crate и бинарника `opencode-pty`, канал Windows `\\.\pipe\opencode-pty-<instance>`. Ждёт ответа владельца B1.3b: собирать ли свой бинарник | B1.3b |
| Р-17 | `core`, `cli` | `core/src/persistent-pty/{binary.bun,binary.node}.ts`, `cli/src/node/target.ts`, `cli/script/{opencode-pty,node-assets}.ts` | поиск бинарника и каталог `<bin>/opencode-pty/`; вместе с Р-16 | B1.3b |
| Р-18 | `core` | `src/plugin/skill/opencode.md`, `src/plugin/skill/report.md`, `src/plugin/command/initialize.txt` | тексты встроенных навыков: пути `~/.config/opencode`, `~/.local/share/opencode/log/opencode.log`, «OpenCode config» | прогон |
| Р-19 | корень | `install` | `INSTALL_DIR=$HOME/.opencode/bin` → `.loginom-ai-agent/bin` (решение владельца, CAT-02); имя бинарника — B2.7a | CAT-02 |
| Р-20 | документы | `AGENTS.md`, `packages/{desktop,process-daemon,app}/README.md`, `packages/app/AGENTS.md` | `OPENCODE_STORY`, `OPENCODE_FLAGS`, `OPENCODE_CHANNEL`, `OPENCODE_PTY_SOCKET_DIR`, `.opencode/skills` | CAT-03 |
| Р-21 | документы | `README.md`, `packages/app/perf/README.md`, `packages/plugins/README.md`, `packages/sdk/README.md` | то же | CAT-03 |
| Р-22…Р-26 | документы | 22 корневых `README.*.md`, по 4–5 на задачу | переведённые README (CAT-03); или решение их не поставлять | CAT-03 |

Итого 27 задач: `product` 1, `cli` 2, `tui` 6, `desktop` 3 (все в B4), `core`/`util`/`process-daemon` 6, корень 2,
документы 7. Ждут решения владельца: Р-6, Р-8, Р-10 (вход Console), Р-15, Р-16 и Р-17, Р-22…Р-26.

Не задачи B1.4, для справки: имя команды `opencode` в сообщениях (39 строк в 19 файлах `cli`, `tui`, `gui-plugins`: «run `opencode pair`», «opencode upgrade», «`opencode mcp add`») — вместе с именем бинарника, B2.7a; без этого BRAND-01 для CLI не закрыть. Имя бинарника CLI `opencode` в путях установки (`cli/src/services/updater.ts` `curlPath`,
`desktop/src/main/service/desktop-cli.ts`, `desktop/script/utils.ts`, удалённый путь SSH в `gui-plugins/src/ssh`) —
B2.7a; строки и адреса обновлятора CLI (`opencode.ai/update`, `formulae.brew.sh`) — B2.7d (CAT-04); `appId`
`ai.opencode.desktop` и onboarding по каталогу `opencode` в userData — B4.1; хранилища по каналу — B1.4c; каталог
`.opencode/` самого репозитория (навыки для разработки) продукт больше не находит — так и должно быть.

### Тесты

Полные наборы, `oc2-migration` (отдельное чистое дерево) → ветка. Сравнивались число прошедших и упавших и имена
упавших тестов (`bun test` печатает их строками `(fail)`). Bun 1.4.4, Node 24.19.0, `LOGINOM_AI_AGENT_TEST_NODE` задан.

| Пакет | Команда | `oc2-migration` | B1.4a |
|---|---|---|---|
| `cli` | `bun test --timeout 60000` | 407 pass, 0 fail | 407 pass, 0 fail |
| `core` | `bun run script/test.ts` | 7118 pass, 3 fail | 7118 pass, 3 fail — те же: `ShellParse > extracts static directory targets…` и два `flock` (прогон под root) |
| `server` | `bun test` | 127 / 0 | 127 / 0 |
| `client` | `bun test` | 262 / 0 | 262 / 0 |
| `util` | `bun test` | 145 / 0 | 145 / 0 |
| `desktop` | `bun test --timeout 30000` | 528 / 0 | 528 / 0 |
| `tui` | `bun test --timeout 30000` | 1672 / 1 | 1672 / 1 — то же `the art stops every frame when hidden…` |
| `app` | `bun run test` (unit и browser) | 3075 / 0 | 3075 / 0 |
| `ui` | `bun test src` | 620 / 0 | 620 / 0 |
| `gui-plugins` | `bun test` | 1129 / 0 | 1129 / 0 |
| `schema` | `bun test` | 92 / 0 | 92 / 0 |
| `plugin` | `bun test` | 37 / 0 | 37 / 0 |
| `simulation` | `bun test --timeout 30000` | 48 / 0 | 48 / 0 |
| `script` | `bun test` | 59 / 12 | 59 / 12 — те же 12 тестов архивов сканера секретов |
| `product` | `bun test` | 56 / 5 | 56 / 5 — те же 5 в `repo-paths.test.ts` (B1.4: Р-1; B5.1, B2.7a) |

Первый полный прогон ветки дал два новых падения, оба — последствия переименования:
- `core`: `ConfigDiscovery.discover > probes candidates when readDirectory reports a differently cased entry` —
  фикстура `.OPENCODE` в другом регистре, кандидат теперь `.loginom-ai-agent`. Исправлено руками (`eb1ab715e6`).
- `gui-plugins`: `setup sessions run in the global configuration's directory…` — регулярное выражение с `.opencode`
  в `config-file.ts` скрипт не менял. Исправлено правилом (`af918a7717`, `656428d33a`).

Полные наборы ветки — на `67ed7b618f`. Потом менялись только `core` (тест `discovery`, `config.test.ts`), `gui-plugins`
(`config-file.ts`) и документы; `core` и `gui-plugins` прогнаны ещё раз на `656428d33a`: 7118 / 3 (те же три) и 1129 / 0.

Охранные тесты отдельно, после снятия `test.failing`:

```text
$ cd packages/product && bun test test/names.test.ts
 9 pass
 0 fail
$ cd packages/cli && bun test test/flag-identity.test.ts
 3 pass
 0 fail
```

Typecheck (`bun typecheck` в каталоге пакета) после прогона — 0 ошибок в `cli`, `core`, `server`, `client`, `util`,
`desktop`, `tui`, `app`, `ui`, `gui-plugins`, `schema`, `plugin`, `simulation`, `product`. Сгенерированный клиент и
OpenAPI не изменились: `bun run check:generated` в `packages/client` и `packages/protocol` — код 0, `git status` чистый
(прогон менял описания в `schema/src/config`).

### Итоговая проверка

На `8f8a4984b5` (после него — только этот журнал), Bun 1.4.4 и Node 24.19.0 первыми в `PATH`, из корня дерева:

```text
$ python3 -I scripts/upstream-sync/apply-identity.py --repo . --check
would change: 0 files                                   # код 0
$ python3 -I scripts/upstream-sync/catalog-check.py --summary
against a6b15d33daf6: 344 divergent upstream files      # код 0, состав — в разделе «Каталог»
$ bun run secrets range oc2-migration HEAD
{"status":"clean","commits":10,"archives":0, …}
$ bun run check                                         # код 0, 50 с
Found 522 warnings and 0 errors.
sdk-docs: … 11 guide blocks match their source; 0 problem(s)
 Tasks:    38 successful, 38 total
Cached:    0 cached, 38 total
$ TMPDIR=<scratchpad> scripts/upstream-sync/selftest.sh  # на 656428d33a: после него менялись только README и документы
SELFTEST PASS                                           # код 0, 1 мин 56 с
```

Внутри `selftest.sh`: `test_tools.py` (70 тестов, в том числе 7 `ApplyIdentityRules`), `test_acceptance.py`,
`test_stand.sh`, док-тест `procedure.md` (`RESULT: ACCEPTED`) и случай уже слитого тега.

Первый `bun run check` (на `656428d33a`) был красным: `sdk-docs` — `packages/gui-plugins/README.md:541 the code block
differs from packages/gui-plugins/src/pairing/main.ts at its line 24`. README повторяет исходник, а скрипт README не
берёт. Исправлено тем же скриптом по явному пути (`8f8a4984b5`); других документов с блоками `<!-- source: … -->`,
которые меняет скрипт, нет.

### Где решал сам

- **Снят `pending` у CAT-09, CAT-10, CAT-11**, хотя задание называло записи CAT-03, CAT-12, CAT-13. Иначе
  `catalog-check.py` красный: прогон дал расхождения в масках этих записей. Меньший вариант без нового правила — снять
  `pending` и описать правку, как предписал B1.7. Перечислять 113 файлов явными путями в CAT-03 перед ними — длиннее и
  прячет от записей пакетов будущие правки в тех же файлах. Задачи 0.4 сохранены в «Не перенесено». **Спорное.**
- **Восемь отпечатков в `.gitleaksignore`** для искусственных путей тестов upstream. Правило документа о сканере
  («специальные исключения — для конкретного искусственного значения, места и с объяснением») это допускает; решение
  В-94 было про сторонние исходники, здесь — код upstream, который форк изменил. Отпечатки без коммита, чтобы
  действовали и в `staged`, и в `range`; цена — такой отпечаток пропустит любое новое совпадение того же правила в той
  же строке файла, а не только разобранное значение. Настоящий путь разработчика upstream не исключал: файл не трогает
  скрипт. **Нужно решение владельца до публикации:** PR-проверка берёт исключения из базовой ветки, поэтому блок
  должен попасть в `loginom` раньше PR переноса, как закрепление В-93; у исключений B1.6 было решение В-94, у этих нет.
- **Порчу исправлял правилами скрипта**, не результатом: прогон — один коммит, который воспроизводится командой и
  проходит `--check` с кодом 0.
- **`.github/` переименован вместе с остальным**, как было в `SOURCES` 0.4: workflows upstream задают переменные для
  скриптов выпуска, которые тоже переименованы. Секреты и `vars` GitHub прогон не тронул (в именах их нет).
- **Имена переменных `process-daemon` — список в скрипте**, а не исключение файлов workflows: так остальные имена в тех
  же workflows переименовываются.
- **Тема `opencode` не переименована.** Это файл и имя темы upstream, а не конфиг. Переименовать ли — Р-8.
- **`opencode-<канал>.db` и `opencode-<канал>.log` — ручная задача Р-13**, а не правило скрипта: имя собирается
  шаблоном (`` `opencode-${…}.db` ``), общего правила без ложных срабатываний не нашёл.
- **Снимок TUI — исключение файла теста**, а не обновление `.snap`: так файл остаётся равным upstream.
- **`.OPENCODE` в `core/test/config/discovery.test.ts` — правка руками** (`.LOGINOM-AI-AGENT`), не правило: это
  единственное написание в другом регистре, а правило с сохранением регистра сложнее самой правки. Записано в CAT-12.
- **Корневые `package.json`, `nix/`, `strobe.json` в `SOURCES` не добавлены**: это инструменты разработчика upstream,
  которые ищут установленный `opencode`; их правка — Р-12.

### Найдено, не чинил

- `names.test.ts` проверяет `OPENCODE_*` только в `src`, `script`, `scripts` пакетов из своего списка, без `tui`,
  `ui`, тестов и `.github`: его зелёный результат не говорит о 32 именах, переименованных в `tui`. Их покрывают тесты
  `tui` и `apply-identity --check`.
- `packages/core/src/plugin/skill/opencode.md` после прогона называет конфиг `~/.config/opencode/loginom-ai-agent.json(c)`:
  каталог в тексте прежний (Р-18).
- `core/src/tool/plugin/shell.ts` ставит дочерним оболочкам `OPENCODE=1` (без `_`, правило его не берёт): метка «запущено
  из агента» для скриптов пользователя; переименовать ли — решение, добавить к Р-13 или Р-15.
- `VITE_OPENCODE_CHANNEL` в `desktop/electron.vite.config.ts` правило не берёт (`_` перед `OPENCODE`): имя внутреннее,
  обе стороны в одном файле, не трогал.
- Строки `gui-plugins/src/updater/web-driver.ts` (`loginom-ai-agent.updater.reset`, имя `BroadcastChannel`) переименованы
  правилом `opencode.updater`: имя внутреннее и одно, поведение не меняется.

### Не проверено

- Windows и macOS: всё на Linux. Пути Windows в правиле `.opencode` проверены только тестом скрипта.
- Workflows и скрипты выпуска upstream в `.github/release/` не запускались: переименование согласовано по чтениям, не
  прогоном. Сборка CLI и Desktop не собиралась; «в собранном CLI нет имён OpenCode» (BRAND-01) — не проверялось, это
  приёмка B1.4 целиком (ручные задачи и B2.7a).
- e2e `app` (Playwright, `packages/app/e2e`) не запускались: в них 4 файла прогона; `bun test` пакета `app` их не берёт.
- `process-daemon` (`cargo test`) не запускался: скрипт его не меняет.
- Пароль и каталоги при унаследованных `OPENCODE_*` проверены тестом `flag-identity` из исходников (канал `local`), не
  в установленной сборке.

## B1.4c Хранилища каналов prod, beta и dev

22.11.2026. Ветка `b14c-channels` от `oc2-migration` (`4b65c9ba94`), рабочее дерево `.claude/worktrees/b14c`. Bun 1.4.4
переносной — первым в `PATH` только для своих команд и `git commit`. `bun install --frozen-lockfile`: код 0, `.husky/_`
появился, хук `pre-commit` срабатывал на каждом коммите. `apply-identity` до переноса не запускался (его гоняет B1.4a).
Раздел написан до B1.4a и называет константу канала `OPENCODE_CHANNEL`. После переноса на `5ab3dbae96` она называется
`LOGINOM_AI_AGENT_CHANNEL`, см. «Перенос» в конце раздела.

### Коммиты

| Коммит | Что | `bun run secrets staged` |
|---|---|---|
| `fb6a8e7401` `feat: keep prod, beta and dev storage in separate directories` | `util`, Desktop, манифесты, `bun.lock`, тесты | `clean` |
| `66823bfb50` `docs(migration): record B1.4c channel storage and its checks` | `catalog.md` (CAT-01, CAT-13), этот раздел | `clean` |
| `8ecb1fc4d5` `test(desktop): share the transpiler cache in the channel pairs test` | кэш транспилятора в тесте Desktop | `clean` |
| `53dc6c3dfa` `docs(migration): note the B1.4a merge risk and the 0.4 CLI channel source` | уточнения раздела после ревью | `clean` |
| `4a804816f1` `chore: merge oc2-migration with the B1.4a identity run into b14c-channels` | перенос на `5ab3dbae96`, разрешение конфликтов | `clean` |
| `32c61f7f49` `chore(identity): apply product names to the B1.4c channel code` | вывод `apply-identity`, 7 файлов | `clean` |
| следующий | журнал переноса | |

### Способ и почему

**Канал — существующая константа сборки `OPENCODE_CHANNEL`, правило — `productChannel` и `productSlug` из
`@loginom-ai-agent/product` (новая зависимость `util`).**

- Сборка CLI уже подставляет `OPENCODE_CHANNEL` во весь бандл (`cli/script/build.ts`, `vite.node.config.ts`); по ней
  upstream уже выбирает имя БД и файл регистрации (`cli/src/version.ts`). `util/src/global.ts` читает ту же константу
  тем же способом, что `version.ts` (`typeof … === "string"`). Нового ключа define и нового механизма нет.
- Переменная окружения не годится. `Global` считает пути при импорте модуля, раньше любого кода CLI. Окружение
  наследуют дочерние процессы: CLI из терминала Desktop взял бы канал Desktop. Пользователь мог бы перевести prod на
  данные dev. Так было в 0.4 (`a080f7725c:packages/core/src/global.ts`, `LOGINOM_AI_AGENT_CHANNEL ?? "prod"`, задавал
  Desktop). CLI 0.4 брал канал из той же переменной, а без неё — из константы сборки (`standalone.ts`, `cliChannel()`:
  `LOGINOM_AI_AGENT_CHANNEL ?? InstallationChannel`, `local` → dev).
- Зависимость `util → product` вместо литерала правила: правило каталога одно, в `product`. `product` своих
  зависимостей не имеет, цикла нет. `bun run build` и `bun run typecheck:dist` в `packages/util` — код 0, TS6059 нет.
  Desktop тоже берёт правило из `product` (`devDependencies`, пакет попадает в бандл main, как остальные workspace-пакеты).
- Сведение канала сборки к каналу продукта: `latest` → `prod` в `util/src/global.ts`, дальше `productChannel` без
  изменений: `prod`, `beta` — как есть, остальное — `dev`. Контракт `productChannel` не менялся. Desktop сворачивает
  `latest` в `prod` и `local` в `dev` сам (`electron.vite.config.ts`), поэтому читает свою константу
  `import.meta.env.OPENCODE_CHANNEL` прямо.
- Запуск из исходников и любая сборка, кроме `latest`/`prod`/`beta`, — канал dev (`productChannel(undefined)`). Это
  следствие правила продукта и совпадает с 0.4: CLI 0.4 сводил `local` к dev, Desktop разработки — тоже. Иначе окно
  разработки (канал dev) разошлось бы со службой из исходников.

| Сборка CLI (`OPENCODE_CHANNEL`) | Канал продукта | Каталог |
|---|---|---|
| `latest`, `prod` | prod | `loginom-ai-agent` |
| `beta` | beta | `loginom-ai-agent-beta` |
| `dev`, `next`, имя ветки, `local`, без константы (исходники) | dev | `loginom-ai-agent-dev` |

### Правки файлов upstream

| Файл | Строк против v2.3.0 (было после B1.3a) | Что |
|---|---|---|
| `util/src/global.ts` | +9 −1 (+3 −1) | константа сборки → `productSlug(productChannel(…))`; данные, конфиг, состояние, кэш, журналы, `tmp` |
| `util/package.json` | +1 | `@loginom-ai-agent/product` в `dependencies` (CAT-01) |
| `desktop/package.json` | +1 | `@loginom-ai-agent/product` в `devDependencies` (CAT-01) |
| `bun.lock` | +2 | две строки зависимостей (CAT-01) |
| `desktop/src/main/service/background-service.ts` | +2 −9 (+5 −3) | `const file = serviceFile()` вместо ветки `service-local.json`; лишний `Path.Path` убран |
| `desktop/src/main/native/logging.ts` | +2 −1 (+6 −1) | журналы службы — из каталога канала |
| `cli/script/service-smoke.ts` (CAT-02) | +12 −6 против `4b65c9ba94` | каталог собранного бинарника — по маске `loginom-ai-agent*`: канал задаёт сборка |

Файл форка `desktop/src/main/service/service-identity.ts`: `directory` — каталог канала сборки Desktop;
`serviceFile()` возвращает файл всегда: `service-<identity>.json`, `service-local.json` сервера разработки или
`service.json`. Без identity (так будет до B4) окно раньше доходило до `fallback()` клиента, а клиент канала не знает:
окно beta или dev ждало бы регистрацию в каталоге prod и через 120 с показало бы ошибку запуска сервера.
`sidecar-probe.ts` не менялся — он уже передаёт `serviceFile()`.

Тесты upstream с литералом `loginom-ai-agent` (B1.3a) запускают CLI из исходников и теперь ждут
`loginom-ai-agent-dev`: `cli` — 8 файлов, `core/test/preload.test.ts` и пара к нему `core/script/test.ts`
(`OPENCODE_CONFIG_DIR`), `server/test/fetch.test.ts`, `util/test/global.test.ts`. Три строки `cli` prettier перенёс.

### Что от канала не зависит

- **Системный каталог конфига и MDM** (`core/src/config/discovery.ts`) не менялись. В 0.4 они от канала не зависели
  (`a080f7725c:packages/opencode/src/config/managed.ts`: `/etc/loginom-ai-agent`, `com.loginom.aiagent.managed`).
  Меньший вариант — оставить: одна политика администратора действует на prod, beta и dev.
- **`process-daemon`** не менялся. Продукт запускает его с `--runtime-dir <Global.state>/pty`
  (`core/src/persistent-pty/index.ts`) — каталог канала приходит оттуда. Литерал в Rust — значение по умолчанию для
  запуска без `--runtime-dir`. Имя сокета — хеш каталога, поэтому сокеты каналов не совпадают.
- **`client/src/service-probe.ts` `fallback()`** не менялся: `service.json` каталога prod. Продукт его больше не
  вызывает: CLI всегда передаёт `ServiceConfig.options().file`, Desktop — `serviceFile()`. Клиент — общий пакет без
  канала. Зависимость `client → product` не добавлялась: по правилу `AGENTS.md` клиент зависит от Schema и Protocol.

### Тесты

Новые и изменённые тесты форка:
- `packages/util/test/product-channel.test.ts` (новый): одна таблица, каждая строка — свой процесс
  `bun --define OPENCODE_CHANNEL=…`. Сборки `latest`, `prod`, `beta`, `dev`, `next`, имя ветки и без константы. Данные,
  кэш, конфиг, состояние, журналы и `tmp` лежат в своём каталоге, всего каталогов три, у prod суффикса нет.
- `packages/desktop/src/main/service/service-identity.test.ts`: таблица пар «окно Desktop ↔ собранный с ним CLI»: prod ↔
  `latest`, beta ↔ beta, dev ↔ dev, сервер разработки (dev + `OPENCODE_DESKTOP_SERVER_CHANNEL=local`) ↔ CLI из
  исходников, prod ↔ `latest` под identity. `serviceFile()` окна равен файлу настоящего `ServiceConfig.options()` CLI в
  общем корне, и путь — ожидаемый. Ожидания четырёх строк `serviceFile()` и проверки чужого `service.json` — в каталоге
  dev: в тесте константы сборки нет.
- `packages/cli/test/service-identity.test.ts` (B1.3a): каталог перенесённых файлов зависит от канала: `latest` — prod,
  `preview-a` — dev. Службы из исходников — в `loginom-ai-agent-dev`.

Мутации, каждая откатывалась:
- `const app = "loginom-ai-agent"` в `util/src/global.ts` — падают `product-channel` и пары Desktop;
- без `latest` → `prod` — падает `product-channel`;
- литерал каталога в `service-identity.ts` — падают все шесть тестов Desktop;
- без ветки `service-local.json` — падают пары Desktop.

Полные наборы пакетов: `oc2-migration` (`4b65c9ba94`, отдельное чистое дерево в scratchpad) → `b14c-channels`
(`fb6a8e7401`). Наборы шли по очереди, Bun 1.4.4, `LOGINOM_AI_AGENT_TEST_NODE` задан:

| Пакет | Команда | До | После |
|---|---|---|---|
| `util` | `bun test` | 145 pass, 0 fail | 146 pass, 0 fail: +1 `product-channel` |
| `client` | `bun test --timeout 5000` | 262 pass, 0 fail | 262 pass, 0 fail |
| `desktop` | `bun test --timeout 30000` | 528 pass, 4 skip, 0 fail | 529 pass, 4 skip, 0 fail: +1 пары каналов |
| `server` | `bun test` | 127 pass, 1 skip, 0 fail | то же |
| `cli` | `bun test --timeout 30000` | 407 pass, 9 skip, 0 fail | то же |
| `core` | `bun run script/test.ts` | 7118 pass, 354 skip, 3 fail | то же; падения те же: `ShellParse > extracts static directory targets…`, `util.effect-flock > fails on unwritable lock roots`, `util.flock > fails clearly on unwritable lock roots` (прогон под root) |
| `product` | `bun test` | 56 pass, 5 fail | то же; те же пять `repo-paths` (B1.4, B5.1, B2.7a) |

Тронутые файлы отдельно:

```text
$ cd packages/util && bun test test/product-channel.test.ts test/global.test.ts
 4 pass
 0 fail
Ran 4 tests across 2 files. [946.00ms]
$ cd packages/desktop && bun test src/main/service/service-identity.test.ts
 6 pass
 0 fail
Ran 6 tests across 1 file. [1319.00ms]
$ cd packages/cli && bun test --timeout 60000 test/service-identity.test.ts test/flag-identity.test.ts test/debug-paths.test.ts
 10 pass
 0 fail
Ran 10 tests across 3 files. [11.20s]
```

Собранный CLI: доходит ли define до `util` в бандле. Сборка `beta` без веб-интерфейса, корень — временный каталог:

```text
$ cd packages/cli && OPENCODE_CHANNEL=beta bun run script/build.ts --single --skip-install --skip-web-ui --outdir=<tmp>/cli-beta
building cli-linux-x64                                  # код 0
$ env -i PATH=… HOME=<root> XDG_{DATA,CONFIG,STATE,CACHE}_HOME=<root>/… TMPDIR=<root>/tmp <tmp>/cli-beta/cli-linux-x64/bin/opencode debug paths
data       <root>/data/loginom-ai-agent-beta
cache      <root>/cache/loginom-ai-agent-beta
config     <root>/config/loginom-ai-agent-beta
state      <root>/state/loginom-ai-agent-beta
tmp        <root>/tmp/loginom-ai-agent-beta
log        <root>/data/loginom-ai-agent-beta/log
db         <root>/data/loginom-ai-agent-beta/opencode.db
$ … opencode --version
opencode v0.0.0-beta-202611221116
```

`script/service-smoke.ts` на этом бинарнике (скопирован в `packages/cli/dist` и затем удалён). Регистрация нашлась в
`state/loginom-ai-agent-beta`, прошли ожидание готовности, сокет MCP и обе проверки аутентификации по токену. Дальше
падение `Compiled service did not serve the web UI` — веб-интерфейс в сборку не входил (`--skip-web-ui`). Журнал
службы в выводе ошибки есть: маска нашла `data/loginom-ai-agent-beta/log/opencode.log`.

### Проверки

- `bun typecheck` в `util`, `desktop`, `cli` — 0 ошибок; в `util` ещё `bun run typecheck:tsc`, `bun run build` и
  `bun run typecheck:dist` — код 0 (зависимость от `product` не ломает сборку `dist`).
- `bun install --frozen-lockfile` после правки манифестов — `no changes`.
- `python3 -I scripts/upstream-sync/catalog-check.py --summary` — код 0: 30 → 32 расходящихся файла, CAT-01 3 → 5
  (`util/package.json`, `desktop/package.json`), CAT-13 — 10, CAT-12 — 11, без изменений.
- `bun run check` из корня на `fb6a8e7401` — код 0: `oxlint` `Found 517 warnings and 0 errors`,
  `Tasks: 38 successful, 38 total`, `Cached: 0 cached`. Предупреждения в изменённых файлах — только
  `anti-slop(require-readable-spacing)` и `no-unknown-returns` в тесте Desktop (у теста B1.3a их было больше);
  `service-identity.ts` — без предупреждений.
- prettier по всем изменённым `.ts` — чисто.

### Где решал сам

- Канал — константа сборки, правило — из `product` через зависимость `util` (выше). Desktop тоже зависит от `product`.
- `latest` → `prod` сводится в `util/src/global.ts`, а не в `productChannel`: контракт `product` без изменений.
- **Спорное:** запуск из исходников — канал dev. Отсюда правки ожиданий в тестах upstream: они ждут
  `loginom-ai-agent-dev`.
- Системный каталог, MDM, `process-daemon` и `fallback()` клиента от канала не зависят (выше). **Спорное:** одна политика
  администратора на три канала. План B1.3b называл MDM для beta и dev задачей B1.4; сделано меньшее, как в 0.4.
- **Спорное:** контракт шва B1.3a изменён — `serviceFile()` Desktop теперь возвращает файл всегда, а не только под
  identity. Ветка `service-local.json` переехала
  туда же из `background-service.ts`; пустой `XDG_STATE_HOME` там теперь, как у CLI, значит «не задан».
- `service-smoke.ts` ищет каталог по маске, а не знает канал бинарника: канал задаёт CI.

### Найдено, не чинил

- **Порт.** Без identity службы всех каналов слушают порт канала upstream `0xc0de` (`ServiceConfig.defaultPort`).
  Службы prod и beta одновременно: вторая не стартует («port … is already in use»). Чужую при этом не подхватывает.
  Identity и явный порт задают B4 и B2.7c.
- CLI, собранный с `OPENCODE_CHANNEL=prod`, пишет `service-prod.json`: upstream `ServiceConfig.filename` знает `latest`,
  а не `prod`. Окно prod ищет `service.json`, в паре с CLI `latest`, как в `release.yml`. Сборку CLI с `prod` выбирает B5.
- `product/src/dashboard-root.ts` берёт корень данных из `LOGINOM_AI_AGENT_CHANNEL ?? "prod"`: для beta и dev и для
  запуска из исходников он разойдётся с `Global`. Вызовов на дереве нет, только тест `product`; связку дашбордов делает
  B2.9.
- `names.test.ts`, проверка `OPENCODE_*` (`test.failing` до B1.4): совпадений на 12 больше — `OPENCODE_CHANNEL` в
  `util/src/global.ts`, `service-identity.ts` и тесте Desktop, `OPENCODE_DESKTOP_SERVER_CHANNEL` переехал. После
  переноса на B1.4a — ноль (ниже).
- **Риск при слиянии с B1.4a (`b14a-identity-script`), текстового конфликта не будет. Снят переносом (ниже).** `wants()` в
  `apply-identity.py` покрывает и ключи define (`cli/script/build.ts`, `cli/vite.node.config.ts`,
  `desktop/electron.vite.config.ts` — маски `script/` и `packages/*/*.config.ts`), и мои чтения (`util/src`,
  `desktop/src`, тесты). Проверено копией регулярки `SOURCES`, скрипт не запускался. Но на ветке B1.4a чтений
  `OPENCODE_CHANNEL` в `util/src/global.ts` и `service-identity.ts` нет. После слияния ключи define станут
  `LOGINOM_AI_AGENT_CHANNEL`, а чтения останутся `OPENCODE_CHANNEL`: все сборки молча уйдут в каталог dev. Тесты
  этого не поймают: тест и чтение переименуются или не переименуются вместе. После слияния нужен прогон
  `apply-identity` по всему дереву и `debug paths` собранного CLI.

### Не проверено

- Windows и macOS: всё на Linux.
- Окно Desktop под Electron и собранный Desktop: свёртку `latest` → prod и `local` → dev в `electron.vite.config.ts`
  тест через окружение не доказывает, она проверена только чтением кода. Пары окна и CLI проверены подстановкой
  константы окну через `import.meta.env` в Bun.
- Собранный CLI: до переноса — только `beta`, после — `latest`, `beta` и `dev` (ниже), все без веб-интерфейса.
  `service-smoke.ts` до конца не прошёл: веб-интерфейс не собирался.
- Две службы разных каналов одновременно не запускались (порт — выше).

### Перенос на `oc2-migration` после B1.4a (`5ab3dbae96`)

B1.4c принят по проверке, но в `oc2-migration` уже влит B1.4a (прогон `apply-identity`). По команде координатора
`oc2-migration` влит в `b14c-channels` слиянием (`4a804816f1`, родители `53dc6c3dfa` и `5ab3dbae96`), без rebase.

Конфликты и как разрешены:

| Файл | Разрешение |
|---|---|
| `desktop/src/main/service/background-service.ts` | сторона B1.4c: `const file = serviceFile()`; ветка `service-local.json` B1.4a (с `LOGINOM_AI_AGENT_DESKTOP_SERVER_CHANNEL`) живёт в `service-identity.ts` |
| `core/script/test.ts`, `cli/test/service.test.ts`, `cli/test/debug-heap-dump.test.ts` | сторона B1.4c (каталог `loginom-ai-agent-dev`), имена переменных — следующим прогоном `apply-identity` |
| `docs/upstream-sync/catalog.md`, CAT-13 | текст B1.4c, в него перенесены правки B1.4a: имена `loginom-ai-agent.json(c)` и `.loginom-ai-agent`, переименованные чтения пяти файлов записи, `OPENCODE_ZIG_CPU` и `OPENCODE_REAL_ZIG`; константа канала названа по-новому |
| этот журнал | раздел B1.4a целиком из `5ab3dbae96`, затем раздел B1.4c целиком |

Остальные файлы слились сами, в том числе `util/src/global.ts` (B1.4a переименовал там `…_TEST_HOME` и `…_CONFIG_DIR`).
После слияния ключи define уже были `LOGINOM_AI_AGENT_CHANNEL`, а чтения B1.4c — `OPENCODE_CHANNEL`. Это и есть риск,
названный выше.

`apply-identity` по всему дереву после разрешения (`32c61f7f49`):

```text
$ python3 -I scripts/upstream-sync/apply-identity.py --repo .
changed: 7 files
packages/cli/test/debug-heap-dump.test.ts
packages/cli/test/service.test.ts
packages/core/script/test.ts
packages/desktop/src/main/service/service-identity.test.ts
packages/desktop/src/main/service/service-identity.ts
packages/util/src/global.ts
packages/util/test/product-channel.test.ts
$ python3 -I scripts/upstream-sync/apply-identity.py --repo . --check
would change: 0 files
```

Первый `--check` во время слияния назвал 13 файлов, часть по три раза: `git ls-files` перечисляет неразрешённый путь
по стадиям. Прогон шёл после `git add` разрешённых файлов. Prettier переложил таблицу каналов в тесте Desktop
(строки стали длиннее 120), один комментарий в `product-channel.test.ts` перенесён руками.

Ключ define и чтения совпадают:

| Где | Имя |
|---|---|
| `cli/script/build.ts` (define), `cli/vite.node.config.ts` (define и `process.env`) | `LOGINOM_AI_AGENT_CHANNEL` |
| `packages/script/src/index.ts` (канал сборки из окружения) | `LOGINOM_AI_AGENT_CHANNEL` |
| `cli/src/version.ts`, `util/src/global.ts` (чтение константы) | `LOGINOM_AI_AGENT_CHANNEL` |
| `desktop/electron.vite.config.ts` (`import.meta.env.…` для main), `desktop/src/main/env.d.ts` | `LOGINOM_AI_AGENT_CHANNEL` |
| `desktop/src/main/service/service-identity.ts` (чтение) | `import.meta.env.LOGINOM_AI_AGENT_CHANNEL` |
| `desktop/script/dev.ts` (задаёт), `service-identity.ts` (читает) | `LOGINOM_AI_AGENT_DESKTOP_SERVER_CHANNEL` |

Собранный CLI, три канала (`LOGINOM_AI_AGENT_CHANNEL=<канал> bun run script/build.ts --single --skip-install
--skip-web-ui`, для `latest` ещё `LOGINOM_AI_AGENT_VERSION=2.3.0-b14c`; 15–16 с каждая), `debug paths` в пустом корне
(`env -i`, `HOME` и `XDG_*` — в корень):

```text
== latest (opencode v2.3.0-b14c)
data       <root>/data/loginom-ai-agent
config     <root>/config/loginom-ai-agent
state      <root>/state/loginom-ai-agent
cache      <root>/cache/loginom-ai-agent
tmp        <root>/tmp/loginom-ai-agent
log        <root>/data/loginom-ai-agent/log
db         <root>/data/loginom-ai-agent/loginom-ai-agent.db
== beta (opencode v0.0.0-beta-202611221134)
data       <root>/data/loginom-ai-agent-beta
config     <root>/config/loginom-ai-agent-beta
state      <root>/state/loginom-ai-agent-beta
cache      <root>/cache/loginom-ai-agent-beta
tmp        <root>/tmp/loginom-ai-agent-beta
log        <root>/data/loginom-ai-agent-beta/log
db         <root>/data/loginom-ai-agent-beta/loginom-ai-agent.db
== dev (opencode v0.0.0-dev-202611221134)
data       <root>/data/loginom-ai-agent-dev
config     <root>/config/loginom-ai-agent-dev
state      <root>/state/loginom-ai-agent-dev
cache      <root>/cache/loginom-ai-agent-dev
tmp        <root>/tmp/loginom-ai-agent-dev
log        <root>/data/loginom-ai-agent-dev/log
db         <root>/data/loginom-ai-agent-dev/loginom-ai-agent.db
```

Тесты после переноса, отдельно:

```text
$ cd packages/util && bun test test/product-channel.test.ts test/global.test.ts      # 4 pass, 0 fail
$ cd packages/desktop && bun test src/main/service/service-identity.test.ts          # 6 pass, 0 fail
$ cd packages/product && bun test test/names.test.ts                                 # 9 pass, 0 fail
$ cd packages/cli && bun test --timeout 60000 test/service-identity.test.ts test/flag-identity.test.ts   # 8 pass, 0 fail
```

`names.test.ts` и `flag-identity.test.ts` после B1.4a идут без `test.failing`: проверка `OPENCODE_*` по исходникам
зелёная и с кодом B1.4c.

Полные наборы, `5ab3dbae96` (отдельное чистое дерево в scratchpad) → `b14c-channels` (`32c61f7f49`), по очереди, те же
команды, что выше:

| Пакет | До | После |
|---|---|---|
| `util` | 145 pass, 0 fail | 146 pass, 0 fail: +1 `product-channel` |
| `client` | 262 pass, 0 fail | то же |
| `desktop` | 528 pass, 4 skip, 0 fail | 529 pass, 4 skip, 0 fail: +1 пары каналов |
| `server` | 127 pass, 1 skip, 0 fail | то же |
| `cli` | 407 pass, 9 skip, 0 fail | то же |
| `core` | 7118 pass, 354 skip, 3 fail | то же, те же три падения (`ShellParse`, два `flock` под root) |
| `product` | 56 pass, 5 fail | то же, те же пять `repo-paths` |

- `python3 -I scripts/upstream-sync/catalog-check.py --summary` — код 0: на `5ab3dbae96` 344 расходящихся файла,
  CAT-01 — 3; на ветке 346, CAT-01 — 5 (`util/package.json`, `desktop/package.json`). Остальные записи — те же.
- `bun run check` из корня на `32c61f7f49` — код 0: `Found 517 warnings and 0 errors`, `Tasks: 38 successful, 38 total`.

## B1.4 Ручные правки бренда: `product`, CLI, корень, документы

22.11.2026. Ветка `b14-brand-a` от `oc2-migration` (`53ec8ddff3`), рабочее дерево `.claude/worktrees/b14-brand-a`. Bun
1.4.4 переносной и Node 24.19.0 — первыми в `PATH` только для своих команд и `git commit`. `bun install
--frozen-lockfile`: код 0, 1600 пакетов, `.husky/_` появился, хук `pre-commit` срабатывал на каждом коммите. Задачи из
таблицы B1.4a: Р-1, Р-2, Р-3, Р-12, Р-19, Р-20, Р-21, Р-22…Р-26. Параллельно другой агент делает Р-4, Р-5, Р-7, Р-8,
Р-13…Р-18. Р-6 и Р-10 ждут решения владельца, Р-9 и Р-11 — B4; их здесь нет.

### Коммиты

Каждая задача — отдельный коммит, не больше пяти файлов; `catalog.json` и `catalog.md` считаются, журнал — отдельный
коммит. `bun run secrets staged` перед каждым коммитом — `clean`.

| Задача | Коммит | Файлы |
|---|---|---|
| Р-1 | `b130ac1847` `test(product): read the OpenCode 2 layout in the repository path guard` | `repo-paths.test.ts`, `guarantees.md` |
| Р-2 (1/2) | `ec9e192ff3` `fix(cli): name the product in command descriptions, upgrade and uninstall` | `commands.ts`, `upgrade.ts`, `uninstall.ts`, `test/mini.test.ts` |
| Р-2 (2/2) | `9bb553d436` `fix(cli): name the product in the update and remote pairing messages` | `default.ts`, `pair.ts`, `test/pair-remote-consent.test.ts`, `catalog.md` (CAT-12) |
| Р-3 (1/2) | `31423f23b8` `fix(cli): name the product in ACP login label and error messages` | `acp/{service,error,translate}.ts`, `test/acp/{session,error}.test.ts` |
| Р-3 (2/2) | `90784ff78b` `fix(cli): name the product on the update preflight screen` | `update-preflight.tsx`, `catalog.md` (CAT-12) |
| Р-19 | `69e8901a27` `fix(install): install into the product directory ~/.loginom-ai-agent/bin` | `install`, `catalog.md` (CAT-02) |
| Р-12 (1/2) | `60f317717a` `chore(identity): give the Desktop startup benchmark profiles the product names` | `strobe.json`, `desktop/perf/startup.bench.ts`, `catalog.json` (`strobe.json` в CAT-02), `catalog.md` (CAT-02, CAT-09) |
| Р-20 | `345277933f` `docs: name the product variables the code reads in AGENTS.md and package READMEs` | `AGENTS.md`, `desktop/README.md`, `process-daemon/README.md`, `catalog.md` (CAT-03) |
| Р-21 | `9cb363516b` `docs: point the root README and the app perf guide at the product names` | `README.md`, `app/perf/README.md`, `catalog.md` (CAT-03, CAT-10) |
| Р-22 | `778e563f42` `docs: move the translated upstream READMEs to docs/upstream (1/5)` | 3 переноса, `catalog.json` (`docs/upstream/**` в CAT-03), `catalog.md` |
| Р-23 | `f96894e078` `… (2/5)` | 5 переносов |
| Р-24 | `9937983264` `… (3/5)` | 5 переносов |
| Р-25 | `83d661fa12` `… (4/5)` | 5 переносов |
| Р-26 | `55a1b30938` `… (5/5)` | 3 переноса, `README.md` (переключатель языков), `catalog.md` |
| Р-12 (2/2) | `f240b721a0` `chore(identity): give the root dev:live scripts and the nix builds the product names` | `package.json`, `nix/opencode.nix`, `nix/desktop.nix`, `catalog.md` (CAT-01, CAT-02) |
| — | следующий | этот журнал; в `catalog.md` (CAT-03) — что видимого `OpenCode` осталось в CLI |

Р-2, Р-3 и Р-12 разделены на два коммита: с тестами, которые проверяют строки, и с записью каталога выходило 7–8
файлов. Порядок коммитов не совпадает с номерами: Р-12 (1/2) раньше Р-20, потому что README Desktop описывает очистку
окружения в замере; Р-12 (2/2) — последним, пока шёл полный прогон тестов `cli` в том же дереве.

### Что сделано

- **Р-1.** `repo-paths.test.ts`: пакет агента — `@opencode/cli` в `packages/cli`; `turbo.json` читается
  `Bun.JSONC.parse`; у `--filter` снимаются селекторы графа turbo (`pkg^...`, `...pkg`); строка справки `[--filter
  name]` в `codemode/script/bench.ts` — исключение `NOT_FILTERS`; устаревшие пути в файлах самого v2.3.0
  (`patches/install-korean-ime-fix.sh` → `packages/opencode`, `script/release.ts` → `packages/console`) — в `NOT_PATHS`.
  Остались три падения: `--filter` в `loginom-macos.yml` и `secrets.yml`, фильтры путей и пути `packages/opencode` в
  workflows Windows — B5.1; `evals`, `loginom-host/script/{build-cli,skills-acceptance}.ts`,
  `node-acceptance` — B2.7a. В `guarantees.md` число падений — 3.
- **Р-2, Р-3.** `OpenCode` → `Loginom AI Agent` в описаниях команд, `upgrade`, `uninstall`, сбое службы при
  обновлении, согласии `pair --remote`, подписи входа ACP («Loginom AI Agent Login»), ошибках ACP «… server is
  unavailable» и «… prompt failed», на экране обновления. Тесты `mini`, `pair-remote-consent`, `acp/{session,error}`
  поправлены вместе со строками.
- **Р-12.** Правила `apply-identity` по явному пути на `package.json`, `nix/opencode.nix`, `nix/desktop.nix`,
  `strobe.json`, `desktop/perf/startup.bench.ts` и руками маска `unset` `OPENCODE_*` → `LOGINOM_AI_AGENT_*` в двух
  профилях замера. Каждое новое имя проверено по читателю: `LOGINOM_AI_AGENT_TUI_CHANNEL` (`cli/…/default.ts`),
  `_PASSWORD` (`cli/src/env.ts`), `_DISABLE_MODELS_FETCH` (`cli/src/server-process.ts`), `_VERSION` и `_CHANNEL`
  (сборка CLI), `_DB`, `_CONFIG_DIR`, `_TEST_HOME`, `_TEST_ONBOARDING`, `_DESKTOP_*` (код Desktop, `cli`, `util`),
  `loginom-ai-agent.settings` (`desktop/src/main/storage/keys.ts`). `_CLI_DIST` задаёт и читает сам `desktop.nix`.
- **Р-19.** `INSTALL_DIR=$HOME/.loginom-ai-agent/bin`, одна строка.
- **Р-20, Р-21.** `AGENTS.md`: `LOGINOM_AI_AGENT_STORY`, `LOGINOM_AI_AGENT_FLAGS`. `desktop/README.md`: переменные
  сборки и очистка окружения замера. `process-daemon/README.md`: `LOGINOM_AI_AGENT_PTY_SOCKET_DIR` (её читает
  `src/daemon/unix.rs` после B1.3b). `README.md`: каталог установки. `app/perf/README.md`: `LOGINOM_AI_AGENT_CHANNEL`.
- **Р-22…Р-26.** 21 переведённый README (`README.<язык>.md`; 22-й корневой — английский `README.md`, он остаётся и
  входит в Р-21) перенесён `git mv` без правок в `docs/upstream/`, как в 0.4. Там уже лежит английский
  `docs/upstream/README.md` форка (README v1 upstream), и его ссылки на переводы снова ведут к файлам. Переключатель
  языков корневого `README.md` ведёт в `docs/upstream/` (последний коммит серии). Маска `docs/upstream/**` в CAT-03
  возвращена: `catalog-check.py` классифицирует перенос по новому пути.

### Где решал сам

- **Литерал `Loginom AI Agent` в `cli`, а не `Product.name`.** `cli` не зависит от `@loginom-ai-agent/product`.
  Зависимость — это `cli/package.json` и `bun.lock` (CAT-01), сверх пяти файлов и с конфликтом замка у параллельного
  агента. В 0.4 те же строки CLI тоже были литералами (`a080f7725c:packages/opencode/src/cli/cmd/uninstall.ts`).
- **ACP: только подписи и сообщения.** В 0.4 ACP не переименовывали вовсе (`a080f7725c:packages/opencode/src/acp/service.ts`),
  но таблица Р-3 называет ACP явно. Изменены подпись входа и две ошибки. Не менялись идентификаторы протокола
  `opencode-login` и `opencode/retry`, поле `agentInfo.name` (в ACP оно для программного использования) и строки с
  командой `opencode` («Login with opencode», «Run `opencode auth login`») — имя команды, B2.7a. **Спорное:** клиент
  ACP без `title` может показать `agentInfo.name` как имя агента; тогда это задача B2.7a вместе с командой.
- **Р-12 — только имена, у которых читатель уже переименован.** Таблица B1.4a называла и `opencode service` в
  `dev:live`; по заданию имя команды — B2.7a, оставлено. Пути установленного Desktop (`ai.opencode.desktop`,
  `OpenCode.exe`), каталоги данных и регистрации службы `opencode`, кэш обновлятора, протокол `opencode` в профилях
  замера — B4 и Р-10.
- **Р-20, Р-21 — без лишних правок.** `.opencode/skills` в `AGENTS.md` и `.opencode/plugins/` в
  `packages/plugins/README.md` — настоящие каталоги дерева v2 (B1.4a: продукт их больше не находит, так и задумано).
  `OPENCODE_PERF_SESSION` читает сам `app/perf/tabs.bench.ts`, скрипт его не берёт. `VITE_OPENCODE_*` и
  `OPENCODE_ZIG_CPU` скрипт оставляет намеренно. Без правок: `packages/app/README.md`, `packages/app/AGENTS.md` (там
  команда `opencode dev web` — B2.7a — и адрес upstream), `packages/plugins/README.md`, `packages/sdk/README.md`
  (`this.opencode` — имя переменной в примере кода).
- **Переводы README перенесены как есть.** Внутренние ссылки переводов на ресурсы от корня (`.github/assets/…`,
  `services/site/…`, `./CONTRIBUTING.md`) из `docs/upstream/` не открываются — так же было в 0.4. Между Р-22 и Р-26
  переключатель корневого `README.md` вёл к уже перенесённым файлам по старым путям: правка `README.md` в каждом коммите
  вывела бы серию за пять файлов.
- **Правка `AGENTS.md`** — только имена переменных по задаче Р-20; правила для агентов не менялись.

### Тесты

До — `oc2-migration` (`53ec8ddff3`), в этом же дереве до первой правки (Desktop — с двумя файлами базы на месте своих,
тесты их не берут). После — на коммитах ниже.

| Пакет | Команда | До | После |
|---|---|---|---|
| `product` | `bun test` | 56 pass, 5 fail (`repo-paths`) | 58 pass, 3 fail (`b130ac1847` и `f240b721a0`, списки внутри трёх падений те же — 3, 5 и 10 строк): остались B5.1 и B2.7a |
| `cli` | `bun test --timeout 60000` | 407 pass, 9 skip, 0 fail | 407 pass, 9 skip, 0 fail (`90784ff78b`, после всех правок `cli`) |
| `desktop` | `bun test --timeout 30000` | 529 pass, 4 skip, 0 fail | 529 pass, 4 skip, 0 fail (`f240b721a0`) |

```text
$ cd packages/product && bun test test/names.test.ts          # 9 pass, 0 fail
$ cd packages/cli && bun test test/flag-identity.test.ts      # 3 pass, 0 fail
$ cd packages/product && bun typecheck                        # tsgo --noEmit, код 0
$ cd packages/cli && bun typecheck                            # ✓ No type errors in 2,140 files across 2 projects
$ cd packages/desktop && bun typecheck                        # ✓ No type errors in 3,503 files across 2 projects (perf входит)
```

Первый `bun typecheck` в `product` после Р-1: `test/repo-paths.test.ts(55,31): error TS2571: Object is of type
'unknown'` — `Bun.JSONC.parse` возвращает `unknown`; добавлено приведение к `{ tasks: Record<string, unknown> }`.

`install` во временном домашнем каталоге (`env -i HOME=<tmp> SHELL=/bin/bash bash ./install --binary <поддельный
бинарник>`, `.bashrc` создан заранее): код 0, бинарник в `<tmp>/.loginom-ai-agent/bin/opencode` и `opencode2`,
каталога `<tmp>/.opencode` нет, в `.bashrc` — `# opencode` и `export PATH=<tmp>/.loginom-ai-agent/bin:$PATH` (пару
ищет `uninstall.ts`).

### Итоговая проверка

На `f240b721a0` (после него — только этот журнал), из корня дерева:

```text
$ python3 -I scripts/upstream-sync/apply-identity.py --repo . --check
would change: 0 files                                   # код 0
$ python3 -I scripts/upstream-sync/catalog-check.py --summary
against a6b15d33daf6: 382 divergent upstream files      # код 0; было 346
  CAT-01: 5   CAT-02: 53 (+4: install, strobe.json, nix ×2)   CAT-03: 26 (+24: 21 перенос, README.md, 2 README пакетов)
  CAT-09: 22 (+1: perf/startup.bench.ts)   CAT-10: 75 (+1: app/perf/README.md)   CAT-11: 18   CAT-12: 173 (+6: файлы cli)
  CAT-13: 10   CAT-04…CAT-08: 0 (pending)
$ bun run secrets range oc2-migration HEAD
{"status":"clean","commits":15,"archives":0, …}
$ bun run check                                         # код 0, 47 с
Found 517 warnings and 0 errors.
sdk-docs: … 11 guide blocks match their source; 0 problem(s)
 Tasks:    38 successful, 38 total
Cached:    0 cached, 38 total
```

### Найдено, не чинил

- `process-daemon/README.md` называет пути по умолчанию до B1.3b: `${XDG_STATE_HOME:-~/.local/state}/opencode/pty`,
  `/tmp/opencode-pty-<uid>/`, дочерний каталог `opencode-pty-<uid>`; исходник после B1.3b — `loginom-ai-agent`. Имя
  бинарника `opencode-pty` в том же README — Р-16.
- Видимый `OpenCode` вне моих задач: скрипт `install` («OpenCode Installer», «OpenCode includes free models», логотип,
  `opencode.ai/docs`), `cli/script/postinstall.mjs` (две ошибки установки пакета npm), `cli/script/build.ts`
  (заглушка Scalar/Swagger), `cli/src/services/updater.ts` (около 20 строк, B2.7d), комментарий в `uninstall.ts:73`.
  Задач на них в таблице B1.4a нет; для BRAND-01 их нужно распределить (предложение: B2.7a и B2.7d).
- Форматирование upstream после `apply-identity`: `prettier --check` красный на `cli/src/commands/handlers/default.ts`
  (длинный импорт `LOGINOM_AI_AGENT_*`) и на таблице корневого `README.md` (так в v2.3.0). Мои строки форматированы.
- Повторный поиск старых строк Р-2 и Р-3 по `packages`, `evals`, `scripts`, `script` (`*.ts`, `*.tsx`, `*.js`, `*.mjs`,
  `*.json`, `*.snap`): вхождений в тестах вне `packages/cli/test` нет. Остаток `OpenCode` в `packages/cli/src` вне
  `updater.ts` — `agentInfo.name` и комментарий `uninstall.ts:73`.
- **Конфликты при слиянии с веткой Р-4…Р-18:** `catalog.md` — строки CAT-12 «Назначение» и «Не перенесено» (обе ветки
  правят одну строку), возможно CAT-03 и CAT-11; хвост этого журнала (оба раздела дописаны в конец).

### Не проверено

- Сборки `nix`: `nix` на машине нет. Замер `strobe` (`strobe.json`, `startup.bench.ts`) не запускался: нужен strobe и
  установленный Desktop.
- ACP в настоящем клиенте и экран обновления CLI глазами: только тесты (у экрана обновления теста нет).
- `install` — только путь `--binary` на Linux; загрузка по сети и Windows (`opencode.exe`) не проверялись.
- Windows и macOS: всё на Linux. BRAND-01 в собранном CLI — не проверялся: остаются B2.7a, B2.7d и задачи TUI.

## B1.4 группа B: ручные правки бренда в TUI, ядре и `process-daemon`

22.11.2026. Ветка `b14-brand-b` от `oc2-migration` (`53ec8ddff3`), рабочее дерево `.claude/worktrees/b14-brand-b`. Bun
1.4.4 переносной и Node 24.19.0 — первыми в `PATH` только для своих команд и `git commit`; для Rust — toolchain 1.90.0
(`/root/.cargo/bin`) и Zig 0.16.0 из scratchpad (B1.3b), только для `cargo`. `bun install --frozen-lockfile`: код 0,
1600 пакетов, `.husky/_` появился, хук `pre-commit` срабатывал на каждом коммите. Задачи из таблицы B1.4a: Р-4, Р-5,
Р-7, Р-8 (а и б), Р-13…Р-18. Параллельно группа A (раздел выше) делала Р-1…Р-3, Р-12, Р-19…Р-26; её ветка влита в
`oc2-migration` (`6fab89624c`) и слита в эту ветку перед журналом.

### Коммиты

Каждая задача — отдельный коммит, не больше пяти файлов. Описание задач в `catalog.md` (кроме CAT-01 и Р-14) — общим
коммитом после слияния с группой A: с тестами многие задачи уже занимали пять файлов, а конфликт в каталоге так
решался один раз. `bun run secrets staged` перед каждым коммитом — `clean`.

| Задача | Коммит | Файлы |
|---|---|---|
| зависимость | `c1fc2378e5` `chore(tui): depend on the product package for the product name and wordmark` | `tui/package.json`, `bun.lock` (одна строка), `catalog.md` (CAT-01) |
| Р-13 | `abf6c3f6be` `fix(identity): name the log and channel database files after the product` | `util/src/observability/logging.ts`, `cli/src/database-path.ts`, `cli/script/service-smoke.ts`, `core/test/logging.test.ts`, `cli/test/flag-identity.test.ts` |
| Р-15 | `87f35b756d` `fix(identity): name the telemetry client and service after the product` | `util/src/observability.ts`, `util/src/observability/otlp.ts`, `core/test/effect/observability.test.ts` |
| Р-18 | `0f691f99b1` `docs(core): point the built-in skill texts at the product's directories` | `core/src/plugin/skill/{opencode,report}.md`, `core/src/plugin/command/initialize.txt` |
| Р-14 | `895411348f` `docs(upstream-sync): keep the .git/opencode project id cache that 0.4 wrote` | `catalog.md` (CAT-12) |
| Р-4 | `18571e4520` `fix(tui): show the product name in the terminal title, notifications and exit hint` | `app.tsx`, `attention.ts`, `mini/runtime.lifecycle.ts`, `mini/footer.prompt.tsx`, `test/app-lifecycle.test.tsx` |
| Р-5 (1/2) | `5b7d05ed17` `fix(tui): name the product in the update dialog and the highlights setting` | `component/dialog-update.tsx`, `config/index.tsx`, `test/component/dialog-update.test.tsx` |
| Р-5 (2/2) | `f41e47210c` `fix(tui): name the product on the crash screen and in error messages` | `component/{error-component,terminal-pane}.tsx`, `util/error-details.ts`, `test/util/error-details.test.ts` |
| Р-7 | `f6f67c73f6` `feat(tui): show the product wordmark on the home screen and in the session epilogue` | `logo.ts`, `component/logo.tsx`, `routes/home.tsx`, `util/presentation.ts`, `test/util/presentation.test.ts` |
| Р-8а | `d3650d1ef6` `feat(tui): rename the default theme to loginom-ai-agent as in 0.4` | `theme/index.ts`, `context/theme.tsx`, `mini/theme.ts`, `test/theme.test.ts`, `test/cli/tui/theme-mode.test.tsx` |
| Р-8б | `f0755ba813` `fix(tui): default the theme setting to loginom-ai-agent and use the id in theme tests` | `component/dialog-config.tsx`, `test/mini/theme.test.ts`, `test/ui/pane-resize-handle.test.tsx` |
| Р-16 (1/2) | `7102c257f0` `fix(process-daemon): name the package and the executable after the product` | `Cargo.toml`, `Cargo.lock`, `tests/{ownership,playground,rows}.rs` |
| Р-16 (2/2) | `c70916674e` `fix(process-daemon): name the Windows pipes after the product` | `src/daemon/windows.rs`, `src/transport/windows.rs`, `src/service/pipe/windows.rs`, `tests/windows-daemon.rs`, `.github/workflows/check-process-daemon.yml` |
| Р-17 | `6e6cc78425` `fix(identity): cache and look up the embedded pty executable under the product name` | `core/src/persistent-pty/{binary.bun,binary.node,daemon}.ts`, `cli/src/node/target.ts` |
| — | `6245c0ff89` `chore: merge oc2-migration with the B1.4 brand group A into b14-brand-b` | конфликт `catalog.md` (CAT-01, CAT-12) |
| каталог | `d643224fdd` `docs(upstream-sync): describe the TUI, core and process-daemon brand edits in the catalog` | `catalog.md` (CAT-02, CAT-11, CAT-12, CAT-13) |
| Р-15 (тест) | `e6ffe4cb21` `test(util): expect the product service name in the exported OTLP trace` | `util/test/observability-otlp.test.ts` |
| Р-5 (тест) | `1043165956` `test(tui): expect the product name in the MCP error investigation draft` | `tui/test/cli/tui/dialog-mcp.test.tsx` |
| — | следующий | этот журнал; в `catalog.md` — ссылка на этот раздел |

Р-5, Р-8 и Р-16 разделены: со строками и тестами выходило 6–9 файлов. Р-8 поделён так, чтобы каждый коммит был
зелёным: в первом — читатели id и два теста, которые падают без них; во втором — значение по умолчанию в диалоге
настроек и тесты, которые проходят и со старым id (у темы есть запасной вариант). Два последних коммита с тестами
появились после полного прогона «после»: эти проверки старых строк лежали вне файлов задач, фокусные прогоны их не
брали (`util/test/observability-otlp.test.ts` ждал `service.name` = `opencode`, `dialog-mcp.test.tsx` — текст
расследования). До этих коммитов `util` и `tui` давали по одному новому падению.

### Что сделано

- **Р-4.** `Product.name` в заголовке терминала (главная, сессия, плагин; TUI и Mini), вместо префикса `OC |`, в
  заголовке уведомлений по умолчанию, в подсказке `/exit` Mini («close Loginom AI Agent») и в пункте палитры
  «Update Loginom AI Agent». `util/tool-display.ts` не менялся: «Web Search via OpenCode» — имя услуги провайдера
  `opencode`, а не продукта (как Р-6).
- **Р-5.** Диалог обновления (заголовок, тексты установки, «… is already up to date»), описание настройки
  `highlights`, экран сбоя («Loginom AI Agent crashed», версия), ошибка устаревшего сервера терминала, текст
  расследования ошибки для модели.
- **Р-7.** Как в 0.4 (`a080f7725c:packages/tui/src/logo.ts`): логотип — `Product.wordmark` «Loginom AI» одной строкой,
  «AI» акцентом `#C79292`, на главной, в статистике и в эпилоге сессии. В v2 у логотипа есть узкие варианты (вторая
  половина логотипа или знак `go` при ширине меньше 44 и 22); со словом-знаком шириной 10 колонок они давали бы «AI»
  или знак OpenCode — убраны, остался порог по высоте. Уведомление об обновлении на главной было шириной логотипа и
  переносилось бы в три строки (проверено рендером, ниже) — `minWidth` вместо `width`.
- **Р-8.** В 0.4 тему переименовали (`a080f7725c`, `theme/assets/loginom-ai-agent.json`, id `loginom-ai-agent`) —
  поэтому переименована и здесь: id темы по умолчанию `loginom-ai-agent` во всех читателях (`theme/index.ts`,
  `context/theme.tsx`, `mini/theme.ts`) и в значении по умолчанию настроек. Файлы `assets/opencode.json` и
  `assets/v2/opencode.json` не переименованы (ниже).
- **Р-13.** Журнал `<log>/loginom-ai-agent.log` (установленные каналы) и `loginom-ai-agent-<канал>.log` (запуск из
  исходников, `Product.slug`), БД локальных каналов `loginom-ai-agent-<канал>.db`. `service-smoke.ts` ищет журнал
  собранной службы под новым именем. Замыкание по `packages/`: других чтений `opencode*.log` и `opencode-*.db` нет,
  кроме `core/src/database/v1-migration.bun.ts` (`opencode-next.db` — источник переноса данных v1, не файл продукта).
- **Р-15.** Имя клиента по умолчанию и `serviceName` OTLP — `Product.slug`. CLI передаёт клиента сам
  (`LOGINOM_AI_AGENT_CLIENT` или артефакт сборки). Ключи атрибутов `opencode.client` и `opencode.run` не менялись:
  задача про имя клиента и службы, а ключи читают коллекторы. **Включена ли телеметрия:** экспорт OTLP есть только
  при заданном `OTEL_EXPORTER_OTLP_ENDPOINT` (`util/src/observability.ts`, `cli/src/index.ts`); без него — только
  локальный файл журнала. Значение по умолчанию не трогалось (этап F).
- **Р-14.** Не переименован, записано в CAT-12. В v2 `.git/opencode` только читается как прежний id (`previous`) —
  писателя нет (`grep` по `packages/*/src`). Файл писали OpenCode 1 и продукт 0.4
  (`a080f7725c:packages/core/src/project.ts`, чтение и запись под тем же именем). Переименование сделало бы чтение
  мёртвым и отняло бы прежний id у репозиториев 0.4. `.opencode-probe` (аргумент `git ls-files`, файла нет),
  `opencode.gitconfig`, `index.opencode-*`, `opencode-pack.lock` (служебные файлы хранилища снимков) и
  `.opencode-version` (кэш навыков в каталоге продукта) — внутренние имена, не менялись.
- **Р-16.** Пакет и исполняемый файл `loginom-ai-agent-pty`; библиотека — прежнее `opencode_pty` (`[lib]` в
  `Cargo.toml`), иначе пришлось бы править `src/main.rs` и девять файлов `tests/`. `Cargo.lock`: тот же состав, пакет
  переехал по алфавиту (проверено сравнением отсортированных строк). Именованные каналы Windows — служебный
  `\\.\pipe\loginom-ai-agent-pty-<instance>`, проверка префикса в транспорте и закрытый канал вывода процесса.
  `check-process-daemon.yml`: шаг проверки исполняемого файла Windows ищет новый пакет и `.exe`. Сообщения и справка
  бинарника (`opencode-pty …`, в том числе вывод `--version`) не менялись — задача про имена.
- **Р-17.** Как решено: кэш встроенного бинарника — `<bin>/loginom-ai-agent-pty/<версия>-<хеш>/loginom-ai-agent-pty`,
  запасное имя для поиска в `PATH` — `loginom-ai-agent-pty` (`binary.bun.ts`, `binary.node.ts`, `daemon.ts`), ключ
  ресурса сборки Node — `loginom-ai-agent-pty/loginom-ai-agent-pty(.exe)` (`cli/src/node/target.ts`). Бинарник из npm
  `@opencode/pty` копируется под этим именем: сборка Bun встраивает его файлом, `install()` пишет под новым именем;
  сборка Node кладёт его под новым ключом. Имя файла внутри пакета npm (`cli/script/opencode-pty.ts`) и
  `OPENCODE_PTY_SOCKET_DIR` не менялись; TS эту переменную не задаёт.
- **Р-18.** Пути `~/.config/loginom-ai-agent/…`, `$XDG_CONFIG_HOME/loginom-ai-agent/cli.json`,
  `~/.local/share/loginom-ai-agent/log/loginom-ai-agent.log` (имя журнала — из Р-13), «Loginom AI Agent config» в
  навыке `report` и в `/init`, «future Loginom AI Agent sessions» в `/init`.

### Где решал сам

- **Зависимость `@loginom-ai-agent/product` — только у `tui`**, как в 0.4 (`a080f7725c:packages/tui/package.json`).
  В TUI имя продукта — в 12 местах и слово-знак. В `core` (три строки `loginom-ai-agent-pty`) и `cli` (имя БД рядом с
  литералом `loginom-ai-agent.db` от `apply-identity`, ключ ресурса) — литералы: как `core/src/config/discovery.ts`
  (B1.3b) и как группа A в `cli`; `cli/package.json` и замок не трогались, чтобы не конфликтовать с группой A.
- **Id темы — литерал `loginom-ai-agent`, а не `Product.slug`.** Это имя темы в конфигах пользователей, как в 0.4; оно
  не должно меняться вместе с идентичностью.
- **Файлы тем не переименованы.** `assets/v2/opencode.json` — тема upstream; правило B1.4a тоже не трогает пути
  `assets/`. В 0.4 файл переименовал скрипт вместе с id. `assets/opencode.json` (v1) в v2 не поставляется: его
  импортируют только тесты `tui` и `packages/theme`. Временная тема эксперимента `opencode2` не менялась.
- **`OC |` → `Product.name |`.** Короткого имени продукта в `Product` нет; придумывать его не стал. Заголовок вкладки
  длиннее, обрезка заголовка сессии (40 символов) прежняя.
- **Адрес отчёта о сбое не менялся** (`github.com/anomalyco/opencode/issues/new`, параметр `opencode-version`, текст
  тела «The OpenCode TUI crashed…»): в 0.4 так же. Видимые строки экрана сбоя — продукта.
- **Р-14 и внутренние файлы `git.ts` — оставлены**, выше. Задание противоречило фактам: меньший вариант.
- **`[lib] name = "opencode_pty"`** — меньше правок, чем переименование библиотеки в 10 файлах.
- **Р-16: `release-process-daemon.yml` и `packages/process-daemon/npm/` не правились.** Они публикуют `@opencode/pty` в
  npm и после переименования crate не сработают (`select(.name == "opencode-pty")`, `target/…/opencode-pty`). Продукт
  их не запускает и пакет upstream не публикует; судьба — B5.1, где собирается свой бинарник для Windows.
  `check-process-daemon.yml` поправлен: он запускается на PR с `packages/process-daemon/**`.
- **Отступ над словом-знаком на главной (`height={3}`) не менялся**, хотя 0.4 его уменьшал: блок центрирован, без
  глаз менять не стал.

### Тесты

До — `oc2-migration` (`53ec8ddff3`) в отдельном чистом дереве в scratchpad. После — ветка после слияния с группой A
(`d643224fdd`), тот же набор команд. Сравнивались числа и имена упавших тестов (строки `(fail)`).

| Пакет | Команда | До | После |
|---|---|---|---|
| `util` | `bun test` | 146 pass, 0 fail | 146 pass, 0 fail (`1043165956`; на `d643224fdd` — 145 / 1, `observability-otlp`, исправлено `e6ffe4cb21`) |
| `product` | `bun test` | 56 pass, 5 fail (`repo-paths`) | 58 pass, 3 fail — то же, что у группы A после Р-1 (B5.1, B2.7a); моих правок в `product` нет |
| `theme` | `bun test` | 2 / 0 | 2 / 0 |
| `cli` | `bun test --timeout 60000` | 407 pass, 9 skip, 0 fail | 407 pass, 9 skip, 0 fail |
| `tui` | `bun test --timeout 30000` | 1672 pass, 2 skip, 1 fail | 1672 pass, 2 skip, 1 fail (`1043165956`) — то же `the art stops every frame when hidden…`; на `d643224fdd` было ещё `dialog-mcp` (исправлено `1043165956`) |
| `server` | `bun test` | 127 pass, 1 skip, 0 fail | 127 pass, 1 skip, 0 fail |
| `core` | `bun run script/test.ts` | 7118 pass, 354 skip, 3 fail | 7119 pass (+1 новый тест телеметрии), 354 skip, 3 fail — те же: `ShellParse > extracts static directory targets…` и два `flock` (прогон под root) |
| `process-daemon` | `cargo test --locked` | 147 passed, 0 failed, 1 ignored | 147 passed, 0 failed, 1 ignored (тесты Windows на Linux пустые) |

Пакеты, которые зависят от `core`, `util` или `tui`, но не менялись, — один прогон на коде `1043165956` (после него — только документы), без своей базы
(числа совпадают с таблицей B1.4a): `gui-plugins` 1129 / 0, `plugin` 37 / 0, `simulation` 48 / 0, `sdk` 40 / 0, `ui`
(`bun test src`) 620 / 0, `session-ui` (`bun test src`) 599 / 0, `app` (`bun run test`) 2715 + 360 / 0.

Новые проверки и их красный прогон на старом коде (файл подменялся из `HEAD` на время прогона и возвращался):

```text
$ cd packages/cli && bun test test/flag-identity.test.ts      # database-path.ts до Р-13
+   "db": "/tmp/loginom-flag-identity-…/data/loginom-ai-agent-dev/opencode-local.db",
 2 pass
 1 fail
$ cd packages/core && bun test test/effect/observability.test.ts   # otlp.ts до Р-15
- Expected  - 2
+ Received  + 6
 6 pass
 1 fail
```

После правок: `flag-identity` 3 pass, `observability` 7 pass, `logging` 2 pass, `error-details` (+2 ожидания),
`presentation` (строка слова-знака в эпилоге), `theme`/`theme-mode` (id `loginom-ai-agent`) — зелёные.

Рендер уведомления об обновлении под словом-знаком (временный тест в `packages/tui/test`, после прогона удалён;
`Logo` и `FadeInText` настоящие):

```text
--- width 80, logo 10, width={logoWidth}       --- то же, minWidth={logoWidth}
            Loginom AI                                     Loginom AI
            /update to                              /update to install v2.3.1
            install
            v2.3.1
```

Установка встроенного бинарника (`install()` из `binary.bun.ts`; временный скрипт подменял `pty-binding.ts`
настоящим бинарником npm, как плагин `cli/script/build.ts`):

```text
source: opencode-pty
resolved: loginom-ai-agent-pty/probe-bc9cb0fa0ebb4e56/loginom-ai-agent-pty
version: opencode-pty 0.5.2 (protocol 8)
daemon alive after 4s: true                          # daemon --name probe --runtime-dir <tmp> из этой копии
runtime: [ "probe", "probe/service.json", "probe/service.lock" ]
```

`process-daemon` после Р-16 (1/2):

```text
$ cargo build --locked                                          # код 0
$ cargo fmt --check                                             # код 0 (после Р-16 (2/2) — тоже, после cargo fmt)
$ cargo clippy --locked --all-targets --all-features -- -D warnings   # код 0
$ target/debug/loginom-ai-agent-pty --version
opencode-pty 0.5.2 (protocol 8)
```

`cargo check --target x86_64-pc-windows-msvc` на Linux не собирается: `build.rs` собирает Ghostty для Windows через
Zig и падает (`build.rs:150`); для `x86_64-pc-windows-gnu` Ghostty не поддерживается (`build.rs:117`). Правки `*.rs`
под `cfg(windows)` проверены только разбором `rustfmt`. Для этой попытки `rustup` поставил в `~/.rustup` цели
`x86_64-pc-windows-gnu` и `x86_64-pc-windows-msvc`; в репозиторий ничего не попало. Полный поиск старых имён по
`packages/process-daemon` (без `*.md`): `opencode-pty` осталось в сообщениях, именах потоков и временных каталогах
тестов, в `npm/` и `script/npm-packages.mjs` (публикация `@opencode/pty`); `tests/ghostty-effects/Cargo.toml` (Miri)
на пакет по имени не ссылается.

Замыкание вне изменённых пакетов (`.github`, `script`, `scripts`, `evals`, `nix`, остальные `packages/*`, без
`services/` и `*.md`): `git grep -E "opencode\.log|opencode-[a-z${][^ \"']*\.(db|log)|opencode-pty|\"OC \| |Updating
OpenCode|OpenCode crashed|close OpenCode"` и поиск id темы — читателей нет. Остались `release-process-daemon.yml`
(выше), моки e2e `app` и тест `gui-plugins/src/terminal/model.test.ts` со значением `service: "opencode-pty"` — это
поле ошибки API сервера (`server/src/handlers/persistent-pty.ts`), не имя файла; не менялось.

Typecheck (`bun typecheck` в каталоге пакета) после правок: `tui` (1910 файлов), `core` (1982), `cli` (2140), `util`
(72) — 0 ошибок. `prettier --check` на изменённых строках — чисто; `app.tsx`, `theme/index.ts`, `mini/theme.ts`,
`test/app-lifecycle.test.tsx`, `test/theme.test.ts`, `test/mini/theme.test.ts` не отформатированы и в v2.3.0 —
форматировались только мои строки.

### Итоговая проверка

На `1043165956` (после него — только этот журнал и ссылка на раздел в `catalog.md`), из корня дерева; `git log
HEAD..oc2-migration` пуст:

```text
$ python3 -I scripts/upstream-sync/apply-identity.py --repo . --check
would change: 0 files                                   # код 0
$ python3 -I scripts/upstream-sync/catalog-check.py --summary
against a6b15d33daf6: 420 divergent upstream files      # код 0; у группы A было 382
  CAT-01: 6 (+1 tui/package.json)   CAT-02: 54 (+1 check-process-daemon.yml)   CAT-03: 26   CAT-09: 22   CAT-10: 75
  CAT-11: 39 (+21 файл tui)   CAT-12: 188 (+15: util, core, cli, process-daemon)   CAT-13: 10   CAT-04…CAT-08: 0 (pending)
$ cd packages/product && bun test test/names.test.ts          # 9 pass, 0 fail
$ cd packages/cli && bun test test/flag-identity.test.ts      # 3 pass, 0 fail
$ bun run secrets range oc2-migration HEAD
{"status":"clean","commits":18,"archives":0, …}
$ bun run check                                         # код 0, 42 с
Found 517 warnings and 0 errors.
sdk-docs: … 11 guide blocks match their source; 0 problem(s)
 Tasks:    38 successful, 38 total
Cached:    0 cached, 38 total
```

### Найдено, не чинил

- `tui/src/context/program-status.ts`: `APP = "opencode"` — имя приложения в отчётах о состоянии терминалу; задачи в
  таблице нет.
- `app.tsx`, «Open docs» открывает `https://opencode.ai/docs`; в `Product` есть `documentation`. Канал upstream — к
  B2.7d или CAT-04.
- Экран сбоя ведёт отчёт на трекер upstream и просит «help us fix this» (выше).
- `tui/src/mini/splash.ts` (знак `go` и «Continue opencode mini -s …»), `util/presentation.ts` («Run opencode …»,
  «opencode -s …») — команда, B2.7a; знак `go` общий с предложением Go (Р-6).
- `process-daemon`: сообщения и справка бинарника `opencode-pty …` (`client.rs`, `daemon*.rs`), имена потоков,
  `README.md` (имя бинарника, пути по умолчанию до B1.3b — отметила и группа A), `AGENTS.md`, `SPEC.md`, `PLAN.md`,
  `description` в `Cargo.toml` («for OpenCode»).
- Навык `opencode` целиком про OpenCode (ссылки на `opencode.ai/docs`, команды `opencode …`); поставлять ли его —
  B2.4 (CAT-06).
- Комментарии «opencode process» в `util/src/observability/logging.ts` остались.
- `server/src/handlers/persistent-pty.ts`: поле ошибки `service: "opencode-pty"` в API (его ждут тесты `gui-plugins` и
  моки e2e `app`) — значение протокола, не имя файла.

### Не проверено

- Windows и macOS: всё на Linux. Каналы Windows и `check-process-daemon.yml` не запускались; `cargo check` под Windows
  на Linux не собирается (выше).
- TUI глазами в терминале: только тесты и рендер в тестовом рендерере. Отступ главной со словом-знаком не смотрел.
- Собранный CLI: сборка `bun run script/build.ts --single --skip-install --skip-web-ui` прошла (15 с), но терминал в
  собранной службе не создавался; путь `install()` и запуск `daemon` из копии проверены скриптом из исходников.
  Сборка Node (SEA) не собиралась.
- Экспорт OTLP в настоящий коллектор не проверялся.

## B1.4 Р-6

22.11.2026. Ветка `b14-r6` от `oc2-migration` (`b1b45848e6`), рабочее дерево `.claude/worktrees/b14-r6`. Bun 1.4.4 и
Node 24.19.0 — первыми в `PATH` только для своих команд. `bun install --frozen-lockfile`: код 0, `.husky/_` есть, хук
`pre-commit` срабатывал на обоих коммитах. Решение по Р-6 — из В-82 и В-91 (передано оркестратором): где OpenCode —
сам агент, имя продукта; предложение подписки OpenCode Go при лимите не показывать; OpenCode Zen, Console, Go и их
бесплатные модели — имена стороннего провайдера, как в OpenCode 2.

### Коммиты

`bun run secrets staged` перед каждым — `clean`.

| Коммит | Что | Файлы |
|---|---|---|
| `b5b10cca6b` `fix(tui): name the product in the permission rejection prompt` | правило 1 | `mini/footer.permission.tsx`, `routes/session/permission.tsx`, `test/mini/blocker.responsive.test.tsx` |
| следующий `fix(tui): stop offering OpenCode Go at the free usage limit` | правило 2, каталог, журнал | `routes/session/index.tsx`, `test/app-lifecycle.test.tsx`, `catalog.md` (CAT-11), этот журнал |

### Что сделано

- **Сам агент → `Product.name`.** «Tell Loginom AI Agent what to do differently» в отказе в разрешении: Mini
  (`mini/footer.permission.tsx`, две строки) и сессия (`routes/session/permission.tsx`). В 0.4 так было только в Mini
  (`a080f7725c:packages/opencode/src/cli/cmd/run/footer.permission.tsx`). Тест `test/mini/blocker.responsive.test.tsx`
  ждал старую строку — литерал поправлен, как у группы B; раскладка при ширине 112 с длинным именем не сломалась.
- **Предложение OpenCode Go при лимите не показывается.** `routes/session/index.tsx` (вне списка файлов Р-6: там вызов
  диалога): обработчик `session.step.failed` после возврата запроса в поле ввода заканчивается; блок, который считал
  окно 24 часа, хранил `go-upsell` и открывал `DialogGoUpsell`, удалён вместе с импортом и хранилищами. Файлы
  `component/dialog-go-upsell.tsx` и `go-upsell-art.ts` остались и из `src` больше не импортируются; тест
  `test/component/go-upsell-art.test.tsx` не менялся, его одно падение — то же, что в базе. Из заметки в ленте
  (`FreeLimitNotice`) убран пункт «Upgrade to OpenCode Go → /connect»; осталось «You've used today's free messages.
  They reset at …» и «Switch model → /models». Отдельный текст «Модель остановила ход» не писал: в TUI эту роль играет
  та же заметка.
- **Тесты предложения** (`test/app-lifecycle.test.tsx`). Первый (`free usage limit offers OpenCode Go once per 24h…`)
  переписан: `free usage limit restores the prompt and explains the limit without offering OpenCode Go` — заметка
  есть, вернулся доставленный запрос, а не тот, что в очереди, после паузы 30 мс и перерисовки нет «Free limit
  reached», «OpenCode Go», «Error:», «Session failed». Три других (`Subscribe handles mid-auth…`, `claims suppression
  atomically across two TUI instances…`, `modal manages live animation FPS…`) — `test.skip` с комментарием.
- **Имена провайдера не менялись (В-82).** `component/usage.tsx` целиком: «OpenCode Console» (вход, кредиты, лимиты)
  и заметка о лимите самого Go «OpenCode Go … usage limit reached» со ссылкой «Or turn on Extra Usage on your Go
  page» — она для подписчика Go, а не предложение подписки. Строки неоткрываемого `dialog-go-upsell.tsx` не трогал.

Новый тест на старом `index.tsx` (файл подменялся из `HEAD` на время прогона) — красный, с правкой — 1 pass:

```text
$ cd packages/tui && bun test --timeout 30000 test/app-lifecycle.test.tsx -t "free usage limit restores"
Expected to not contain: "Free limit reached"
(fail) free usage limit restores the prompt and explains the limit without offering OpenCode Go [2645.44ms]
 0 pass
 1 fail
```

### Где решал сам

- **Блок удалён, а не обойдён.** Строка `return` перед ним не прошла typecheck: после недостижимого `return`
  TypeScript теряет сужение `current` (5 ошибок TS18048). Цена — конфликт при слиянии, если upstream поменяет блок;
  проверка — в CAT-11. Устаревшее «skips the offer» в соседнем комментарии не трогал.
- **Пункт «Upgrade to OpenCode Go» убран, хотя назван был только диалог:** это то же предложение Go при лимите (В-91).
- **`test.skip`, а не удаление:** файл ближе к upstream. С ними выпала проверка «не затирать черновик при лимите»
  (вторая половина теста двух экземпляров TUI); эта логика стоит до удалённого блока и не менялась.

### Оставлено, вопрос владельцу

- `feature-plugins/sidebar/footer.tsx`, «Getting started»: «OpenCode includes free models so you can start
  immediately.» Строка между правилами 1 и 3: это и приложение, и бесплатные модели провайдера OpenCode Zen; в 0.4 не
  менялась. **Вопрос:** «Loginom AI Agent includes free models…» (`Product.name`) или «OpenCode Zen includes free
  models…»?

### Найдено, не чинил

- То же предложение Go при бесплатном лимите есть в веб-приложении: `app/src/session/usage-exceeded-dialogs.tsx`,
  `app/src/providers/connect/usage-exceeded.tsx` и `go-upsell-hero*`, строки `ui/src/i18n/en.ts`
  (`dialog.usageExceeded.freeTier.*`), e2e `app/e2e/regression/{composer,settings}.spec.ts`. В-91 касается и его; это
  не Р-6 (CAT-10). От правок `tui` они не зависят: `git grep` изменённых строк вне `packages/tui` других совпадений
  не дал.
- Знак `go` из `logo.ts` остаётся меткой на выходе Mini (`mini/splash.ts`) — логотип, не предложение; к Р-7.

### Тесты и итоговая проверка

До — цифры B1.4a и группы B на `oc2-migration`, своей базы не гонял. После — рабочее дерево с кодом второго коммита:

| Пакет | Команда | До | После |
|---|---|---|---|
| `tui` | `bun test --timeout 30000` | 1672 pass, 2 skip, 1 fail | 1669 pass, 5 skip, 1 fail — то же `the art stops every frame when hidden…`; +3 skip |
| `product` | `bun test test/names.test.ts` | 9 / 0 | 9 / 0 |
| `cli` | `bun test test/flag-identity.test.ts` | 3 / 0 | 3 / 0 |

Первый полный прогон `tui` дал ещё `roomy rejection keeps the editor and confirmation hints inline` (строка «Tell
OpenCode…»): первый поиск по тестам я обрезал `head`. Тест исправлен в первом коммите (`--amend`, не опубликован).

```text
$ cd packages/tui && bun typecheck
✓ No type errors in 1,910 files across 2 projects
$ python3 -I scripts/upstream-sync/apply-identity.py --repo . --check
would change: 0 files                                   # код 0
$ python3 -I scripts/upstream-sync/catalog-check.py --summary
against a6b15d33daf6: 424 divergent upstream files      # код 0; было 420
  CAT-11: 43                                            # +4, app-lifecycle.test.tsx расходился после Р-4
$ bun run check                                         # код 0, 18 с
Found 517 warnings and 0 errors.
 Tasks:    38 successful, 38 total
Cached:    36 cached, 38 total
```

### Не проверено

- TUI в настоящем терминале и живой бесплатный лимит OpenCode Zen: только тестовый рендерер.

## B1.8 Проверка секретов в CI

22.11.2026. Ветка `b18-secrets-ci` от `oc2-migration` (`b1b45848e6`), рабочее дерево `.claude/worktrees/b18`. Bun 1.4.4
переносной — первым в `PATH` только для своих команд и `git commit`. `bun install --frozen-lockfile`: 1600 пакетов,
`.husky/_` есть, хук `pre-commit` срабатывал на каждом коммите. Код сканера (`secret-scan.ts`) и его тесты не менялись.

### Коммиты

| Коммит | Файлы | `bun run secrets staged` |
|---|---|---|
| `35799e6bd3` `fix(ci): run the secret scan workflow on the OpenCode 2 tree` | `secrets.yml`, `packages/script/package.json`, `bun.lock` (одна строка) | `clean` |
| `af21ac5ded` `fix(ci): give the secret scanner tests a 30 s per-test limit` | `secrets.yml` | `clean` |
| следующий | этот раздел, `catalog.md` (CAT-01) | |

### Что изменено

`secrets.yml`, четыре правки (пять строк с комментарием):

- `bun-version: "1.4.4"`, как `packageManager`. Action `oven-sh/setup-bun` закреплён тем же SHA `0c5077e5…` (v2.2.0).
  Файл релиза `bun-v1.4.4/bun-linux-x64.zip` на GitHub есть (HTTP 200); как именно action его скачивает — не проверял.
- `--filter @opencode/script`. Со старым именем `bun install` в чистом дереве даёт код 0, ничего не ставит и пишет
  только `warn: No workspace packages matched the filter "@opencode-ai/script"` — сбой всплыл бы в тестах.
- `bun typecheck` → `bun check --no-script`. В `packages/script/package.json` v2.3.0 есть только `test`: `bun typecheck`
  отвечает `Script not found "typecheck"`, код 1.
- `bun test` → `bun test --timeout 30000` (отдельный коммит, сверх списка задания; ниже).

Проверка типов: из двух вариантов задания выбран прямой вызов `bun check --no-script` — той же команды, что в скриптах
`typecheck` соседних пакетов v2.3.0 (`plugin`, `schema`, `util`, `protocol` и другие). Скрипт `typecheck` в
`package.json` — это правка файла OpenCode, и пакет попал бы в `bun turbo typecheck`, то есть в состав `bun run check` и
хука `pre-push`: это общий контракт. Прямой вызов — одна строка в файле форка (в v2.3.0 `secrets.yml` нет).

Расхождение с заданием: одного варианта не хватило. После установки с `--filter @opencode/script` в чистом дереве
`bun check --no-script` дал 5 ошибок: `tsconfig.json(3,14): TS6053 File '@tsconfig/bun/tsconfig.json' not found` и
четыре в `bun-types` (`TextEncoderEncodeIntoResult`, `ConnectionOptions`, `KeyObject`, `TLSSocket`) — следствие: без
базового конфига нет `skipLibCheck`. `tsconfig.json` пакета наследует `@tsconfig/bun`, но в v2.3.0 пакет его не
объявляет и берёт из корневых `devDependencies`, а фильтр их не ставит. На точке отсечения (`a080f7725c`) он был в
`devDependencies` пакета. Выбрано меньшее: та же строка `"@tsconfig/bun": "catalog:"`, что у 20 соседних пакетов v2
(`ai`, `cli`, `client`, `core`, `plugin`, `schema`, `util` и другие). `bun install` дописал одну строку в раздел
рабочего пространства `bun.lock`, разрешённые версии не менялись. Другой путь без правки файла OpenCode — добавить корень
в фильтр — ставит все корневые зависимости и рабочие пространства, то есть не «Install scanner tooling only». Запись —
CAT-01 в `catalog.md`; `catalog-check.py` — 420 расходящихся файлов, как до задачи: манифест и lock-файл уже расходились.

Предел теста: в чистом дереве `a pinned archive is skipped only at its pinned path` (`secret-scan.test.ts`, тест правки
сканера B1.2s) упал по пределу 5 с по умолчанию: `this test timed out after 5000ms`. Он трижды запускает сканер с
настоящим gitleaks. Три одиночных прогона без моих фоновых прогонов (load average 1,4 на 6 ядрах): 4,83 / 4,93 / 5,05 с; рядом
`a merge beyond Git's default rename limit…` — 4,3 с и `exceptions are exact…` — 3,7 с. Запаса нет, первый push ветки
переноса мог дать красный статус. В workflow — `--timeout 30000`, как в ручных прогонах пакета от 12 ноября: тесты и
сканер не менялись, ни одна проверка не ослаблена, общий предел задаёт `timeout-minutes: 15`. Если владелец решит иначе,
коммит `af21ac5ded` выбрасывается целиком, а предел ставится в самом тесте в рамках B1.2s.

Что сохранено из `secret-protection.md`: checkout `pull_request.base.sha || github.sha`, `fetch-depth: 0`,
`persist-credentials: false`; fetch head PR из публичного origin без credentials; `pull_request_target` только для
`loginom`, `pull_request` нет; `--frozen-lockfile --ignore-scripts`; сканер вызывается `bun --no-install`, без скриптов
пакетов; `permissions: contents: read`. Шаг «Scan only incoming commits» не менялся.

Правка действует только для push. PR в `loginom` проверяется событием `pull_request_target`: GitHub берёт workflow и
checkout из базовой ветки `loginom`. PR переноса проверит прежний workflow (Bun 1.3.14, `@opencode-ai/script`,
`bun typecheck`) на дереве `loginom`, где он согласован с деревом (`origin/loginom`: `packageManager` `bun@1.3.14`,
пакет `@opencode-ai/script` со скриптом `typecheck: tsgo --noEmit`); новый workflow начнёт действовать для PR только после
слияния переноса в `loginom`. Для PR переноса нужно, чтобы в `loginom` раньше попали правка сканера B1.2s,
`.gitleaks-upstream` и записи `.gitleaksignore` (итог B1).

### Локальный прогон шагов

Чистое дерево — `git worktree add --detach <scratchpad>/b18-clean`, на `af21ac5ded` после `git clean -xfd`, без
`node_modules`. Шаги `run:` берутся из YAML скриптом из scratchpad (`b18-run-steps.ts`, в репозиторий не входит) и
исполняются как у раннера: `bash --noprofile --norc -eo pipefail`, `env` шага, `working-directory`, `GITHUB_ENV` и
`GITHUB_PATH` между шагами, `RUNNER_TEMP`, пустой `HOME` (свежий кэш Bun; gitleaks ставится туда, а не в общий
`~/.local/bin`), `PATH` без `~/.local/bin`. Событие — push новой ветки: `EVENT=push`, `BEFORE` — 40 нулей,
`HEAD=af21ac5ded`. Действия `checkout` и `setup-bun` заменены чистым деревом и Bun 1.4.4 в `PATH`; шаг fetch PR
пропущен (только `pull_request_target`). `origin/loginom` = `ae89c43b57`, совпал с `git ls-remote origin
refs/heads/loginom`; база диапазона — `git merge-base origin/loginom HEAD` = `dd2f949d11`.

`zip` на этой машине нет (на образе GitHub ubuntu-24.04 он есть). Первый прогон, ещё на `35799e6bd3`: 12 тестов
`secret-scan.test.ts` упали с `Executable not found in $PATH: "zip"`. Для следующих прогонов `zip` 3.0-13ubuntu0.2 взят
`apt-get download` и распакован `dpkg-deb -x` в scratchpad, без установки в систему; SHA256 пакета совпал с индексом
apt. Второй прогон (с `zip`, без `--timeout`): 70 pass, 1 fail — предел 5 с, выше.

Итоговый прогон на `af21ac5ded`, код 0, 2 мин 19 с:

```text
## skip (action): actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
## skip (PR only): Fetch PR objects without checking out untrusted code
## skip (action): oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6
## run: Install scanner tooling only
$ export TMPDIR="$RUNNER_TEMP"; echo "TMPDIR=$RUNNER_TEMP" >> "$GITHUB_ENV"
$ bun install --frozen-lockfile --ignore-scripts --filter @opencode/script
bun install v1.4.4 (38afee6c8)
warn: patches/…  no longer applies (…is no longer installed)      # сокращено: 4 строки, пакетов нет в фильтре
+ @tsconfig/bun@1.0.9
+ @types/bun@1.4.3
+ semver@7.8.5
14 packages installed [272.00ms]
$ bun run secrets:install
$ bun packages/script/src/install-gitleaks.ts
Gitleaks 8.30.1 installed with verified checksum. Add <scratchpad>/b18-ci/home/.local/bin to PATH.
$ echo "$HOME/.local/bin" >> "$GITHUB_PATH"
## exit 0, 1.1 s: Install scanner tooling only
## run: Verify scanner behavior
$ cd packages/script && bun test --timeout 30000                  # вывод тестов сокращён
 71 pass
 0 fail
 259 expect() calls
Ran 71 tests across 5 files. [85.33s]
$ bun check --no-script
✓ No type errors in 10 files [62.72ms]
## exit 0, 85.4 s: Verify scanner behavior
## run: Scan only incoming commits
$ EVENT=push BEFORE=0000000000000000000000000000000000000000 BASE= HEAD=af21ac5ded…  <run шага из YAML>
# ветка BEFORE=0…0: base=$(git merge-base origin/loginom "$HEAD") = dd2f949d11
$ bun --no-install packages/script/src/secret-scan.ts range "$base" "$HEAD"
{"status":"clean","commits":2583,"archives":46,"current_files":0,"skipped":[],"upstream_commits":6784,"upstream_findings":606,"upstream_missing":0,"elapsed_ms":51434}
## exit 0, 52.1 s: Scan only incoming commits
```

Диапазон первого push ветки переноса (от `dd2f949d11`: 2583 коммита форка и 6784 коммита истории OpenCode, снятые
закреплением) чист и занимает 52 с при `timeout-minutes: 15`. На `35799e6bd3` тот же шаг: `clean`, 2582 коммита, 55 с.

Проверка типов не холостая: временный файл `src/b18-negative.ts` с `const broken: number = "text"` в чистом дереве —
`TS2322`, код 1; файл удалён.

Разбор YAML: `python3` (`yaml.safe_load`) и `Bun.YAML.parse` — код 0, шесть шагов, `with: {bun-version: "1.4.4"}`;
`secret-workflow.test.ts` читает тот же файл через `Bun.YAML` и исполняет шаг сканирования — 71 pass выше.
`actionlint` на машине нет (`command -v actionlint` пусто), не ставил.

### Какие workflow стартуют при push в обычную ветку

GitHub берёт workflow для push из отправленного коммита, то есть из дерева v2. Только список, чинить — B5.1.

| Workflow | Push-триггер | Push ветки переноса |
|---|---|---|
| `secrets.yml` | `branches: ["**"]`, `tags: ["**"]` | стартует всегда; локально зелёный (выше) |
| `windows-native-check.yml` | `branches: ["**"]` и `paths`: `packages/loginom-host/**`, `packages/desktop/src/main/apps{,.test}.ts`, `packages/opencode/…`, `script/test-windows-profile.ps1`, сам файл | стартует, если push меняет эти пути: ветка переноса меняет `packages/loginom-host/**` (115 файлов от `dd2f949d11`). По коду скорее красный: Bun `1.3.14` при `packageManager` 1.4.4; `packages/desktop/src/main/apps.test.ts` в дереве v2 нет, а шаг его запускает; путей `packages/opencode/…` нет |
| `loginom-macos.yml` | `branches: [macos-build, loginom]` и `paths` | нет |
| `loginom-windows.yml` | push нет (PR по путям, ручной запуск) | нет |
| `loginom-client-full.yml` | push нет (PR по путям, ручной запуск) | нет |
| `release.yml` (v2.3.0 с правками форка) | `branches: [beta]`; ещё `schedule` и ручной запуск | нет |

Workflow v2.3.0 в дереве реагируют на push только в `dev`, `beta`, `production` или теги `process-daemon-v*`
(`bot-nix-hashes`, `check`, `check-nix`, `check-process-daemon`, `check-test`, `deploy*`, `release-process-daemon`) — на
обычной ветке не стартуют. Как GitHub применяет `paths` к первому push ветки с тысячами изменённых файлов, локально не
проверить: для `windows-native-check.yml` считать, что стартует.

К сведению B5.1, не push:

- `schedule` работает только из ветки по умолчанию (`loginom`): расписания `release.yml` (каждые 6 ч), `nightly-beta.yml`
  и `triage-*` начнут срабатывать после слияния переноса в `loginom`. У `release.yml` и `nightly-beta.yml` первое
  задание с `if: github.repository == 'anomalyco/opencode'` и в форке пропускается; у `triage-*` такого условия нет.
- PR из ветки переноса в `loginom`: событие `pull_request` берёт workflow из PR — стартуют `check-test.yml` и
  `check-bot-scope.yml` на любой PR, по путям `check-docs`, `check-process-daemon`, `loginom-client-full`,
  `loginom-macos`, `loginom-windows`, `release-process-daemon`. `pull_request_target` (`secrets`, `triage-*`) — из
  `loginom`. Списки составлены по `on:`; условия `if:` заданий, кроме `github.repository` выше, не разбирал.

### Итоговая проверка

На `af21ac5ded` (после него — только этот раздел и строка CAT-01 в `catalog.md`), из корня дерева:

```text
$ python3 -I scripts/upstream-sync/catalog-check.py --summary
against a6b15d33daf6: 420 divergent upstream files      # код 0; CAT-01: 6, как до задачи
$ bun install --frozen-lockfile                         # код 0, проверка CAT-01
Checked 1684 installs across 2059 packages (no changes)
$ cd packages/script && bun check --no-script
✓ No type errors in 10 files                            # код 0
$ bun run check                                         # код 0, 17 с; 37 из 38 задач из кэша turbo
Found 517 warnings and 0 errors.
sdk-docs: … 11 guide blocks match their source; 0 problem(s)
 Tasks:    38 successful, 38 total
```

### Найдено, не чинил

- Тесты сканера B1.2s с настоящим gitleaks идут 3,7–5,1 с при пределе 5 с по умолчанию (выше); локальные прогоны пакета
  без `--timeout` нестабильны.
- `windows-native-check.yml` на Bun 1.3.14 и вызывает `bun typecheck`; `loginom-windows.yml` тоже вызывает
  `bun typecheck` — B5.1.
- Установка с фильтром печатает 4 предупреждения `patches/… no longer applies` — пакетов нет в фильтре, код 0.

### Не проверено

- Настоящий запуск в GitHub Actions: `setup-bun` с 1.4.4, раннер ubuntu-24.04, время тестов на его CPU, событие
  `pull_request_target`. Локально — только push новой ветки.
- Как GitHub считает `paths` для первого push ветки переноса (`windows-native-check.yml`).

## B2.1 Каркас плагина, U1, только встроенные плагины

22.11.2026. Ветка `b21-plugin-scaffold` от `oc2-migration` (`56fe41abdb`), рабочее дерево `.claude/worktrees/b21`.
Bun 1.4.4 переносной — первым в `PATH` только для своих команд и `git commit`. `bun install --frozen-lockfile`:
1600 пакетов, `.husky/_` есть; хук `pre-commit` (`bun run secrets staged`) — `clean` на каждом коммите. Основа —
`origin/stage-b-checks`: `spike/oc2/plugin/loginom-product`, `spike/oc2/patches/u1-product-plugin.patch`,
`spike/oc2/plugin/impostor`, `spike/oc2/harness/s8.ts`, отчёт spike (S8, «Правки в файлах OpenCode»).

### Коммиты

| Коммит | Что |
|---|---|
| `1c5a043fe6` `feat(core): register the loginom.product plugin as a guarded built-in (U1)` | пакет `packages/loginom-agent`, зависимость `core`, `bun.lock`, `core/src/plugin/{product,internal,supervisor}.ts`, тесты S8, `FORK_ONLY` в `product/test/names.test.ts`, CAT-07 и CAT-01 |
| `4ffd31bbed` `feat(core): load only built-in server plugins in the product server` | запрет пакетов: `PluginProduct.Packages`, проверка в супервизоре, `ServerOptions.pluginPackages`, замена узла в `routes.ts`, `pluginPackages: false` в CLI; тесты `core` и `cli`; CAT-07 |
| `a8101b8738` `docs(upstream-sync): record B2.1 plugin scaffold, U1 and built-in-only plugins` | этот раздел (первая версия) |
| `19dcfa34c1` `test(core): reject a plugin-directory package in the product server` | файл в каталоге `plugins/` конфига в тесте запрета; проверка маркера самозванца — «есть `imported`, нет `setup`» |
| следующий | уточнения этого раздела и CAT-07 |

### Что сделано

- **Пакет `packages/loginom-agent`** (`@loginom-ai-agent/loginom-agent`, private, рабочее пространство по маске
  `packages/*`): `src/index.ts` — `Plugin.define({ id: "loginom.product", setup: () => {} })` на promise-API, как
  прототип spike; хуков нет — шов их не требует, инструменты, допуск и аренда — B2.2…B2.5. `package.json` и
  `tsconfig.json` — по образцу `plugin-browser` (встроенный плагин, который `core` импортирует так же), `typecheck` —
  `bun check --no-script`. От `core` пакет не зависит. Имя `@loginom-ai-agent/agent` не взято: так в 0.4 назывался пакет
  агента (`compat-compare.ts`). Новый пакет форка внесён в `FORK_ONLY` политики имён (`product/test/names.test.ts`), иначе
  два теста `package names` красные.
- **U1.** `core/src/plugin/product.ts` (файл форка): `plugins = [PluginPromise.fromPromise(LoginomAgent)]`, `ids`;
  приведение `as unknown as InternalPlugin` из spike не понадобилось. `internal.ts`: плагины продукта последними в `post`,
  их id в `guarded`. `supervisor.ts`: пакет с id из `guarded` — `failed: Plugin ID is reserved by a built-in plugin: <id>`.
  Переключателей `LOGINOM_SPIKE_*` нет: плагин встроен всегда.
- **Только встроенные плагины.** `PluginProduct.Packages` (`{ allowed }`, узел `PluginProduct.node`, по умолчанию
  `true`). При `allowed = false` супервизор превращает каждую операцию `add` с пакетом (локальный путь из `plugins`,
  каталог `plugins/` конфига, npm-имя) в запись `failed: Plugin packages are disabled: only built-in plugins load` ещё до
  `modules.load`: модуль не импортируется, npm не вызывается. Операции над встроенными id (`-id`, `id`, `opencode.*`)
  работают как прежде. Сервер: `ServerOptions.pluginPackages` и `PluginProduct.node.replace(PluginProduct.configured(...))`
  в `routes.ts`. CLI передаёт `pluginPackages: false` при каждом запуске сервера (`serve`, `service`, stdio — один вызов
  `start` в `server-process.ts`); переменной окружения и ключа конфига нет.

### Правки файлов upstream

| Файл | Строк | Запись |
|---|---|---|
| `packages/core/src/plugin/internal.ts` | +8 −1 | CAT-07 |
| `packages/core/src/plugin/supervisor.ts` | +22 | CAT-07 |
| `packages/server/src/options.ts` | +2 | CAT-07 |
| `packages/server/src/routes.ts` | +2 | CAT-07 |
| `packages/cli/src/server-process.ts` | +2 | CAT-07 (раньше файл был в CAT-12 по маске: имена `apply-identity`) |
| `packages/core/package.json`, `bun.lock` | +1, +16 | CAT-01 |

CAT-07 теперь запись с расхождениями: `pending: B2.1, B2.7a, B4.1` снят, B2.7a и B4.1 — в «Не перенесено из 0.4», как у
CAT-09. Новые файлы форка: `packages/loginom-agent/**`, `core/src/plugin/product.ts`, `core/test/plugin/product.test.ts`,
`cli/test/builtin-plugins.test.ts`.

### Тесты

`packages/core/test/plugin/product.test.ts` — настоящая загрузка Location с конфигом проекта
`.loginom-ai-agent/loginom-ai-agent.json`, Npm-заглушка записывает вызовы:

| Тест | Режим | Что проверяет |
|---|---|---|
| самозванец с `id: "loginom.product"` из конфига (S8) | пакеты разрешены (умолчание OpenCode) | встроенный `active` с `source: builtin`; пакет `failed: Plugin ID is reserved…`; в маркере самозванца есть `imported`, нет `setup` |
| `-loginom.product`, `-loginom.*`, `-*` (S8) | как в продукте | плагин продукта `active`; соседнее удаление `-opencode.config.agent` применилось (конфиг прочитан); последний активный плагин — `loginom.product` |
| сторонний пакет из конфига и из каталога плагинов | как в продукте | файл `.loginom-ai-agent/plugins/discovered.ts` (клонированный проект, конфиг не правится), локальный пакет из `plugins` и npm-имя — `failed: Plugin packages are disabled…`; маркер пуст (модули не импортированы); вызовов npm нет |
| встроенные провайдеры | как в продукте | все id из `ProviderPlugins`, `opencode.models.dev`, `opencode.provider.dynamic` активны; отдельно названы `chatgpt`, `openai`, `github.copilot`, `opencode`, `claude-agent`, `ollama`, `lmstudio`, `vllm` |

Самозванец S8 проверяется при разрешённых пакетах: при запрете пакет отклоняется раньше, и проверка зарезервированного id
до него не доходит.

`packages/cli/test/builtin-plugins.test.ts` — `bun src/index.ts serve --port 0` из исходников в изолированном доме
(`isolatedEnv`), конфиг проекта с локальным пакетом (маркер), npm-именем `third-party-npm-plugin` и провайдером `stub`
(`@opencode/ai/providers/openai-compatible`, `baseURL` — подставной сервер в тесте, без `apiKey`). Ждёт по `GET /api/plugin`,
пока появится `loginom.product`, проверяет обе записи `failed`, отсутствие маркера, активные `loginom.product`,
`opencode.provider.openai`, `opencode.models.dev`. Затем вход по ключу и запрос модели — ниже.

### Мутации

Код `4ffd31bbed`, файл подменялся `perl` и возвращался из копии; `core` — `bun run script/test.ts test/plugin/product.test.ts`,
`cli` — `bun test --timeout 60000 test/builtin-plugins.test.ts`:

```text
=== M0 none                                   core 6 pass 0 fail; cli 1 pass 0 fail
=== M1 guarded without PluginProduct.ids      core 2 pass 4 fail: самозванец и три удаления
=== M2 reserved-id check off                  core 5 pass 1 fail: самозванец
=== M3 product first in post                  core 3 pass 3 fail: три удаления (порядок)
=== M4 package gate off                       core 5 pass 1 fail: сторонний пакет; cli 0 pass 1 fail
=== M5 CLI without pluginPackages: false      cli 0 pass 1 fail
=== M6 test without key login                 cli 0 pass 1 fail: запросы к провайдеру без ключа
```

После `19dcfa34c1` тест запрета проверяет и каталог `plugins/`; M4 его по-прежнему краснит (без проверки файл
импортируется). Устойчивость: `--rerun-each 10` — `core/test/plugin/product.test.ts` 60 pass / 0 fail,
`cli/test/builtin-plugins.test.ts` 10 pass / 0 fail.

M1 повторяет базу S8 из spike: самозванец `active` с `source: local`, встроенный —
`failed: Duplicate plugin ID: loginom.product`.

### Вход по ключу (В-82)

Через API: `POST /api/integration/stub/connect/key` с `{ key, location }` — тот же вызов, что делает
`auth login <id> --method key`. Сама команда CLI ключ спрашивает только в интерактивном терминале
(`form.ts`, `secret`: `API key input requires an interactive terminal`), флага для ключа нет, поэтому вход — через API.
Ключ у сконфигурированного провайдера — метод `key` из `ConfigProviderPlugin`. Затем `POST /api/session`,
`POST /api/session/:id/prompt` и `POST /api/experimental/session/:id/wait`; подставной провайдер записывает заголовок
`authorization` каждого запроса `/chat/completions`: запросы есть, у всех `Bearer <ключ>`. Без входа (M6) запросы идут без
ключа, тест красный. Всё это — при запрете пакетов, то есть в конфигурации продукта.

Вход по подписке ChatGPT (`opencode.provider.chatgpt`, OAuth) не проверялся: аккаунта нет. Плагин загружается
(тест провайдеров выше), сам вход — не проверен.

### Приёмка

Полные прогоны — на `19dcfa34c1` (код окончательный; после него только документы), одной цепочкой, по одному пакету:

| Пакет | Команда | База (B1, журнал) | `19dcfa34c1` |
|---|---|---|---|
| `core` | `bun run script/test.ts` | 7119 pass, 354 skip, 3 fail | 7125 pass (+6 новых), 354 skip, 3 fail — те же `ShellParse > extracts static directory targets…`, `util.effect-flock`, `util.flock` (прогон под root) |
| `cli` | `bun test --timeout 60000` | 407 pass, 9 skip, 0 fail | 408 pass (+1 новый), 9 skip, 0 fail |
| `server` | `bun test` | 127 pass, 1 skip, 0 fail | 127 pass, 1 skip, 0 fail |
| `sdk` | `bun run test` | 40 / 0 | 40 / 0 |
| `product` | `bun test` | 58 pass, 3 fail (`repo-paths`, В-95) | 58 pass, 3 fail — те же |

Промежуточные прогоны: `core` на первом коммите (до запрета) — 7123 pass, 354 skip, 3 fail. Все пять пакетов на рабочем
дереве перед вторым коммитом (до смены ключа узла на `@opencode/` и до теста каталога `plugins/`) дали те же числа,
кроме `product`: 55 pass, 6 fail. Три новых падения `package names` имели две причины: новый пакет вне `FORK_ONLY` и
ключ `@loginom-ai-agent/…`. `FORK_ONLY` исправлен в первом коммите (amend до публикации), ключ — во втором.

Первое имя поля, `plugins: { packages }`, совпало с полем `plugins` в `sdk/src/internal/host.ts`
(`CreateOptions extends Omit<ServerOptions, …>`), и typecheck `sdk` дал TS2430. Поле переименовано в `pluginPackages`.

Typecheck на `19dcfa34c1`: `bun run typecheck` — `core` 1986 файлов, `server` 1573, `cli` 2142, `sdk` 1577,
`loginom-agent` 173, без ошибок. `bun run typecheck:tsc` (`tsc`): `core`, `server`, `cli`, `loginom-agent` — код 0.

```text
$ python3 scripts/upstream-sync/catalog-check.py
against a6b15d33daf6: 429 divergent upstream files       # код 0; CAT-07: 5, CAT-01: 7, CAT-12: 187
$ python3 -I scripts/upstream-sync/apply-identity.py --repo . --check
would change: 0 files
$ bun install --frozen-lockfile
Checked 1686 installs across 2060 packages (no changes)
$ bun run check                                          # код 0, 42 с, 39 задач без кэша turbo
Found 517 warnings and 0 errors.                          # как в B1.8; у новых файлов oxlint — 0 предупреждений
sdk-docs: … 11 guide blocks match their source; 0 problem(s)
@loginom-ai-agent/loginom-agent:typecheck: ✓ No type errors in 173 files
 Tasks:    39 successful, 39 total
$ bun run secrets range 56fe41abdb HEAD                  # на 19dcfa34c1
{"status":"clean","commits":4,…}
```

`bun run check` запускался на `4ffd31bbed`; в `19dcfa34c1` изменился только тест, его typecheck и `tsc` выше.

### Где решал сам

- **Запрет — опцией сервера, а не безусловно в `core`.** Задание требует и запрета в загрузчике, и «`core` без новых
  падений». Пробный безусловный запрет в `supervisor.ts` дал 10 новых падений в `core` (`supervisor-reload.test.ts` — 8,
  `session-activation.test.ts` — 2) и 3 в `server` (`artifact.test.ts`, `worktree.test.ts` — 2): тесты upstream
  загружают локальные пакеты. Сравнил два пути. Запрет по умолчанию с разрешением в тестах трогал бы ещё 4 файла тестов
  upstream и требовал бы того же поля опций: `server/test/fixture/server.ts` запускает `ServerProcess.start` без
  замен. Выбран меньший: библиотека по умолчанию ведёт себя как OpenCode, а сервер продукта всегда передаёт
  `pluginPackages: false`. Переменной окружения и ключа конфига нет: правка значения — правка кода CLI. Путь запуска
  сервера продукта один — `server-process.ts`; его охраняет `cli/test/builtin-plugins.test.ts` (M5). Пакеты по-прежнему
  загружает встраивание через `@opencode/sdk` и тесты `core`, но это не продукт.
- **Проверка зарезервированного id оставлена**, хотя при запрете пакетов продукт до неё не доходит. Задание и план
  называют её частью U1, и она держит S8, если запрет когда-нибудь ослабят. Тест — при разрешённых пакетах.
- **Отклонённый пакет — `failed` с текстом.** В схеме `@opencode/schema/plugin` есть только `active` и `failed`. Свой
  статус «отклонён» — правка публичной схемы и `bun run generate`.
- **Удаления встроенных плагинов из конфига не запрещены.** `-opencode.provider.dynamic` и другие `-opencode.*` действуют
  как в OpenCode: В-80 говорит о загрузке сторонних плагинов. Защищены только `guarded`: id upstream и `loginom.product`.
- **Плагины `SdkPlugins` и `InstancePlugins` (`source: sdk`) не трогал.** Их регистрирует только встраивающий код, в
  сервере продукта их нет. Такой плагин с id `loginom.product` встал бы в `pre` раньше встроенного — как и для id
  upstream из `guarded`.
- **Скелет на promise-API** (`setup`), как прототип: B2.2…B2.5 переносят его код. Регистрация — через
  `PluginPromise.fromPromise`.
- **Ключ узла** — `@opencode/PluginProduct/Packages`: политика имён (`names.test.ts`) требует `@opencode/` для ключей
  сервисов Effect.

### Найдено, не чинил

- Отклонённый npm-пакет остаётся целью проверки обновлений (`PluginUpdate.check`, у записи `source.type: "package"`).
  `Npm.check` отвечает `Package is not installed` до сети, но в журнал на каждую активацию пишется
  `failed to check plugin update`. Что сети нет — только для этой фоновой проверки и только по коду `util/src/npm.ts`,
  перехватом трафика не проверял. Что делает ручной `POST /api/plugin/update` для отклонённой цели — не смотрел.
- `cli/src/server-process.ts` не отформатирован prettier ещё на базе: строки, удлинённые `apply-identity`. Мои строки
  формат не меняют.
- B1.7 предлагал проверить в B2.1 исправления 0.4 в `provider/transform.ts`, кодах OAuth и WebSocket через прокси.
  В задание B2.1 это не вошло, записано в CAT-07 как не проверенное.

### Не проверено

- Вход по подписке ChatGPT (нет аккаунта); вход OAuth и устройства у других провайдеров.
- Windows и macOS; установленная сборка CLI (`build.ts`) — только запуск из исходников.
- Клиентские плагины TUI (TUI грузит их сам из своего конфига) и GUI-плагины Desktop. При запрете сервер не отдаёт
  GUI-бандл пакета из конфига, потому что пакет не загружается. Сам Desktop не запускал.
