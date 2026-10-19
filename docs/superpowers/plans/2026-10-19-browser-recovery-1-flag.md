# Browser recovery, план 1: флаг сборки и приватная capability

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Runtime получает `browserRecovery: true` только от упакованной CLI или Desktop сборки с флагом; переменные окружения при запуске и модель его не включают.

**Architecture:** Флаг — константа сборки: Bun `define` для CLI и electron-vite `define` для Desktop. Он записывается в манифест артефакта. Launcher вычисляет capability (CLI — константа и проверенный установленный bundle; Desktop — константа и `app.isPackaged`) и передаёт её приватным boolean по пути `closeSavedPackageOnShutdown`. Runtime проверяет вход и записывает его в метаданные сессии. Сам режим в этом плане ещё ничего не использует.

**Tech Stack:** Bun build `define`, electron-vite, Effect Schema, Node IPC.

**Spec:** [дизайн, раздел 4](../specs/2026-10-19-browser-recovery-design.md); [общий контракт](2026-10-19-browser-recovery.md#общий-контракт).

## Global Constraints

- «Разрешение задаётся константой, которую вшивает сборка, и записывается в метаданные артефакта для диагностики.»
- `LOGINOM_AI_AGENT_CHANNEL=prod` или иная переменная в рантайме не влияет. Внешний bundle через `LOGINOM_AI_AGENT_CLI_BUNDLE`, непроверенный manifest и Desktop не в packaged-режиме — выключено.
- «Модель и параметры её инструментов не могут включить режим»: поле не входит ни в одну схему инструмента, аргументы вызова его не передают.
- Validation и readiness runtime всегда получают `false`.
- `release.yml` здесь не меняется: флаг в release включает план 5.

## Результат, объём, исключения

- Готово, когда Tasks 1–4 закрыты, тесты из задач зелёные, `bun typecheck` в изменённых Bun-пакетах чистый.
- Первый проверяемый результат — Task 2: настоящий Node host передаёт task runtime `true`, а validation runtime — `false`.
- Объём: ~19 файлов, ~+450 / −20 строк (код ~150, тесты ~280, документация ~20).
- Исключения: поведение recovery, `release.yml`, скрипты сборки Windows и macOS (флаг приходит им через окружение задачи CI в плане 5).

## Review Focus

1. `LOGINOM_AI_AGENT_BROWSER_RECOVERY=1` и `LOGINOM_AI_AGENT_CHANNEL=prod` в окружении запуска исходного CLI → capability `false` (Task 3).
2. Строка `"true"` вместо boolean → `LOGINOM_START_INVALID` и `LOGINOM_HANDSHAKE_INVALID` до старта (Tasks 1, 2).
3. Проверка подключения (validation) и readiness с включённой capability → `false` (Tasks 1, 2).
4. Манифесты, выпущенные до флага, продолжают читаться и проверяться (Tasks 3, 4).
5. `browserRecovery` в аргументах вызова инструмента не меняет start input (Task 2).

---

### Task 1: Runtime принимает capability

**Files:**
- Modify: `packages/loginom-runtime/src/start-input.mjs:7-35`
- Modify: `packages/loginom-runtime/src/managed-entry.mjs:88,121-146`
- Modify: `packages/loginom-runtime/client/lib/session.mjs:84-93`
- Create: `packages/loginom-runtime/client/test/session-browser-config.test.mjs`
- Test: `packages/loginom-runtime/test/start-input.test.mjs`, `packages/loginom-host/test/managed-work-entry.test.ts`
- Docs: `packages/loginom-runtime/AGENTS.md` (один пункт)

**Interfaces:**
- Produces: `validateStartInput(input) → {acceptanceCleanupPackage, closeSavedPackageOnShutdown, browserRecovery: boolean}`; bridge получает `config.browserRecovery: boolean`; `session.metadata.browserRecovery: boolean`.

- [x] **Step 1: Write the failing tests**

В `start-input.test.mjs` обновить все три существующих `deepEqual` (в первых двух тестах), добавив `browserRecovery: false`, и добавить:

```js
test("private browser recovery capability accepts only an explicit boolean", () => {
  for (const value of [undefined, false, true])
    assert.equal(validateStartInput({ ...base, browserRecovery: value }).browserRecovery, value === true)
  for (const value of [null, "true", 1, {}, []])
    assert.throws(() => validateStartInput({ ...base, browserRecovery: value }), /^Error: LOGINOM_START_INVALID$/)
})

test("browser recovery is never granted to validation or readiness runtimes", () => {
  for (const patch of [{ validation: true }, { chat: "readiness" }])
    assert.throws(() => validateStartInput({ ...base, ...patch, browserRecovery: true }), /^Error: LOGINOM_START_INVALID$/)
})
```

В `session-browser-config.test.mjs` вызвать настоящий `createSession` с `headless: true` и `managed: {directory, browserPath: process.execPath, browserRoot}`:

```js
test('session metadata records the private browser recovery capability', async t => {
  for (const browserRecovery of [true, undefined]) {
    const session = await createSession({ ...config, browserRecovery }, managedOptions(t))
    assert.equal(session.metadata.browserRecovery, browserRecovery === true)
  }
})
```

В `managed-work-entry.test.ts` фиктивный `bridge.mjs` пишет полученный `config.browserRecovery` в файл; тест стартует с `browserRecovery: true` и проверяет записанное `true`.

- [x] **Step 2: Run tests to verify they fail**

Run: `cd packages/loginom-runtime && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/start-input.test.mjs`, затем `cd client && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/session-browser-config.test.mjs`
Expected: FAIL — нет поля `browserRecovery`, строковое значение не отклоняется.

- [x] **Step 3: Implement**

`validateStartInput` проверяет поле как `closeSavedPackageOnShutdown`: `undefined` → `false`, иначе только boolean; `true` вместе с `validation === true` или `chat === "readiness"` → `LOGINOM_START_INVALID`. `managed-entry.mjs` кладёт результат в `config.browserRecovery`. `createSession` пишет `browserRecovery: config.browserRecovery === true` в `metadata`.

- [x] **Step 4: Run tests to verify they pass**

Run: команды Step 2 и `cd packages/loginom-host && LOGINOM_AI_AGENT_TEST_NODE=<pinned node> bun test test/managed-work-entry.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/loginom-runtime packages/loginom-host/test/managed-work-entry.test.ts
git commit -m "feat(runtime): accept private browser recovery capability"
```

### Task 2: Host передаёт capability только task runtime

**Files:**
- Modify: `packages/loginom-host/src/node-entry.ts:82-105`
- Modify: `packages/loginom-host/src/node-client.ts` (тип входа `launchNodeHost`, payload `start` в строках 159–169)
- Modify: `packages/loginom-host/src/host.ts:13-22,72-94`
- Modify: `packages/loginom-host/src/supervisor.ts:15-25`
- Create: `packages/loginom-host/test/browser-recovery-capability.test.ts`
- Test: `packages/loginom-host/test/node-host.test.ts`
- Docs: `packages/loginom-host/AGENTS.md` (один пункт)

**Interfaces:**
- Consumes: runtime start input из Task 1.
- Produces: `launchNodeHost({..., browserRecovery?: boolean})`; handshake `start.browserRecovery?: boolean`; `createLoginomHost({..., browserRecovery?: boolean})`; `Launch.browserRecovery?: boolean`; runtime `start` всегда получает boolean `!validation && options.browserRecovery === true`.

- [x] **Step 1: Write the failing tests**

В `node-host.test.ts` — копия теста `a non-boolean saved-package cleanup policy is rejected before the host starts` (строка 395) с `browserRecovery: "true"`:

```ts
test("a non-boolean browser recovery capability is rejected before the host starts", async () => {
  // те же проверки, что в тесте на строке 395: LOGINOM_HANDSHAKE_INVALID и Host не создан
})
```

`browser-recovery-capability.test.ts` повторяет устройство теста `private CLI policies reach…` из `saved-package-shutdown.test.ts:115-219`: настоящий Node host и фиктивный `managed-entry.mjs`, который пишет `m.input.browserRecovery`:

```ts
test.each([true, false])("browser recovery capability reaches only the task runtime: %p", async (capability) => {
  // launchNodeHost({..., browserRecovery: capability, environment: {...process.env, LOGINOM_AI_AGENT_BROWSER_RECOVERY: "1"}})
  // connection.check → validation runtime; dock_prepare с args { browserRecovery: !capability } → task runtime
  expect(starts.filter((value) => value.validation).every((value) => value.browserRecovery === false)).toBe(true)
  expect(starts.find((value) => !value.validation)?.browserRecovery).toBe(capability)
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd packages/loginom-host && LOGINOM_AI_AGENT_TEST_NODE=<pinned node> bun test test/node-host.test.ts test/browser-recovery-capability.test.ts`
Expected: FAIL — строка проходит handshake, task runtime получает `undefined`.

- [x] **Step 3: Implement**

Повторить цепочку `closeSavedPackageOnShutdown` (`node-entry.ts:95-96,105`, `host.ts:21,87`, `supervisor.ts:24`, `node-client.ts:166-168`). Validation runtime получает `false`. Переменные окружения и аргументы вызова не читаются.

- [x] **Step 4: Run tests to verify they pass**

Run: команда Step 2 и `bun typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/loginom-host
git commit -m "feat(host): forward private browser recovery capability"
```

### Task 3: CLI вшивает флаг и включает его только с проверенным bundle

**Files:**
- Modify: `packages/agent/script/build.ts:213-221`
- Modify: `packages/core/src/installation/version.ts:1-8`
- Modify: `packages/agent/src/cli/standalone-bundle.ts:6-34`
- Modify: `packages/agent/src/cli/standalone-run.ts:46-66`
- Modify: `packages/loginom-host/src/cli-manifest.ts:14-23`
- Modify: `packages/loginom-host/script/build-cli.ts:140-154`
- Create: `packages/agent/test/cli/standalone-browser-recovery.test.ts`
- Test: `packages/loginom-host/test/cli-manifest.test.ts`
- Docs: `packages/agent/AGENTS.md` (раздел standalone CLI, один пункт)

**Interfaces:**
- Consumes: `launchNodeHost({browserRecovery})` из Task 2.
- Produces: `InstallationBrowserRecovery: boolean`; `standaloneBundle(): Promise<{resources: string; node: string; entry: string; verified: boolean}>`, где `verified` — `false` для `LOGINOM_AI_AGENT_CLI_BUNDLE`; `run` и `tui` передают `browserRecovery: InstallationBrowserRecovery && bundle.verified`, команды `loginom ...` поле не передают; `metadata.browserRecovery?: boolean` в `cli-manifest.json`.

- [ ] **Step 1: Write the failing tests**

`standalone-browser-recovery.test.ts` повторяет `standalone-saved-package-policy.test.ts`. Фиктивный `host/node-host.mjs` пишет `{browserRecovery: m.input.browserRecovery ?? null}`. Окружение дополнительно содержит `LOGINOM_AI_AGENT_BROWSER_RECOVERY: "1"` и `LOGINOM_AI_AGENT_CHANNEL: "prod"`:

```ts
test.each(["run", "tui", "status"])("source standalone entry never offers browser recovery: %s", async (mode) => {
  expect(JSON.parse(await readFile(join(directory, "capability.json"), "utf8")))
    .toEqual({ browserRecovery: mode === "status" ? null : false })
})
```

В `cli-manifest.test.ts`:

```ts
test("CLI manifest records the browser recovery build flag and verifies manifests without it", async () => {
  // root и info — как в тесте "CLI manifest verifies complete payload…" (строка 60)
  await writeCliManifest(root, { ...info, browserRecovery: true })
  expect((await verifyCliManifest(root, info)).browserRecovery).toBe(true)
  await writeCliManifest(root, info)
  expect((await verifyCliManifest(root, info)).browserRecovery).toBeUndefined()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent && LOGINOM_AI_AGENT_TEST_NODE=<pinned node> bun test test/cli/standalone-browser-recovery.test.ts`; `cd packages/loginom-host && LOGINOM_AI_AGENT_TEST_NODE=<pinned node> bun test test/cli-manifest.test.ts`
Expected: FAIL — `run` и `tui` пишут `null`; `verifyCliManifest` отвергает лишнее поле (`onExcessProperty: "error"`).

- [ ] **Step 3: Implement**

`build.ts` добавляет в `define` значение `'1'` только при `process.env.LOGINOM_AI_AGENT_BROWSER_RECOVERY === "1"`, иначе `'0'`. `version.ts` объявляет глобал по образцу `LOGINOM_AI_AGENT_CHANNEL`; без `define` (запуск из исходников) — `false`. `build-cli.ts` пишет `browserRecovery` из того же входа сборки; окружение в агентскую сборку уже передаётся через `...process.env` (строка 58). В схеме `metadata` поле `Schema.optional(Schema.Boolean)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: команды Step 2, затем `bun typecheck` в `packages/agent`, `packages/core` и `packages/loginom-host`
Expected: PASS. Ветка «проверенный установленный bundle и флаг» требует собранного бинаря и проверяется в плане 5, Task 4.

- [ ] **Step 5: Commit**

```bash
git add packages/agent packages/core packages/loginom-host
git commit -m "feat(cli): embed browser recovery build flag"
```

### Task 4: Desktop включает capability только в packaged-сборке

**Files:**
- Modify: `packages/desktop/electron.vite.config.ts:34-37`
- Modify: `packages/desktop/src/main/constants.ts:4-8`
- Modify: `packages/desktop/src/main/env.d.ts`
- Modify: `packages/desktop/src/main/loginom/desktop-service.ts:12-20`
- Modify: `packages/desktop/scripts/release/manifest.ts:10-58`
- Modify: `packages/desktop/scripts/release/write-manifest.ts:92-96`
- Test: `packages/desktop/scripts/release/artifact.test.ts`
- Docs: `packages/desktop/AGENTS.md` (один пункт)

**Interfaces:**
- Consumes: `createLoginomHost({browserRecovery})` из Task 2.
- Produces: `BROWSER_RECOVERY = app.isPackaged && import.meta.env.LOGINOM_AI_AGENT_BROWSER_RECOVERY === "1"` (по образцу `UPDATER_ENABLED`); `release-manifest.json` поле `browserRecovery?: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
test("release manifest keeps the browser recovery build flag and decodes older manifests", () => {
  // released — фикстура Linux-манифеста из теста "decodes Linux and Windows manifests…" (строка 192)
  expect(decodeManifest({ ...released, browserRecovery: true }).browserRecovery).toBe(true)
  expect(decodeManifest(released).browserRecovery).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/desktop && bun test scripts/release/artifact.test.ts`
Expected: FAIL — строгая схема отвергает поле.

- [ ] **Step 3: Implement**

`electron.vite.config.ts` добавляет `define` из входа сборки (`"1"` или `"0"`). `env.d.ts` объявляет `LOGINOM_AI_AGENT_BROWSER_RECOVERY: string` в `ImportMetaEnv`. `desktopLoginom()` передаёт `browserRecovery: BROWSER_RECOVERY`. `write-manifest.ts` пишет `browserRecovery: process.env.LOGINOM_AI_AGENT_BROWSER_RECOVERY === "1"`. Зависимость от `app.isPackaged` проверяется на упакованном артефакте в плане 5 без мока Electron, как и `UPDATER_ENABLED`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/desktop && bun test scripts/release/artifact.test.ts && bun typecheck`
Expected: PASS.

- [ ] **Step 5: Commit and checkpoint**

```bash
git add packages/desktop
git commit -m "feat(desktop): enable browser recovery only in packaged builds"
```

Checkpoint до 20 строк. Открыть PR `feat: deliver private browser recovery capability` в `demo-022`.
