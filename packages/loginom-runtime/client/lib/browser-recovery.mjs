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
const readOnlyBrowserTools = new Set(['browser_snapshot', 'browser_find', 'browser_take_screenshot', 'browser_wait_for']);

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
  // A browser action with an unknown outcome blocks Dock until the session is recovered.
  let uncertain = null;
  // The action currently dispatched; a stop waits for it before releasing the page.
  let inflight = null;

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
      return (!!uncertain || holding()) && !leaseReadOnlyTools.has(name);
    },
    active() {
      return holding();
    },
    unsettled() {
      return !!uncertain || holding();
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
      if (!holding() || attempt.phase === 'stopping') return;
      await stopAttempt('runtime_closed', 'The runtime closed during browser recovery.').catch(() => undefined);
    },
  };

  async function start(input, extra) {
    if (uncertain) return refusal('A browser recovery action has an unknown outcome; Dock stays blocked in this session.', { uncertain });
    if (holding())
      return refusal(`Browser recovery for operation ${attempt.operation_id} is already in phase ${attempt.phase}.`, view());
    // The attempt holds the page from its first moment; basis and handoff run in one gate turn.
    const previous = attempt;
    const current = attempt = { id: randomUUID(), operation_id: input.operation_id, phase: 'handoff', step: null, reason: null,
      budget: { calls: 0, started_at: null, closed: false } };
    const outcome = await track(gate(async () => {
      if (attempt !== current || uncertain) return { refused: refusal('Browser recovery state changed before its start.') };
      const basis = await Promise.resolve().then(() => executor.browserRecoveryBasis(input.operation_id)).catch(error => error);
      if (basis instanceof Error) return { refused: refusal(basis.message) };
      const budget = budgets.get(basis.step.key) ?? { calls: 0, started_at: null, closed: false };
      if (budget.closed) return { refused: refusal('This step was already completed or stopped without a safe retry; continue through Dock.') };
      if (exhausted(budget)) return { refused: refusal('The browser recovery budget for this step is exhausted.', { budget: remaining(budget) }) };
      budgets.set(basis.step.key, budget);
      Object.assign(current, { step: basis.step, reason: basis.reason, budget });
      // Every hand-over starts on a confirmed page: a lost boundary is never inherited by a new attempt.
      const page = await Promise.resolve().then(probe).catch(error => ({ ok: false, reason: error.message, unknown: true }));
      if (page.unknown) uncertain ??= { operation_id: current.operation_id, tool: null,
        reason: 'Page check failed: ' + String(page.reason).slice(0, 400) };
      if (page.ok !== true) return { refused: refusal('The Loginom page is outside recovery bounds: ' + page.reason) };
      // Only a confirmed stop of the original executor hands the page over.
      const handoff = await Promise.resolve().then(() => executor.browserRecoveryHandoff(input.operation_id, { signal: extra?.signal }))
        .catch(error => ({ stopped: false, reason: error.message }));
      await journal({ phase: 'browser_recovery_started', attempt_id: current.id, operation_id: current.operation_id,
        reason: current.reason, step: current.step, budget: remaining(current.budget) });
      await journal({ phase: 'browser_recovery_handoff', attempt_id: current.id, operation_id: current.operation_id,
        stopped: handoff.stopped === true, proof: handoff.proof ?? null, reason: handoff.reason ?? null });
      // Activation belongs to the same gate turn and only to an attempt nobody stopped meanwhile.
      if (handoff.stopped === true && attempt === current && current.phase === 'handoff') {
        current.phase = 'browser';
        current.budget.started_at ??= now();
      }
      return { basis, handoff };
    }));
    if (outcome.refused) {
      if (attempt === current) attempt = previous;
      return outcome.refused;
    }
    if (attempt !== current || current.phase === 'stopping' || current.phase === 'stopped') return reply(view());
    if (outcome.handoff.stopped !== true)
      return stopAttempt('executor_not_stopped', outcome.handoff.reason ?? 'The original executor stop was not confirmed.');
    return reply({ ...view(), instruction: 'The browser tools are available on your next step. Complete only this step in the '
      + 'current Loginom tab, then call dock_browser_recovery finish. Leave a node view or visualizer through the scenario '
      + 'breadcrumb (Сценарий) in the navigation path; never close workspace tabs, the package or Loginom windows: that '
      + 'changes the context Dock is bound to and ends the attempt. Navigation, reload, tabs, code, storage, network and '
      + 'file tools are refused.', goal: outcome.basis.goal ?? null });
  }

  async function browserCall(name, args, extra) {
    if (!recoveryBrowserToolSet.has(name)) return refusal(`${name} is outside the browser recovery allowlist.`);
    if (Object.hasOwn(args, 'filename')) return refusal('Browser recovery does not write files; omit filename.');
    const refused = admission(name, attempt);
    if (refused) return refused;
    if (exhausted(attempt.budget)) return stopAttempt('budget_exhausted', 'The browser recovery budget for this step is exhausted.');
    const current = attempt;
    const outcome = await track(gate(async () => {
      // A gesture queued behind another one is admitted only against the state that one left.
      const late = admission(name, current) ?? (exhausted(current.budget) ? refusal('The browser recovery budget for this step is exhausted.') : null);
      if (late) return { refused: late };
      current.budget.calls++;
      const response = await browser.callTool({ name, arguments: args }, undefined, { signal: extra?.signal, timeout: 60_000 })
        .then(value => ({ value }), error => ({ error }));
      // Latch an unknown outcome before the page check, the journal or any early return can intervene.
      if (response.error) uncertain ??= { operation_id: current.operation_id, tool: name,
        reason: String(response.error.message).slice(0, 500) };
      // A failed gesture may still have landed: the next gesture waits for an observation.
      if (response.value) current.observationRequired = readOnlyBrowserTools.has(name)
        ? current.observationRequired && response.value.isError === true : response.value.isError === true;
      // The page check runs even after a failed action: its effect may still have landed.
      const page = await Promise.resolve().then(probe).catch(error => ({ ok: false, reason: error.message, unknown: true }));
      // A page check that could not run leaves the page state unknown; a failed one proves it left bounds.
      if (page.unknown) uncertain ??= { operation_id: current.operation_id, tool: name,
        reason: 'Page check failed: ' + String(page.reason).slice(0, 400) };
      // Latch a lost page boundary before the gate is released, like an unknown outcome.
      if (page.ok !== true) current.pageLost ??= String(page.reason ?? 'page check failed').slice(0, 500);
      // The evidence is durable before the next queued entry is admitted.
      await journal({ phase: 'browser_recovery_action', attempt_id: current.id, operation_id: current.operation_id, tool: name,
        arguments_sha256: sha256(JSON.stringify(args)), is_error: response.error ? null : response.value?.isError === true,
        transport_error: response.error ? String(response.error.message) : null, page,
        content: describeContent(response.value?.content), budget: remaining(current.budget) });
      return { ...response, page };
    }));
    if (outcome.refused) return outcome.refused;
    // A late reply belongs to an attempt that already ended: it never regains the page.
    if (attempt !== current || current.phase !== 'browser')
      return refusal('This browser action finished after the recovery attempt ended; its result is not evidence.', view());
    if (outcome.error) return stopAttempt('browser_unavailable', 'The browser action outcome is unknown: ' + outcome.error.message);
    if (current.pageLost) return stopAttempt('page_changed', `The Loginom page changed outside recovery bounds: ${current.pageLost}.`);
    const result = boundText(outcome.value, limits.textBytes);
    result.content.push({ type: 'text', text: JSON.stringify({ browser_recovery: remaining(current.budget) }) });
    return result;
  }

  async function finish(input, extra) {
    const refused = admission(browserRecoveryToolName, attempt);
    if (refused) return refused;
    if (attempt.operation_id !== input.operation_id) return refusal('finish requires the browser phase of this operation.', view());
    const current = attempt;
    const attested = { actions_performed: input.actions_performed ?? [], expected_result: input.expected_result ?? null,
      browser_settings: input.browser_settings ?? [] };
    // Admission, the phase change and the verifier share one gate turn: a finish queued behind an
    // unknown outcome or a lost page never runs the verifier or its release.
    const outcome = await track(gate(async () => {
      const late = admission(browserRecoveryToolName, current);
      if (late) return { late };
      current.phase = 'verify';
      await journal({ phase: 'browser_recovery_attested', attempt_id: current.id, operation_id: current.operation_id,
        attested_by_model: attested });
      const verification = await Promise.resolve().then(() => executor.verifyBrowserRecovery({ operationId: current.operation_id,
        step: current.step, attested, signal: extra?.signal })).catch(error => ({ status: 'unresolved', facts: [],
          reason: error.message, uncertain: true }));
      // The verifier's own release gestures may end with an unknown outcome too.
      if (verification.uncertain) uncertain ??= { operation_id: current.operation_id, tool: browserRecoveryToolName,
        reason: 'Verification outcome is unknown: ' + String(verification.reason ?? '').slice(0, 400) };
      const status = ['completed', 'continuable'].includes(verification.status) ? verification.status : 'unresolved';
      await journal({ phase: 'browser_recovery_verified', attempt_id: current.id, operation_id: current.operation_id,
        status, facts: verification.facts ?? [], receipt_id: verification.receipt_id ?? null });
      // Only a verification nobody stopped meanwhile moves the phase.
      if (attempt === current && current.phase === 'verify' && !uncertain) {
        if (status !== 'unresolved') {
          current.phase = 'dock';
          if (status === 'completed') current.budget.closed = true;
        } else if (!exhausted(current.budget)) current.phase = 'browser';
      }
      return { verification, status };
    }));
    if (outcome.late) {
      if (attempt !== current || !(uncertain || current.pageLost)) return outcome.late;
      return uncertain ? stopAttempt('browser_unavailable', 'A browser action outcome is unknown: ' + uncertain.reason)
        : stopAttempt('page_changed', `The Loginom page changed outside recovery bounds: ${current.pageLost}.`);
    }
    const { verification, status } = outcome;
    const result = { ...verification, status, attested_by_model: attested };
    // A stop during verification already decided the lease; report what verification found.
    if (attempt !== current || ['stopping', 'stopped'].includes(current.phase)) return reply({ ...view(), verification: result });
    if (uncertain) return stopAttempt('browser_unavailable', uncertain.reason, { verification: result });
    if (current.phase === 'dock') return reply({ ...view(), verification: result });
    if (current.phase === 'verify')
      return stopAttempt('unresolved', verification.reason ?? 'The verification did not establish the step result.', { verification: result });
    return reply({ ...view(), verification: result,
      instruction: 'The step result is not established yet. Continue in the browser within the remaining budget, or call stop.' });
  }

  async function stop(input, reason) {
    // Any holding phase can stop, so a failed journal write never strands the lease.
    if (!holding() || attempt.phase === 'stopping' || attempt.operation_id !== input.operation_id)
      return refusal('stop requires an active browser recovery attempt of this operation.', view());
    return stopAttempt('model_stopped', reason);
  }

  async function stopAttempt(code, reason, extra = {}) {
    const current = attempt;
    // Still holding: a dispatched action or verification settles first and decides whether the page may return to Dock.
    current.phase = 'stopping';
    if (inflight) await inflight.catch(() => undefined);
    // Safe completion only: the runtime may cancel its own unapplied draft; unknown effects stay locked.
    const cleanup = await Promise.resolve().then(() => executor.stopBrowserRecovery({ operationId: current.operation_id,
      step: current.step, reason: code, uncertain: !!uncertain })).catch(error => ({ state: 'retained', reason: error.message }));
    // A lost page or document ends the step for good, whatever stopped the attempt; other stops keep
    // the shared budget for an explicit re-entry.
    if (current.step && (code === 'page_changed' || current.pageLost)) current.budget.closed = true;
    // The attempt keeps holding until its stop is journaled; a new start waits for that.
    try {
      await journal({ phase: 'browser_recovery_stopped', attempt_id: current.id, operation_id: current.operation_id,
        code, reason, cleanup, budget: remaining(current.budget) });
    } finally { current.phase = 'stopped'; }
    return reply({ ...view(current), stopped: { code, reason, cleanup }, ...extra,
      instruction: 'Browser recovery stopped. Report what was done, what the runtime confirmed, what only you attested, '
        + 'whether the package was saved, and what remains unknown. Do not claim success for an unknown result.' });
  }

  // Evidence that cannot be written leaves the outcome unproven: it blocks like an unknown effect.
  async function journal(event) {
    try { return await record(event); }
    catch (error) {
      uncertain ??= { operation_id: event.operation_id, tool: null, reason: 'Journal write failed: ' + String(error.message).slice(0, 400) };
      throw error;
    }
  }

  function track(call) {
    inflight = call;
    return call.finally(() => { if (inflight === call) inflight = null; });
  }

  function holding() {
    return ['handoff', 'browser', 'verify', 'stopping'].includes(attempt?.phase);
  }

  // One rule for every entry: an unknown outcome or a lost page boundary admits nothing more.
  function blocked(current) {
    return !!uncertain || !!current?.pageLost || attempt !== current;
  }

  // Shared admission for gestures and finish, checked before queueing and again inside the gate.
  function admission(name, current) {
    if (uncertain) return refusal('A browser recovery action has an unknown outcome; no further gesture is allowed.', { uncertain });
    if (current?.pageLost) return refusal('The Loginom page left recovery bounds; only stop is allowed.', { page: current.pageLost });
    if (attempt !== current || current?.phase !== 'browser')
      return refusal(`${name} is available only during the browser phase of dock_browser_recovery.`);
    if (name !== browserRecoveryToolName && current.observationRequired && !readOnlyBrowserTools.has(name))
      return refusal('The last browser gesture failed after it may have taken effect. Observe the page with browser_snapshot '
        + 'or browser_find before another gesture.');
    return null;
  }

  function view(of = attempt) {
    if (!of) return { phase: 'dock' };
    return { phase: of.phase, operation_id: of.operation_id, reason: of.reason, step: of.step, budget: remaining(of.budget) };
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
export function makeRecoveryPageProbeCode({ tabTid = null } = {}) {
  return `async (page) => {
    const pages = page.context().pages().filter(item => !item.isClosed()).length;
    const observed = await page.evaluate(tab => ({ origin: location.origin,
      document_id: globalThis.__loginomDockPreparationV1?.document === document ? globalThis.__loginomDockPreparationV1.id : null,
      tab_present: tab ? !!document.querySelector('[data-tid="' + CSS.escape(tab) + '"]') : null }), ${JSON.stringify(tabTid)});
    return JSON.stringify({ kind: 'browser_recovery_page', pages, ...observed });
  }`;
}

export function parseRecoveryPageProbe(response, { origin, documentId, tabTid = null }) {
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
      // Closing the prepared scenario tab changes the workflow context Dock is bound to.
      if (tabTid && value.tab_present !== true) return { ok: false, reason: 'prepared scenario tab closed' };
      return { ok: true };
    } catch { /* Only a parsed probe is evidence. */ }
  }
  return { ok: false, reason: 'page probe returned no result' };
}
