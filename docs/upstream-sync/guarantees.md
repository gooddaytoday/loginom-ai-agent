# Охранные тесты гарантий

Шесть гарантий продукта и тесты, которые падают, если перенос кода или слияние upstream их ослабляет. Тесты выполняются в CI (`unit`, `desktop`) и при каждой синхронизации ([procedure.md](procedure.md), шаг `check`). Живые сценарии Desktop/CLI (LNX-*), macOS и Windows скриптами не заменяются: их перечень — разделы 4–5 матрицы совместимости LAB-200.

Для каждой гарантии указан тест-ловушка, проверенный **мутацией**: в копии итогового дерева в код вносилась точечная поломка гарантии, тест становился красным, после отката — зелёным (стенд: Linux, root, bun 1.3.14, Node 24.19.0, 3 CPU/3,8 ГБ; дерево `f37dbf40`).

| № | Гарантия | Где исполняется | Охранные тесты | Мутация и результат |
|---|---|---|---|---|
| G1 | Доступ к файлам и инструментам | `packages/opencode/src/session/tools.ts` (`permitsTool` :699, проверка при вызове :172, допуск вложений), `tool/registry.ts:260-261`, `packages/loginom-host/src/{task-scope,inputs,host-port}.ts` | `packages/opencode/test/session/{profile-tools,task-scope,tools,prompt,loginom-truncation}.test.ts`, `test/util/attachment-preview.test.ts`, `test/tool/package-docs.test.ts`; `packages/loginom-host/test/{inputs,host-port,package-docs,task-scope}.test.ts`; живой `packages/desktop/test/loginom/package-docs-permissions.mjs` | `permitsTool` всегда возвращает `true`: `profile-tools.test.ts` 10/0 → **4/6** (6 падений) (docs-профиль показывает чужие инструменты, подмена одноимённым пользовательским инструментом) |
| G2 | Изоляция профилей (prod/beta/dev; Desktop ≠ CLI; защёлка `.writer`) | `packages/product/src/{index,cli-profile}.ts`, `packages/core/src/{global,flag/flag}.ts`, `packages/opencode/src/cli/standalone.ts` | **новые:** `packages/core/test/flag-identity.test.ts` (унаследованные `OPENCODE_*` не меняют ни флаги, ни пути; не перекрывают `LOGINOM_AI_AGENT_*`), `packages/product/test/names.test.ts` (в исходниках нет чтений `OPENCODE_*` кроме ключей сторонних провайдеров); прежние: `packages/product/test/{identity,cli-profile}.test.ts`, `packages/opencode/test/cli/{standalone,standalone-preflight,profile-windows}.test.ts` | `Flag.LOGINOM_AI_AGENT_CONFIG` с запасным чтением `OPENCODE_CONFIG`: `flag-identity.test.ts` 2/0 → **1 падение** (`"config": "/inherited/opencode.json"`) |
| G3 | Отмена и завершение процессов | `packages/loginom-host/src/{supervisor,node-client}.ts` (успех только при `closed: true` и коде 0), `packages/opencode/src/cli/tui/worker.ts`, `packages/desktop/src/main/server.ts` | `packages/loginom-host/test/{process,node-host,saved-package-shutdown,cli-owner-crash}.test.ts`, `packages/desktop/src/main/shutdown.test.ts`; живые `shutdown-validation.mjs`, `parent-crash.ts` | Принять ненулевой код выхода рантайма (`outcome.code !== 0` → `false`): `process.test.ts` 3/0 → **1 падение** («runtime cleanup requires both a close acknowledgement and a clean exit») |
| G4 | Восстановление соединений | `packages/loginom-host/src/connection/recovery-store.ts`, `host-port.ts`, `packages/opencode/src/session/browser-recovery.ts` | `packages/loginom-host/test/{recovery,host-port,network-fault,parallel-calls,connection-migration,connection-readiness,connection-validation}.test.ts`, `packages/opencode/test/session/browser-recovery.test.ts`, `packages/desktop/src/main/loginom/recovery-store.test.ts` | Мягкий режим перестаёт очищать журнал прошлого процесса (`if (!strict)` → `if (false)`): `host-port.test.ts` + `recovery.test.ts` 20/0 → **1 падение** («restarting the host drops an uncertain record without replaying it») |
| G5 | Комплектность поставляемых ресурсов | `packages/loginom-host/script/stage-resources.ts`, `src/{cli-manifest,bundled-skills}.ts`, `packages/product/loginom-release.json`, `packages/desktop/electron-builder.config.ts` | `packages/loginom-host/test/{stage-resources,cli-manifest,ci-inputs,build-notices,bundled-skills}.test.ts`, `packages/desktop/electron-builder.config.test.ts`, `packages/desktop/scripts/release/artifact.test.ts`; шаг `compat` (хеши каталогов ресурсов, конфигурация electron-builder) | Манифест перестаёт требовать обязательный файл (`LOGINOM_MANIFEST_INCOMPLETE`): `cli-manifest.test.ts` 5/1 → **4/2** (новое падение «macOS manifest requires and hashes the native Keychain helper»; одно падение «umask» было и до мутации — см. ниже) |
| G6 | Правила встроенных скиллов | `packages/opencode/src/skill/index.ts` (:142 зарезервированные имена только из `bundled`, :312 `verifyProductSkills`), `command/index.ts` | `packages/opencode/test/skill/{bundled-skills,skill}.test.ts`, `test/tool/skill.test.ts`, `packages/loginom-host/test/bundled-skills.test.ts`; живой `product-skills-smoke.mjs` | Зарезервированные имена принимаются из любого источника (`if (false)`): `bundled-skills.test.ts` 19/0 → **15/4** (4 падения) (проектный скилл подменяет `package-docs`, загруженный скилл занимает зарезервированное имя) |

## Охранные тесты самой миграции

Они защищают от поломок, которые вносят переименования и слияния, а не отдельную гарантию:

| Тест | Что ловит | Красный на |
|---|---|---|
| `packages/product/test/repo-paths.test.ts` | ключи задач turbo, `--filter`, фильтры путей workflows, `working-directory`, пути к соседним пакетам и `packages/<имя>` в скриптах сборки/CI указывают на несуществующее | `c201f28a` (7 устаревших ссылок: в том числе `packages/desktop/scripts/prebuild.ts`, из-за которого первый CI-прогон ветки упал в macOS и Windows) |
| `packages/product/test/names.test.ts` | пакет форка/upstream носит чужое имя; `@loginom-ai-agent/<пакет upstream>` в импортах; ключи сервисов с чужим префиксом; чтение `OPENCODE_*` | `2e6f66a9` (5 падений из 6; зелёным остаётся лишь проверка чтений `OPENCODE_*`) |
| `packages/core/test/flag-identity.test.ts` | унаследованное окружение OpenCode влияет на конфигурацию, БД или пути | мутация выше |
| `scripts/upstream-sync/selftest.sh` | процедура принимает «разрешение» с файлом форка целиком | мутация проверки `kept-fork` |

## Как запускать

```bash
cd packages/product && bun test                                  # repo-paths, names, identity, cli-profile
cd packages/core && bun test test/flag-identity.test.ts
cd packages/opencode && bun test test/session test/skill test/tool test/util test/cli
cd packages/loginom-host && LOGINOM_AI_AGENT_TEST_NODE=<node 24.19.0> xvfb-run -a bun test
cd packages/desktop && bun test --path-ignore-patterns=src/main/draft-store.test.ts
scripts/upstream-sync/selftest.sh
```

## Базовые падения стенда

Часть тестов падает на стенде независимо от изменений (запуск от root, нет sudo, малый объём памяти). Их список и сравнение «до/после» на одном стенде — в отчёте LAB-207; падение, присутствующее на `2e6f66a9` и на итоговом SHA в том же виде, не считается регрессией, но и не маскируется. Известный пример: `cli-manifest.test.ts` «archive verification preserves manifest modes under a private umask» падает до и после мутации.
