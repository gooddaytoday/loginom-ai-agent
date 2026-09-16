# Loginom AI Agent: основание продукта и перенос исходников

**Goal:** сохранить исходники и незавершённую работу Dock, собрать единое дерево
разработки и изолировать идентичность Loginom AI Agent от OpenCode.
**Architecture:** архив происхождения → проверенный source map → импорт runtime,
сервера и сайта → общий Product manifest → смена собственных имён и путей.
**Tech Stack:** Git, Python 3, Bun 1.3.14, TypeScript, Electron, существующие Node/MJS,
Python/Rust server sources; версии зависимостей сохраняются до отдельных проверок.
**Spec:** [согласованный дизайн](../specs/2026-09-16-loginom-ai-agent-desktop-design.md).
**Inputs:** [снимок Dock](../../migration/loginom-dock-inventory.md), commit спецификации
`be99a5767`; пути из снимка повторно проверяются перед выполнением.

## Общие ограничения

- Это план; команды ниже выполняются при реализации, не при чтении документа.
- Не изменять чужие worktrees, не применять stash к ним, не останавливать чужие задачи.
  Согласовать границу записи перед фиксацией архива; изменившийся снимок переснять.
- Архив сохраняет Codex/Hermes/Cursor, активная поставка их не регистрирует.
- Серверные данные и секреты не входят в новый Git. Внешние `ai-skills`,
  `e2e-tests`, `loginom-help` не считаются перенесёнными вместе с Dock.
- Тесты запускать из package/service directories; typecheck — `bun typecheck`.
  Public Protocol/HttpApi → `bun run generate` в `packages/client`, без ручных generated.
- Не менять provider IDs, MCP/OpenViking URI и лицензии глобальной заменой строк.
  Production, публикация и удаление старого repo требуют отдельной явной команды.
- Все evidence имеют PASS/FAIL/BLOCKED, source SHA и фактические команды;
  исторический PASS старого Dock не подтверждает новый runtime.

## F1. Переснять inventory и утвердить границу исходников

**Paths:** изменить `docs/migration/loginom-dock-inventory.md`; создать
`docs/migration/source-selection.md`, `script/migration/inventory.py`,
`script/migration/test_inventory.py`.
**Consumes → produces:** доступные локальные refs/worktrees → выбор SHA и снимок
метаданных без содержимого конфигов. Снимок ещё не является резервной копией.

- [ ] Реализовать новый CLI `inventory.py --source PATH --output PATH`:
  refs/tags, common git dir, все worktree HEAD, index/working-tree status,
  stash reflog object IDs, reflog-only кандидаты; не читать содержимое private files.
- [ ] Указать baseline `main + linux`; отдельно landing/packaging из wow-landing.
  Для каждого изменения cursor/executor-linux записать import/archive/reject с причиной;
  generic fixes рассмотреть отдельно от чужого host integration.
- [ ] Обновить untracked перечень: прежние 42 файла могли измениться. Stash и
  regression harness сохранять незавершёнными. Не брать старое дерево rl-bench целиком.
- [ ] **Commands, cwd `script/migration`:** `python3 -m unittest test_inventory`;
  затем `python3 inventory.py --source /home/kiselev/git/loginom-dock --output /tmp/loginom-source-inventory.json`.
  Fixture покрывает detached HEAD, два stash entry, untracked и ignored filenames.
- [ ] **Acceptance:** все вершины из снимка разрешаются; изменение refs/status во время
  чтения даёт `SOURCE_CHANGED`, а не частичный PASS; секретные bytes не попадают в output.
  Сохранить выбранные SHA, digest snapshot и границу остановки записей в source-selection.
- [ ] **Commit:** `docs(migration): record frozen source selection`.

## F2. Создать полный защищённый архив и доказать восстановление

**Paths:** создать `script/migration/archive.py`, `script/migration/restore_check.py`,
`script/migration/test_archive.py`, `docs/migration/archive-protocol.md`;
изменить `docs/migration/source-selection.md`.
**Consumes → produces:** согласованный F1 snapshot + явные allowlists → архив вне
обоих checkout, retained object refs и redacted restore proof.

- [ ] Новый `archive.py --snapshot FILE --destination DIR --public-allowlist FILE
  --private-allowlist FILE` сначала проверяет отсутствие дрейфа. Allowlist private
  хранится вне Git; неизвестные файлы не копируются автоматически и блокируют полноту.
- [ ] В отдельном архивном bare repo сохранить named refs и создать `refs/backup/...`
  для каждого выбранного detached/reflog/stash object; сохранить index/worktree deltas.
  Учитывать родителей stash с untracked. Не полагаться на один `git bundle --all`:
  bundle не хранит рабочие файлы, reflog journal и прежние неукреплённые объекты.
- [ ] Разделить history bundle, разрешённые untracked sources и private backup.
  Private bytes — вне Git, каталог `0700`, файлы `0600`, шифрование/защищённое
  хранилище оператора; отчёт содержит только тип, размер и digest, без credentials.
- [ ] Новый `restore_check.py --archive DIR --destination NEW_DIR --report FILE`
  делает `git bundle verify`, восстанавливает refs/trees, index/deltas/untracked,
  проверяет manifest; private часть восстанавливает отдельно без вывода содержимого.
- [ ] **Commands, cwd `script/migration`:** `python3 -m unittest test_archive`.
  Реальный CLI запускать с выбранными в archive-protocol абсолютными путями;
  каталог назначения должен быть новым и находиться вне удаляемого source/worktrees.
- [ ] **Acceptance:** fixture с lost detached commit, несколькими stash, symlink и
  ignored credential восстанавливается; missing object/hash mismatch → FAIL.
  Реальная реконструкция всех выбранных материалов подтверждена; до неё импорт не финализировать.
- [ ] **Commit:** `chore(migration): add verified source archive workflow`.

## F3. Импортировать выбранные компоненты с происхождением каждого файла

**Paths:** создать `docs/migration/source-map.json`, `source-map.schema.json`,
`script/migration/import_sources.py`, `verify_sources.py`, `test_sources.py`,
`packages/loginom-runtime/`, `services/loginom-ai/`, `apps/loginom-site/`;
изменить workspace `package.json`, `bun.lock` и `source-selection.md`.
**Consumes → produces:** восстановленный архив F2 + выбор F1 → повторяемый импорт.

- [ ] Source map v1 содержит записи следующей формы; значения берутся из Git/байтов:
  ```ts
  type SourceEntry = {
    sourceRepo: string; ref: string; commit: string; tree: string
    sourcePath: string; destination: string
    disposition: "active" | "archive" | "excluded"; hash: string
  }
  // root: { version: 1, files: SourceEntry[] }; hash = SHA-256 исходных bytes.
  ```
  Для archive destination — относительный путь в архиве, не секретный locator;
  причины excluded и последующие преобразования фиксируются отдельно в source-selection.
- [ ] Новый `import_sources.py --archive DIR --map FILE --destination DIR --dry-run`
  разрешает только frozen objects и явные entries; применение без `--dry-run`
  запрещает overwrite чужого файла, path traversal и symlink escape.
- [ ] Runtime: перенести `client/`, `executor/` и нужные shared modules, сохранив
  сначала их относительную структуру внутри `packages/loginom-runtime`.
  Server: дерево upstream/build inputs внутри `services/loginom-ai`; сайт — в
  `apps/loginom-site`. Старые native plugins — только архив, необходимые общие функции
  отделить от их регистрации. Не сохранять вторую изменяемую копию runtime в server tree.
- [ ] Исправить build/source-inventory и runtime pin inputs на новый layout; сохранить
  LICENSE/README_UPSTREAM/notices, lockfiles, каталоги и fixtures. Snapshot bytes и
  преобразования различать: verifier сравнивает import base, затем записанный diff hash.
- [ ] **Commands, cwd `script/migration`:** `python3 -m unittest test_sources`;
  новый `python3 verify_sources.py --map ../../docs/migration/source-map.json --root ../..`.
  `bun install` из корня — только установка обновлённого workspace lock, не запуск тестов.
- [ ] **Acceptance:** все map entries имеют disposition и checksum; нет runtime imports
  из старого абсолютного checkout/host plugins. Server build closure включает Rust,
  C++, Studio, Python и packaging metadata; фактическая сборка — server-transition S2.
- [ ] **Commit:** `feat(runtime): import selected Loginom sources with provenance`.

## F4. Ввести Product и сразу остановить upstream auto-update

**Paths:** создать `packages/product/package.json`, `tsconfig.json`, `src/index.ts`,
`test/identity.test.ts`; изменить `packages/desktop/src/main/updater.ts`,
`packages/desktop/electron-builder.config.ts`, `.github/workflows/publish.yml`,
`packages/opencode/src/installation/index.ts`, workspace dependencies;
тесты `packages/desktop/src/main/updater-controller.test.ts`,
`packages/opencode/test/installation/installation.test.ts`.
**Consumes → produces:** identity spec → единственный immutable identity module.

- [ ] Экспортировать `Product` без runtime зависимости от Core/Server. Все вложенные
  записи freeze; `updateFeed` отсутствует до проверенного собственного feed:
  ```ts
  export const Product = Object.freeze({
    name: "Loginom AI Agent", slug: "loginom-ai-agent",
    namespace: "@loginom-ai-agent", envPrefix: "LOGINOM_AI_AGENT_",
    scheme: "loginom-ai-agent", executable: "loginom-ai-agent",
    database: "loginom-ai-agent.db", updateFeed: null,
    artifactName: "loginom-ai-agent-${os}-${arch}.${ext}",
    stores: Object.freeze({ settings: "loginom-ai-agent.settings", updater: "loginom-ai-agent.updater" }),
    config: Object.freeze({ directory: ".loginom-ai-agent", json: "loginom-ai-agent.json", jsonc: "loginom-ai-agent.jsonc" }),
    channels: Object.freeze({ prod: "com.loginom.aiagent",
      beta: "com.loginom.aiagent.beta", dev: "com.loginom.aiagent.dev" }),
    resources: Object.freeze({ runtime: "loginom", manifest: "resource-manifest.json" }),
  })
  ```
- [ ] `updateFeed === null` запрещает check/download/install и upstream fallback;
  UI сообщает об отсутствии настроенного обновления. CLI upgrade не скачивает OpenCode.
  Publishing upstream jobs выключить до собственного release plan; не менять провайдеров LLM.
- [ ] **Commands, cwd `packages/product`:** `bun test test/identity.test.ts`, `bun typecheck`.
  Cwd `packages/desktop`: `bun test src/main/updater-controller.test.ts`;
  cwd `packages/opencode`: `bun test test/installation/installation.test.ts`.
  Disabled feed → ноль network/download calls; канал выбирает собственный app ID.
- [ ] **Acceptance:** отсутствует запуск upstream updater на startup/restart;
  resource logical names доступны упаковщику, secret/config data в Product отсутствуют.
- [ ] **Commit:** `feat(product): centralize identity and disable upstream updates`.

## F5. Переименовать собственные пакеты и пути без разрушения контрактов

**Paths:** `packages/opencode/` → `packages/agent/`; изменить root/package workspace
manifests, `bun.lock`, внутренние imports, `packages/desktop/scripts/`,
`packages/core/src/global.ts`, `packages/core/src/database/database.ts`,
`packages/core/src/flag/flag.ts`,
`packages/agent/src/config/config.ts`, `packages/core/src/v1/config/config.ts`,
`packages/desktop/src/main/{index,store,updater}.ts`, CLI installer/build references;
создать `docs/migration/compatibility.json`, `script/migration/check_identity.py`.
**Consumes → produces:** F4 Product + classification → самостоятельный namespace.

- [ ] Классифицировать каждое совпадение OpenCode/opencode: own/runtime, external,
  attribution, generated, vendored. compatibility entries: `{path, token, reason,
  category}`; checker отклоняет незаявленные активные own identifiers.
- [ ] Все собственные workspace names/imports → `@loginom-ai-agent/*`, env →
  `LOGINOM_AI_AGENT_*`; CLI bin/fallback, XDG slug, project directory/config names,
  DB, locks, logs/tmp, browser state и localStorage получают собственные имена.
  Desktop stores: `loginom-ai-agent.settings`, `loginom-ai-agent.updater`.
  Prod/beta/dev имеют раздельные userData/locks; не читать старый профиль по fallback.
- [ ] Доработать generator inputs и запустить `bun run generate` в `packages/client`
  при затронутых generated import identities; legacy SDK — штатный
  `./packages/sdk/js/script/build.ts` из корня. Generated файлы вручную не редактировать.
  `packages/app/vendor/opencode-ai-client-1.17.13-v2.tgz` оставить immutable с checksum
  и explicit compatibility exception до отдельной воспроизводимой замены.
- [ ] **Commands:** cwd `script/migration`: новый `python3 check_identity.py --root ../..`;
  cwd каждого затронутого `packages/{agent,core,client,app,desktop,product}`: `bun typecheck`.
  Cwd `packages/core`: `bun test test/global.test.ts test/config/config.test.ts`;
  cwd `packages/agent`: `bun test test/config/config.test.ts test/config/v2-compat.test.ts`.
  В этих точных файлах обновить fixtures и проверить новые пути/отсутствие fallback.
- [ ] **Acceptance:** новый временный HOME не читает/создаёт `.opencode`; собственный
  JSON/JSONC и env работают, чужой provider ID/MCP URI прежний; все старые source paths
  имеют classification. Отличать vendored legacy client от своего workspace Client.
- [ ] **Commit:** `refactor(product): adopt Loginom namespaces and storage paths`.

## F6. Передать основание следующим этапам

**Paths:** изменить `docs/migration/source-selection.md`, `source-map.json`,
`compatibility.json`; создать `docs/migration/foundation-acceptance.md`.
**Consumes → produces:** F1–F5 evidence → проверенная точка для desktop/packaging/server.
- [ ] Записать новые source/runtime hashes, выполненные commands/results, оставшиеся
  archived branches и исключения. Не включать private locations/keys в публичный отчёт.
- [ ] Повторить source-map/identity verifiers; убедиться, что активная сборка не
  зависит от старого repo и отдельной установки Codex/Hermes/Cursor.
- [ ] Передать Product/resources и source-map в packaging план; runtime/host contracts
  — desktop плану; серверное дерево — [server-transition](2026-09-16-loginom-server-transition.md).
  До native verification не объявлять готовыми Windows/macOS или installer.
- [ ] **Acceptance:** каждый required entry проверен либо имеет явный BLOCKED owner;
  отсутствие restore proof блокирует retirement, но не маскируется успешным импортом.
- [ ] **Commit:** `docs(migration): record foundation acceptance and handoff`.
