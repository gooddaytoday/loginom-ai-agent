# Охранные тесты гарантий

Шесть гарантий продукта и тесты, которые падают, если перенос кода или слияние upstream их ослабляет. Тесты выполняются при каждой синхронизации ([procedure.md](procedure.md), шаг `check`) и в CI (workflows форка на дереве v2 — B5.1). Живые сценарии Desktop/CLI (LNX-*), macOS и Windows скриптами не заменяются: их перечень — разделы 4–5 матрицы совместимости LAB-200.

**Дерево переноса на OpenCode v2.3.0.** Пакеты форка `loginom-host` и `product` перенесены как есть (B1.2a), вместе с ними — их охранные тесты. Код, который в 0.4 жил в пакете `opencode` (швы `ProductHooks`, `standalone`, мост воркера TUI), на v2 переносят задачи B2 в плагин `loginom.product`, Desktop — задачи B4. Каждая такая задача переносит охранные тесты своей гарантии и проверяет их мутацией (план B, раздел B2). Шлюз B, пункт 2: G1–G6 перенесены, зелёные и проверены мутацией (B6.2). Таблица 0.4 — где исполнялась гарантия, тесты, мутации — на точке отсечения: `git show a080f7725c:docs/upstream-sync/guarantees.md`.

Мутации в последнем столбце проверены на 0.4: в копии итогового дерева в код вносилась точечная поломка гарантии, тест становился красным, после отката — зелёным (стенд: Linux, root, bun 1.3.14, Node 24.19.0, 3 CPU/3,8 ГБ; дерево `f37dbf40`). На дереве v2 мутации не перемерялись.

| № | Гарантия | На дереве v2: код и охранные тесты | Переносит | Мутация и результат (0.4) |
|---|---|---|---|---|
| G1 | Доступ к файлам и инструментам | `packages/loginom-host/src/{task-scope,inputs,host-port}.ts`; `packages/loginom-host/test/{inputs,host-port,package-docs,task-scope}.test.ts`. В `package-docs.test.ts` одно падение до B2: тест читает фикстуры маршрутизации пакета `opencode` 0.4 (B1.5) | Фильтр набора инструментов и проверка при вызове, каталог Host, допуск вложений (швы `toolPolicy`, `toolContributor`, `attachmentResolver` 0.4) — B2.2, B2.5d. Приёмка B2.2: мутация «`permits` всегда `true`» краснит G1 | `toolPolicy.permits` всегда возвращает `true`: `profile-tools.test.ts` 10/0 → **4/6**; вместе с `tool-policy.test.ts` 29/0 → **19/10** |
| G2 | Изоляция профилей (prod/beta/dev; Desktop ≠ CLI; защёлка `.writer`) | `packages/product/src/{index,cli-profile}.ts`; `packages/product/test/{identity,cli-profile,names}.test.ts`; `packages/cli/test/flag-identity.test.ts` (B1.3a: CLI с унаследованными `OPENCODE_*` держит данные, кэш, состояние и журналы в каталогах продукта; проверки конфига, домашнего каталога, БД и пароля — `test.failing` до B1.4); своя служба у каждого продукта и профиля — `packages/cli/test/service-identity.test.ts` (U5, CAT-13) | Чтение только `LOGINOM_AI_AGENT_*` и каталоги по каналу — B1.4; профили CLI и защёлка `.writer` — B2.7c | `Flag.LOGINOM_AI_AGENT_CONFIG` с запасным чтением `OPENCODE_CONFIG`: `flag-identity.test.ts` 2/0 → **1 падение** |
| G3 | Отмена и завершение процессов | `packages/loginom-host/src/{supervisor,node-client}.ts` (успех только при `closed: true` и коде 0); `packages/loginom-host/test/{process,node-host,saved-package-shutdown,cli-owner-crash}.test.ts` | Аренда Host на границах хода (`turnLifecycle.acquireRun` 0.4) — B2.3; завершение Desktop и службы (LIFE-01, В-87) — B2.3b, B4 | Принять ненулевой код выхода рантайма (`outcome.code !== 0` → `false`): `process.test.ts` 3/0 → **1 падение** («runtime cleanup requires both a close acknowledgement and a clean exit») |
| G4 | Восстановление соединений | `packages/loginom-host/src/connection/recovery-store.ts`, `packages/loginom-host/src/host-port.ts`; `packages/loginom-host/test/{recovery,host-port,network-fault,parallel-calls,connection-migration,connection-readiness,connection-validation}.test.ts` | Одно напоминание о восстановлении браузера за попытку (`turnLifecycle.endTurn` и `session/browser-recovery.ts` 0.4) — B2.3; хранилище восстановления Desktop — B4 | Мягкий режим перестаёт очищать журнал прошлого процесса (`if (!strict)` → `if (false)`): `host-port.test.ts` + `recovery.test.ts` 20/0 → **1 падение** («restarting the host drops an uncertain record without replaying it») |
| G5 | Комплектность поставляемых ресурсов | `packages/loginom-host/script/stage-resources.ts`, `packages/loginom-host/src/{cli-manifest,bundled-skills}.ts`, `packages/product/loginom-release.json`; `packages/loginom-host/test/{stage-resources,cli-manifest,ci-inputs,build-notices,bundled-skills}.test.ts`; шаг `compat` (хеши каталогов ресурсов) | Конфигурация electron-builder и артефакты Desktop форка — B4; G5 с мутацией на выпуске — B5.2 | Манифест перестаёт требовать обязательный файл (`LOGINOM_MANIFEST_INCOMPLETE`): `cli-manifest.test.ts` 5/1 → **4/2** (одно падение «umask» было и до мутации — см. ниже) |
| G6 | Правила встроенных скиллов | `packages/loginom-host/test/bundled-skills.test.ts` | Зарезервированные имена только из встроенного каталога (шов `skillSource` 0.4) — B2.4. Приёмка B2.4: мутация «`admits` всегда `true`» краснит G6 | `skillSource.admits` всегда `true`: `bundled-skills.test.ts` 19/0 → **15/4**; `test/product` + `test/skill` 82/0 → **77/5** |

## Охранные тесты самой миграции

Они защищают от поломок, которые вносят переименования и слияния, а не отдельную гарантию:

| Тест | Что ловит | Красный на |
|---|---|---|
| `packages/product/test/repo-paths.test.ts` | ключи задач turbo, `--filter`, фильтры путей workflows, `working-directory`, пути к соседним пакетам и `packages/<имя>` в скриптах сборки/CI указывают на несуществующее; каталог расходится с upstream; файлы этого документа отсутствуют | `c201f28a` (7 устаревших ссылок 0.4, в том числе на `prebuild.ts` Desktop); на дереве v2 — 5 падений до B1.4 и B5.1, см. журнал переноса, раздел B1.7 |
| `packages/product/test/names.test.ts` | пакет форка/upstream носит чужое имя; `@loginom-ai-agent/<пакет upstream>` в импортах; ключи сервисов с чужим префиксом; чтение `OPENCODE_*` (до B1.4 — `test.failing`) | `2e6f66a9` (5 падений из 6) |
| `packages/cli/test/flag-identity.test.ts` | унаследованное окружение OpenCode влияет на каталоги, конфигурацию, БД или пароль | мутация G2 (0.4) |
| `scripts/upstream-sync/selftest.sh` | процедура принимает «разрешение» с файлом форка целиком; уже слитый тег даёт не пустой результат | мутация проверки `kept-fork` |

## Охранные тесты швов ProductHooks

В 0.4 шесть швов и порядок их загрузки жили в пакете `opencode` (`src/product/*`); каждый шов вводился отдельным коммитом с тестом, красным без шва или при мутации. Таблица мутаций — в версии документа на точке отсечения. На v2 швы становятся кодом плагина, и мутацию повторяет задача, которая переносит шов: `installationNode` — B2.7d, `skillSource` — B2.4, `toolPolicy` — B2.2, `toolContributor` и `attachmentResolver` — B2.5d, `turnLifecycle` — B2.3, порядок загрузки — B2.1. Живые сценарии (мастер, подключение, вложения, отмена, восстановление) этими тестами не заменяются.

## Как запускать

Из корня рабочего дерева, Bun 1.4.4 (`packageManager`) и Node 24.19.0 (`packages/product/loginom-release.json`):

```bash
cd packages/loginom-runtime/client && npm ci --ignore-scripts --omit=dev --no-audit --fund=false --workspaces=false   # пакет acorn для product
cd packages/dashboard/template && "$LOGINOM_AI_AGENT_TEST_NODE" "$(dirname "$LOGINOM_AI_AGENT_TEST_NODE")/../lib/node_modules/npm/bin/npm-cli.js" ci --ignore-scripts
cd packages/product && bun test                                  # repo-paths, names, identity, cli-profile, маршруты узлов
cd packages/cli && bun test test/flag-identity.test.ts test/service-identity.test.ts
cd packages/loginom-host && LOGINOM_AI_AGENT_TEST_NODE=<node 24.19.0> xvfb-run -a bun test
cd packages/dashboard && LOGINOM_AI_AGENT_TEST_NODE=<node 24.19.0> bun run test
scripts/upstream-sync/selftest.sh
```

Два шага, без которых прогон врёт (B1.1, B1.5):

- `npm ci` шаблона `packages/dashboard/template` закреплённым Node — до тестов дашбордов. Без него на точке отсечения было 17 ложных падений (B1.1); на дереве v2 — 19 в `test:coverage:workers`, и скрипт `test` дальше не идёт (B1.7).
- `LOGINOM_AI_AGENT_TEST_NODE` — путь к `bin/node` Node 24.19.0 для `loginom-host` и `dashboard`. Без неё `loginom-host` на дереве v2 даёт 205 падений вместо 38 (B1.5). В 0.4 то же требовалось набору пакета `opencode`: без неё 66 падений вместо 6 (B1.1); при переносе кода туда, где тесты запускают Node, переменную берут с собой.

Ещё одна подготовка: тест маршрутов узлов в `product` загружает клиент `loginom-runtime`, а тот импортирует `acorn`. В 0.4 пакет лежал в корневом `node_modules`, на v2 Bun его туда не кладёт, и без `npm ci` клиента тест падает с `Cannot find package 'acorn'`. Шаг `install` процедуры ставит клиента тем же `npm ci`.

`bun turbo test` переменную не передаёт: задачи `turbo.json` с `passThroughEnv` для пакетов форка на дереве v2 ещё нет (B5.1). Поэтому `loginom-host` и `dashboard` запускают из каталога пакета, как выше.

## Базовые падения стенда

Часть тестов падает на стенде независимо от изменений (запуск от root, нет sudo, малый объём памяти). Падение, присутствующее до и после правки в том же виде, не считается регрессией, но и не маскируется. Сравнение «до/после» на одном стенде — в журнале переноса (`oc2-migration-log.md`) по задачам. Известные примеры:

- `cli-manifest.test.ts` «archive verification preserves manifest modes under a private umask» и `managed-work-entry` «Expected refusal» (под root) — в `loginom-host` с точки отсечения;
- на дереве v2 в `loginom-host` ещё 36 падений до B2 и B4 (`skills-acceptance` 24, фикстуры пакета `opencode` 0.4 — 9, `bundled-ripgrep` 3; B1.5);
- `dashboard`, `folder.test.mjs` «a partial source copy is retried completely…» (2 подтеста и сам тест): под root `chmod 0` не даёт `EACCES` (B1.7).
