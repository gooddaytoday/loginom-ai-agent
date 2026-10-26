# Охранные тесты гарантий

Шесть гарантий продукта и тесты, которые падают, если перенос кода или слияние upstream их ослабляет. Тесты выполняются в CI (`unit`, `desktop`) и при каждой синхронизации ([procedure.md](procedure.md), шаг `check`). Живые сценарии Desktop/CLI (LNX-*), macOS и Windows скриптами не заменяются: их перечень — разделы 4–5 матрицы совместимости LAB-200.

Для каждой гарантии указан тест-ловушка, проверенный **мутацией**: в копии итогового дерева в код вносилась точечная поломка гарантии, тест становился красным, после отката — зелёным (стенд: Linux, root, bun 1.3.14, Node 24.19.0, 3 CPU/3,8 ГБ; дерево `f37dbf40`).

| № | Гарантия | Где исполняется | Охранные тесты | Мутация и результат |
|---|---|---|---|---|
| G1 | Доступ к файлам и инструментам | `packages/opencode/src/product/{tool-policy,tool-contributor,attachment-resolver}.ts` (фильтр набора и проверка при вызове — `toolPolicy.permits`, каталог Host — `toolContributor`, допуск вложений — `attachmentResolver`), их вызовы в `session/{tools,prompt}.ts`, `tool/registry.ts` (`origin`, `allowed`), `packages/loginom-host/src/{task-scope,inputs,host-port}.ts` | `packages/opencode/test/product/{tool-policy,tool-contributor,attachment-resolver}.test.ts`, `packages/opencode/test/session/{profile-tools,task-scope,tools,prompt,loginom-truncation}.test.ts`, `test/util/attachment-preview.test.ts`, `test/tool/package-docs.test.ts`; `packages/loginom-host/test/{inputs,host-port,package-docs,task-scope}.test.ts`; живой `packages/desktop/test/loginom/package-docs-permissions.mjs` | `toolPolicy.permits` всегда возвращает `true` (раньше `permitsTool` в `tools.ts`): `profile-tools.test.ts` 10/0 → **4/6** (6 падений); вместе с `tool-policy.test.ts` 29/0 → **19/10** (docs-профиль показывает чужие инструменты, подмена одноимённым пользовательским инструментом) |
| G2 | Изоляция профилей (prod/beta/dev; Desktop ≠ CLI; защёлка `.writer`) | `packages/product/src/{index,cli-profile}.ts`, `packages/core/src/{global,flag/flag}.ts`, `packages/opencode/src/cli/standalone.ts` | **новые:** `packages/core/test/flag-identity.test.ts` (унаследованные `OPENCODE_*` не меняют ни флаги, ни пути; не перекрывают `LOGINOM_AI_AGENT_*`), `packages/product/test/names.test.ts` (в исходниках нет чтений `OPENCODE_*` кроме ключей сторонних провайдеров); прежние: `packages/product/test/{identity,cli-profile}.test.ts`, `packages/opencode/test/cli/{standalone,standalone-preflight,profile-windows}.test.ts` | `Flag.LOGINOM_AI_AGENT_CONFIG` с запасным чтением `OPENCODE_CONFIG`: `flag-identity.test.ts` 2/0 → **1 падение** (`"config": "/inherited/opencode.json"`) |
| G3 | Отмена и завершение процессов | `packages/loginom-host/src/{supervisor,node-client}.ts` (успех только при `closed: true` и коде 0), `packages/opencode/src/cli/tui/worker.ts`, `packages/opencode/src/product/turn-lifecycle.ts` (`acquireRun` освобождает аренду Host при закрытии области запуска), `packages/desktop/src/main/server.ts` | `packages/opencode/test/product/turn-lifecycle.test.ts`, `packages/opencode/test/session/prompt.test.ts` (гонки освобождения аренды и отмены), `packages/loginom-host/test/{process,node-host,saved-package-shutdown,cli-owner-crash}.test.ts`, `packages/desktop/src/main/shutdown.test.ts`; живые `shutdown-validation.mjs`, `parent-crash.ts` | Принять ненулевой код выхода рантайма (`outcome.code !== 0` → `false`): `process.test.ts` 3/0 → **1 падение** («runtime cleanup requires both a close acknowledgement and a clean exit») |
| G4 | Восстановление соединений | `packages/loginom-host/src/connection/recovery-store.ts`, `host-port.ts`, `packages/opencode/src/session/browser-recovery.ts`, `packages/opencode/src/product/turn-lifecycle.ts` (`endTurn`: одно напоминание за попытку, затем остановка) | `packages/loginom-host/test/{recovery,host-port,network-fault,parallel-calls,connection-migration,connection-readiness,connection-validation}.test.ts`, `packages/opencode/test/session/browser-recovery.test.ts`, `packages/desktop/src/main/loginom/recovery-store.test.ts` | Мягкий режим перестаёт очищать журнал прошлого процесса (`if (!strict)` → `if (false)`): `host-port.test.ts` + `recovery.test.ts` 20/0 → **1 падение** («restarting the host drops an uncertain record without replaying it») |
| G5 | Комплектность поставляемых ресурсов | `packages/loginom-host/script/stage-resources.ts`, `src/{cli-manifest,bundled-skills}.ts`, `packages/product/loginom-release.json`, `packages/desktop/electron-builder.config.ts` | `packages/loginom-host/test/{stage-resources,cli-manifest,ci-inputs,build-notices,bundled-skills}.test.ts`, `packages/desktop/electron-builder.config.test.ts`, `packages/desktop/scripts/release/artifact.test.ts`; шаг `compat` (хеши каталогов ресурсов, конфигурация electron-builder) | Манифест перестаёт требовать обязательный файл (`LOGINOM_MANIFEST_INCOMPLETE`): `cli-manifest.test.ts` 5/1 → **4/2** (новое падение «macOS manifest requires and hashes the native Keychain helper»; одно падение «umask» было и до мутации — см. ниже) |
| G6 | Правила встроенных скиллов | `packages/opencode/src/product/skill-source.ts` (`admits`: зарезервированные имена только из `bundled`; `bundled`: `verifyProductSkills`), вызовы в `skill/index.ts` и `command/index.ts` | `packages/opencode/test/product/skill-source.test.ts`, `packages/opencode/test/skill/{bundled-skills,skill}.test.ts`, `test/tool/skill.test.ts`, `packages/loginom-host/test/bundled-skills.test.ts`; живой `product-skills-smoke.mjs` | Зарезервированные имена принимаются из любого источника (`skillSource.admits` всегда `true`, раньше `if (false)` в `skill/index.ts`): `bundled-skills.test.ts` 19/0 → **15/4** (4 падения); `test/product` + `test/skill` 82/0 → **77/5** (проектный скилл подменяет `package-docs`, загруженный скилл занимает зарезервированное имя) |

## Охранные тесты самой миграции

Они защищают от поломок, которые вносят переименования и слияния, а не отдельную гарантию:

| Тест | Что ловит | Красный на |
|---|---|---|
| `packages/product/test/repo-paths.test.ts` | ключи задач turbo, `--filter`, фильтры путей workflows, `working-directory`, пути к соседним пакетам и `packages/<имя>` в скриптах сборки/CI указывают на несуществующее | `c201f28a` (7 устаревших ссылок: в том числе `packages/desktop/scripts/prebuild.ts`, из-за которого первый CI-прогон ветки упал в macOS и Windows) |
| `packages/product/test/names.test.ts` | пакет форка/upstream носит чужое имя; `@loginom-ai-agent/<пакет upstream>` в импортах; ключи сервисов с чужим префиксом; чтение `OPENCODE_*` | `2e6f66a9` (5 падений из 6; зелёным остаётся лишь проверка чтений `OPENCODE_*`) |
| `packages/core/test/flag-identity.test.ts` | унаследованное окружение OpenCode влияет на конфигурацию, БД или пути | мутация выше |
| `scripts/upstream-sync/selftest.sh` | процедура принимает «разрешение» с файлом форка целиком | мутация проверки `kept-fork` |

## Охранные тесты швов ProductHooks

Каждый шов вводился отдельным коммитом вместе с тестом, красным без шва или при мутации. Числа ниже перемерены на итоговом дереве скриптом мутаций (мутация вносится в модуль шва, дерево возвращается к исходному, «прошло/упало»; до мутации во всех наборах 0 падений).

| Шов (коммит) | Тест | Мутация | Набор (`cd packages/opencode && bun test …`) | Результат |
|---|---|---|---|---|
| `installationNode` (`72a7f03e`) | `test/installation/product-installation.test.ts` | `node = upstreamNode` в `installation/index.ts` | `test/installation`, 33 теста | 33/0 → **14/19** (зелёными остаются тесты upstream против `upstreamNode`, `userAgent` и классификация релизов) |
| `skillSource` (`08e1876d`) | `test/product/skill-source.test.ts`, `test/skill/bundled-skills.test.ts` | `admits` всегда `true` | `test/product test/skill`, 82 теста | 82/0 → **77/5** |
| `toolPolicy` (`ef595a2f`) | `test/product/tool-policy.test.ts`, `test/session/profile-tools.test.ts` | `permits` всегда `true` | `test/product/tool-policy.test.ts test/session/{profile-tools,tools,task-scope}.test.ts`, 29 тестов | 29/0 → **19/10** |
| `toolContributor` (`8e54950b`) | `test/product/tool-contributor.test.ts`, `test/session/tools.test.ts` | три сразу: токен Host остаётся в схеме, инструменты выдаются без задачи, вложения не откладываются до вызова Dock | `test/product/tool-contributor.test.ts test/session/{tools,profile-tools}.test.ts`, 19 тестов | 19/0 → **15/4** |
| `attachmentResolver` (`ab25238a`) | `test/product/attachment-resolver.test.ts`, `test/session/prompt.test.ts` | две сразу: пакет сценария не распознаётся, снимок игнорирует ссылку на строки и якорь | `test/product/attachment-resolver.test.ts test/session/prompt.test.ts`, 97 тестов | 97/0 → **92/5** |
| `turnLifecycle` (`1e01da73`) | `test/product/turn-lifecycle.test.ts`, `test/session/{prompt,browser-recovery}.test.ts` | две сразу: аренда не освобождается, напоминание о восстановлении не отправляется | `test/product/turn-lifecycle.test.ts test/session/{prompt,browser-recovery}.test.ts`, 103 теста | 103/0 → **97/6** |
| порядок загрузки (`5506e9eb`) | `test/product/load-order.test.ts` | шов `skillSource` импортирует `session/prompt` | `test/product/load-order.test.ts`, 12 учтённых случаев | 12/0 → **7/5** (в том числе один безымянный сбой загрузки файла) |

Живые сценарии (мастер, подключение, вложения, отмена, восстановление) этими тестами не заменяются.

## Как запускать

```bash
cd packages/product && bun test                                  # repo-paths, names, identity, cli-profile
cd packages/core && bun test test/flag-identity.test.ts
cd packages/opencode && bun test test/product test/session test/skill test/tool test/util test/cli test/installation
cd packages/loginom-host && LOGINOM_AI_AGENT_TEST_NODE=<node 24.19.0> xvfb-run -a bun test
cd packages/desktop && bun test --path-ignore-patterns=src/main/draft-store.test.ts
scripts/upstream-sync/selftest.sh
```

## Базовые падения стенда

Часть тестов падает на стенде независимо от изменений (запуск от root, нет sudo, малый объём памяти). Их список и сравнение «до/после» на одном стенде — в отчёте LAB-207; падение, присутствующее на `2e6f66a9` и на итоговом SHA в том же виде, не считается регрессией, но и не маскируется. Известный пример: `cli-manifest.test.ts` «archive verification preserves manifest modes under a private umask» падает до и после мутации.
