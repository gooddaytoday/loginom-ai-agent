# Каталог оставшихся изменений в файлах upstream

Состояние: форк `loginom` после модульной интеграции LAB-198 против OpenCode `501ff62c` (общая база, v1.18.31). Каталог описывает файлы, которые существуют в upstream и в которых форк отличается от него. Новые файлы форка (`packages/product`, `packages/loginom-host`, `packages/loginom-runtime`, `services/`, `evals/`, `docs/testing/` и др.) от upstream не зависят и каталогом не описываются.

**Как сохраняется честность каталога.** `catalog.json` относит каждый такой файл к записи по маске пути; `scripts/upstream-sync/catalog-check.py` завершается ошибкой, если файл не попал ни в одну запись, запись осталась без файлов или идентификаторы в `catalog.json` и в этом документе разошлись. Проверка входит в процедуру ([procedure.md](procedure.md)), её результат на итоговом SHA — в отчёте. Состав записей сейчас: 1200 файлов (было 2650 до возврата имён), `CAT-01` … `CAT-12`.

**Что вернулось к upstream.** Каталог `packages/opencode`, имя пакета `opencode`, область `@opencode-ai/*` у всех пакетов, существующих в upstream, ключи сервисов Effect `@opencode/<Имя>`. Пакеты только форка (`product`, `loginom-host`, `runtime`, `site`, `evals`) сохраняют область `@loginom-ai-agent`. Внешние имена (`LOGINOM_AI_AGENT_*`, `.loginom-ai-agent`, `loginom-ai-agent.json(c)`, исполняемый файл, идентификаторы приложения, `User-Agent`) не менялись.

## Политики владения

| Политика | Что делать при конфликте |
|---|---|
| `merge` | Объединить обе стороны построчно. Результат проверяется командой из записи и `sync-upstream.sh accepted`. |
| `upstream-first` | Взять файл upstream целиком и повторить описанную в записи правку форка. |
| `fork-owned` | Участок или файл принадлежит форку. Его содержимое сохраняется, изменения upstream в остальных частях переносятся вручную. Выбор файла форка целиком фиксируется как решение владельца (`--allow-ours`). |
| `regenerate` | Не править руками: сгенерировать командой из записи. |

Для всех записей: после слияния выполняются охранные тесты ([guarantees.md](guarantees.md)) и `compat-snapshot` / `compat-compare` ([procedure.md](procedure.md)). Новые `OPENCODE_*`, `.opencode`, `opencode.json(c)` в приходящем коде приводятся к именам продукта командой `scripts/upstream-sync/apply-identity.py`.

## CAT-01 Манифесты и lock-файл

- **Назначение.** Версия продукта (`packages/desktop/package.json` → `0.3.3`, версия установщиков) и корневой `package.json` (`name`, `description`, `version`, скрипты `secrets*`, рабочее пространство `apps/loginom-site`); лицензия и автор Desktop; зависимости только форка (`@loginom-ai-agent/product` в `app`, `core`; `loginom-host` и `schema` в Desktop и `opencode`), добавленные зависимости (`sharp`, `https-proxy-agent`); скрипты `dev:cli`, `prepare:release`; имя бинарника `bin.loginom-ai-agent` у `opencode`; переменная окружения в скрипте `enterprise`.
- **Почему не вынесено.** Манифест — один файл на пакет, расширений в нём нет. Версию `packages/desktop` читает electron-builder (`app.getVersion()`), `extraMetadata.version` из `LOGINOM_AI_AGENT_VERSION` как замену не проверяли (UNVERIFIED), поэтому поле остаётся.
- **Компоненты.** `package.json`, `packages/{app,core,desktop,enterprise,opencode,script,tui,ui}/package.json`, `bun.lock`.
- **Проверка при обновлении.** `bun install --frozen-lockfile`; `bun turbo typecheck`; шаг `compat` (раздел `workspaces`); `packages/desktop/electron-builder.config.test.ts`. Набор разрешённых `name@version` в `bun.lock` сравнивается с блокировкой upstream для зависимостей, которых форк не менял.
- **Политика.** `package.json`: `merge`; поля `name`, `description`, `version` корня и `version`, `license`, `author`, `homepage` Desktop — `fork-owned`. `bun.lock`: `regenerate` (`bun install` версией bun из `packageManager`, затем `--frozen-lockfile`). Корневой `overrides` для `@opencode-ai/plugin` удалён: рабочий пакет теперь носит это имя, как в upstream.

## CAT-02 CI, сборка, выпуск, гигиена репозитория

- **Назначение.** Проверки на любой ветке и PR (`test.yml`, `typecheck.yml`: `branches: ["**"]`), фильтры и каталоги задач форка (`loginom-macos.yml`, `loginom-windows.yml`, `windows-native-check.yml`, `release.yml`, `secrets.yml` — файлы форка, в каталог не входят; публикация upstream `publish.yml` перенесена в `.github/archived/publish-upstream.yml` и не запускается), обёртка сборки CLI/Desktop (`packages/opencode/script/build.ts`: режим `--standalone`, `--target`, метаданные сборки, `User-Agent` продукта), скрипты Desktop (`packages/desktop/scripts/*`, `electron-builder.config.ts`), `turbo.json` (задачи `@loginom-ai-agent/*#test`, `product#test`), `.gitignore`, `.husky/pre-push`, `install`, Nix-описание.
- **Почему не вынесено.** Триггеры `on:` и список задач лежат в самом файле workflow; `build.ts` upstream собирает бинарник одним вызовом `Bun.build` и не имеет точки подключения для метаданных сборки Loginom.
- **Компоненты.** `.github/**`, `.husky/**`, `script/**`, `nix/**`, `packages/*/script(s)/**`, `turbo.json`, `.gitignore`, `install`.
- **Проверка при обновлении.** `packages/product/test/repo-paths.test.ts` (ключи turbo, `--filter`, фильтры путей, `working-directory`, пути в скриптах); `electron-builder.config.test.ts`; шаг `compat` (разделы `workflows`, `turbo`, `electronBuilder`); набор из 27 проверок PR #441 не сокращается.
- **Политика.** `test.yml`, `typecheck.yml`: `merge`, блок `on:` — `fork-owned`; `build.ts`: `merge`, секции standalone — `fork-owned`; `.gitignore`: `merge`; остальное `merge`. Скрипт `install` (установщик OpenCode) форк менял только на путь `~/.loginom-ai-agent/bin` (внешнее имя); продукт устанавливается пакетами, поэтому при конфликте `upstream-first` + `apply-identity.py`.

## CAT-03 Бренд: документы, переводы, значки, словари

- **Назначение.** Название и тексты продукта в документации сайта и переводах (`packages/web/src/content/**`, 470 файлов), словарях интерфейса (`packages/app/src/i18n/*`, 63 файла), значках (`packages/desktop/icons/**`), репозиторных каталогах агента (`.loginom-ai-agent/**`, ранее `.opencode/**`), переведённых README (`docs/upstream/**`), `specs/**`, корневых `*.md`.
- **Почему не вынесено.** Тексты — данные upstream без слоя подстановки: `packages/app/src/context/language.tsx` принимает словари целиком. Оверлей словарей (63 файла вернулись бы к upstream) спроектирован в отчёте LAB-199, но не реализован: он меняет загрузку языка во всех поверхностях интерфейса и требует живой проверки Desktop (LAB-206), которой этот PR не заменяет.
- **Компоненты.** См. маски записи в `catalog.json`.
- **Проверка при обновлении.** Английские строки интерфейса не меняются без решения (`ID UI-06` матрицы): сравнение `en.ts` до/после; тесты `packages/app` на ключи; `rg -n "OpenCode" packages/app/src packages/desktop/src` — каждое вхождение осознанное (`OpenCode Zen` и `OpenCode Go` — названия сторонних моделей и остаются).
- **Политика.** Переводы и документы сайта: `upstream-first` (взять upstream, повторить замену названия продукта); значки: `fork-owned`; `.loginom-ai-agent/**`: перенос новых файлов upstream из `.opencode/**` (git сообщит «file location»).

## CAT-04 Каналы upstream: обновление, установщик, публикация

- **Назначение.** Продукт не обращается к каналам OpenCode: сервис `Installation` возвращает установленную версию, метод `unknown`, а `upgrade` завершается ошибкой «Install a Loginom AI Agent package» (`packages/opencode/src/installation/index.ts:69`, `Layer.succeed`); `cli/upgrade.ts` форк менял только именами флагов (`LOGINOM_AI_AGENT_DISABLE_AUTOUPDATE`, `…_ALWAYS_NOTIFY_UPDATE`): обновление не происходит, потому что `Installation.latest()` возвращает установленную версию; Desktop управляет обновлением сам (`updater.ts`, фид отключён: `Product.updateFeed = null`); в `share-next.ts` форк меняет только имя флага (`OPENCODE_DISABLE_SHARE` → `LOGINOM_AI_AGENT_DISABLE_SHARE`, внешнее имя); в v1.19.4 upstream этот файл удалил, прекратив совместное использование сессий (`cli/cmd/run.ts`: «Session sharing has been discontinued»; `cli/cmd/import.ts`: импорт по ссылке не поддерживается).
- **Почему не вынесено.** `Installation.node` подключён в двух корнях композиции (`effect/app-runtime.ts:105`, `server/routes/instance/httpapi/server.ts:260`), а вспомогательные функции `Installation.latest/method/upgrade` в самом модуле строят рантайм из этого узла. Подмена слоя без правки модуля потребует правки обоих корней композиции; `cli/upgrade.ts` останется с именами флагов: правки не исчезают, а распределяются по трём файлам. Шов `installationLayer` описан в ADR, не реализован.
- **Компоненты.** `packages/opencode/src/installation/index.ts`, `src/cli/upgrade.ts`, `src/share/share-next.ts`, `test/installation/installation.test.ts`, `packages/desktop/src/main/updater.ts`, `updater-controller.test.ts`.
- **Проверка при обновлении.** `packages/opencode/test/installation/installation.test.ts`; `packages/desktop/src/main/updater-controller.test.ts`; шаг `compat` (`Product.Product.updateFeed`, `externalLiterals`); manifest сборки `updater.feed = null`.
- **Политика.** `installation/index.ts`: `fork-owned` — слой `Installation` остаётся заглушкой форка, типы и экспорт (`Info`, `Method`, `Service`, `userAgent`) переносятся из upstream; `cli/upgrade.ts`, `install`: `upstream-first` + `apply-identity.py`. Файл `share-next.ts` удалён в upstream вместе с функцией (в `packages/core/src/share/sql.ts` осталась только таблица `session_share`): перед слиянием владелец подтверждает, что продукт принимает удаление (ADR, «Открытые решения»); пока решения нет, синхронизация не удаляет файл молча, а конфликт остаётся видимым.

## CAT-05 Сессия, инструменты, вложения, права, сервер

- **Назначение.** Профиль задачи (`default`, `loginom-automation`, `package-docs`) и фильтр набора инструментов модели с проверкой при вызове (`session/tools.ts`: `permitsTool` :699, `Effect.die(Error("LOGINOM_SCOPE_DENIED"))` :172); инструменты Loginom в наборе модели (`if (loginom)` :567); метка происхождения инструмента (`tool/registry.ts`: `origin` :260-261); границы хода: аренда запуска Host, применение профиля, активация скилла, восстановление браузера (`session/prompt.ts`, `runLoop` :1154); вложения как байты исходного файла и снимки (`util/file-snapshot.ts`, `util/attachment-preview.ts`, `session/prompt.ts`); неприкосновенность служебных метаданных частей (`TaskScope.sanitize`, `session/task-scope.ts:89`, вызовы в `prompt.ts:1056,1073`).
- **Почему не вынесено.** Плагинные хуки OpenCode (`packages/plugin/src/index.ts`, `Hooks`) не имеют точки на границе хода провайдера, не скрывают инструмент от модели и не назначают происхождение инструмента: `tool.definition` меняет описание и схему, `permission.ask` срабатывает при вызове, `experimental.chat.messages.transform` работает над массивом сообщений без связи с записью в БД (LAB-199, раздел 5). Эти файлы реализуют гарантии «доступ к файлам и инструментам» и «восстановление соединений»; менять их без живой проверки Desktop и Loginom (LAB-206) нельзя, а выигрыша для метрики нет: в дельте v1.19.4 они не конфликтуют, а частота правок upstream в них низкая (`session/tools.ts` и `tool/registry.ts` — по 7 коммитов за последние 1000, `session/prompt.ts` — менее 7).
- **Компоненты.** `packages/opencode/src/{session,tool,effect,server,permission,mcp,util}/**` и тесты; 80 файлов. Реализация Host — в `packages/loginom-host` (не входит в каталог).
- **Проверка при обновлении.** Охранные тесты G1, G3, G4 ([guarantees.md](guarantees.md)): `test/session/{profile-tools,task-scope,tools,prompt,browser-recovery,loginom-truncation}.test.ts`, `test/tool/package-docs.test.ts`, `test/util/attachment-preview.test.ts`, `packages/loginom-host/test/{inputs,host-port,package-docs}.test.ts`; живые сценарии LNX-D3, LNX-C4.
- **Политика.** `merge` с обязательным прогоном перечисленных тестов; выбор файла целиком запрещён. **Шов (проект, не реализован):** `ToolPolicy`, `ToolContributor`, `TurnLifecycle`, `AttachmentResolver` в сервисе `ProductHooks` — контракты в ADR.

## CAT-06 Скиллы и команды

- **Назначение.** Правила встроенных скиллов: зарезервированные имена принимаются только от источника `bundled` (`skill/index.ts:142`), подпись и состав встроенных скиллов проверяет `verifyProductSkills` (`skill/index.ts:312`), порядок загрузки детерминирован; встроенные команды продукта не раскрывают shell-подстановки (`command/index.ts`).
- **Почему не вынесено.** Хук `config` и `skills.paths` добавляют каталоги, но не источник и не запрет зарезервированных имён из недоверенных мест.
- **Компоненты.** `packages/opencode/src/{skill,command}/index.ts`, `command/template/initialize.txt`, `test/skill/skill.test.ts`.
- **Проверка при обновлении.** G6: `test/skill/{bundled-skills,skill}.test.ts`, `test/tool/skill.test.ts`, `packages/loginom-host/test/bundled-skills.test.ts`; `packages/desktop/test/loginom/product-skills-smoke.mjs` (живой).
- **Политика.** `merge`; правка порядка загрузки (:269) — кандидат на PR в upstream. **Шов (проект):** `SkillSourcePolicy`.

## CAT-07 Провайдеры, плагины, прокси

- **Назначение.** Схема JSON инструментов под OpenAI, причины отмены по тайм-ауту, коды ошибок OAuth, WebSocket через прокси (`provider/transform.ts`, `provider/provider.ts`, `plugin/openai/*`, `util/proxy-env.ts`); установка плагинов.
- **Почему не вынесено.** `chat.params` и `chat.headers` не меняют схему инструмента под модель, `tool.definition` не получает модель. Правки универсальны.
- **Компоненты.** 21 файл: `packages/opencode/src/{provider,plugin}/**` и тесты.
- **Проверка при обновлении.** `bun test test/provider/transform.test.ts` (матрица LC-05); тесты `test/plugin/*`.
- **Политика.** `merge`; файлы `transform.ts` и `provider.ts` часто меняются в upstream (29 и 20 коммитов за 1000) — кандидаты на PR в upstream: после принятия расхождение исчезнет.

## CAT-08 CLI, воркер, конфигурация пакета `opencode`

- **Назначение.** Автономный вход (`standalone`, `loginom` management, `run --file`, коды выхода, SIGINT после подтверждённой очистки), мост воркера (`cli/tui/worker.ts`), конфигурация (`config/*`).
- **Почему не вынесено.** В upstream нет хуков жизненного цикла процесса; автономный вход уже вынесен в новые файлы форка (`src/standalone.ts`, `src/cli/standalone*.ts`), остаются правки `run.ts`, `worker.ts`, `tui.ts`.
- **Компоненты.** `packages/opencode/src/cli/**`, `src/config/**`, `test/cli/**` и др.; 80 файлов.
- **Проверка при обновлении.** G2, G3: `test/cli/{standalone,standalone-preflight,loginom-management,run-outcome}.test.ts`, `packages/product/test/cli-profile.test.ts`, `packages/loginom-host/test/{process,node-host,cli-owner-crash}.test.ts`; живые LNX-C3, LNX-C6.
- **Политика.** `merge`. **Шов (проект):** `ProcessHost`; `run.ts` — вынести в `run-standalone.ts`.

## CAT-09 Desktop: главный процесс, preload, renderer

- **Назначение.** Подключение Host в Electron (`src/main/loginom/*`, новые файлы форка), профиль и пути (`src/main/index.ts`), sidecar и завершение (`server.ts`, `sidecar.ts`), мастер первого запуска (`src/renderer/onboarding.tsx`).
- **Почему не вынесено.** В `packages/app` и `packages/desktop` нет плагинного API.
- **Компоненты.** `packages/desktop/**` кроме значков и сценариев сборки; 92 файла.
- **Проверка при обновлении.** `bun test --path-ignore-patterns=src/main/draft-store.test.ts`; G3, G4: `src/main/{shutdown,loginom/recovery-store}.test.ts`; живые LNX-D1…D8.
- **Политика.** `merge`. **Шов (проект):** `ProductSlots`.

## CAT-10 Веб-приложение, UI-кит, UI сессии

- **Назначение.** Настройки Loginom, форма подключения, фильтр вложений `.lgp`, слово-знак нового чата, платформенные возможности.
- **Почему не вынесено.** Нет реестра секций настроек.
- **Компоненты.** `packages/app/**`, `packages/ui/**`, `packages/session-ui/**` (кроме словарей и ресурсов из CAT-03); 113 файлов.
- **Проверка при обновлении.** `bun run test:unit`, `bun run test:browser` в `packages/app`; `bun test src` в `ui`, `session-ui`; e2e в CI (`e2e`).
- **Политика.** `merge`.

## CAT-11 Терминальный интерфейс

- **Назначение.** Слово-знак и главная страница, вложения из буфера и упоминаний (`local-attachment.ts`).
- **Почему не вынесено.** Слот `home_logo` существует в upstream (`packages/tui/src/routes/home.tsx`, `mode="replace"`) и мог бы заменить правку; подключение плагина через `OPENCODE_TUI_CONFIG` из встроенных ресурсов не проверялось (UNVERIFIED).
- **Компоненты.** `packages/tui/**`; 33 файла.
- **Проверка при обновлении.** `bun test` в `packages/tui`; живой LNX-C5.
- **Политика.** `merge`.

## CAT-12 Ядро: идентичность и общие пакеты

- **Назначение.** Имена приложения и каталогов данных (`core/src/global.ts`: `loginom-ai-agent` по каналу), флаги окружения `LOGINOM_AI_AGENT_*` (`core/src/flag/flag.ts`), логирование, схема и сервер, SDK.
- **Почему не вынесено.** `OPENCODE_` встречался в 98 исходных файлах upstream, `Flag` покрывает часть; единой точки идентичности нет. Загрузочное сопоставление `LOGINOM_AI_AGENT_*` → `OPENCODE_*` отвергнуто (ADR, альтернатива C).
- **Компоненты.** `packages/core/**`, `schema`, `server`, `sdk`, `sdk-next`, `cli`, `enterprise`, `script`; 47 файлов.
- **Проверка при обновлении.** `packages/core/test/flag-identity.test.ts` (унаследованные `OPENCODE_*` не влияют на конфигурацию и пути), `packages/product/test/names.test.ts` (нет чтений `OPENCODE_*`, кроме ключей сторонних провайдеров), `bun test` в `packages/core`; шаг `compat` (`envLiterals`, `opencodeEnvFiles`).
- **Политика.** `merge` + `apply-identity.py` для нового кода.
