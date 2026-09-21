# План сборки и приёмки Loginom AI Agent

## Goal

Получить воспроизводимые desktop-артефакты со всем локальным исполнителем и подготовить независимую передачу Windows/macOS агентам. Завершение документации передачи не зависит от результатов будущих нативных запусков; готовность конкретного выпуска зависит от его проверок.

## Architecture

`packages/product` определяет идентичность; desktop использует backend v1 из `packages/agent` и встроенный `packages/loginom-host`; `packages/loginom-runtime` запускается отдельным процессом с комплектными Node, Playwright/MCP и Chromium. Сборка создаёт каталог ресурсов, установщик и manifest; проверки используют установленный пакет. Сервер знаний остаётся внешним.

## Tech Stack

Текущий baseline: Electron 42.3.3, electron-builder 26.15.2, Bun 1.3.14; импортируемый Dock — Node 24.19.0, `@playwright/mcp` 0.0.80, Playwright/core `1.63.0-alpha-2026-08-31`. Chromium revision извлекается из `browsers.json` именно закреплённого Playwright. Alpha pin не обновлять попутно: любое изменение требует отдельной совместимости Loginom/runtime и повторной матрицы.

## Spec и зависимости

[Согласованная спецификация](../specs/2026-09-16-loginom-ai-agent-desktop-design.md), commit `be99a5767`; [общий план](2026-09-16-loginom-ai-agent.md); [нативные runbooks](../../testing/loginom-ai-agent/README.md). Начинать после переноса клиента, Product identity, рабочего v1 host adapter и сервиса подключения. Ссылки на исходный `packages/opencode` в исторических документах после переименования соответствуют `packages/agent`.

**Общие ограничения:** не терять чужие изменения; эта задача — документация, команды ниже исполняются только при реализации. Тесты — из package directories, typecheck — `bun typecheck`, не прямой `tsc`. При изменении публичного Protocol/HttpApi выполнить `bun run generate` из `packages/client`; generated вручную не править. Сохранять Schema → Core/Protocol → Server; Client не импортирует Core/Server. Имена веток — максимум три слова через дефисы; коммиты conventional. Секреты не писать в Git, manifest, stdout, model history и отчёты. Не публиковать release, не переключать production и не удалять старый репозиторий как побочный эффект сборки.

## Входные и выходные контракты

- Вход: `Product` из `packages/product/src/index.ts`, зафиксированные импорт и lockfile runtime, trust/license manifest и action-catalog hash, lifecycle API host/runtime, относительный executable/resource layout.
- Вход desktop settings: `window.api.loginom.{read,check,save,cancelPending,status}`; redacted state, поколения подключения и snapshots задач. Проверки не вызывают `global.config.update`.
- Изменения ждут всех активных Loginom drains и неопределённых операций; новый runtime запускается до active commit. Failure сохраняет старый runtime/admission; потеря обоих блокирует только Loginom. Упаковка не подменяет этот контракт restart всего backend.
- Выход: `artifacts/loginom-ai-agent/<version>/<platform>-<arch>/release-manifest.json`, соседние установщики, SHA256 sidecar manifest, `checks/` с очищенными отчётами. Target IDs: `linux-x64`, `win32-x64`, `darwin-arm64`.
- Все CLI ниже **новые, их сначала создать** в `packages/desktop/scripts/release/`; текущих Loginom release-команд в репозитории нет. Пути аргументов разрешаются относительно указанного cwd; вывод ошибок не содержит secrets.

## Задача R1. Закрепить и подготовить комплект ресурсов

**Файлы:** создать `packages/desktop/loginom-runtime-pins.json`, `scripts/release/stage-loginom.ts`, `scripts/release/stage-loginom.test.ts`; изменить `packages/loginom-runtime` launcher и его tests по итоговой карте импорта. Cwd команд задачи — `packages/desktop`.

- [ ] Сверить реальный runtime lock с baseline выше. В pins зафиксировать target, Node URL/SHA256, npm integrity/lock SHA256, Playwright/core/MCP versions, Chromium revision/URL/SHA256 для каждой цели, source/catalog hashes, разрешённые лицензии. Нет плавающих `latest`/диапазонов.
- [ ] Определить layout `resources/loginom/{runtime,node,chromium}/` и `resource-manifest.json`; executable пути относительны к корню bundle, запрещены traversal/выход наружу. Node имеет платформенное имя, Chromium layout сохраняет нужные helper/framework/resources. Указывать также весь lockfile closure, не только `bridge.mjs`.
- [ ] Контракт CLI: `stage-loginom.ts --target <target> --pins <json> --out <dir> [--offline-cache <dir>]`; обязательно проверяет hash до распаковки, пишет staging атомарно, возвращает nonzero при отсутствующем cache/target/dependency. Скачать browser только при build; offline-cache не разрешает сетевой fallback.
- [ ] Launcher получает абсолютные bundled paths от host, не `which node` и не пользовательский browser cache. Writable state идёт в Product user directories, install directory остаётся read-only. Сохранить Linux DISPLAY/XAUTHORITY/XDG_RUNTIME_DIR/WAYLAND_DISPLAY/XDG_SESSION_TYPE и network proxy/NO_PROXY по runtime policy.
- [ ] Запустить новую проверку с реальным fixture-архивом: повреждённый hash, отсутствующий browser executable, неправильная архитектура и неполный dependency closure отвергаются; путь с Unicode/пробелами работает. Не ограничиваться поиском строк `chromium` в JSON.

```sh
bun test scripts/release/stage-loginom.test.ts
bun scripts/release/stage-loginom.ts --target linux-x64 --pins loginom-runtime-pins.json --out resources/loginom
bun typecheck
```

**Готовность:** все runtime entrypoints и browser ресурсы найдены из staging, dependency provenance сохранён; build download нужен только на build host. **Коммит:** `feat(desktop): stage pinned Loginom runtime resources`.

## Задача R2. Упаковать runtime и создать проверяемый release manifest

**Файлы:** изменить `packages/desktop/electron-builder.config.ts`, `scripts/prebuild.ts`, `scripts/utils.ts`, `package.json`; создать `scripts/release/{manifest.ts,write-manifest.ts,verify-artifact.ts,artifact.test.ts}`. Удаление upstream CLI download выполняется согласованно с foundations, не параллельной заменой его файлов. Cwd — `packages/desktop`.

- [ ] Добавить staged runtime в `extraResources` вне ASAR, включая Chromium executable bits и dylib/DLL/so. Desktop v1 использует Node Electron; Node исполнителя остаётся самостоятельным закреплённым ресурсом. Не включать server Python/Rust или credentials.
- [ ] Учесть текущую неизвестность: `packages/desktop/native` отсутствует, хотя packaging config/native:build его упоминают. Установить реальные импорты, build producer и необходимость каждого native resource; восстановить stage либо убрать доказанно неиспользуемые ссылки. Пустая папка не закрывает проблему; сохранить вывод build/native диагностики.
- [ ] Определить strict schema manifest, без разрешения неизвестных полей; JSON содержит все поля ниже. Paths в составе артефакта относительные, user paths — шаблоны без имени/секретов реального пользователя. Hash самого manifest — отдельный `release-manifest.json.sha256`, не рекурсивное поле.

```ts
type ReleaseManifest = {
  schemaVersion: 1; version: string; channel: "dev" | "beta" | "prod"; builtAt: string
  source: { commit: string; dirty: boolean; patchSha256: string | null; inputsManifestSha256: string; importSha256: string }
  target: { platform: "linux" | "win32" | "darwin"; arch: "x64" | "arm64"; minimumOS: string; backend: "v1" }
  build: { os: string; arch: string; bun: string; lockSha256: string }
  runtime: { electron: string; electronNode: string; node: string; playwright: string; playwrightMcp: string; chromiumVersion: string; chromiumRevision: string; catalogSha256: string; resourcesSha256: string }
  product: { name: string; appId: string; executable: string; uriScheme: string }
  paths: { executor: string; node: string; chromium: string; config: string; data: string; cache: string; state: string; logs: string; profiles: string; secretStore: string }
  connection: { schemaVersion: number; generationProtocol: number; knowledgeEndpoint: string }
  updater: { feed: string | null; channel: string; previousVersion: string | null }
  signing: { status: "signed" | "unsigned"; identity: string | null; notarized: boolean }
  installation: { scope: "user" | "machine"; uninstallPolicy: string; preservesUserData: boolean }
  validation: { commands: { cwd: string; argv: string[] }[]; reportFiles: string[] }
  provenance: { licensesSha256: string; migrationManifestSha256: string }
  artifacts: { file: string; kind: string; bytes: number; sha256: string }[]
}
```

- [ ] CLI `write-manifest.ts --target <id> --version <v> --channel <c> --dist <dir> --resources <dir> --output <path>` читает Product/pins/build provenance и фактические артефакты; неподтверждённые подписи не объявляет signed. `verify-artifact.ts --manifest <path> --artifact <path> --report <json>` проверяет schema/hash, распаковывает пакет во временную папку и сверяет все resource hashes/arch/dependencies; не запускает код при static verify.
- [ ] Тесты: оригинальный пакет проходит; удалённый runtime/DLL/browser resource, изменённый executable, ложный target и path escape проваливаются. Сравнить ресурсы установленного `.deb`, а не только исходное `resources/`.

```sh
bun test scripts/release/artifact.test.ts
bun run build
bun run package:linux --x64 --publish never
bun typecheck
```

**Готовность:** записанный manifest воспроизводится из конкретного package hash; подписанные файлы хешируются после подписи. **Коммит:** `feat(desktop): package runtime and emit release manifests`.

Создание и статическая проверка после упаковки (cwd `packages/desktop`, значения `<...>` заранее разрешить из сборки):

```sh
bun scripts/release/write-manifest.ts --target linux-x64 --version <version> --channel dev --dist dist --resources resources/loginom --output <absolute-release-manifest.json>
bun scripts/release/verify-artifact.ts --manifest <absolute-release-manifest.json> --artifact <absolute-deb> --report <absolute-static-report.json>
```

Static verify не заменяет R3/R4: успешное извлечение executable не доказывает загрузку shared libraries, sandbox или запуск GUI. `artifacts[].kind` валидируется по whitelist `deb|appimage|exe|dmg|zip|blockmap|updater-metadata`; platform/arch пары допускаются только из трёх целевых IDs. Dirty build обязан иметь непустой patch hash и полный идентификатор дополнительных build inputs; чистый release не наследует незаписанные файлы рабочего дерева.

`validation.commands` содержит окончательные воспроизводимые команды без credentials
и host-specific private paths; manifest не является разрешением исполнять произвольный
argv. `installation` явно определяет поведение uninstall/reinstall для runbooks.
Отчёты приёмки ссылаются на hash immutable manifest; последующие результаты не
перезаписывают manifest уже проверенного/подписанного артефакта.

## Задача R3. Проверить настоящий упакованный процесс

**Файлы:** создать `packages/desktop/scripts/release/{packaged-smoke.mjs,packaged-smoke.test.ts}` и fixture `fixtures/packaged-smoke/`; изменить только требуемые resource-path helpers. Не создавать альтернативный renderer или тестовую бизнес-реализацию.

- [ ] Контракт `packaged-smoke.mjs --app <absolute-executable> --runtime <absolute-resource-root> --manifest <absolute-json> --report <absolute-json>`: запускается **комплектным Node**, импортирует комплектный Playwright, запускает installed Electron через `_electron.launch`, работает с реальным окном, завершает только собственное process tree.
- [ ] Smoke не требует Loginom/LLM credentials: проверить четыре defaults и отсутствие password placeholder, «Позже», прямой вход Loginom, повторный запуск незавершённого мастера. Отдельно запустить комплектный Chromium с временным profile и открыть локальную fixture, получить screenshot/DOM value, затем закрыть; только версия executable недостаточна.
- [ ] В чистом HOME и без runtime в PATH проверить отсутствие first-start downloads, доступность ресурсов в read-only install dir, профили/логи только в user directories. Сохранять фактические executable paths, versions/arch, PID lifecycle и сетевые обращения без auth values.
- [ ] Тест harness: ошибка старта Electron/Chromium не записывается PASS; timeout завершает только принадлежащие прогону процессы; следующий независимый прогон возможен. Не добавлять глобальный `--no-sandbox`; sandbox failure — результат теста.
- [ ] Запуск после установки: команда задаётся точными paths из manifest — `<bundled-node> scripts/release/packaged-smoke.mjs --app <installed-exe> --runtime <resources> --manifest <manifest> --report <report>`. Эти placeholders обязаны разрешиться до вызова; не использовать shell `eval`.

**Проверки (cwd `packages/desktop`):** `bun test scripts/release/packaged-smoke.test.ts`, затем smoke указанным контрактом на фактически установленном пакете. **Доказательства:** report, очищенный process inventory, screenshots, resource hash и запуск browser. **Коммит:** `test(desktop): exercise packaged Electron and Chromium lifecycle`.

## Задача R4. Выполнить Linux Docker-матрицу и реальный desktop smoke

**Файлы:** создать `packages/desktop/scripts/release/{linux-test-images.json,docker-linux-smoke.ts,docker-linux-smoke.test.ts}`, `docker/{Dockerfile.linux-smoke,run-linux-smoke.sh}`; отчёты в release `checks/`, не исходные credentials.

- [ ] Образы: Ubuntu 22.04/24.04/26.04 и Debian 12/13, x64; JSON `{schemaVersion:1, images:[{id,image,digest}]}` содержит реальные immutable digests. Не подставлять Docker tag вместо digest; недоступный image отмечать BLOCKED.
- [ ] Контейнер устанавливает `.deb` как root только на этапе подготовки с объявленными system dependencies и Xvfb/DBus. Само приложение и smoke запускаются non-root с отдельным чистым HOME, `/dev/shm`, изолированными volumes и виртуальным дисплеем. Нет mounts старых OpenCode/Dock config/cache; отдельные Node/Bun/Chrome/Python не устанавливаются.
- [ ] Запретить сеть в фазе первого запуска; root пакетная установка может иметь сеть для системных библиотек. Host driver читает manifest, распаковывает/передаёт scripts и вызывает smoke комплектным Node. Сохранить версии реально установленных system libraries и image digest.
- [ ] Контракт `docker-linux-smoke.ts --manifest <path> --images <json> --report-dir <dir> --format <deb|appimage>` выбирает соответствующий артефакт из manifest, делает hash check, по одному изолированному запуску на image, выдаёт по-образные статусы; отсутствующий format/input => nonzero. AppImage тестировать отдельно с FUSE/extract-and-run режимом, фиксируя режим, а не выдавая один за другой.
- [ ] Тестировать корректный DEB install/uninstall, smoke R3, user-data persistence и отсутствие leftovers процессов. На Debian/Ubuntu ошибки shared libraries, sandbox и graphics классифицировать отдельно; не лечить всё privileged container.

```sh
bun test scripts/release/docker-linux-smoke.test.ts
bun scripts/release/docker-linux-smoke.ts --manifest ../../artifacts/loginom-ai-agent/0.1.0/linux-x64/release-manifest.json --images scripts/release/linux-test-images.json --report-dir ../../artifacts/loginom-ai-agent/0.1.0/linux-x64/checks/docker-deb --format deb
```

Версия `0.1.0` здесь пример формы пути; до запуска заменить фактической manifest version. Cwd — `packages/desktop`. Затем выполнить R3 на текущем Ubuntu desktop отдельно: X11 и Wayland — независимые строки, эмулированная Wayland-сессия явно отмечается. Контейнер не доказывает совместимость со всеми ядрами/GPU/DE дистрибутива. **Коммит:** `test(desktop): add reproducible Linux package acceptance matrix`.

## Задача R5. Перевести CI, подпись и обновления на свой продукт

**Файлы:** создать `.github/workflows/release.yml` (режим `candidate`); изменить `packages/desktop/electron-builder.config.ts`, `src/main/updater.ts`, `scripts/finalize-latest-yml.ts`, `scripts/finalize-latest-json.ts`, соответствующие tests; согласовать с foundations изменения upstream workflow и `Product`.

- [ ] Собственные repository guard/runner labels: узнать origin и доступные runners, не копировать `anomalyco` conditions или signer IDs. Targets только linux-x64, win32-x64, darwin-arm64. Linux build baseline совместим с Ubuntu22/Debian12; более новый CI image сам по себе не доказывает эту совместимость.
- [ ] Workflow вызывает R1/R2/R3, Linux R4; Windows/mac jobs нативные. Node24 для build и Bun из packageManager — build prerequisites, не пользовательские зависимости. Точный набор signing secrets документируется по собственному signer; их отсутствие блокирует signed job, не выдаёт unsigned за release.
- [ ] Mac подписывает весь вложенный Node/Chromium/helper closure и notarizes DMG/app; Windows подписывает installer и входящие executable согласно release policy. Повторить verify-artifact после подписи, manifest записать последним. Dev unsigned помечается явно.
- [ ] Updater по умолчанию отключён без собственного валидированного feed; старая ветка publisher не может стартовать из Loginom release. Product app ID/channel/data locks не смешиваются. Mac ZIP и update metadata входят в artifacts и проверяются наряду с DMG; Windows EXE/blockmap и Linux требуемые metadata также хешируются.
- [ ] Интеграционный тест с собственным локальным feed N→N+1: реальный installed app запрашивает правильный URL, проверяет hash/signature и обновляется; settings/chats сохраняются. Повреждённый payload/неверный channel/upstream target отвергается, работающая версия остаётся. Отсутствие update не считается проверкой установки обновления.
- [ ] Выполнять `bun test electron-builder.config.test.ts src/main/updater-controller.test.ts` и новые updater integration tests из `packages/desktop`; `bun typecheck` там же. Имена новых тестов сначала добавить в этот package и manifest commands. Публикация остаётся отдельным явно разрешённым действием.

**Готовность:** unsigned/signed/job BLOCKED различимы; собственная update chain доказана артефактами. **Коммит:** `chore(desktop): isolate Loginom release and update channels`.

Нативные команды после реализации R1/R2 выполняют агенты на соответствующих build host; cwd `packages/desktop`:

```sh
bun scripts/release/stage-loginom.ts --target win32-x64 --pins loginom-runtime-pins.json --out resources/loginom
bun run build
bun run package:win --x64 --publish never
```

На arm64 Mac заменить target на `darwin-arm64`, packaging — `bun run package:mac --arm64 --publish never`; это отдельный job, не следующие команды Windows job. Запись manifest для этих платформ использует тот же R2 CLI с соответствующим target. Не копировать linux-x64 staging в native jobs; наличие файла с правильным именем не подтверждает его архитектуру.

## Задача R6. Проверить реальную Loginom-задачу на Linux

**Файлы:** использовать `docs/testing/loginom-ai-agent/{README.md,report-template.md}`; сохранять очищенные результаты в `artifacts/loginom-ai-agent/<version>/linux-x64/checks/native-loginom/`; при необходимости уточнить runbook, не переписывать runtime ради теста.

- [ ] До запуска получить разрешённый стенд, API-ключ/учётные данные вне отчёта и модель, настроенную существующим способом. Не отправлять тестовые prompts произвольному провайдеру без выбранной конфигурации. Зафиксировать endpoint/version и manifest/hash.
- [ ] Выполнить все доступные 23 сценария общего runbook. FLOW-01: 4 строки, Revenue `20,15,12,8`, Alpha35/Beta20/total55; второй чат с одноимённым вложением — Alpha100/Beta1/total101. Сохранить и независимо переоткрыть пакеты, сверить реальные поля/значения и структуру.
- [ ] CON-02 доказывает отсутствие folder listing/stat/write в проверке подключения. Настоящая загрузка использует `/<username>` и сохраняет runtime guards. Linux `connection.json` plaintext с `0600`; provider credentials policy не меняется. Ключ/пароль отсутствуют в API/log/transcript.
- [ ] CON-06…08: два активных drains удерживают generation; cancelPending возвращает допуск старой; ошибка candidate/startup не меняет рабочую; crash around active commit не смешивает поколения. При ambiguous receipt автоматического retry изменения нет; фиксируется точка fault injection и отсутствие дублей.
- [ ] Пройти network/browser failure и lifecycle только на своих PID/тестовых пакетах. Ошибку сервера/LLM/DNS отличать от packaging. Невыполненное явно `BLOCKED`/`NOT_RUN`; исторический Dock PASS не переносится на новый hash.

**Готовность:** заполненный report с oracle, receipt IDs, startup/runtime versions и очищенными доказательствами; ручные действия указаны. **Коммит:** `docs(testing): record Linux Loginom release acceptance` — только очищенный компактный отчёт/индекс, не секретные логи и тяжёлые binaries.

## Задача R7. Собрать автономный handoff Windows/macOS

**Файлы:** дополнить `docs/testing/loginom-ai-agent/{README.md,windows.md,macos.md,report-template.md}` фактическими командами и manifest; создать `packages/desktop/scripts/release/{assemble-handoff.ts,assemble-handoff.test.ts}`.

- [ ] Контракт `assemble-handoff.ts --target <win32-x64|darwin-arm64> --manifest <path> --output <dir>` проверяет manifest/artifact hashes, копирует соответствующий runbook, общий протокол, report template и source/patch provenance. Secrets не являются аргументами. Выход `handoff.json` перечисляет включённые файлы/hashes и `nativeExecution: "NOT_RUN"`.
- [ ] Если native artifacts ещё не собраны, подготовить документационный handoff с явным `BLOCKED: artifact/manifest missing`, точными native build prerequisites и source commit. Это завершает документационную часть сейчас; полный assembler не должен создавать ложный release manifest из Linux binary.
- [ ] В test приложить корректный fixture bundle; пропущенный Chromium/manifest или несовпадающий hash отклоняется. Передать также две версии/собственный feed для UPDATE-01; отсутствие второй версии блокирует только соответствующую проверку.
- [ ] Windows агент выполняет clean Windows11 x64 EXE; Mac агент — native macOS14+ arm64 DMG с Gatekeeper, protected store, nested signing и ZIP update path. Каждый получает контракты/23 сценария без зависимости от истории текущего чата и от установленного старого Dock.
- [ ] Внести в runbooks проверенные финальные `packages/agent` paths и команды; сохранить исторические команды только как исторические. Отчёты принимаются по target/hash и перечню ограничений, не по одному «всё работает». Повторные исправления получают новый hash и повторную зависимую проверку.

**Проверки (cwd `packages/desktop`):** `bun test scripts/release/assemble-handoff.test.ts`; после наличия target artifact — `bun scripts/release/assemble-handoff.ts --target win32-x64 --manifest <absolute-manifest> --output <absolute-handoff-dir>` (аналогично darwin-arm64). **Коммит:** `docs(testing): finalize native agent release handoff`.

Порядок передачи независим от очередности машин: сначала исходники/план/runbooks и список BLOCKED входов; затем собранный на своей платформе артефакт/manifest; затем полный отчёт. Каждый агент может самостоятельно устранить platform build failures, не ожидая другого target. Изменение общих lifecycle/settings контрактов согласуется между агентами до интеграции, чтобы нативная починка не отменяла правила поколений и receipts.

## Итоговые gates

- [ ] **Документация:** план, runbooks и шаблон полны, самостоятельны и согласованы; Windows/macOS `NOT_RUN/BLOCKED` не мешают закрытию этого документационного этапа.
- [ ] **Linux кандидат:** ресурсы/manifest + Docker5 + фактический Linux desktop + Loginom oracle/две сессии/recovery подтверждены для одного hash.
- [ ] **Нативная платформа:** собственный агент передал полный подписанный release report для соответствующего target и hash; неподписанный exploratory pass не подменяет этот gate.
- [ ] **Публикация:** все требуемые platform gates, свой feed/signatures/licenses и отдельное разрешение публикации. Старый репозиторий/production не удаляются этим планом.
