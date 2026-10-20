# Browser recovery, план 3: аренда браузера в bridge и первый прогон на Loginom

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При capability bridge публикует `dock_browser_recovery`, по `start` передаёт текущую вкладку тому же агенту через allowlist Playwright MCP, проверяет страницу после каждого вызова, ведёт бюджет и журнал и по `finish` возвращает управление Dock после общей проверки. План заканчивается первым сквозным прогоном на реальном Loginom.

**Architecture:** Новый модуль `browser-recovery.mjs` содержит allowlist и фильтр аргументов, бюджет шага, автомат аренды и код пробы страницы. Он работает над executor-API плана 2 и клиентом Playwright MCP, который уже есть в bridge. Bridge собирает каталог по состоянию аренды и маршрутизирует вызовы до обычной таблицы маршрутов. Конец run агента приходит приватным IPC `run-released` (сторона host — план 4). Task 5 запускает BR-S1 и BR-S3 через `supervise()` на реальном Loginom.

**Tech Stack:** JavaScript ESM, Node 24.19.0, `node:test`, MCP SDK `InMemoryTransport`, Playwright MCP 0.0.82.

**Spec:** [дизайн, разделы 6, 7, 9](../specs/2026-10-19-browser-recovery-design.md); [общий контракт](2026-10-19-browser-recovery.md#общий-контракт).

## Global Constraints

- «Во всех фазах браузером управляет не более одного программного исполнителя»; «Не используются второй браузер, новый login или отдельный CDP endpoint». Все вызовы recovery идут через тот же `browserGate` и тот же клиент `browser`.
- Публикуются ровно 16 инструментов allowlist; всё прочее отклоняется на границе исполнения, даже если имя известно модели.
- «После каждого действия runtime проверяет тот же origin Loginom, единственную страницу и наличие подготовленного документа. Иначе попытка переходит в `stopped`.»
- `snapshot: {mode: "none"}` — только при `config.browserRecovery === true` в executor-режимах; без capability конфигурация сессии прежняя.
- «Изображение не входит в текстовый лимит ответа `user-v1` (46 000 байт); в журнал пишутся хэш и размеры, а не само изображение.» Файлы, которые Playwright MCP пишет в `artifacts/` сессии, остаются в приватном каталоге попытки и не попадают в журнал и диагностику.
- Бюджет: 30 вызовов (allowlist-вызов модели и каждый `finish`) и 600000 мс суммарно в `browser` на ключ шага; handoff и общая проверка время не расходуют; после `completed` ключ удаляется.
- «`stopped` не переходит в Dock только из-за закрытия диалога или окончания таймера»; автоматического повторного запуска нет.
- «Вызовы из старого каталога, параллельные вызовы и запоздавшие ответы проверяются по текущему состоянию аренды.»
- `start` и `finish` укладываются в срок одного вызова: handoff ждёт не дольше 60 с, для `dock_browser_recovery` срок вызова — 255 с.

## Результат, объём, исключения

- Готово, когда Tasks 1–5 закрыты, `bun run test:upstream` зелёный, BR-S1 и BR-S3 — PASS на реальном Loginom.
- Первый сквозной результат — Task 5.
- Объём: ~15 файлов, ~+1550 / −40 строк (модуль ~500, bridge и entry ~180, тесты ~560, скрипт приёмки ~250, runbook и отчёт ~60).
- Исключения: агент, host, навык, evals, упакованные сборки, release.

## Review Focus

1. `browser_snapshot` с `filename` → `BROWSER_RECOVERY_ARGUMENT_FORBIDDEN`, файл не создан (Task 1).
2. Вызов allowlist-инструмента сразу после `stop` (старый каталог) → `BROWSER_RECOVERY_INACTIVE`, браузер не вызван (Task 3).
3. Полный `browser_snapshot` больше 46000 байт текста → ограниченный отказ с советом `target`/`depth`/`browser_find`; вызов учтён в бюджете (Task 4).
4. Вторая страница или уход со страницы в настоящем браузере → `stopped`, следующие вызовы отклоняются (Task 3).
5. Неподтверждённый жест проверки → `stopped`, управление не возвращается ни модели, ни Dock (Task 2).

---

### Task 1: Allowlist и фильтр аргументов

**Files:**
- Create: `packages/loginom-runtime/client/lib/browser-recovery.mjs`
- Test: `packages/loginom-runtime/client/test/browser-recovery.test.mjs`

**Interfaces:**
- Produces:
  - `RECOVERY_BROWSER_TOOLS` — замороженный массив 16 имён из общего контракта.
  - `browserRecoveryTool` — определение `dock_browser_recovery` со схемой из общего контракта (`oneOf` по `action`, `additionalProperties: false`).
  - `recoveryBrowserCatalog(browserTools) → Tool[]` — определения allowlist из закреплённого каталога без свойства `filename`; отсутствие любого имени — `Error` с этим именем.
  - `admitRecoveryBrowserCall(name, args) → args` — иначе `Error('BROWSER_RECOVERY_TOOL_FORBIDDEN')` или `Error('BROWSER_RECOVERY_ARGUMENT_FORBIDDEN')`; разрешены только ключи опубликованной схемы.

- [ ] **Step 1: Write the failing tests**

Каталог в тестах — настоящий: `createConnection({capabilities: ['core', 'vision'], snapshot: {mode: 'none'}}, async () => { throw Error('no browser') })` из установленного `@playwright/mcp` 0.0.82 и `listTools()` через `InMemoryTransport`, без рукописной копии.

```js
test('only the design allowlist is published and filename parameters are removed', async () => {
  const published = recoveryBrowserCatalog(await pinnedBrowserTools());
  assert.equal(RECOVERY_BROWSER_TOOLS.length, 16);
  assert.deepEqual(published.map(t => t.name).sort(), [...RECOVERY_BROWSER_TOOLS].sort());
  assert.deepEqual(Object.keys(published.find(t => t.name === 'browser_snapshot').inputSchema.properties).sort(), ['boxes', 'depth', 'target']);
  assert.equal('filename' in published.find(t => t.name === 'browser_take_screenshot').inputSchema.properties, false);
});
test('forbidden tools and arguments are refused before reaching the browser', () => {
  for (const name of ['browser_evaluate', 'browser_run_code_unsafe', 'browser_navigate', 'browser_navigate_back', 'browser_reload',
    'browser_tabs', 'browser_close', 'browser_cookie_list', 'browser_localstorage_get', 'browser_storage_state', 'browser_set_storage_state',
    'browser_network_requests', 'browser_route', 'browser_file_upload', 'browser_drop', 'browser_resize', 'browser_emulate_media',
    'browser_pdf_save', 'browser_start_tracing', 'browser_highlight', 'browser_resume', 'browser_mouse_down', 'browser_keydown',
    'browser_press_sequentially', 'browser_check', 'browser_uncheck'])
    assert.throws(() => admitRecoveryBrowserCall(name, {}), /BROWSER_RECOVERY_TOOL_FORBIDDEN/);
  assert.throws(() => admitRecoveryBrowserCall('browser_snapshot', { filename: 'page.yml' }), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  assert.deepEqual(admitRecoveryBrowserCall('browser_snapshot', { target: 'e12', depth: 3 }), { target: 'e12', depth: 3 });
});
test('a pinned catalog without an allowlisted tool fails closed', async () => {
  assert.throws(() => recoveryBrowserCatalog((await pinnedBrowserTools()).filter(t => t.name !== 'browser_find')), /browser_find/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/loginom-runtime/client && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser-recovery.test.mjs`
Expected: FAIL — модуль отсутствует.

- [ ] **Step 3: Implement per Interfaces**

- [ ] **Step 4: Run tests to verify they pass** (команда Step 2; Expected: PASS)

- [ ] **Step 5: Commit**

```bash
git add packages/loginom-runtime/client
git commit -m "feat(runtime): define the browser recovery allowlist"
```

### Task 2: Бюджет шага и автомат аренды

**Files:**
- Modify: `packages/loginom-runtime/client/lib/browser-recovery.mjs`
- Test: `packages/loginom-runtime/client/test/browser-recovery.test.mjs`

**Interfaces:**
- Consumes: план 2 — `browserRecoveryBasis`, `browserRecoveryHandoff`, `verifyBrowserRecovery`, `settleBrowserRecovery`, `markBrowserRecoveryStopped`, `browserRecoverySafeCompletion`, `browserRecoveryStepKey`, `BROWSER_RECOVERY_BUDGET`; Task 1.
- Produces: `createBrowserRecovery({runtime, definitions, callBrowser, probePage, record, now = Date.now}) → {owns(name), tools(baseTools), call(name, args, {signal}), release(reason), active(), hasUnsettledWork(), dockAllowed(name, args), noteDockCall(name, args, outcome), remaining(stepKey)}`.
  - Бюджет — `Map` по ключу шага внутри модуля: число вызовов и накопленное время в `browser`. `remaining(stepKey)` передаётся executor как опция плана 2.
  - `attempt_id` — `br-<n>`, номер `finish` в попытке — `k` для `verifyBrowserRecovery(..., {attemptId, sequence: k})`.
  - `tools(base)`: в `browser` — инструменты `remote`, `dock_diagnostics`, `dock_browser_recovery` и `definitions`; в неразрешённом `stopped` — remote, диагностика, recovery и только конкретное доступное safe-completion действие; при обычном допуске Dock — `base` и `dock_browser_recovery`.
  - `dockAllowed(name, args)` в `handoff`, `browser` и `verifying` разрешает только remote и `dock_diagnostics`. В `stopped` обычный Dock не допускается до подтверждённого safe release. При живой странице и известном исходе допускается только конкретный `next_step` из `markBrowserRecoveryStopped` → `browserRecoverySafeCompletion`, с исходным `operation_id` и `strategy: "abandon_operation"`. Unknown browser/verification или смена страницы не допускают ни этого действия, ни нового start. Проверка повторяется непосредственно перед dispatch внутри существующего browser gate, в том числе для ранее поставленных в очередь Dock-вызовов.
  - `noteDockCall(name, args, outcome)` получает фактический исход после существующего runtime dispatch. Он пишет `browser_recovery_dock_resumed` для первого принятого вызова Dock после `completed`/`continuable`; для разрешённого stopped-safe-release возвращает обычный допуск Dock только по matching `SUCCEEDED`/`released_after_proof` с исходной операцией, то есть после существующих native proof и durable release ACK. Сам вызов recover, отказ и запоздалый результат при утрате владения допуск не возвращают.
  - `hasUnsettledWork()` сообщает удержанное владение попытки, включая unknown или ещё не разрешённый `stopped`; `active()` отдельно сообщает выполняющуюся аренду. Это запрос существующего состояния, используемый в bridge/cleanup, без второго реестра блокировок.
  - Одна причина/намерение остановки хранится в текущей попытке. `release` и abort охватывают `handoff`, `browser`, `verifying`; после каждого await перед передачей владения проверяются та же попытка и это намерение. Принятый вызов не прерывается: результат и факты сохраняются, но поздний ответ не возрождает browser/dock. При stop во время verify новая settlement не начинается; при уже начатой записи сохраняется подтверждённая квитанция, активная аренда не восстанавливается. Уже отменённый до dispatch сигнал не отправляет browser-вызов.
  - Ответы — по общему контракту, с `structuredContent` и `_meta["loginom/browser_recovery"]`.

Переходы:

| Вызов | Переходы |
| --- | --- |
| `start` | нет основания → `BROWSER_RECOVERY_NOT_OFFERED`, состояние прежнее; бюджет шага исчерпан → `stopped` (`budget_exhausted`); иначе `handoff` → `browserRecoveryHandoff`; `verified: false` → `stopped` (`handoff_unverified`); иначе `browser`, время шага идёт |
| `finish` | только из `browser`; сначала обновляет browser-время и проверяет оба остатка (любой исчерпан → `stopped`, `budget_exhausted`, без verify); принятый finish расходует вызов, время шага останавливается; `verifying` → `verifyBrowserRecovery`; `unconfirmed` → `stopped` (`verification_unconfirmed`); иначе `settleBrowserRecovery`; ошибка квитанции → `stopped` (`receipt_unconfirmed`); `completed` → `dock`, ключ шага удаляется; `continuable` → `dock`; `unresolved` → `browser` при остатке бюджета, иначе `stopped` |
| `stop`, `release`, abort | из `handoff`/`browser`/`verifying`: намерение остановки и `stopped` после установленного результата уже принятого вызова (`model_stop`, `run_released`, `runtime_closed`, `cancelled`); без новых UI-жестов и без восстановления владельца поздним ответом |

Подтверждённый safe release — отдельный явный путь возврата обычного допуска Dock; он не повторяет stopped-попытку и не заявляет recovered goal. Каждый переход в `stopped` вызывает `markBrowserRecoveryStopped` и пишет `browser_recovery_state`. Любой ответ со `state: "stopped"` содержит `stop_reason`, `summary` (вызванные инструменты, состояние исходной операции, последний результат проверки, `attested_by_model`) и `next_step`: при живой странице — `runtime.browserRecoverySafeCompletion(operationId)`, после `page_changed` и `browser_call_unconfirmed` — `{instruction}` сообщить фактическое состояние.

- [ ] **Step 1: Write the failing tests**

`runtime(...)` в тестах — обычный объект с функциями плана 2, без библиотек моков: `markBrowserRecoveryStopped` записывает id в `rt.stopped` и обнуляет основание, `settleBrowserRecovery` — в `rt.settled`. `now` — управляемые часы. `recovery(options)` создаёт автомат и считает вызовы `callBrowser` в массиве `r.browserCalls`, события журнала — в `r.events`. `start(r, id)` и `finish(r)` — вызовы `dock_browser_recovery` с `action: "start"` и `action: "finish"` (фиксированный отчёт); `meta(reply)` — `reply._meta["loginom/browser_recovery"]`.

```js
test('start enters browser only after a verified handoff', async () => {
  const r = recovery({ runtime: runtime() });
  const started = await start(r, 'apply');
  assert.deepEqual(meta(started), { attempt_id: 'br-1', state: 'browser', calls_remaining: 30, ms_remaining: 600000 });
  assert.ok(r.tools(base).some(t => t.name === 'browser_click'));
});
test('the recovery tool is listed whenever enabled and start without a basis is refused', async () => {
  const r = recovery({ runtime: runtime({ basis: null }) });
  assert.ok(r.tools(base).some(t => t.name === 'dock_browser_recovery'));
  assert.equal((await start(r, 'apply')).structuredContent.error.code, 'BROWSER_RECOVERY_NOT_OFFERED'); assert.equal(r.active(), false);
});
test('an unverified handoff stops the attempt and never enters browser', async () => {
  const rt = runtime({ handoff: { verified: false, reason: 'RECEIPT_UNSETTLED' } }), r = recovery({ runtime: rt });
  const reply = await start(r, 'apply');
  assert.deepEqual([reply.structuredContent.state, reply.structuredContent.stop_reason], ['stopped', 'handoff_unverified']);
  assert.deepEqual(rt.stopped, ['apply']);
});
test('stop and run release end the attempt without UI gestures and point to safe completion', async () => {
  const rt = runtime({ safeCompletion: { tool: 'dock_operation_recover' } }), r = recovery({ runtime: rt }); await start(r, 'apply');
  const stopped = await r.call('dock_browser_recovery', { action: 'stop', reason: 'no justified action' }, {});
  assert.equal(stopped.structuredContent.next_step.tool, 'dock_operation_recover');
  assert.equal(r.browserCalls.length, 0); assert.deepEqual(rt.stopped, ['apply']);
  const other = recovery({ runtime: runtime() }); await start(other, 'apply'); await other.release('run_released');
  assert.equal(other.active(), false);
});
test('an unconfirmed verification gesture stops the attempt', async () => {
  const rt = runtime({ verify: { unconfirmed: true } }), r = recovery({ runtime: rt }); await start(r, 'apply');
  const reply = await finish(r);
  assert.deepEqual([meta(reply).state, reply.structuredContent.stop_reason], ['stopped', 'verification_unconfirmed']);
  assert.deepEqual(rt.settled, []);
});
test('the step budget is shared across operation ids and re-entries and renewed after completed', async () => {
  // 'apply': start, finish → unresolved, finish → continuable; затем основание 'again' с тем же ключом шага
  assert.equal(meta(await start(r, 'again')).calls_remaining, 28);
  // finish → completed; новое основание того же ключа
  assert.equal(meta(await start(r, 'third')).calls_remaining, 30);
});
test('only time in browser state is counted', async () => {
  // handoff и verify двигают часы на 5 минут каждый, состояние browser — на 1 минуту; decision unresolved
  assert.equal(meta(await finish(r)).ms_remaining, 540000);
});
test('each finish consumes one call and unresolved returns to browser only with budget left', async () => {
  assert.deepEqual([meta(await finish(r)).calls_remaining, meta(await finish(r)).state], [29, 'browser']);
  // при одном оставшемся вызове: finish → state 'stopped', stop_reason 'budget_exhausted'
});
```

Дополнительные регрессии Task 2: `finish` при времени 600000 мс не вызывает verify даже с 30 оставшимися вызовами; release/abort во время deferred handoff и verify (confirmed/unknown) не возрождают аренду поздним ответом и сохраняют факты; начатый durable ACK сохраняет результат при stop; matching safe release разрешает Dock только после подтверждённого outcome.

- [ ] **Step 2: Run tests to verify they fail** (`--test test/browser-recovery.test.mjs`; Expected: FAIL)

- [ ] **Step 3: Implement** по таблице переходов.

- [ ] **Step 4: Run tests to verify they pass** (Expected: PASS)

- [ ] **Step 5: Commit**

```bash
git add packages/loginom-runtime/client
git commit -m "feat(runtime): lease the browser for one recovery attempt"
```

### Task 3: Вызовы Playwright, проверка страницы и журнал

**Files:**
- Modify: `packages/loginom-runtime/client/lib/browser-recovery.mjs`
- Create: `packages/loginom-runtime/client/test/browser-recovery-probe.integration.test.mjs` (по образцу `browser-geometry.integration.test.mjs` и `support/run-direct-browser-tests.mjs`)
- Test: `packages/loginom-runtime/client/test/browser-recovery.test.mjs`

**Interfaces:**
- Produces:
  - `makeRecoveryPageProbeCode({origin, documentId, sessionId, account, loginomBuild}) → string` — read-only код для `browser_run_code_unsafe` из проверок `readSavedPackageState` (`package-persistence.mjs:15-19`): `location.origin`, `app.Version`, `__loginomDockPreparationV1` с `document === document` и `id === documentId`, квитанция подготовки этой сессии, подключённый аккаунт; плюс `page.context().pages().length`. Значения — из `getStorageBinding()`. Проверки пакета и вкладки не используются: Save As меняет путь и может переоткрыть пакет, а открытые мастер или диалог того же документа — не смена страницы.
  - `parseRecoveryPageProbe(response) → {origin_ok: boolean, page_count: number, document_present: boolean}` — неполный ответ даёт `false`.
  - Порядок вызова allowlist-инструмента: состояние `browser`, иначе `BROWSER_RECOVERY_INACTIVE` → `admitRecoveryBrowserCall` → расход вызова (нет вызова или времени → `stopped` (`budget_exhausted`) и `BROWSER_RECOVERY_BUDGET_EXHAUSTED`, браузер не вызывается) → `callBrowser(name, args)` без сигнала → `probePage()` → `browser_recovery_call` → ответ. После ответа: `signal.aborted` → `stopped` (`cancelled`); провал пробы → `stopped` (`page_changed`) и код `BROWSER_RECOVERY_PAGE_CHANGED`; исключение, тайм-аут или protocol reply `isError: true` без структурированного no-effect доказательства → `stopped` (`browser_call_unconfirmed`) и `BROWSER_CALL_UNCONFIRMED` без повтора.
  - Успешная проба страницы не подтверждает no-effect ошибочного MCP-ответа. Такой исход сохраняется в ограниченном ответе/журнале; нет повторного жеста или safe UI cleanup. Локальный отказ admission до dispatch остаётся отказом без browser-вызова.
  - `browser_recovery_call`: `{attempt_id, tool, arguments, duration_ms, is_error, text_bytes, images: [{mime, bytes, sha256}], page, calls_remaining, ms_remaining}`.

- [ ] **Step 1: Write the failing tests**

`started(options)` — `recovery(options)` после успешного `start`; `browserCalls` хранит аргументы каждого `callBrowser`.

```js
const click = (r, signal) => r.call('browser_click', { target: 'e1' }, { signal });
test('a navigation, a second page or a missing prepared document stops the attempt', async () => {
  for (const page of [{ origin_ok: false, page_count: 1, document_present: true },
    { origin_ok: true, page_count: 2, document_present: true }, { origin_ok: true, page_count: 1, document_present: false }]) {
    const r = await started({ probe: page });
    assert.equal((await click(r)).structuredContent.error.code, 'BROWSER_RECOVERY_PAGE_CHANGED');
    assert.equal((await click(r)).structuredContent.error.code, 'BROWSER_RECOVERY_INACTIVE');
    assert.equal(r.browserCalls.length, 1);
  }
});
test('an aborted call completes its accepted action and then stops', async () => {
  const controller = new AbortController(), r = await started({ onBrowserCall: () => controller.abort() });
  const reply = await click(r, controller.signal);
  assert.notEqual(reply.isError, true); assert.equal(r.browserCalls[0].signal, undefined);
  assert.equal(meta(reply).state, 'stopped');
});
test('a failed or timed out browser call is unconfirmed and stops without retry', async () => {
  const r = await started({ browserError: Error('MCP request timed out') });
  assert.equal((await click(r)).structuredContent.error.code, 'BROWSER_CALL_UNCONFIRMED');
  assert.equal(r.browserCalls.length, 1); assert.equal(r.active(), false);
});
test('the journal keeps image digests and sizes but never image data', async () => {
  const data = 'iVBORw0KGgo=', r = await started({ browserResult: { content: [{ type: 'image', mimeType: 'image/png', data }] } });
  await r.call('browser_take_screenshot', { scale: 'css' }, {});
  assert.deepEqual(r.events.find(e => e.phase === 'browser_recovery_call').images,
    [{ mime: 'image/png', bytes: 8, sha256: createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex') }]);
  assert.equal(JSON.stringify(r.events).includes(data), false);
});
test('calls from an old catalog are checked against the current state', async () => {
  const r = await started({});
  await r.call('dock_browser_recovery', { action: 'stop', reason: 'done' }, {});
  assert.equal((await click(r)).structuredContent.error.code, 'BROWSER_RECOVERY_INACTIVE'); assert.equal(r.browserCalls.length, 0);
});
```

В `browser-recovery-probe.integration.test.mjs` — настоящий Chromium:

```js
test('page probe accepts the prepared page with an open dialog and refuses a second page or navigation', async () => {
  // страница с __loginomDockPreparationV1 (document, id, receipts этой сессии) и фиктивным bg.app (Version, аккаунт подключён)
  // проба: origin_ok, page_count 1, document_present; после показа диалога на странице — то же
  // context.newPage(): page_count 2; page.goto('about:blank'): origin_ok false, document_present false
});
```

- [ ] **Step 2: Run tests to verify they fail** (`--test test/browser-recovery.test.mjs`, интеграционный тест — командой `support/run-direct-browser-tests.mjs`; Expected: FAIL)

- [ ] **Step 3: Implement** по порядку из Interfaces.

- [ ] **Step 4: Run tests to verify they pass** (Expected: PASS)

- [ ] **Step 5: Commit**

```bash
git add packages/loginom-runtime/client
git commit -m "feat(runtime): check the page after every recovery browser call"
```

### Task 4: Bridge: каталог, маршрутизация, размер ответа, режим snapshot, конец run и срок вызова

**Files:**
- Modify: `packages/loginom-runtime/client/lib/bridge.mjs` — `createBridge` (92–99), каталоги и `createActionRuntime` (154–176), `ListTools` (205), начало `callTool` (208–211), обёртка ответа (477–481), `hasActiveWork` (482), `close` (485)
- Modify: `packages/loginom-runtime/client/lib/user-response-budget.mjs:8-31`
- Modify: `packages/loginom-runtime/client/lib/session.mjs:72-80`
- Modify: `packages/loginom-runtime/src/managed-entry.mjs:180-222`
- Modify: `packages/loginom-runtime/src/call-timeout.mjs:3-10`
- Create: `packages/loginom-runtime/client/test/support/browser-recovery-bridge.mjs` (по образцу `support/package-cleanup-bridge.mjs`)
- Create: `packages/loginom-runtime/client/test/browser-recovery-bridge.test.mjs`
- Test: `packages/loginom-runtime/client/test/user-response-budget.test.mjs`, `packages/loginom-runtime/client/test/session-browser-config.test.mjs`, `packages/loginom-runtime/test/call-timeout.test.mjs`, `packages/loginom-host/test/managed-work-entry.test.ts`
- Docs: `packages/loginom-runtime/AGENTS.md` (пункт о профиле `user-v1` и аренде)

**Interfaces:**
- Consumes: Tasks 1–3, `config.browserRecovery` из плана 1.
- Produces:
  - Recovery создаётся только при `config.browserRecovery === true`, профиле `user-v1` и `executor-replay`. Иначе каталог, маршруты и ответы прежние.
  - `createActionRuntime({..., browserRecovery: {remaining: recovery.remaining}})`.
  - `ListTools` возвращает `recovery.tools(catalog.tools)`. В начале `callTool`, до локальных инструментов: `recovery.owns(name)` → `browserGate(() => recovery.call(...))` и `boundedRecoveryReply`; иначе `!recovery.dockAllowed(name, args)` → `BROWSER_RECOVERY_ACTIVE`; иначе прежний путь с повторной проверкой допуска внутри существующего gate перед browser dispatch. Ранняя проверка сохраняется для `dock_node_cancel`/`dock_node_stop`, обходящих gate. После runtime dispatch `noteDockCall(name, args, outcome)` получает настоящий исход, без разбора текста compact reply и без второго маршрутизатора.
  - `boundedRecoveryReply(reply, {tool}) → reply` — лимиты `boundedUserToolReply` (46000 байт, 50 KiB, 2000 строк) считаются без блоков `image`; при превышении — отказ `USER_RESPONSE_BUDGET` с `next_step.instruction` про `target`/`depth` и `browser_find`; `_meta` сохраняется.
  - `hasActiveWork()` истинно и при `recovery.active()`; `hasUnsettledWork()` учитывает `recovery.hasUnsettledWork()`. `close()` сначала вызывает `recovery.release('runtime_closed')`; package cleanup проверяет этот же факт до входа и внутри существующего gate. Неизвестный browser call не очищается автоматически даже при settled T4 и пустом executor pending; обычное закрытие MCP/браузера и честный blocked cleanup result сохраняются.
  - Bridge возвращает `releaseRun()`. `managed-entry.mjs` на `{operation: "run-released"}` вызывает её и отвечает `{released: true}`; проверка `state.controller` к этой операции не применяется.
  - `session.mjs` пишет `snapshot: {mode: "none"}` в `playwright.json` только в executor-режиме при `config.browserRecovery === true`.
  - `runtimeCallTimeout('dock_browser_recovery', args) = 255000` (`BROWSER_RECOVERY_VERIFY_MS` плюс 15000). Из него выводятся срок IPC host (+15 с, `host-port.ts:427`) и срок адаптера агента (`max(180 с, +30 с)`, `adapter.ts:88`).

- [ ] **Step 1: Write the failing tests**

Фикстура bridge: поддельные MCP-клиенты, как в `package-cleanup-bridge.mjs`. Браузерный клиент отдаёт настоящий каталог 0.0.82 и `browser_run_code_unsafe`; на коде Save отвечает `AMBIGUOUS` с `cleanup_complete: true`, на чтение квитанции — `completed`; проба страницы и состояние сохранённого пакета (`modified: false`) задаются тестом. После inspect этого Save получается настоящее основание T4 `save`. Помощник `recoveryBridge({browserRecovery})` возвращает `{call, callRaw, tools, events, browserCodes}`: `call` разбирает первый текстовый блок, `callRaw` отдаёт ответ MCP, `tools()` — имена `listTools`.

```js
test('the recovery tool appears only with the capability and the basis only after inspect', async () => {
  for (const browserRecovery of [false, true]) {
    const b = await recoveryBridge({ browserRecovery });
    assert.equal((await b.tools()).includes('dock_browser_recovery'), browserRecovery);
    await b.call('dock_action_run', save);
    const inspected = await b.call('dock_operation_inspect', { operation_id: 'save-1' });
    assert.equal(inspected.next_step?.tool === 'dock_browser_recovery', browserRecovery);
    assert.equal((await b.tools()).some(name => name.startsWith('browser_')), false);
    if (!browserRecovery) await assert.rejects(b.callRaw('browser_click', { target: 'e1' }), /Unknown Dock tool/);
  }
});
test('browser state lists knowledge, diagnostics, dock_browser_recovery and the allowlist only', async () => {
  // после start
  assert.deepEqual((await b.tools()).sort(), [...remoteNames, 'dock_diagnostics', 'dock_browser_recovery', ...RECOVERY_BROWSER_TOOLS].sort());
});
test('Dock tools are refused in browser state even when their names are known', async () => {
  const before = b.browserCodes.length, reply = await b.call('dock_action_run', save2);
  assert.equal(reply.error.code, 'BROWSER_RECOVERY_ACTIVE'); assert.equal(b.browserCodes.length, before);
});
test('an oversized snapshot is refused but counted', async () => {
  // поддельный браузер отвечает на browser_snapshot 47000 байтами текста
  const reply = await b.callRaw('browser_snapshot', {});
  assert.equal(reply.isError, true); assert.equal(reply._meta['loginom/browser_recovery'].calls_remaining, 29);
});
test('a verified save completes the step and restores the ordinary catalog', async () => {
  const finished = await b.call('dock_browser_recovery', { action: 'finish', report });
  assert.equal(finished.result, 'completed'); assert.equal((await b.tools()).some(name => name.startsWith('browser_')), false);
  assert.ok(b.events.some(e => e.phase === 'browser_recovery_verified'));
});
```

```js
test('image blocks do not count toward the text delivery budget', () => {   // user-response-budget.test.mjs
  const image = { type: 'image', mimeType: 'image/png', data: 'A'.repeat(200000) };
  const small = { content: [{ type: 'text', text: 'ok' }, image] };
  assert.deepEqual(boundedRecoveryReply(small, { tool: 'browser_take_screenshot' }), small);
  const big = boundedRecoveryReply({ content: [{ type: 'text', text: 'x'.repeat(47000) }] }, { tool: 'browser_snapshot' });
  assert.equal(big.isError, true); assert.match(big.content[0].text, /browser_find/);
});
test('only recovery-enabled executor sessions turn off Playwright response snapshots', async t => {   // session-browser-config.test.mjs
  const browserConfig = async (mode, browserRecovery) => JSON.parse(await readFile((await createSession({ ...config, mode, browserRecovery }, managedOptions(t))).browserConfig, 'utf8'));
  assert.deepEqual((await browserConfig('executor-replay', true)).snapshot, { mode: 'none' });
  assert.equal((await browserConfig('executor-replay', false)).snapshot, undefined);
  assert.equal((await browserConfig('classic', true)).snapshot, undefined);
});
test('browser recovery calls get the verification deadline', () => {   // test/call-timeout.test.mjs
  assert.equal(runtimeCallTimeout('dock_browser_recovery', { action: 'finish' }), 255000);
  assert.equal(runtimeCallTimeout('dock_node_apply', {}), 105000);
});
```

Дополнительные регрессии bridge: settled T4 → browser timeout/`isError:true` → stale Dock mutation и package cleanup запрещены; queued Dock, допущенный до start, повторно проверяется внутри gate; stopped-safe-release отклоняет другую operation/strategy и снимает запрет только после подтверждённого собственного proof/ACK.

В `managed-work-entry.test.ts` фиктивный bridge получает `releaseRun`, который пишет файл; тест шлёт `run-released` и проверяет ответ `{released: true}` и файл.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/loginom-runtime/client && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser-recovery-bridge.test.mjs test/user-response-budget.test.mjs test/session-browser-config.test.mjs`; `cd packages/loginom-runtime && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/call-timeout.test.mjs`; `cd packages/loginom-host && LOGINOM_AI_AGENT_TEST_NODE=<pinned node> bun test test/managed-work-entry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** по Interfaces.

- [ ] **Step 4: Run tests to verify they pass**

Run: команды Step 2 и `cd packages/loginom-runtime && PATH="$(dirname "$LOGINOM_AI_AGENT_TEST_NODE"):$PATH" bun run test:upstream`
Expected: PASS; прежние наборы bridge без capability не изменились.

- [ ] **Step 5: Commit**

```bash
git add packages/loginom-runtime packages/loginom-host/test/managed-work-entry.test.ts
git commit -m "feat(runtime): wire the browser recovery lease into the bridge"
```

### Task 5: Первый прогон на реальном Loginom (BR-S1, BR-S3)

**Предусловия:** как у плана 2, Task 0; resources заново stage из текущего принятого HEAD существующим builder. Старый bundle живой пробы Task 0 для проверки новой реализации не используется.

**Files:**
- Create: `packages/desktop/test/loginom/browser-recovery-acceptance.ts` (по образцу `runtime-acceptance.ts:88-140`: `supervise({..., browserRecovery: true, acceptanceFault})`, `invoke()` сохраняет каждую квитанцию)
- Create: `docs/testing/loginom-ai-agent/browser-recovery.md` (runbook: окружение, команда, сценарии, критерии; план 5 его дополняет)
- Create: `docs/testing/loginom-ai-agent/reports/<YYYY-MM-DD>-browser-recovery-smoke/report.md`
- Modify: `docs/testing/loginom-ai-agent/README.md` (ссылка на runbook)

**Interfaces:**
- Consumes: планы 1–2, Tasks 1–4.
- Скрипт принимает ID сценария, печатает каталог приватных доказательств и останавливается на первом неопределённом исходе, сохраняя квитанции. Запрос узла — `transform.calculator` без output-mapping, `finish: "execute"`. Оператор скриптован: находит элемент через `browser_find`, требует ровно одно совпадение внутри мастера узла шага (иначе FAIL), кликает его и вызывает `finish`.

| ID | `acceptanceFault` | Триггер | Действия оператора | Требуемый результат |
| --- | --- | --- | --- | --- |
| BR-S1 | `transform.calculator`: `phase_stop configure` (`times: 1`) и `release_refusal` (`times: 1`) | T1 | «Отмена» мастера | ни в одном ответе нет `user_action`; `continuable`; новая операция над `existing`-узлом с полными настройками — `SUCCEEDED`; `dock_node_read` |
| BR-S3 | `transform.calculator`: `phase_stop configure` (`times: 3`) | T3 после освобождения Dock | «Выполнить» мастера; `browser_wait_for` закрытия мастера | `completed`: выполнение и схема проверены консолью и Preview; `dock_node_read` с `source_operation_id` квитанции — `SUCCEEDED`; фаза `configure` Dock больше не запускается (`remaining` у `acceptanceFault` — 1) |

Оба сценария заканчиваются `package.save_checkpoint` через Dock и состоянием пакета `modified: false`.

- [ ] **Step 1: Write the script and runbook**

- [ ] **Step 2: Run the scenarios**

Run: `cd packages/desktop && LOGINOM_AI_AGENT_TEST_CONFIG=<private config> LOGINOM_AI_AGENT_TEST_RESOURCES=<staged resources> bun test/loginom/browser-recovery-acceptance.ts BR-S1` (затем `BR-S3`)
Expected: оба PASS; в журналах есть `acceptance_fault_injected`, `browser_recovery_handoff`, `browser_recovery_verified`, `browser_recovery_dock_resumed`. При провале — остановиться, записать в checkpoint и не начинать план 4 до исправления.

- [ ] **Step 3: Write the report**

SHA исходников, SHA-256 ресурсов, по сценарию — PASS/FAIL, ключевые квитанции (выдержки), ограничения: оператор скриптован, это не качество модели.

- [ ] **Step 4: Commit and checkpoint**

```bash
git add packages/desktop/test/loginom/browser-recovery-acceptance.ts docs/testing/loginom-ai-agent
git commit -m "test(desktop): run the first browser recovery scenarios on Loginom"
```

Checkpoint до 20 строк. PR `feat(runtime): browser recovery lease` в `demo-022`.
