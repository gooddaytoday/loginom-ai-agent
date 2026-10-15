# JavaScript PR CI Implementation Plan

> **For agentic workers:** execute these bounded fixes in this session; the test-signal-collector gathers the original macOS failure separately.

**Goal:** довести PR #68 `node-javascript → loginom` до успешных тестов и candidate-сборок.

**Architecture:** исправить рассинхронизацию installer с product pin и native test fixture. Обычный shutdown освобождает транспорт после blocked package cleanup, но managed Host сохраняет отказ cleanup и профиль; strict acceptance сохраняет прежнее раннее прекращение.

**Tech Stack:** Bun 1.3.14, pinned Node, node:test, GitHub Actions.

**Spec:** `packages/loginom-host/AGENTS.md`, `packages/loginom-runtime/AGENTS.md`, запрос владельца на push/PR/зелёный CI.

## Global Constraints

- Никаких force-push, merge, публикации релиза или ослабления CI.
- Незакоммиченные изменения worktree4118 не включать; временные файлы — `/home/kiselev/storage/tmp/`.
- Native package Close/logout нельзя объявлять успешными по факту выхода браузера.

### Task 1: installer follows Chromium pin

Files: `packages/loginom-host/src/cli-install.ts`, `test/cli-install.test.ts`, `test/cli-install-native.mjs`.

- [x] Добавить Linux artifact с sandbox текущего pin и mode0755; `installCli` обязан отказать `CLI_SANDBOX_MODE_INVALID` без launcher.
- [x] Выполнить RED: `bun test test/cli-install.test.ts` из Host.
- [x] Импортировать release JSON; заменить фиксированный `chromium-1243` на `chromium-${release.chromiumRevision}` в installer и native acceptance.
- [x] Повторить installer tests и Host `bun typecheck`.

### Task 2: close resources without certifying blocked package cleanup

Files: `packages/loginom-runtime/client/lib/bridge.mjs`, `client/test/support/package-cleanup-bridge.mjs`, `src/managed-resources-close.mjs`, `test/managed-resources-close.test.mjs`.

- [x] Проверить blocked/no-save/evidence-failure в normal mode: transport закрыт, receipt BLOCKED; strict isolated mode оставляет прежний отказ.
- [x] Добавить managed case с `package_cleanup:{policy:'last_confirmed_own_save',status:'BLOCKED'}`: закрыть browser/server, отказать ACK, сохранить profile.
- [x] Выполнить RED целевых node:test; изменить только эти условия и сохранить действующие проверки остальных ACK.
- [x] Выполнить оба целевых набора и соседние package cleanup/managed-entry tests.

### Task 3: native macOS fixture and complete CI

Files: `packages/loginom-host/test/saved-package-shutdown.test.ts`, текущий отчёт PR.

- [x] Для обоих fixture paths создать `root` с mode0700 и на darwin собрать `buildKeychain(join(resources,'bin'))`, как в `node-host.test.ts`.
- [x] Linux source signal повторить3 раза; после исправления выполнить Host shutdown tests и typecheck. macOS проверить настоящим CI.
- [x] Сохранить диагноз и checkpoint≤20 строк, commit, обычный push, ответить на два review threads.
- [ ] Полностью дождаться PR checks и release candidate для итогового SHA; обновить PR с точными run URLs и ограничениями.
