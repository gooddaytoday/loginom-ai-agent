import {BROWSER_RECOVERY_BUDGET, browserRecoveryStepKey} from './browser-recovery-basis.mjs';
import {validateActionParameters} from './action-catalog.mjs';
import {createHash} from 'node:crypto';

export const RECOVERY_BROWSER_TOOLS = Object.freeze([
  'browser_snapshot', 'browser_find', 'browser_take_screenshot', 'browser_click',
  'browser_hover', 'browser_type', 'browser_press_key', 'browser_fill_form',
  'browser_select_option', 'browser_drag', 'browser_mouse_click_xy',
  'browser_mouse_move_xy', 'browser_mouse_drag_xy', 'browser_mouse_wheel',
  'browser_handle_dialog', 'browser_wait_for',
]);

export const browserRecoveryTool = {
  name: 'dock_browser_recovery',
  description: 'Start, finish or stop a bounded browser recovery of the current Dock operation.',
  inputSchema: {type: 'object', oneOf: [
    {type: 'object', additionalProperties: false, required: ['action', 'operation_id'], properties: {
      action: {const: 'start'}, operation_id: {type: 'string', minLength: 1, maxLength: 128},
    }},
    {type: 'object', additionalProperties: false, required: ['action', 'report'], properties: {
      action: {const: 'finish'}, report: {type: 'object', additionalProperties: false,
        required: ['actions', 'result', 'settings'], properties: {
          actions: {type: 'array', maxItems: 30, items: {type: 'string', maxLength: 500}},
          result: {type: 'string', maxLength: 2000},
          settings: {type: 'array', maxItems: 50, items: {type: 'string', maxLength: 500}},
        }},
    }},
    {type: 'object', additionalProperties: false, required: ['action', 'reason'], properties: {
      action: {const: 'stop'}, reason: {type: 'string', maxLength: 1000},
    }},
  ]},
};

export function recoveryBrowserCatalog(browserTools) {
  return RECOVERY_BROWSER_TOOLS.map(name => {
    const original = browserTools.find(tool => tool.name === name);
    if (!original) throw new Error(`Missing browser recovery tool: ${name}`);
    const tool = structuredClone(original);
    delete tool.inputSchema.properties.filename;
    return tool;
  });
}

export function admitRecoveryBrowserCall(name, args, publishedTools) {
  if (!RECOVERY_BROWSER_TOOLS.includes(name)) throw new Error('BROWSER_RECOVERY_TOOL_FORBIDDEN');
  const tool = publishedTools.find(tool => tool.name === name);
  if (!tool) throw new Error('BROWSER_RECOVERY_TOOL_FORBIDDEN');
  try {
    return validateActionParameters(tool.inputSchema, args);
  } catch {
    throw new Error('BROWSER_RECOVERY_ARGUMENT_FORBIDDEN');
  }
}

export function makeRecoveryPageProbeCode({origin, documentId, sessionId, account, loginomBuild}) {
  return `async page => ({...await page.evaluate(${readRecoveryPage.toString()},
    ${JSON.stringify({origin, documentId, sessionId, account, loginomBuild})}), page_count: page.context().pages().length})`;
}

function readRecoveryPage(expected) {
  const app = globalThis.bg?.app, prep = globalThis.__loginomDockPreparationV1;
  const connection = app?.Application?.FInstance?.FMainForm?.FMapTree?.FServerConnection;
  return {
    origin_ok: location.origin === expected.origin,
    document_present: app?.Version === expected.loginomBuild && prep?.document === document && prep.id === expected.documentId
      && prep.receipts instanceof Map && [...prep.receipts.values()].some(receipt => {
        try { return JSON.parse(receipt.request).session === expected.sessionId; } catch { return false; }
      }) && connection?.Connected === true && connection.UserName === expected.account,
  };
}

export function parseRecoveryPageProbe(response) {
  if (!response?.isError && Array.isArray(response?.content)) for (const block of response.content) {
    if (block?.type !== 'text') continue;
    let page;
    try { page = JSON.parse(block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1] ?? block.text); }
    catch { continue; }
    if (typeof page?.origin_ok === 'boolean' && typeof page.document_present === 'boolean'
      && Number.isInteger(page.page_count) && page.page_count >= 0) return {
      origin_ok: page.origin_ok, page_count: page.page_count, document_present: page.document_present,
    };
  }
  return {origin_ok: false, page_count: 0, document_present: false};
}

const remoteTools = new Set(['find', 'search', 'read', 'grep', 'glob', 'list', 'tree']);

export function createBrowserRecovery({runtime, definitions, callBrowser, probePage, record, now = Date.now}) {
  let attempt;
  let sequence = 0;
  const budgets = new Map();
  const remaining = key => ({calls_remaining: Math.max(0, BROWSER_RECOVERY_BUDGET.calls - (budgets.get(key)?.calls ?? 0)),
    ms_remaining: Math.max(0, BROWSER_RECOVERY_BUDGET.ms - (budgets.get(key)?.ms ?? 0)
      - (attempt?.key === key && attempt?.browserSince != null ? Math.max(0, now() - attempt.browserSince) : 0))});
  function pauseBrowser(current) {
    if (current.browserSince == null) return;
    budgets.get(current.key).ms += Math.max(0, now() - current.browserSince);
    current.browserSince = null;
  }
  const exhausted = current => remaining(current.key).calls_remaining <= 0 || remaining(current.key).ms_remaining <= 0;
  function safeCompletion(current) {
    if (current.unknown || current.pageChanged) return {instruction: 'Report the factual state; do not repeat an unconfirmed effect.'};
    return runtime.browserRecoverySafeCompletion(current.basis.operation_id);
  }
  function reply(fields = {}) {
    const state = attempt?.state ?? 'dock';
    const structuredContent = {result_version: 'user-v1', kind: 'dock_browser_recovery', state, ...fields,
      ...(attempt?.journalError ? {journal_error: attempt.journalError} : {}),
      ...(state === 'stopped' ? {stop_reason: attempt.stopReason, summary: {tools: attempt.tools,
        operation: attempt.basis.input, handoff: attempt.handoff, verification: attempt.verification ?? null, settlement: attempt.settlement ?? null,
        safe_release: attempt.safeRelease ?? null,
        attested_by_model: attempt.attested ?? null}, next_step: safeCompletion(attempt)} : {})};
    return {content: [{type: 'text', text: JSON.stringify(structuredContent)}], structuredContent,
      ...(fields.error ? {isError: true} : {}),
      _meta: {'loginom/browser_recovery': {attempt_id: attempt?.id ?? null, state, ...remaining(attempt?.key),
        ...(attempt?.journalError ? {journal_error: attempt.journalError} : {})}}};
  }
  async function journal(current, event) {
    try { await record(event); }
    catch (error) { current.journalError = String(error.message ?? error).slice(0, 1000); }
  }
  async function stop(current, reason, fields) {
    pauseBrowser(current);
    current.stopReason ??= reason;
    if (current.state !== 'stopped') {
      current.state = 'stopped';
      runtime.markBrowserRecoveryStopped(current.basis.operation_id, current.id);
      current.safeStep = safeCompletion(current);
      await journal(current, {phase: 'browser_recovery_state', attempt_id: current.id,
        operation_id: current.basis.operation_id, state: 'stopped', stop_reason: current.stopReason});
    }
    return reply(fields);
  }
  function stopIntent(current, reason) {
    pauseBrowser(current);
    current.stopReason ??= reason;
  }
  async function accepted(current, run, signal) {
    const abort = () => stopIntent(current, 'cancelled');
    signal?.addEventListener('abort', abort, {once: true});
    current.work = run(current);
    try {
      const result = await current.work;
      return current.stopReason && current.state !== 'stopped' ? stop(current, current.stopReason) : result;
    }
    finally { current.work = null; signal?.removeEventListener('abort', abort); }
  }
  async function requestStop(reason) {
    if (attempt) attempt.releaseGeneration++;
    if (!attempt || attempt.state === 'dock') return reply();
    const current = attempt;
    stopIntent(current, reason);
    if (current.work) await current.work;
    return stop(current, reason);
  }
  async function startAttempt(current) {
    current.handoff = await runtime.browserRecoveryHandoff(current.basis.operation_id)
      .catch(error => ({verified: false, reason: String(error.message ?? error)}));
    if (current !== attempt || current.stopReason) return stop(current, current.stopReason);
    if (!current.handoff.verified) return stop(current, 'handoff_unverified');
    current.state = 'browser';
    current.browserSince = now();
    return reply({attempt_id: current.id, recovery_input: current.basis.input,
      allowed_tools: definitions.map(tool => tool.name), budget: remaining(current.key),
      instruction: 'Recover the current step, then call finish with the factual report.'});
  }
  async function finishAttempt(current) {
    current.verification = await runtime.verifyBrowserRecovery(current.basis.operation_id,
      {attemptId: current.id, sequence: ++current.finishes})
      .catch(error => ({unconfirmed: true, error: String(error.message ?? error)}));
    current.unknown = current.verification.unconfirmed === true;
    if (current !== attempt || current.stopReason) return stop(current, current.stopReason);
    if (current.unknown) return stop(current, 'verification_unconfirmed');
    current.settlement = await runtime.settleBrowserRecovery(current.basis.operation_id,
      {attemptId: current.id, facts: current.verification.facts, attested: current.attested})
      .catch(error => ({error: {code: 'RECOVERY_RECEIPT_UNCONFIRMED', message: String(error.message ?? error)}}));
    if (current.settlement.result === 'completed') budgets.delete(current.key);
    if (current !== attempt || current.stopReason) return stop(current, current.stopReason, current.settlement);
    if (current.settlement.error) return stop(current, 'receipt_unconfirmed', {error: current.settlement.error});
    if (current.settlement.result === 'unresolved' && exhausted(current)) return stop(current, 'budget_exhausted');
    current.state = current.settlement.result === 'unresolved' ? 'browser' : 'dock';
    if (current.state === 'browser') current.browserSince = now();
    return reply({...current.settlement, verified: current.verification.decision.verified,
      attested_by_model: current.attested, budget: remaining(current.key)});
  }
  function safeRelease(current, name, args, step = current.safeStep) {
    return current.state === 'stopped' && !current.unknown && !current.pageChanged
      && name === 'dock_operation_recover' && step?.tool === name
      && step.arguments?.operation_id === current.basis.operation_id
      && step.arguments?.strategy === 'abandon_operation'
      && args?.operation_id === current.basis.operation_id && args?.strategy === 'abandon_operation';
  }
  const captureDockAdmission = () => ({attempt_id: attempt?.id ?? null, release_generation: attempt?.releaseGeneration ?? 0});
  const matchesAdmission = admission => admission?.attempt_id === (attempt?.id ?? null)
    && admission?.release_generation === (attempt?.releaseGeneration ?? 0);
  function dockAllowed(name, args, admission) {
    if (remoteTools.has(name) || name === 'dock_diagnostics') return true;
    if (!matchesAdmission(admission)) return false;
    if (!attempt || attempt.state === 'dock') return true;
    return safeRelease(attempt, name, args, safeCompletion(attempt));
  }
  async function noteDockCall(name, args, outcome, admission) {
    const current = attempt;
    if (admission?.attempt_id !== current?.id) return;
    if (current && safeRelease(current, name, args) && outcome?.status === 'SUCCEEDED'
      && typeof args.recovery_operation_id === 'string' && outcome.recovery_operation_id === args.recovery_operation_id
      && outcome.operation_id === current.basis.operation_id && outcome.output?.resolution === 'released_after_proof'
      && outcome.output.original_outcome?.operation_id === current.basis.operation_id) {
      current.safeRelease = outcome;
      if (matchesAdmission(admission)) current.state = 'dock';
    }
    if (!matchesAdmission(admission)) return;
    if (current?.state === 'dock' && !current.safeRelease && !current.dockResumed
      && ['completed', 'continuable'].includes(current.settlement?.result)
      && name.startsWith('dock_') && name !== 'dock_diagnostics' && name !== browserRecoveryTool.name
      && ['SUCCEEDED', 'FAILED', 'AMBIGUOUS'].includes(outcome?.status)) {
      current.dockResumed = true;
      await journal(current, {phase: 'browser_recovery_dock_resumed', attempt_id: current.id,
        operation_id: current.basis.operation_id, tool: name, outcome});
    }
  }
  return {
    owns: name => name === browserRecoveryTool.name || RECOVERY_BROWSER_TOOLS.includes(name),
    active: () => !!attempt && ['handoff', 'browser', 'verifying'].includes(attempt.state),
    release: requestStop,
    captureDockAdmission, dockAllowed, noteDockCall,
    hasUnsettledWork: () => !!attempt && attempt.state !== 'dock',
    remaining,
    tools(base) {
      if (!attempt || attempt.state === 'dock') return [...base, browserRecoveryTool];
      const next = attempt.state === 'stopped' ? safeCompletion(attempt) : null;
      return [...base.filter(tool => remoteTools.has(tool.name) || tool.name === 'dock_diagnostics'
        || safeRelease(attempt, tool.name, next?.arguments, next)), browserRecoveryTool,
        ...(attempt.state === 'browser' ? definitions : [])];
    },
    async call(name, args, {signal} = {}) {
      if (name !== browserRecoveryTool.name) {
        if (attempt?.state !== 'browser') return reply({error: {code: RECOVERY_BROWSER_TOOLS.includes(name)
          ? 'BROWSER_RECOVERY_INACTIVE' : 'BROWSER_RECOVERY_TOOL_FORBIDDEN'}});
        try { args = admitRecoveryBrowserCall(name, args, definitions); }
        catch (error) { return reply({error: {code: error.message}}); }
        const current = attempt;
        if (signal?.aborted) return stop(current, 'cancelled');
        if (exhausted(current)) return stop(current, 'budget_exhausted', {error: {code: 'BROWSER_RECOVERY_BUDGET_EXHAUSTED'}});
        budgets.get(current.key).calls++;
        let result;
        let status = await accepted(current, async () => {
          const started = now();
          let page, failure;
          try {
            result = await callBrowser(name, args);
            page = await probePage();
          } catch (error) { failure = String(error.message ?? error).slice(0, 1000); }
          // Native Playwright errors carry no trusted no-effect receipt.
          current.unknown = failure != null || result?.isError === true;
          current.pageChanged = !current.unknown && (page?.origin_ok !== true || page.page_count !== 1 || page.document_present !== true);
          const event = {phase: 'browser_recovery_call', attempt_id: current.id, tool: name, arguments: args,
            duration_ms: Math.max(0, now() - started), is_error: current.unknown,
            text_bytes: (result?.content ?? []).filter(block => block.type === 'text')
              .reduce((bytes, block) => bytes + Buffer.byteLength(block.text, 'utf8'), 0),
            images: (result?.content ?? []).filter(block => block.type === 'image').map(block => {
              const bytes = Buffer.from(block.data, 'base64');
              return {mime: block.mimeType, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
            }), page: page ?? null, ...remaining(current.key), ...(failure != null ? {error: failure} : {})};
          current.tools.push(event);
          await journal(current, event);
          if (current.stopReason || current.unknown || current.pageChanged) {
            return stop(current, current.stopReason ?? (current.unknown ? 'browser_call_unconfirmed' : 'page_changed'),
              current.unknown ? {error: {code: 'BROWSER_CALL_UNCONFIRMED'}}
                : current.pageChanged ? {error: {code: 'BROWSER_RECOVERY_PAGE_CHANGED'}} : {});
          }
          return reply();
        }, signal);
        if (status.structuredContent.state !== 'stopped' && (signal?.aborted || current.stopReason)) {
          status = await stop(current, current.stopReason ?? 'cancelled');
        }
        if (status.structuredContent.state === 'stopped') return {...status,
          content: [...(result?.content ?? []), ...status.content],
          structuredContent: {...status.structuredContent, browser_result: result?.structuredContent ?? null},
          _meta: {...result?._meta, ...status._meta}};
        return {...result, _meta: {...result._meta, ...status._meta}};
      }
      try { validateActionParameters(browserRecoveryTool.inputSchema, args); }
      catch { return reply({error: {code: 'BROWSER_RECOVERY_ARGUMENT_FORBIDDEN'}}); }
      if (args.action === 'finish') {
        if (attempt?.state !== 'browser') return reply({error: {code: 'BROWSER_RECOVERY_INACTIVE'}});
        const current = attempt;
        if (signal?.aborted) return stop(current, 'cancelled');
        pauseBrowser(current);
        if (exhausted(current)) return stop(current, 'budget_exhausted');
        budgets.get(current.key).calls++;
        current.state = 'verifying';
        current.attested = structuredClone(args.report);
        return accepted(current, finishAttempt, signal);
      }
      if (args.action === 'stop') return attempt && attempt.state !== 'dock' ? requestStop('model_stop') : reply({error: {code: 'BROWSER_RECOVERY_INACTIVE'}});
      if (attempt && attempt.state !== 'dock') return reply({error: {code: 'BROWSER_RECOVERY_ACTIVE'}});
      const basis = runtime.browserRecoveryBasis(args.operation_id);
      if (!basis) return reply({error: {code: 'BROWSER_RECOVERY_NOT_OFFERED'}});
      const key = browserRecoveryStepKey(basis.step);
      if (!budgets.has(key)) budgets.set(key, {calls: 0, ms: 0});
      attempt = {id: `br-${++sequence}`, state: 'handoff', basis, key, tools: [], finishes: 0, releaseGeneration: 0};
      if (signal?.aborted) return stop(attempt, 'cancelled');
      if (exhausted(attempt)) return stop(attempt, 'budget_exhausted');
      const current = attempt;
      return accepted(current, startAttempt, signal);
    },
  };
}
