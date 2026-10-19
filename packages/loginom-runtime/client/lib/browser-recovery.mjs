import { createHash, randomUUID } from 'node:crypto';

// Temporary browser recovery: the same model receives a fixed allowlist of
// standard Playwright MCP tools under a bridge-owned browser lease. Everything
// outside this list stays refused at the execution boundary even if the name
// leaks into the model's catalog (design 2026-10-19-browser-recovery, §6-§9).
export const browserRecoveryToolName = 'dock_browser_recovery';

// Playwright MCP 0.0.82 marks browser_press_sequentially, browser_check and
// browser_uncheck skill-only, so MCP never lists them; browser_type (slowly),
// browser_click and browser_fill_form cover the same gestures.
export const recoveryBrowserTools = Object.freeze([
  'browser_snapshot', 'browser_find', 'browser_take_screenshot', 'browser_click', 'browser_hover', 'browser_type',
  'browser_press_key', 'browser_fill_form', 'browser_select_option', 'browser_drag', 'browser_mouse_click_xy',
  'browser_mouse_drag_xy', 'browser_mouse_move_xy', 'browser_mouse_wheel', 'browser_handle_dialog', 'browser_wait_for',
]);

const recoveryBrowserToolSet = new Set(recoveryBrowserTools);

export function isBrowserRecoveryTool(name) {
  return name === browserRecoveryToolName || recoveryBrowserToolSet.has(name);
}

export function isRecoveryBrowserTool(name) {
  return recoveryBrowserToolSet.has(name);
}

export const browserRecoveryLimits = Object.freeze({ calls: 30, ms: 600_000, textBytes: 46_000 });

// Read-only Dock calls stay available while the lease is held; they never
// drive the page. Everything else waits for the lease to return to Dock.
const leaseReadOnlyTools = new Set(['dock_diagnostics', 'dock_action_describe', 'dock_node_status', 'dock_node_wait',
  'dock_artifact_delivery_status', 'find', 'search', 'read', 'grep', 'glob', 'list', 'tree']);

const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
export const browserRecoveryTool = {
  name: browserRecoveryToolName,
  description: 'Temporary browser recovery for one failed Dock step. Call start only when a Dock result names this tool in next_step. '
    + 'While the phase is browser, use the listed browser_* tools in the same Loginom tab to complete exactly that step, '
    + 'one action per response, reading subtrees with browser_snapshot target/depth or browser_find. Then call finish with '
    + 'what you did; the runtime verifies the result and returns control to Dock. Call stop when no justified next action remains.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['action', 'operation_id'], properties: {
    action: { enum: ['start', 'finish', 'stop'] },
    operation_id: text(200),
    actions_performed: { type: 'array', maxItems: 40, items: text(500) },
    expected_result: text(2000),
    browser_settings: { type: 'array', maxItems: 60, items: text(500) },
    reason: text(1000),
  } },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
};

export function createBrowserRecovery({ enabled, browser, executor, gate, record, probe, now = Date.now,
  limits = browserRecoveryLimits }) {
  const budgets = new Map();
  let attempt = null;

  return {
    enabled,
    // Dynamic part of the catalog: browser tools exist only while the lease is in browser.
    listTools(browserTools) {
      if (!enabled) return [];
      if (attempt?.phase !== 'browser') return [structuredClone(browserRecoveryTool)];
      return [structuredClone(browserRecoveryTool), ...browserTools
        .filter(tool => recoveryBrowserToolSet.has(tool.name))
        .map(tool => withoutFileOutput(structuredClone(tool)))];
    },
    owns(name) {
      return enabled && isBrowserRecoveryTool(name);
    },
    // Dock may not drive the page while the lease is held or verified.
    refusesDock(name) {
      return ['handoff', 'browser', 'verify'].includes(attempt?.phase) && !leaseReadOnlyTools.has(name);
    },
    active() {
      return ['handoff', 'browser', 'verify'].includes(attempt?.phase);
    },
    async call(name, args, extra) {
      if (!enabled) return refusal('Browser recovery is unavailable in this build.');
      if (name !== browserRecoveryToolName) return browserCall(name, args ?? {}, extra);
      const input = requireInput(args ?? {});
      if (typeof input === 'string') return refusal(input);
      if (input.action === 'start') return start(input, extra);
      if (input.action === 'finish') return finish(input, extra);
      return stop(input, input.reason ?? 'Stopped by the model.');
    },
    async close() {
      if (!['handoff', 'browser', 'verify'].includes(attempt?.phase)) return;
      await stopAttempt('runtime_closed', 'The runtime closed during browser recovery.').catch(() => undefined);
    },
  };

  async function start(input, extra) {
    if (['handoff', 'browser', 'verify'].includes(attempt?.phase))
      return refusal(`Browser recovery for operation ${attempt.operation_id} is already in phase ${attempt.phase}.`, view());
    const basis = await Promise.resolve().then(() => executor.browserRecoveryBasis(input.operation_id)).catch(error => error);
    if (basis instanceof Error) return refusal(basis.message);
    const budget = budgets.get(basis.step.key) ?? { calls: 0, started_at: null, closed: false };
    budgets.set(basis.step.key, budget);
    if (budget.closed) return refusal('This step was already completed or stopped without a safe retry; continue through Dock.');
    if (exhausted(budget)) return refusal('The browser recovery budget for this step is exhausted.', { budget: remaining(budget) });
    attempt = { id: randomUUID(), operation_id: input.operation_id, step: basis.step, reason: basis.reason, phase: 'handoff', budget };
    await record({ phase: 'browser_recovery_started', attempt_id: attempt.id, operation_id: attempt.operation_id,
      reason: basis.reason, step: basis.step, budget: remaining(budget) });
    // Only a confirmed stop of the original executor hands the page over.
    const handoff = await gate(() => executor.browserRecoveryHandoff(input.operation_id, { signal: extra?.signal }))
      .catch(error => ({ stopped: false, reason: error.message }));
    await record({ phase: 'browser_recovery_handoff', attempt_id: attempt.id, operation_id: attempt.operation_id,
      stopped: handoff.stopped === true, proof: handoff.proof ?? null, reason: handoff.reason ?? null });
    if (handoff.stopped !== true)
      return stopAttempt('executor_not_stopped', handoff.reason ?? 'The original executor stop was not confirmed.');
    attempt.phase = 'browser';
    budget.started_at ??= now();
    return reply({ ...view(), instruction: 'The browser tools are available on your next step. Complete only this step in the '
      + 'current Loginom tab, then call dock_browser_recovery finish. Navigation, reload, tabs, code, storage, network and '
      + 'file tools are refused.', goal: basis.goal ?? null });
  }

  async function browserCall(name, args, extra) {
    if (attempt?.phase !== 'browser')
      return refusal(`${name} is available only during the browser phase of dock_browser_recovery.`);
    if (!recoveryBrowserToolSet.has(name)) return refusal(`${name} is outside the browser recovery allowlist.`);
    if (exhausted(attempt.budget)) return stopAttempt('budget_exhausted', 'The browser recovery budget for this step is exhausted.');
    if (Object.hasOwn(args, 'filename')) return refusal('Browser recovery does not write files; omit filename.');
    const current = attempt;
    current.budget.calls++;
    const outcome = await gate(async () => {
      const response = await browser.callTool({ name, arguments: args }, undefined, { signal: extra?.signal, timeout: 60_000 })
        .then(value => ({ value }), error => ({ error }));
      // The page check runs even after a failed action: its effect may still have landed.
      const page = await Promise.resolve().then(probe).catch(error => ({ ok: false, reason: error.message }));
      return { ...response, page };
    });
    await record({ phase: 'browser_recovery_action', attempt_id: current.id, operation_id: current.operation_id, tool: name,
      arguments_sha256: sha256(JSON.stringify(args)), is_error: outcome.error ? null : outcome.value?.isError === true,
      transport_error: outcome.error ? String(outcome.error.message) : null, page: outcome.page,
      content: describeContent(outcome.value?.content), budget: remaining(current.budget) });
    // A late reply belongs to an attempt that already ended: it never regains the page.
    if (attempt !== current || current.phase !== 'browser')
      return refusal('This browser action finished after the recovery attempt ended; its result is not evidence.', view());
    if (outcome.page.ok !== true)
      return stopAttempt('page_changed', `The Loginom page changed outside recovery bounds: ${outcome.page.reason}.`);
    if (outcome.error) return stopAttempt('browser_unavailable', 'The browser action outcome is unknown: ' + outcome.error.message);
    const result = boundText(outcome.value, limits.textBytes);
    result.content.push({ type: 'text', text: JSON.stringify({ browser_recovery: remaining(current.budget) }) });
    return result;
  }

  async function finish(input, extra) {
    if (attempt?.phase !== 'browser' || attempt.operation_id !== input.operation_id)
      return refusal('finish requires the browser phase of this operation.', view());
    const current = attempt;
    current.phase = 'verify';
    const attested = { actions_performed: input.actions_performed ?? [], expected_result: input.expected_result ?? null,
      browser_settings: input.browser_settings ?? [] };
    await record({ phase: 'browser_recovery_attested', attempt_id: current.id, operation_id: current.operation_id,
      attested_by_model: attested });
    const verification = await gate(() => executor.verifyBrowserRecovery({ operationId: current.operation_id,
      step: current.step, attested, signal: extra?.signal })).catch(error => ({ status: 'unresolved',
      facts: [], reason: error.message }));
    const status = ['completed', 'continuable'].includes(verification.status) ? verification.status : 'unresolved';
    await record({ phase: 'browser_recovery_verified', attempt_id: current.id, operation_id: current.operation_id,
      status, facts: verification.facts ?? [], receipt_id: verification.receipt_id ?? null });
    if (status !== 'unresolved') {
      current.phase = 'dock';
      if (status === 'completed') current.budget.closed = true;
      return reply({ ...view(), verification: { ...verification, status, attested_by_model: attested } });
    }
    if (exhausted(current.budget))
      return stopAttempt('unresolved', verification.reason ?? 'The verification did not establish the step result.',
        { verification: { ...verification, status, attested_by_model: attested } });
    current.phase = 'browser';
    return reply({ ...view(), verification: { ...verification, status, attested_by_model: attested },
      instruction: 'The step result is not established yet. Continue in the browser within the remaining budget, or call stop.' });
  }

  async function stop(input, reason) {
    if (attempt?.phase !== 'browser' || attempt.operation_id !== input.operation_id)
      return refusal('stop requires the browser phase of this operation.', view());
    return stopAttempt('model_stopped', reason);
  }

  async function stopAttempt(code, reason, extra = {}) {
    const current = attempt;
    current.phase = 'stopped';
    // Safe completion only: the runtime may cancel its own unapplied draft; unknown effects stay locked.
    const cleanup = await Promise.resolve().then(() => executor.stopBrowserRecovery({ operationId: current.operation_id,
      step: current.step, reason: code })).catch(error => ({ state: 'retained', reason: error.message }));
    // A lost page or document ends the step for good; other stops keep the shared budget for an explicit re-entry.
    if (code === 'page_changed') current.budget.closed = true;
    await record({ phase: 'browser_recovery_stopped', attempt_id: current.id, operation_id: current.operation_id,
      code, reason, cleanup, budget: remaining(current.budget) });
    return reply({ ...view(), stopped: { code, reason, cleanup }, ...extra,
      instruction: 'Browser recovery stopped. Report what was done, what the runtime confirmed, what only you attested, '
        + 'whether the package was saved, and what remains unknown. Do not claim success for an unknown result.' });
  }

  function view() {
    if (!attempt) return { phase: 'dock' };
    return { phase: attempt.phase, operation_id: attempt.operation_id, reason: attempt.reason, step: attempt.step,
      budget: remaining(attempt.budget) };
  }

  function exhausted(budget) {
    return budget.calls >= limits.calls || budget.started_at !== null && now() - budget.started_at >= limits.ms;
  }

  function remaining(budget) {
    return { calls_left: Math.max(0, limits.calls - budget.calls),
      ms_left: budget.started_at === null ? limits.ms : Math.max(0, limits.ms - (now() - budget.started_at)) };
  }
}

function requireInput(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return 'Arguments must be an object.';
  const allowed = new Set(Object.keys(browserRecoveryTool.inputSchema.properties));
  const unknown = Object.keys(args).find(key => !allowed.has(key));
  if (unknown) return `Unknown argument ${unknown}.`;
  if (!['start', 'finish', 'stop'].includes(args.action)) return 'action must be start, finish or stop.';
  if (typeof args.operation_id !== 'string' || !args.operation_id || args.operation_id.length > 200)
    return 'operation_id must name the failed Dock operation.';
  const lists = ['actions_performed', 'browser_settings'];
  if (lists.some(key => args[key] !== undefined && (!Array.isArray(args[key]) || args[key].length > (key === 'browser_settings' ? 60 : 40)
    || args[key].some(item => typeof item !== 'string' || !item || item.length > 500))))
    return 'actions_performed and browser_settings must be short lists of non-empty strings.';
  if (['expected_result', 'reason'].some(key => args[key] !== undefined
    && (typeof args[key] !== 'string' || !args[key] || args[key].length > (key === 'reason' ? 1000 : 2000))))
    return 'expected_result and reason must be non-empty strings.';
  if (args.action === 'finish' && !args.actions_performed?.length) return 'finish requires actions_performed.';
  return args;
}

function withoutFileOutput(tool) {
  if (tool.inputSchema?.properties?.filename) {
    delete tool.inputSchema.properties.filename;
    if (Array.isArray(tool.inputSchema.required))
      tool.inputSchema.required = tool.inputSchema.required.filter(key => key !== 'filename');
  }
  return tool;
}

function boundText(response, limit) {
  const content = [];
  let used = 0, truncated = false;
  for (const block of response?.content ?? []) {
    if (block.type !== 'text') { content.push(block); continue; }
    const bytes = Buffer.byteLength(block.text);
    if (used + bytes <= limit) { content.push(block); used += bytes; continue; }
    const room = Math.max(0, limit - used);
    content.push({ type: 'text', text: Buffer.from(block.text).subarray(0, room).toString().replace(/�$/, '') });
    used = limit;
    truncated = true;
  }
  if (truncated) content.push({ type: 'text', text: 'Output truncated. Read a smaller subtree with browser_snapshot target/depth or browser_find.' });
  return { ...(response?.isError ? { isError: true } : {}), content };
}

function describeContent(content) {
  return (content ?? []).map(block => block.type === 'image'
    ? { type: 'image', mime_type: block.mimeType, bytes: Buffer.byteLength(block.data ?? '', 'base64'), sha256: sha256(block.data ?? '') }
    : { type: block.type, bytes: Buffer.byteLength(block.text ?? '') });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function reply(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}

function refusal(message, extra = {}) {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ refused: message, ...extra }) }] };
}

// The page check runs in the same gate after each recovery action: same origin,
// one page, and the document prepared by Dock (design §7).
export function makeRecoveryPageProbeCode() {
  return `async (page) => {
    const pages = page.context().pages().filter(item => !item.isClosed()).length;
    const observed = await page.evaluate(() => ({ origin: location.origin,
      document_id: globalThis.__loginomDockPreparationV1?.document === document ? globalThis.__loginomDockPreparationV1.id : null }));
    return JSON.stringify({ kind: 'browser_recovery_page', pages, ...observed });
  }`;
}

export function parseRecoveryPageProbe(response, { origin, documentId }) {
  if (response?.isError) return { ok: false, reason: 'page probe failed' };
  for (const block of response?.content ?? []) {
    if (block.type !== 'text') continue;
    const match = block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/);
    try {
      let value = JSON.parse(match?.[1] ?? block.text);
      if (typeof value === 'string') value = JSON.parse(value);
      if (value?.kind !== 'browser_recovery_page') continue;
      if (value.pages !== 1) return { ok: false, reason: `expected one page, found ${value.pages}` };
      if (value.origin !== origin) return { ok: false, reason: 'origin changed' };
      if (value.document_id !== documentId) return { ok: false, reason: 'prepared document changed' };
      return { ok: true };
    } catch { /* Only a parsed probe is evidence. */ }
  }
  return { ok: false, reason: 'page probe returned no result' };
}
