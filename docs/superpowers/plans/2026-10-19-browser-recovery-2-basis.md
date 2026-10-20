# Browser recovery, план 2: основание перехода, общая проверка и recovery-квитанция

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При включённой опции executor выдаёт структурированное основание T1–T4 как `next_step` на `dock_browser_recovery`, доказывает остановку собственного исполнения, проверяет результат шага чтениями и собственными проходами консоли процессов и Preview и записывает recovery-квитанцию, которую принимает `dock_node_read`.

**Architecture:** Классификация основания и решение по фактам — чистые функции одного модуля `browser-recovery-basis.mjs`. Executor собирает срез операции в трёх точках: отказ освобождения, inspect и итог узловой операции. Общую проверку executor выполняет на собственном канале с отдельной операцией проверки, по образцу канала чтения JS-источника (`executor.mjs:1985-2011`). Проверка вызывает только существующие процедуры: `proveNodeRestsQuiet`, процедуру консоли процессов, процедуру Preview и `readNativeExportFile`. Bridge в Tasks 1–6 не меняется; Task 7 только передаёт в executor приватный `acceptanceFault`. Без опции поведение продукта прежнее.

**Tech Stack:** JavaScript ESM, Node 24.19.0, `node:test`.

**Spec:** [дизайн, разделы 5, 7, 8](../specs/2026-10-19-browser-recovery-design.md); [общий контракт](2026-10-19-browser-recovery.md#общий-контракт).

## Global Constraints

- Без опции `browserRecovery` ответы Dock и журнал обычных запусков не меняются: существующие наборы зелёные, `user_action` остаётся, новых событий журнала нет.
- «Решение не строится на поиске слов в сообщении об ошибке» — только структурные поля исхода.
- Не триггеры: `NOT_APPLIED` с `effect_possible=false` и `next_step`; `running`; `LOGIN_REQUIRED`; отмена пользователем; отсутствие исходных данных; неустановленный исход последнего вызова браузера; загрузка и доставка входного файла (`artifact.upload`).
- T2 — «шаг известен, и inspect не предлагает ни одного штатного продолжения». Штатные продолжения: непустой `recovery_options`, `dock_node_resume`, `dock_operation_recover`, `dock_artifact_verify`, `dock_artifact_delivery_resume` в `next_steps` или `internal_resume_available: true` (`executor.mjs:1871-1902` возвращает пустой `recovery_options` при доступном resume маппинга, а пауза ожидания выполнения объявляет resume только этим флагом, `executor.mjs:1886-1889`).
- Общая проверка делает жесты только существующими процедурами Dock на собственном канале с операцией проверки `<attempt_id>:v<k>`. Модель в это время не действует, драйвер исходной процедуры не вызывается. Жест проверки без подтверждённой browser-квитанции не даёт применить решение.
- «Исходная операция остаётся `FAILED`/released, её ошибка и прежние квитанции сохраняются»; ручное действие не становится успешной квитанцией Dock.
- «Снятие блокировки и разрешение следующего шага происходят только после записи квитанции.» Закрываются только блокировки исходной операции.
- Настройки — всегда `attested_by_model`. После `completed` или `continuable` прежние наблюдения недействительны (`observations.clear()`).
- Повтор через Dock — только для выполнения узла и экспорта с `overwrite: "replace"`.

## Результат, объём, исключения

- Готово, когда Tasks 0–7 закрыты, `bun run test:upstream` зелёный, итог живой пробы Task 0 записан в checkpoint.
- Первый проверяемый результат — Task 0 на реальном Loginom.
- Объём: ~17 файлов, ~+1600 / −80 строк (код ~700, тесты ~850, документация ~10).
- Исключения: bridge (кроме передачи `acceptanceFault`), агент, навык, доставка входного файла, новые читатели настроек, изменения процедур настройки узлов.

## Review Focus

1. Не-триггеры, загрузки и доступный resume дают `null` (Task 1).
2. Квитанция `running` или её отсутствие — handoff отказывает (Task 3).
3. Выполнение без схемы — `unresolved`, а не `continuable`; старая группа выполнения не даёт `completed` (Tasks 1, 5).
4. Неподтверждённый жест проверки не применяет решение (Task 5).
5. Сбой записи квитанции оставляет блокировку и даёт `RECOVERY_RECEIPT_UNCONFIRMED` (Task 6).

---

### Task 0: Живая проба главного пути

**Статус: выполнено 20.10.2026.** Каталог, независимое выполнение и Preview подтверждены на реальном Loginom; независимое review принято без замечаний. Snapshot: 20 093 байта без аргументов, 1 073 байта с ограничением. Итоговый собственный пакет, transport и браузер закрыты; закрытие несохранённого пакета первой неудачной попытки осталось неподтверждённым.

**Предусловия** ([preflight-отчёт](../../testing/loginom-ai-agent/reports/2026-10-19-browser-recovery-preflight.md), пункты 2–4): зависимости runtime установлены по lockfile (`cd packages/loginom-runtime/client && npm ci`), Chromium по pins и staged resources, приватная конфигурация Loginom (`LOGINOM_AI_AGENT_TEST_CONFIG`), вход и связность с Dock. Без них задача заблокирована. Tasks 1–7 начинаются только после её успеха.

Временный скрипт по образцу `packages/desktop/test/loginom/runtime-acceptance.ts`, вне продукта, не коммитится. Одна сессия на реальном Loginom:

1. `listTools()` браузерного клиента сессии (`capabilities: ['core', 'vision']`) содержит все 16 имён allowlist общего контракта.
2. Через Dock создать и выполнить `transform.calculator` без output-mapping (`finish: "execute"`, `read.ports: []`). Встроенная Table здесь не нужна: схему независимо читает Preview на шаге 3, а её активация добавляет отдельную группу процессов. Сохранить базовую линию выполнения, снятую процедурой до запуска. Закрыть все окна: граф тихий.
3. Без процедуры узла: проверка покоя, как в `node-pending-release.mjs:51-66`, без жестов; затем процедура консоли процессов с этой базовой линией (`identify`, `waitCompleted`); затем `openOwnedNativePreview` → схема → `closeOwnedNativePreview`. Базовую линию достаточно временно подставить в отдельный экземпляр процедуры. `prepare()` возвращает baseline; IPC-клиент `supervise()` сам не раскрывает browser/channel, поэтому временная instrumentation связывает их в том же контексте вне продукта, без нового production API.
4. `browser_snapshot` страницы Loginom: размер ответа без аргументов и с `target`/`depth: 3`.

Ожидается: шаг 3 доказывает выполнение и читает схему; размеры записаны. Если шаг 3 не проходит, остановиться и вынести на решение владельца: на этом допущении держится `completed`. Итог — в checkpoint до 20 строк; скрипт удаляется.

### Task 1: Чистые функции основания и решения

**Files:**
- Create: `packages/loginom-runtime/client/lib/browser-recovery-basis.mjs`
- Test: `packages/loginom-runtime/client/test/browser-recovery-basis.test.mjs`

**Interfaces:**
- Produces:
  - `BROWSER_RECOVERY_BUDGET = Object.freeze({calls: 30, ms: 600000})`, `BROWSER_RECOVERY_VERIFY_MS = 240000`, `BROWSER_RECOVERY_HANDOFF_MS = 60000`
  - `classifyBrowserRecovery(view, history = []) → Basis | null`
  - `browserRecoveryStepKey(step) → string` (формат — общий контракт)
  - `browserRecoveryNextStep(basis, {calls_remaining, ms_remaining}) → object` (формат — общий контракт)
  - `decideBrowserRecovery(basis, facts) → {result, verified, missing: string[]}`; конкретный `next_step` формирует executor в Task 6 из исходного request и фактического `attemptId`. Для `completed`/`continuable` он выдаётся после ACK квитанции; для `unresolved` — инструкция с missing без ссылки на несуществующую квитанцию.
- `view` — срез операции, который собирает Task 2: `operation_id, capability, action_key, state ('pending'|'running'|'settled'), status, effect_possible, error_code, cause_code, pending_phase, released_phase, checkpoint_kind, execution_status, export_download_unconfirmed, export_overwrite, node {document_id, workflow_id, node_id} | null, target {kind, type}, request_finish, read_ports, transport_uncertain, recovery_options, next_tools, internal_resume_available, user_action, release_refused, stopped_error {code, cause_code}, browser_recovery_stopped, recovery_receipt_id, reconciled, document_id, package_path`.
- Фаза шага в `step` — `pending_phase`; для T4 `execution` — `released_phase`, для T4 `export` — `read`. Так бюджет T4 делится с T1–T3 того же шага.
- `Basis`: `{trigger, reason_code, effect, operation_id, step, goal: {execution, output_schema, ports, file, saved_package}, idempotent_retry}`.

Правила (порядок проверки — T1, T3, T4, T2; первое совпадение):

| Основание | Условие |
| --- | --- |
| T1 | `state === "pending"`, `pending_phase !== null`, `release_refused.user_action` задан и `release_refused.phase === pending_phase` |
| T3 | `target.kind === "existing"`; фаза `P = pending_phase` и код `C = cause_code ?? error_code`; в `history` есть операция того же узла с `checkpoint_kind === "local_node_released"`, `released_phase === P` и `stopped_error` с тем же `C` |
| T4 `execution` | `checkpoint_kind === "local_node_released"`, `execution_status === "unknown"` |
| T4 `export` | `export_download_unconfirmed === true` |
| T4 `save` | `reconciled === true` (срез собран inspect после reconcile); `action_key` — `package.save_checkpoint` или `package.save_as`; `state === "pending"`; `status === "AMBIGUOUS"` |
| T2 | `node` задан; `state === "pending"`; `pending_phase !== null`; `recovery_options` пуст; в `next_tools` нет `dock_node_resume`, `dock_operation_recover`, `dock_artifact_verify`, `dock_artifact_delivery_resume`; `internal_resume_available !== true`; нет `user_action` |

Всегда `null`: `state === "running"`; `status === "NOT_APPLIED"` при `effect_possible === false`; `execution_status === "cancelled"`; `error_code === "LOGIN_REQUIRED"`; `transport_uncertain`; `capability === "artifact.upload"`; задан `browser_recovery_stopped` или `recovery_receipt_id`. Классификация требует только завершённого вызова; квитанцию `completed` с cleanup проверяет handoff (Task 3).

`goal`: `execution = request_finish === "execute"`; `output_schema = execution && target.type !== "exports.text"`; `ports = read_ports.length ? read_ports : [0]`; для `exports.text` — `file = execution`; для Save — `saved_package`. `idempotent_retry`: T4 `execution` или `exports.text` с `export_overwrite === "replace"`.

Решение по фактам:

| Шаг | `completed` | `unresolved` с повторным `finish` | `continuable` | иначе |
| --- | --- | --- | --- | --- |
| узел с `goal.execution` | workspace, execution, output_schema | workspace и execution, схема не прочитана | workspace | `unresolved` |
| узел без `goal.execution` | — | — | workspace | `unresolved` |
| `exports.text` | workspace, execution, export_file | — | workspace и `idempotent_retry` | `unresolved` |
| Save | saved_package | — | — | `unresolved` |

`next_step` формирует `settleBrowserRecovery` (Task 6), имеющий исходный request, тип узла и `attemptId`; pure decision его не вычисляет. Для `completed` узла — `dock_node_read` с `source_operation_id` квитанции, кроме `exports.text` (инструкция продолжать сценарий: файл уже проверен) и `programming.javascript` (инструкция: выполнение и схема проверены, данные выхода читаются только новой операцией над `existing`-узлом, потому что `dock_node_read` требует readback исходной процедуры, `node-read-contract.mjs:44-49`); для `completed` Save — инструкция продолжать и в конце сохранить пакет через Dock (`package.save_checkpoint`); для `continuable` — `next_step` освобождённой операции (`node-apply.mjs:504-510`: новая операция над `existing`-узлом с полными настройками). Для `unresolved` — инструкция с перечнем `missing`; при выполнении без схемы — «выполнение подтверждено, схема выхода не прочитана: не меняй узел, закрой посторонние окна и снова вызови finish».

- [x] **Step 1: Write the failing tests**

```js
const view = patch => ({ operation_id: 'apply', capability: 'node.apply', state: 'pending', status: 'AMBIGUOUS',
  effect_possible: true, error_code: 'NODE_APPLY_STOPPED', cause_code: 'UI_SCAN_LIMIT', pending_phase: 'configure',
  node: { document_id: 'doc', workflow_id: 'wf', node_id: 'n1' }, target: { kind: 'new', type: 'transform.calculator' },
  request_finish: 'execute', read_ports: [], transport_uncertain: false, recovery_options: [], next_tools: [], ...patch });

test('T1 is offered for a refused release that names a user action', () => {
  const basis = classifyBrowserRecovery(view({ recovery_options: ['abandon_operation'], next_tools: ['dock_operation_recover'],
    release_refused: { user_action: 'Ask the user', phase: 'configure' } }));
  assert.equal(basis.trigger, 'T1'); assert.equal(basis.reason_code, 'NODE_RELEASE_REFUSED');
  assert.deepEqual(basis.step, { kind: 'node', document_id: 'doc', workflow_id: 'wf', node_id: 'n1', phase: 'configure' });
  assert.deepEqual(basis.goal, { execution: true, output_schema: true, ports: [0], file: false, saved_package: false });
});
test('T2 needs a known pending node without any standard continuation', () => {
  assert.equal(classifyBrowserRecovery(view()).reason_code, 'NO_RECOVERY_OPTIONS');
  for (const patch of [{ transport_uncertain: true }, { recovery_options: ['abandon_operation'] }, { user_action: 'Ask the user' },
    { next_tools: ['dock_node_resume'] }, { next_tools: ['dock_artifact_verify'] }, { node: null }, { pending_phase: null },
    { internal_resume_available: true }])
    assert.equal(classifyBrowserRecovery(view(patch)), null, JSON.stringify(patch));
});
test('T3 matches the same node, phase and stop code after a released operation', () => {
  const released = view({ operation_id: 'first', state: 'settled', status: 'FAILED', checkpoint_kind: 'local_node_released',
    released_phase: 'configure', pending_phase: null, stopped_error: { code: 'NODE_APPLY_STOPPED', cause_code: 'UI_SCAN_LIMIT' } });
  const again = view({ operation_id: 'second', target: { kind: 'existing', type: 'transform.calculator' },
    recovery_options: ['abandon_operation'], next_tools: ['dock_operation_recover'] });
  assert.equal(classifyBrowserRecovery(again, [released]).reason_code, 'REPEATED_PHASE_FAILURE');
  assert.equal(classifyBrowserRecovery({ ...again, cause_code: 'WIZARD_OPEN_NOT_CONFIRMED' }, [released]), null);
});
test('T4 covers an unknown execution, an unconfirmed download and a save left ambiguous by inspect', () => {
  const settled = { state: 'settled', status: 'FAILED', pending_phase: null };
  assert.equal(classifyBrowserRecovery(view({ ...settled, checkpoint_kind: 'local_node_released', released_phase: 'execute',
    execution_status: 'unknown' })).effect, 'execution');
  const exported = classifyBrowserRecovery(view({ ...settled, export_download_unconfirmed: true,
    target: { kind: 'existing', type: 'exports.text' }, export_overwrite: 'replace' }));
  assert.deepEqual([exported.effect, exported.idempotent_retry], ['export', true]);
  const save = view({ capability: null, action_key: 'package.save_checkpoint', node: null, document_id: 'doc', package_path: '/user/a.lgp' });
  assert.equal(classifyBrowserRecovery(save), null);
  const reconciled = classifyBrowserRecovery({ ...save, reconciled: true });
  assert.deepEqual([reconciled.effect, reconciled.step], ['save', { kind: 'save', document_id: 'doc', package_path: '/user/a.lgp', phase: 'save' }]);
});
test('non-triggers, uploads and closed attempts never produce a basis', () => {
  for (const patch of [{ state: 'settled', status: 'NOT_APPLIED', effect_possible: false }, { state: 'running' },
    { execution_status: 'cancelled' }, { error_code: 'LOGIN_REQUIRED' }, { capability: 'artifact.upload' },
    { browser_recovery_stopped: 'br-1' }, { recovery_receipt_id: 'br-1:receipt' }])
    assert.equal(classifyBrowserRecovery(view(patch)), null, JSON.stringify(patch));
});
test('step identity ignores operation ids', () => {
  assert.equal(browserRecoveryStepKey(classifyBrowserRecovery(view({ operation_id: 'other' })).step), 'node:doc:wf:n1:configure');
});
test('verification result follows the step goal and verified facts', () => {
  const yes = { verified: true }, no = { verified: false, reason: 'x' };
  const node = { step: { kind: 'node' }, goal: { execution: true, output_schema: true, ports: [0] } };
  assert.equal(decideBrowserRecovery(node, { workspace: yes, execution: yes, output_schema: yes }).result, 'completed');
  assert.equal(decideBrowserRecovery(node, { workspace: yes, execution: yes, output_schema: no }).result, 'unresolved');
  assert.equal(decideBrowserRecovery(node, { workspace: yes, execution: no, output_schema: no }).result, 'continuable');
  assert.equal(decideBrowserRecovery(node, { workspace: no }).result, 'unresolved');
  assert.equal(decideBrowserRecovery({ step: { kind: 'node' }, goal: { execution: false } }, { workspace: yes }).result, 'continuable');
  const exported = { step: { kind: 'node' }, goal: { execution: true, file: true }, idempotent_retry: false };
  assert.equal(decideBrowserRecovery(exported, { workspace: yes, execution: yes, export_file: no }).result, 'unresolved');
  assert.equal(decideBrowserRecovery({ ...exported, idempotent_retry: true }, { workspace: yes, execution: yes, export_file: no }).result, 'continuable');
  assert.equal(decideBrowserRecovery({ step: { kind: 'save' }, goal: { saved_package: true } }, { saved_package: { verified: true, modified: false } }).result, 'completed');
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd packages/loginom-runtime/client && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser-recovery-basis.test.mjs`
Expected: FAIL — модуль отсутствует.

- [x] **Step 3: Implement the module per the tables**

- [x] **Step 4: Run tests to verify they pass** (команда Step 2; Expected: PASS)

- [x] **Step 5: Commit**

```bash
git add packages/loginom-runtime/client/lib/browser-recovery-basis.mjs packages/loginom-runtime/client/test/browser-recovery-basis.test.mjs
git commit -m "feat(runtime): classify browser recovery triggers and decide results"
```

Дополнительное поведение Task 1: при одинаковых успешных фактах тип узла не влияет на pure decision; next_step проверяется через executor в Task 6.

### Task 2: Executor выдаёт основание

**Files:**
- Modify: `packages/loginom-runtime/client/lib/executor.mjs` — опция `createActionRuntime` (1460–1462); `releaseApply` (1819–1849); `recoveryAdvice`/`view` (1850–1931); `inspect` (1942–…); итог `runNodeApply` (2601–2627); множества `readOnly`/`nodeControls` (2723–2724)
- Modify: `packages/loginom-runtime/client/lib/user-results.mjs:82-86,121-135`
- Create: `packages/loginom-runtime/client/test/support/stopped-node-fixture.mjs` (перенести `request`, `fixture`, `proved`, `stop` из `node-pending-release.test.mjs:83-112`)
- Create: `packages/loginom-runtime/client/test/browser-recovery-executor.test.mjs`
- Test: `packages/loginom-runtime/client/test/node-pending-release.test.mjs`, `packages/loginom-runtime/client/test/user-results.test.mjs`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `createActionRuntime({..., browserRecovery})`: `undefined` — выключено; иначе `{remaining(stepKey) → {calls_remaining, ms_remaining}}` (бюджет держит bridge, план 3).
  - `runtime.browserRecoveryBasis(operationId) → (Basis & {input}) | null` — основание названной операции (`start` всегда передаёт `operation_id` из `next_step`). `input` — вход в восстановление из раздела 7 дизайна: `original_operation_id, request, document_id, workflow_ref, node, package_path, phase, confirmed_phases, possible_effects, used_recovery, goal`. Сериализованный `request` длиннее 16384 байт опускается с `request_omitted: true`.
  - Поле `browser_recovery: {basis, next_step}`: в `output` отказа `operation.recover` с `NODE_RELEASE_REFUSED`, в `output` inspect и в `outcome.output` узловых исходов. Исход Save основания не несёт: T4 `save` появляется только в inspect после reconcile. При опции и основании `output.user_action` не возвращается.
  - Состояние операции: `operation.releaseRefused = {user_action, phase}` только для текущей pending-фазы; после её успешного освобождения или продвижения отказ очищается; `operation.stoppedError = {code, cause_code}` — сохраняется в `runNodeApply` из остановленного исхода (`error.code`, `error.cause.code`) до перезаписи при освобождении; `operation.usedRecovery: string[]`. У Save `operation.browserRecoveryReconciled` относится к текущему исходу: выставляется после завершённого inspect/reconcile, сбрасывается при изменении исхода или новом browser-действии этой операции; полного кэша Basis нет.
  - `compactNodeResult` и `compactActionResult` ставят `browser_recovery.next_step` первым `next_step`.
  - Журнал: `browser_recovery_basis` один раз на пару (операция, триггер).
  - `browserRecoveryBasis` и `browserRecoveryHandoff` (Task 3) входят в `readOnly`: они не мутируют и вызываются при занятом executor.

Источники полей среза, которых нет в исходе напрямую:

| Поле | Источник |
| --- | --- |
| `release_refused` | `operation.releaseRefused`; ставит `releaseApply` при `NodeReleaseBlocked` |
| `stopped_error` | `operation.stoppedError` |
| `released_phase`, `checkpoint_kind`, `execution_status` | `operation.outcome.output` после `releaseNodeApply` (`node-apply.mjs:477-516`) |
| `next_tools`, `internal_resume_available` | `recoveryAdvice(operation)`: `next_steps.map(step => step.tool)` и одноимённый флаг |
| `export_download_unconfirmed` | `Boolean(operation.nodeApply.export_download_refusal)` (`node-apply.mjs:213-217`); исход и журнал не меняются |
| `reconciled` | `operation.browserRecoveryReconciled` для текущего Save-исхода; inspect ставит после `reconcilePending`, последующий `browserRecoveryBasis(id)` читает тот же факт без повторного UI-прохода |
| `read_ports` | `operation.nodeApply.request.read.ports` |
| `document_id`, `package_path` (Save) | `getStorageBinding().document_id`, путь из параметров Save |

- [x] **Step 1: Write the failing tests**

В `browser-recovery-executor.test.mjs` — фикстура `fixture({release, browserRecovery})` из `support/stopped-node-fixture.mjs`, `full = { remaining: () => ({ calls_remaining: 30, ms_remaining: 600000 }) }`, `refuse` — драйвер освобождения из `node-pending-release.test.mjs:145`, который бросает `NodeReleaseBlocked(..., 'Ask the user to close it with Cancel.')`:

```js
test('refused release offers browser recovery instead of a user action when enabled', async () => {
  const f = fixture({ release: refuse, browserRecovery: full }); await stop(f, 'finish');
  const refused = await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  assert.equal(refused.error.code, 'NODE_RELEASE_REFUSED'); assert.equal(refused.output.user_action, undefined);
  assert.deepEqual(refused.output.browser_recovery.next_step.arguments, { action: 'start', operation_id: 'apply' });
  assert.equal(refused.output.browser_recovery.next_step.trigger, 'T1');
  assert.equal(f.events.filter(e => e.phase === 'browser_recovery_basis').length, 1);
});
test('without the option the refusal still names the user action', async () => {
  const f = fixture({ release: refuse }); await stop(f, 'finish');
  const refused = await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  assert.equal(refused.output.user_action, 'Ask the user to close it with Cancel.'); assert.equal(refused.output.browser_recovery, undefined);
});
test('inspect of a stopped phase without a release driver offers T2', async () => {
  const f = fixture({ browserRecovery: full }); await stop(f, 'finish');
  const view = (await f.runtime.inspect({ operationId: 'apply' })).output;
  assert.deepEqual(view.recovery_options, []); assert.equal(view.browser_recovery.next_step.trigger, 'T2');
});
test('the same phase failing with the same cause on the existing node offers T3', async () => {
  const f = fixture({ release: proved(), browserRecovery: full });
  await stop(f, 'finish', { cause: 'UI_SCAN_LIMIT' });
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  const again = await stop(f, 'finish', { cause: 'UI_SCAN_LIMIT', operationId: 'again', target: { kind: 'existing', type: 'imports.text', ref: node } });
  assert.equal(again.outcome.output.browser_recovery.next_step.trigger, 'T3');
  assert.equal(browserRecoveryStepKey(again.outcome.output.browser_recovery.basis.step),
    browserRecoveryStepKey({ kind: 'node', ...node, phase: 'finish' }));
});
test('a release from a launch phase offers T4 for the unknown execution', async () => {
  const f = fixture({ release: proved(), browserRecovery: full }); await stop(f, 'finish');   // request().finish === 'execute'
  const released = await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  assert.equal(released.output.original_outcome.output.execution.status, 'unknown');
  assert.equal(released.output.original_outcome.output.browser_recovery.next_step.effect, 'execution');
});
test('an exhausted step budget leaves an instruction without a tool', async () => {
  const f = fixture({ browserRecovery: { remaining: () => ({ calls_remaining: 0, ms_remaining: 120000 }) } }); await stop(f, 'finish');
  const next = (await f.runtime.inspect({ operationId: 'apply' })).output.browser_recovery.next_step;
  assert.equal(next.tool, undefined); assert.match(next.instruction, /budget/i);
});
```

Дополнительные регрессии: refused release → successful release с unknown execution даёт T4 со старой released_phase и тем же step key; после установленного результата старый T1 не предлагается. Inspect неоднозначного Save → последующий browserRecoveryBasis(id) возвращает тот же Save step, до inspect основания нет.

`stop(f, phase, {cause, operationId, target})` в переносимой фикстуре расширяется: драйвер бросает ошибку с `receipt: {error: {code: cause, message: cause}}`, чтобы исход получил `error.cause.code`.

В `user-results.test.mjs`:

```js
test('user-v1 replies put the browser recovery next_step first', () => {
  const next = { tool: 'dock_browser_recovery' };
  assert.equal(compactNodeResult({ operation_id: 'apply', state: 'settled', outcome: { status: 'AMBIGUOUS',
    output: { next_step: { tool: 'dock_operation_inspect' }, browser_recovery: { next_step: next } } } }).next_step.tool, 'dock_browser_recovery');
  assert.equal(compactActionResult({ status: 'AMBIGUOUS', action_key: 'operation.recover', output: { browser_recovery: { next_step: next } } }).next_step.tool, 'dock_browser_recovery');
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd packages/loginom-runtime/client && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser-recovery-executor.test.mjs test/user-results.test.mjs test/node-pending-release.test.mjs`
Expected: FAIL в новых тестах; перенос фикстуры оставляет `node-pending-release.test.mjs` зелёным.

- [x] **Step 3: Implement**

Срез строится одной функцией executor по таблице источников. `history` — прочие узловые операции из `operations`. Основание пересчитывается при каждом ответе, а не хранится: T1 опирается только на актуальный `operation.releaseRefused`. Основание исторической операции не выдаётся при чужой незавершённой работе; handoff повторно проверяет это после ожидания (Task 3).

- [x] **Step 4: Run tests to verify they pass**

Run: команда Step 2 и весь набор `bun run test:upstream`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/loginom-runtime/client
git commit -m "feat(runtime): offer browser recovery as a structured next step"
```

### Task 3: Доказательство остановки исполнителя (handoff)

**Files:**
- Modify: `packages/loginom-runtime/client/lib/executor.mjs` (новый метод `runtime`; `readReceipt` 1576–1591)
- Modify: `packages/loginom-runtime/client/test/support/stopped-node-fixture.mjs` (параметр ответа `readReceipt` по образцу `stopped()` в `node-pending-release.test.mjs:32-36`)
- Test: `packages/loginom-runtime/client/test/browser-recovery-executor.test.mjs`

**Interfaces:**
- Produces: `runtime.browserRecoveryHandoff(operationId, {signal, pollMs = 250}) → Promise<{verified: true, receipt_id: string, waited_ms: number} | {verified: false, reason: 'EXECUTOR_STILL_RUNNING'|'RECEIPT_UNSETTLED'|'RECEIPT_MISSING'|'RECEIPT_IDENTITY_MISMATCH'|'UNRELATED_UNSETTLED_WORK'}>`.
- Поведение: ждёт, пока `running`, `nodeJobs.busy`, `sourceReads.busy`, `delivery.busy` не станут ложными, но не дольше `min(operation.deadline - now(), BROWSER_RECOVERY_HANDOFF_MS)`: живой executor дольше минуты после остановки фазы — аномалия, и попытка честно уходит в `stopped`. Затем читает `operation.lastReceipt` (даже при ложном `transportUncertain`) и требует `state === "completed"` и `receipt.cleanup_complete === true`. Без квитанции — `RECEIPT_MISSING` (дизайн, §6: иначе `stopped`). До ожидания и перед успешным возвратом метод сверяет существующее владение pending/node/source/delivery работой: неопределённая работа другой операции даёт `UNRELATED_UNSETTLED_WORK`, даже если старая квитанция выбранной операции завершена. Метод ничего не отменяет и не прерывает. Журнал — `browser_recovery_handoff` с результатом.

- [x] **Step 1: Write the failing tests**

```js
test('handoff waits for the running browser call and never aborts it', async () => {
  // execute фикстуры завершается через 200 мс; handoff стартует во время вызова
  const proof = await f.runtime.browserRecoveryHandoff('apply', { pollMs: 10 });
  assert.equal(proof.verified, true); assert.equal(abortSeen, false);
});
test('a sent abort or an expired transport timeout is not proof that the executor stopped', async () => {
  // transportUncertain и квитанция state:'running' до истечения срока
  assert.deepEqual(await f.runtime.browserRecoveryHandoff('apply', { pollMs: 10 }), { verified: false, reason: 'RECEIPT_UNSETTLED' });
});
test('handoff waits no longer than the original deadline or one minute', async () => {
  // поддельные часы: до срока исходной операции 10 минут; квитанция всегда state:'running'
  const proof = await f.runtime.browserRecoveryHandoff('apply', { pollMs: 50 });
  assert.equal(proof.reason, 'RECEIPT_UNSETTLED'); assert.ok(clock.elapsed() <= 60050);
});
test('an operation without a browser receipt is not handed off', async () => {
  // operation.lastReceipt отсутствует
  assert.deepEqual(await f.runtime.browserRecoveryHandoff('apply', { pollMs: 10 }), { verified: false, reason: 'RECEIPT_MISSING' });
});
```

- [x] **Step 2: Run tests to verify they fail** (`--test test/browser-recovery-executor.test.mjs`; Expected: FAIL — метода нет)

- [x] **Step 3: Implement** `browserRecoveryHandoff` по описанию Interfaces.

- [x] **Step 4: Run tests to verify they pass** (Expected: PASS)

- [x] **Step 5: Commit**

```bash
git add packages/loginom-runtime/client
git commit -m "feat(runtime): prove executor stop before browser handoff"
```

Дополнительная регрессия Task 3: released/T4 операция A, затем pending B после неподтверждённого browser-вызова — handoff A не допускает браузер; outcome и gate B сохранены.

### Task 4: Строительные блоки проверки

**Files:**
- Modify: `packages/loginom-runtime/client/lib/node-pending-release.mjs:51-66` (вынести `proveNodeRestsQuiet`)
- Modify: `packages/loginom-runtime/client/lib/node-procedure.mjs:64` (метод канала `rememberExecutionBaseline`)
- Modify: `packages/loginom-runtime/client/lib/node-execution-procedure.mjs:79-80,123-170` (опция `baseline`, метод `verifyCompletion`, вызов `rememberExecutionBaseline` в `prepare`)
- Modify: `packages/loginom-runtime/client/lib/collapse-native-output.mjs:24-56` (номер выходного порта)
- Create: `packages/loginom-runtime/client/test/native-preview-port.test.mjs`
- Test: `packages/loginom-runtime/client/test/node-pending-release.test.mjs`, `packages/loginom-runtime/client/test/node-procedure.test.mjs`, `packages/loginom-runtime/client/test/node-execution-stop.test.mjs`

**Interfaces:**
- Produces:
  - `proveNodeRestsQuiet({operation, channel, node}) → Promise<{verified: true, node_context, graph}>` — проверка строк 51–66: тот же разблокированный узел на тихом графе без мастера, диалога и маски, два одинаковых чтения графа. Жестов нет; при отказе бросает. `releasePendingNode` вызывает её вместо собственного кода. `readReleaseGraph` читает у `operation` поля `nodeApply.request`, `nodeTargetAdapter` и `deadline` (стр. 87–89).
  - `channel.rememberExecutionBaseline(baseline)` сохраняет копию в `operation.nodeApply.execution_baseline`, если у операции есть `nodeApply`; событий журнала нет. `createNodeExecutionProcedure().prepare()` вызывает его сразу после `captureExecutionBaseline`.
  - `createNodeExecutionProcedure(channel, node, {baseline})` принимает сохранённую базовую линию; `prepare()` при ней отказывает.
  - `procedure.verifyCompletion({signal}) → Promise<{verified: true, execution_id, ...receipt} | {verified: false, reason: 'NO_NEW_EXECUTION'|'AMBIGUOUS_EXECUTION'|string}>` — открывает консоль и читает историю один раз. Ровно одна новая группа относительно базовой линии — существующие `identifyNewExecution` и `waitCompleted` (Show Node, закрытие консоли, возврат на граф). Нет новой группы или их больше одной — консоль закрывается, возвращается отказ. `waitCompleted()` может вернуть `verified: true, status: "failed"`: это проверенный неуспех, а не выполненная цель. `verifyCompletion` нормализует `verified: true` только для `status === "completed"` с существующим owner proof; failed-квитанция сохраняется в факте с `verified: false` и причиной `EXECUTION_FAILED`. Прежнее поведение `waitCompleted` не меняется. Исключение даёт `verified: false` с его сообщением.
  - `openOwnedNativePreview(channel, ctx, index = 0)`: `activeNativeOutput` выбирает порт с этим публичным индексом (`node_outputs.ports[].index`), ожидание схемы и `closeOwnedNativePreview` сверяют `node_preview_schema.port` с `port.index`. По умолчанию — порт 0; чтение «Свёртки» не меняется.

- [x] **Step 1: Write the failing tests**

```js
test('quiet-node proof reads twice and performs no gesture', async () => {
  const s = surface({ wizard: true });     // surface() и stopped() — помощники node-pending-release.test.mjs:18-35
  await assert.rejects(proveNodeRestsQuiet({ operation: stopped(), channel: s.channel, node }));
  assert.deepEqual(s.gestures, []);       // открытый мастер не закрывается, в отличие от releasePendingNode
  const quiet = surface(), proof = await proveNodeRestsQuiet({ operation: stopped(), channel: quiet.channel, node });
  assert.equal(proof.verified, true); assert.deepEqual(quiet.gestures, []);
});
test('execution preparation keeps its baseline on the node operation without journal events', async () => {
  await createNodeExecutionProcedure(channel, node).prepare();     // канал из createNodeProcedure над фиктивной операцией
  assert.equal(typeof operation.nodeApply.execution_baseline.root_id, 'string');
  assert.equal(events.some(event => event.phase?.startsWith('browser_recovery_')), false); // без опции новых recovery events нет
});
test('an adopted baseline proves one new completed group and closes the console otherwise', async () => {
  // поверхность консоли из node-execution-stop.test.mjs: базовая линия, затем одна новая завершённая группа узла
  const adopted = createNodeExecutionProcedure(channel, node, { baseline });
  await assert.rejects(adopted.prepare(), /already been captured/);
  assert.equal((await adopted.verifyCompletion()).verified, true);
  const none = createNodeExecutionProcedure(emptyChannel, node, { baseline });   // новых групп нет
  assert.deepEqual(await none.verifyCompletion(), { verified: false, reason: 'NO_NEW_EXECUTION' });
  assert.equal(emptySurface.consoleOpen, false);
});
```

Дополнительная регрессия Task 4: новая failed-группа с реальной формой receipt от waitCompleted, даже при доступном старом Preview, не даёт completed.

В `native-preview-port.test.mjs` — фиктивный канал с наблюдениями `node_outputs` двух активных выходов и `node_preview_schema`, который записывает жесты:

```js
test('Preview opens and closes the requested output port', async () => {
  const handle = await openOwnedNativePreview(channel, ctx, 1);
  assert.equal(handle.port.index, 1); assert.equal(handle.preview.port, 1);
  assert.equal((await closeOwnedNativePreview(channel, ctx, handle.port, handle.preview.root_tid)).preview_closed, true);
  // Поверхность подтверждает выбор/закрытие порта 1; чужой порт не выбран.
});
```

- [x] **Step 2: Run tests to verify they fail** (`--test test/node-pending-release.test.mjs test/node-procedure.test.mjs test/node-execution-stop.test.mjs test/native-preview-port.test.mjs`; Expected: FAIL — функций и параметров нет)

- [x] **Step 3: Implement**; существующие тесты освобождения, выполнения и чтения «Свёртки» остаются зелёными без изменений.

- [x] **Step 4: Run tests to verify they pass** (команда Step 2 и `bun run test:upstream`; Expected: PASS)

- [x] **Step 5: Commit**

```bash
git add packages/loginom-runtime/client
git commit -m "refactor(runtime): share quiet proof, keep execution baseline, open Preview by port"
```

### Task 5: Общая проверка шага

**Files:**
- Modify: `packages/loginom-runtime/client/lib/executor.mjs` (метод `verifyBrowserRecovery` и канал проверки)
- Test: `packages/loginom-runtime/client/test/browser-recovery-executor.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `runtime.verifyBrowserRecovery(operationId, {attemptId, sequence}) → Promise<{basis, facts, decision, verification_id, unconfirmed: boolean}>`. Сигнал отмены в метод не передаётся: проверка завершается в собственном сроке.
- Операция проверки `verification`: `id: attemptId + ':v' + sequence`, `action: {action_key: 'browser.recovery.verify', revision: '1'}`, `checkpoint: {document_id, workflow_ref}`, `nodeApply: {request}` исходной операции, `nodeTargetAdapter: targetAdapter(verification)` (`executor.mjs:1662`), `deadline: now() + BROWSER_RECOVERY_VERIFY_MS`. Канал — `createNodeProcedure({operation: verification, execute, record: onRecord, targetOrigin, targetBuild, preparedNodeContext: {document_id, workflow_ref, node}, maxSteps: 4096, wrapMutation})`, где `wrapMutation` — `withBrowserReceipt` с `receiptOptions(verification, …)`, как у канала чтения JS-источника (`executor.mjs:2001-2011`). Каждый `finish` даёт новую идентичность `<attempt_id>:v<k>`, поэтому квитанции, шаги канала и идентификаторы чтения экспорта не сталкиваются.
- Fixed plain-object readers выполняются через локальный typed transport по существующему образцу `executeNodeScript`/`executeSourceScript`: browser-код возвращает ActionOutcome с `output.value`, реальный `execute`/`parseCapabilityResult` валидирует envelope, adapter извлекает value. Канал и reader получают согласованный execute; нового browser API нет. Для `parseSavedPackageState` из raw value собирается ожидаемый MCP text envelope, без повторного browser-вызова.
- Transport проверки отказывает до dispatch при остатке меньше 5000 мс: это сохраняет минимум чтения node-observe и общий deadline без распознавания кода или нового API. Цена — менее 5 секунд (2,084%) окна, включая Save. Одна локальная подготовленная receipt переносится в `lastReceipt` только перед реальным execute; ранний отказ сохраняет прежнюю dispatched receipt и не создаёт ложный `unconfirmed`. Неизвестная dispatched receipt запрещает следующий жест до подтверждения. Ответ после deadline не становится проверенным фактом.
- Verification использует существующее владение executor: после проверки отсутствия чужой работы её operation регистрируется и удерживает pending gate до обработки результата в settle и подтверждённой записи recovery-квитанции. Установленные browser-квитанции сами gate не снимают. Ссылка на исходное владение сохраняется; при `completed`/`continuable` gate снимается или передаётся только после ACK Task 6. При `unresolved`, неизвестном browser-исходе или отказе ACK gate сохраняется, в том числе для уже released T4. Следующий finish той же попытки заменяет завершённую verification новой `<attempt>:v<k>`, распознавая владение той же исходной операцией и не снимая её pending; старую неопределённую проверку заменять нельзя. Освобождение исходной операции не снимает gate проверки, кроме явно остановленной попытки с завершённой подтверждённой verification по безопасному release proof и durable release ACK из Task 6. Отдельного реестра, стека snapshots или lock-системы нет: используются уже предусмотренный объект проверки и одна ссылка на прежнее владение.
- Порядок для узла: `workspace` → `execution` → `output_schema` (только если выполнение проверено) → повторный `workspace`, итоговое состояние после проходов. Если первый `workspace` не проверен, проходов нет.
- `facts`:

| Факт | Чем | Жесты |
| --- | --- | --- |
| `workspace` | `proveNodeRestsQuiet` с операцией проверки, до и после проходов; отказ — `verified: false` без `user_action` | нет |
| `execution` | `createNodeExecutionProcedure(channel, node, {baseline: operation.nodeApply.execution_baseline}).verifyCompletion()`; без базовой линии — `reason: 'NO_BASELINE'` | консоль процессов, Show Node |
| `output_schema` | для каждого порта `goal.ports`: `openOwnedNativePreview(channel, ctx, port)` → схема из ответа → `closeOwnedNativePreview` | Preview |
| `export_file` | `readNativeExportFile(options, ctx, {destination, configured: {destination_check}}, execution)` (`text-export-output.mjs:123`): `destination` — из параметров запроса, `destination_check` — из значения фазы `configure` исходной операции (как в `text-export-node.mjs:16`), `execution` — проверенный факт; options используют существующий `artifactStore`, receiptOptions именно verification и `storageDirectories: getStorageBinding().directories`, ctx содержит `deadline: verification.deadline` и `execution: facts.execution`, подтверждённый этим проходом; исходными остаются document/workflow/node и настройки назначения. Успешный возврат reader преобразуется в `facts.export_file: {verified: true, ...result}`, исключение — `verified: false` с причиной. Без проверки назначения файл не проверяется: при `replace` шаг получает `continuable`, при `reject` — `unresolved` | File Storage, скачивание |
| `saved_package` | `makeSavedPackageStateCode`/`parseSavedPackageState` с `sessionId`, `documentId`, `account`, `loginomUrl`, `loginomBuild` из `getStorageBinding()` (`session_id`, `document_id`, `loginom_account`, `origin`, `loginom_build`) и путём из параметров Save; требуется тот же путь и `modified === false` | нет |

- Ошибка прохода оставляет факт `verified: false` с причиной; жесты не повторяются.
- Если проверка делала жесты (`verification.lastReceipt` задан), метод перед возвратом сверяет эту квитанцию. Не `completed` с cleanup — `unconfirmed: true`: решение не применяется, `hasUnsettledWork()` остаётся истинным. Без жестов (нетихий граф, проверка Save) `unconfirmed: false`.

- [x] **Step 1: Write the failing tests**

Поверхность фикстуры — консоль и Preview из Task 4; базовая линия хранится в `operation.nodeApply.execution_baseline`.

```js
test('an executed step is completed only with its verified schema', async () => {
  // одна новая завершённая группа узла, Preview порта 0 с полями
  const { facts, decision } = await f.runtime.verifyBrowserRecovery('apply', { attemptId: 'br-1', sequence: 1 });
  assert.deepEqual([facts.execution.verified, facts.output_schema.verified, decision.result], [true, true, 'completed']);
});
test('an executed step whose Preview did not open stays unresolved', async () => {
  // Preview не становится видимым
  const { facts, decision } = await f.runtime.verifyBrowserRecovery('apply', { attemptId: 'br-1', sequence: 1 });
  assert.deepEqual([facts.execution.verified, facts.output_schema.verified, decision.result], [true, false, 'unresolved']);
});
test('an older execution group never completes a step', async () => {
  // новейшая завершённая группа уже входит в базовую линию
  const { facts, decision } = await f.runtime.verifyBrowserRecovery('apply', { attemptId: 'br-1', sequence: 1 });
  assert.deepEqual([facts.execution.reason, decision.result], ['NO_NEW_EXECUTION', 'continuable']);
});
test('an unconfirmed verification gesture never applies the decision', async () => {
  // транспорт жеста открытия Preview падает
  const verified = await f.runtime.verifyBrowserRecovery('apply', { attemptId: 'br-1', sequence: 1 });
  assert.equal(verified.unconfirmed, true); assert.equal(f.runtime.hasUnsettledWork(), true);
});
test('a verification without gestures is never treated as unconfirmed', async () => {
  // мастер открыт: первый workspace не проверен, проходов нет
  const busy = await f.runtime.verifyBrowserRecovery('apply', { attemptId: 'br-1', sequence: 1 });
  assert.deepEqual([busy.unconfirmed, busy.decision.result], [false, 'unresolved']);
  // Save: состояние сохранённого пакета modified false по тому же пути
  const saved = await s.runtime.verifyBrowserRecovery('save-1', { attemptId: 'br-2', sequence: 1 });
  assert.deepEqual([saved.unconfirmed, saved.decision.result], [false, 'completed']);
});
test('repeated verification uses a new identity and never calls the failed drivers', async () => {
  const before = [...f.calls];
  const first = await f.runtime.verifyBrowserRecovery('apply', { attemptId: 'br-1', sequence: 1 });
  const second = await f.runtime.verifyBrowserRecovery('apply', { attemptId: 'br-1', sequence: 2 });
  assert.deepEqual(f.calls, before); assert.deepEqual([first.verification_id, second.verification_id], ['br-1:v1', 'br-1:v2']);
});
test('an export file that existed before without replace is not fresh', async () => {
  // исходная exports.text: destination_check.existed === true, overwrite 'reject'
  const { facts, decision } = await f.runtime.verifyBrowserRecovery('export', { attemptId: 'br-1', sequence: 1 });
  assert.deepEqual([facts.export_file.verified, decision.result], [false, 'unresolved']);
});
```

- [x] **Step 2: Run tests to verify they fail** (`--test test/browser-recovery-executor.test.mjs`; Expected: FAIL)

- [x] **Step 3: Implement** метод и канал проверки по Interfaces.

- [x] **Step 4: Run tests to verify they pass** (команда Step 2 и `bun run test:upstream`; Expected: PASS)

- [x] **Step 5: Commit**

```bash
git add packages/loginom-runtime/client
git commit -m "feat(runtime): verify a recovered step with runtime console and Preview passes"
```

Дополнительные регрессии Task 5: Save/export читатели проходят реальный typed/MCP transport format через parseCapabilityResult; plain object не принимается вместо ActionOutcome. Начать с действительно released T4 без других locks, потерять подтверждение жеста verification: hasUnsettledWork остаётся true, обычная мутация и освобождение старой операции не дают unlock.

### Task 6: Recovery-квитанция, снятие блокировки, чтение выхода, остановка

**Files:**
- Modify: `packages/loginom-runtime/client/lib/executor.mjs` (методы `settleBrowserRecovery`, `markBrowserRecoveryStopped`, `browserRecoverySafeCompletion`; `releaseApply` для остановленной попытки)
- Modify: `packages/loginom-runtime/client/lib/node-read-contract.mjs:39-71`
- Modify: `packages/loginom-runtime/client/lib/user-results.mjs:60-95`
- Test: `packages/loginom-runtime/client/test/browser-recovery-executor.test.mjs`, `packages/loginom-runtime/client/test/node-read.test.mjs`, `packages/loginom-runtime/client/test/user-results.test.mjs`
- Docs: `packages/loginom-runtime/AGENTS.md` (один пункт о квитанции и снятии блокировки)

**Interfaces:**
- Consumes: Task 5.
- Produces:
  - `runtime.settleBrowserRecovery(operationId, {attemptId, decision, facts, attested}) → Promise<{receipt_id, result, next_step} | {result: 'unresolved', next_step} | {result: 'unresolved', error: {code: 'RECOVERY_RECEIPT_UNCONFIRMED'}}>`.
  - Порядок: запись `browser_recovery_verified` с проверкой подтверждения журнала, как в `releaseNodeApply` (`node-apply.mjs:511-514`) → только при `completed`/`continuable` квитанция `<attemptId>:receipt` в `operations` и снятие блокировки → `observations.clear()`. При `unresolved` квитанции нет и блокировка остаётся.
  - Квитанция: `action: {action_key: 'browser.recovery', capability: 'browser.recovery', revision: '1'}`, `parameters: {original_operation_id, contract_revision, workflow_ref, target}` из исходного запроса, `outcome.output: {checkpoint_kind: 'browser_recovery_verified', result, original_operation_id, node, execution, output: {ports}, verified, configuration: {status: 'attested_by_model', attested_by_model}, cleanup_complete: true}`.
  - Снятие для узла: исход `FAILED`, `checkpoint_kind: 'local_node_released'`, `released_phase` (фаза, которая была pending; по ней T3 узнаёт повтор), `released_by: 'browser_recovery'`, `recovery_receipt_id`; `pending` снимается только при владении исходной операции или её подтверждённой verification; `nodeJobs.settle` затрагивает только исходную операцию. Уже освобождённая Dock операция (T4 `execution`) получает только `recovery_receipt_id`. `outcome.error` исходной операции и `stoppedError` сохраняются; вложенный released `output.error` имеет `NODE_OPERATION_RELEASED` с исходной причиной. Для Save снимается только собственный pending, исход получает `browser_recovery: {receipt_id, result}`.
  - `runtime.markBrowserRecoveryStopped(operationId, attemptId)` задаёт `operation.browserRecoveryStopped`; основание этой операции больше не предлагается. Отказ освобождения такой операции не возвращает `user_action`, а несёт `instruction`: сообщить операцию, фазу и причину отказа, не перекладывая исправление интерфейса на пользователя.
  - `runtime.browserRecoverySafeCompletion(operationId) → next_step` — `nodeReleaseStep(operation)` (`executor.mjs:1812-1814`), если он есть и нет незавершённой verification; при неизвестной квитанции проверки — только `{instruction}` о фактическом состоянии, без предложения освободить старую операцию. Иначе `{instruction}` сообщить фактическое состояние; используют ответы `stop` и автоматической остановки (план 3).
  - После `markBrowserRecoveryStopped` обычный `abandon_operation` может безопасно завершить исходную операцию при собственной завершённой подтверждённой verification той же попытки. Gate остаётся до существующих native release proof и durable `node_operation_released` ACK; снимается только своё владение. Это не recovery-квитанция и не успех unresolved-шага. Неизвестная verification, другая попытка и неостановленная попытка исключены; уже released T4 без pending-фазы остаётся instruction-only.
  - `markBrowserRecoveryStopped` и `browserRecoverySafeCompletion` входят в `readOnly` (`executor.mjs:2723`): браузер они не трогают и вызываются, даже когда handoff вернул `EXECUTOR_STILL_RUNNING`.
  - `buildNodeReadRequest(args, source)` принимает квитанцию, только если `checkpoint_kind === 'browser_recovery_verified'`, `result === 'completed'`, проверены `execution` и `output_schema`, `cleanup_complete`; схемы — из `verified.output_schema.ports`: native Preview `fields` проецируются в `{port, schema: [{index, name, label, type}]}` без выдуманных полей, исходные факты остаются в journal event. JavaScript и `exports.text` отклоняются, как и для обычной операции.
  - `compactNodeResult` переносит `released_by` и `recovery_receipt_id` в `output`: верхний уровень `userResultSchema` закрыт (`user-results.mjs:5-6`).

- [ ] **Step 1: Write the failing tests**

```js
test('the recovery receipt is journaled before the original operation is released', async () => {
  // onRecord фикстуры на событии browser_recovery_verified фиксирует hasUnsettledWork() === true
  const settled = await f.runtime.settleBrowserRecovery('apply', { attemptId: 'br-1', decision: continuable, facts, attested });
  assert.equal(settled.receipt_id, 'br-1:receipt'); assert.equal(f.runtime.hasUnsettledWork(), false);
  const original = f.runtime.nodeApplyStatus('apply').outcome.output;
  assert.equal(original.checkpoint_kind, 'local_node_released'); assert.equal(original.released_by, 'browser_recovery');
  assert.equal(original.recovery_receipt_id, 'br-1:receipt'); assert.equal(original.error.code, 'NODE_OPERATION_RELEASED');
});
test('an unresolved decision writes no receipt and keeps the lock', async () => {
  const settled = await f.runtime.settleBrowserRecovery('apply', { attemptId: 'br-1', decision: unresolved, facts, attested });
  assert.equal(settled.receipt_id, undefined); assert.equal(f.runtime.hasUnsettledWork(), true);
});
test('a failed receipt write keeps the lock and reports RECOVERY_RECEIPT_UNCONFIRMED', async () => {
  // onRecord бросает на phase 'browser_recovery_verified'
  const settled = await f.runtime.settleBrowserRecovery('apply', { attemptId: 'br-1', decision: continuable, facts, attested });
  assert.deepEqual([settled.result, settled.error.code], ['unresolved', 'RECOVERY_RECEIPT_UNCONFIRMED']);
  assert.equal(f.runtime.hasUnsettledWork(), true);
});
test('a stopped attempt is never offered again and its release refusal names no user action', async () => {
  const f = fixture({ release: refuse, browserRecovery: full }); await stop(f, 'finish');
  f.runtime.markBrowserRecoveryStopped('apply', 'br-1');
  assert.equal(f.runtime.browserRecoveryBasis('apply'), null);
  const refused = await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-2' });
  assert.equal(refused.output.user_action, undefined); assert.match(refused.output.instruction, /phase/i);
});
test('stopping works while a node job is busy', async () => {
  // фоновая узловая операция ещё выполняется
  f.runtime.markBrowserRecoveryStopped('apply', 'br-1');
  assert.ok(f.runtime.browserRecoverySafeCompletion('apply'));
});
test('the same phase failing again after a browser recovery release offers T3', async () => {
  // после settleBrowserRecovery с continuable: новая операция над existing-узлом останавливается в той же фазе с тем же кодом
  const again = await stop(f, 'finish', { cause: 'UI_SCAN_LIMIT', operationId: 'again', target: { kind: 'existing', type: 'imports.text', ref: node } });
  assert.equal(again.outcome.output.browser_recovery.next_step.trigger, 'T3');
});
test('exact retry of the original request returns its released outcome linked to the receipt', async () => {
  // после settleBrowserRecovery: startNodeApply(request()) с тем же operation_id
  const job = await f.runtime.waitNodeApply('apply', { timeoutMs: 0 });
  assert.equal(job.outcome.output.recovery_receipt_id, 'br-1:receipt');
  assert.equal(compactNodeResult(job).output.recovery_receipt_id, 'br-1:receipt');
  assert.equal(f.calls.filter(call => call === 'finish').length, 1);
});
```

Дополнительные регрессии Task 6: успешный Calculator даёт dock_node_read с фактическим `<attempt>:receipt`; JavaScript — инструкцию новой existing-операции без чтения по recovery receipt; exports.text — инструкцию к уже проверенному файлу. При settle не затрагиваются чужие pending/node/source/delivery состояния. Отдельно проверить released T4 без других locks: browser-проверка подтверждена, но ACK recovery receipt отказал — обычная мутация по-прежнему отклоняется; успешный ACK разрешает следующий шаг.

В `node-read.test.mjs`:

```js
test('dock_node_read accepts a completed recovery receipt with verified execution and schema', () => {
  const request = buildNodeReadRequest({ operation_id: 'read-1', source_operation_id: 'br-1:receipt' }, receipt('completed'));
  assert.deepEqual(request.parameters.schemas, receipt('completed').outcome.output.verified.output_schema.ports);
});
test('dock_node_read refuses continuable or attested-only recovery receipts', () => {
  assert.throws(() => buildNodeReadRequest({ operation_id: 'read-1', source_operation_id: 'br-1:receipt' }, receipt('continuable')), /source_operation_id/);
});
```

- [ ] **Step 2: Run tests to verify they fail** (`--test test/browser-recovery-executor.test.mjs test/node-read.test.mjs test/user-results.test.mjs`; Expected: FAIL)

- [ ] **Step 3: Implement** по Interfaces.

- [ ] **Step 4: Run tests to verify they pass** (команда Step 2 и `bun run test:upstream`; Expected: PASS)

- [ ] **Step 5: Commit**

```bash
git add packages/loginom-runtime
git commit -m "feat(runtime): record browser recovery receipts and release only after them"
```

### Task 7: Acceptance-only вход `acceptanceFault`

**Files:**
- Modify: `packages/loginom-runtime/src/start-input.mjs`, `packages/loginom-runtime/src/managed-entry.mjs:121-146`
- Modify: `packages/loginom-runtime/client/lib/bridge.mjs` (передать в `createActionRuntime`)
- Modify: `packages/loginom-runtime/client/lib/executor.mjs` (опция; `releaseApply` 1819–1849; вызов `applyNode` 2601)
- Modify: `packages/loginom-runtime/client/lib/node-apply.mjs` (помощник `phase`)
- Modify: `packages/loginom-host/src/supervisor.ts:15-25` (поле `Launch`, помеченное acceptance-only)
- Test: `packages/loginom-runtime/test/start-input.test.mjs`, `packages/loginom-runtime/client/test/browser-recovery-executor.test.mjs`, `packages/loginom-host/test/browser-recovery-capability.test.ts`

**Interfaces:**
- Produces:
  - `validateStartInput(input).acceptanceFault: Fault[] | null` — формат из общего контракта.
  - `createActionRuntime({..., acceptanceFault})`. Счётчики `times` живут в runtime; каждое срабатывание пишет `acceptance_fault_injected {kind, node_type, phase, code, remaining}`.
  - `phase_stop`: тело фазы `phase` для `request.target.type === node_type` завершилось, его квитанции закрыты. Тогда помощник `phase` до записи завершения бросает ошибку с `receipt: {error: {code, message: "acceptance fault"}}`, и операция остаётся `AMBIGUOUS` с `pending_phase === phase` и `error.cause.code === code`.
  - `release_refusal`: в `releaseApply` до `releaseNodeApply` бросается `NodeReleaseBlocked('Acceptance fault: release refused', 'Ask the user to close the open Loginom wizard with its Cancel button.')`.

- [ ] **Step 1: Write the failing tests**

```js
test("acceptance fault input is validated and refused for validation and readiness", () => {
  const fault = [{ kind: "phase_stop", node_type: "transform.calculator", phase: "configure", code: "UI_SCAN_LIMIT", times: 2 }]
  assert.deepEqual(validateStartInput({ ...base, acceptanceFault: fault }).acceptanceFault, fault)
  for (const value of [[], [{ ...fault[0], times: 4 }], [{ ...fault[0], code: "ui scan" }], Array(5).fill(fault[0]), [{ kind: "drop_reply" }]])
    assert.throws(() => validateStartInput({ ...base, acceptanceFault: value }), /^Error: LOGINOM_START_INVALID$/)
  for (const patch of [{ validation: true }, { chat: "readiness" }])
    assert.throws(() => validateStartInput({ ...base, ...patch, acceptanceFault: fault }), /^Error: LOGINOM_START_INVALID$/)
})
```

```js
test('phase_stop stops the named phase after its receipts settle and counts down', async () => {
  // fixture({release: proved(), acceptanceFault: [{kind: 'phase_stop', node_type: 'imports.text', phase: 'finish', code: 'UI_SCAN_LIMIT', times: 1}]})
  // первая операция: AMBIGUOUS, pending_phase 'finish', error.cause.code 'UI_SCAN_LIMIT', одно событие acceptance_fault_injected;
  // после освобождения операция над existing-узлом завершается SUCCEEDED
});
test('release_refusal turns the next release into NODE_RELEASE_REFUSED', async () => {
  // первое освобождение: refused.error.code === 'NODE_RELEASE_REFUSED'; второе проходит
});
```

В `browser-recovery-capability.test.ts` (план 1) фиктивный `managed-entry.mjs` дополнительно пишет `m.input.acceptanceFault ?? null`; новый тест `the product host never forwards acceptanceFault` ожидает `null` во всех стартах.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/loginom-runtime && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/start-input.test.mjs`; `cd client && "$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser-recovery-executor.test.mjs`; `cd packages/loginom-host && LOGINOM_AI_AGENT_TEST_NODE=<pinned node> bun test test/browser-recovery-capability.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** по Interfaces.

- [ ] **Step 4: Run tests to verify they pass** (команды Step 2 и `bun run test:upstream`; Expected: PASS)

- [ ] **Step 5: Commit and checkpoint**

```bash
git add packages/loginom-runtime packages/loginom-host
git commit -m "test(runtime): add acceptance-only fault input for browser recovery"
```

Checkpoint до 20 строк. PR `feat(runtime): browser recovery basis and verification` в `demo-022`.
