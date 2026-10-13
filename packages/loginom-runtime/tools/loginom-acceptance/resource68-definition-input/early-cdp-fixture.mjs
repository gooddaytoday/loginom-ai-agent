// Private offline Chromium primitive. Not registered in runtime/host/IPC.
import { createHash } from 'node:crypto';

export const LOCK_SHA256 = 'e321d140d5da0ef14ab24435e9a6562c1042f2e5f789424de6d1c3dfa2af23bd';
const fields = ['page', 'context', 'gate', 'token', 'run', 'lease', 'generation',
  'session', 'account', 'chat', 'document', 'signal', 'deadline', 'target'];
const refusal = code => Object.assign(new Error(code), { code });
const hash = source => createHash('sha256').update(source).digest('hex');

// Called synchronously at fixture Page creation. The gate is the fixture loader's
// original causal state, not a native owner token or serialized authority.
export function retainEarlyLockFixture(owner) {
  const original = Object.fromEntries(fields.map(key => [key, owner[key]]));
  if (!original.page || original.page.context() !== original.context ||
      !original.signal || !Number.isFinite(original.deadline) ||
      fields.some(key => original[key] === undefined || original[key] === null)) {
    throw refusal('EARLY_CDP_MISSING_ORIGINAL');
  }
  const group = `resource68-fixture-${crypto.randomUUID()}`;
  let session, targetId, frameId, installed = false, began = false, acquired = false;
  let disposed = false, pending = 0, first, held = false;
  const scripts = [], contexts = [], trace = [];
  let exportHandle, getterHandle, scopeHandle;
  function hold(value) { if (!held) { first = value; held = true; } return first; }
  function guard({ early = false } = {}) {
    try {
    if (held) throw first;
    if (original.signal.aborted) throw original.signal.reason;
    if (Date.now() >= original.deadline) throw refusal('EARLY_CDP_EXPIRED');
    if (disposed || original.page.isClosed()) throw refusal('EARLY_CDP_CLOSED');
    if (fields.some(key => owner[key] !== original[key]) ||
        original.page.context() !== original.context) throw refusal('EARLY_CDP_BINDING_CHANGED');
    if (original.gate.pending || original.gate.unknown || original.gate.overlap) {
      throw refusal('EARLY_CDP_UNSETTLED');
    }
    if (early && original.gate.started !== 0) throw refusal('EARLY_CDP_LATE_INSTALL');
    } catch (error) { throw hold(error); }
  }
  async function query(method, params = {}, early = false) {
    guard({ early }); pending++;
    try {
      const reply = await session.send(method, params);
      guard({ early });
      return reply;
    } catch (error) { throw hold(error); }
    finally { pending--; }
  }
  async function properties(objectId) {
    if (!objectId) throw refusal('EARLY_CDP_MISSING_HANDLE');
    return query('Runtime.getProperties', { objectId, ownProperties: true });
  }
  function location(result) {
    return result.internalProperties?.find(row => row.name === '[[FunctionLocation]]')?.value?.value;
  }
  return {
    async install() {
      if (installed || session) throw refusal('EARLY_CDP_DUPLICATE_INSTALL');
      guard({ early: true }); pending++;
      try {
        session = await original.context.newCDPSession(original.page);
        guard({ early: true });
        session.on('Debugger.scriptParsed', event => scripts.push(event));
        session.on('Runtime.executionContextCreated', event => contexts.push(event.context));
      } catch (error) { throw hold(error); }
      finally { pending--; }
      const target = await query('Target.getTargetInfo', {}, true);
      targetId = target.targetInfo.targetId;
      frameId = (await query('Page.getFrameTree', {}, true)).frameTree.frame.id;
      await query('Runtime.enable', {}, true);
      await query('Debugger.enable', {}, true);
      guard({ early: true });
      installed = true;
      trace.push('install-ack-before-loader');
    },
    beginFixedLoad() {
      guard({ early: true });
      if (!installed || began || pending) throw refusal('EARLY_CDP_NO_LOAD_ADMISSION');
      began = true; original.gate.started = 1;
      trace.push('loader-start-after-ack');
    },
    async acquire() {
      if (arguments.length) throw refusal('EARLY_CDP_EXTERNAL_HANDLE_FORBIDDEN');
      guard();
      if (!installed || !began || acquired || pending || original.gate.completed !== true) {
        throw refusal('EARLY_CDP_COMPLETION_REQUIRED');
      }
      pending++;
      try {
        // Nested query accounting keeps terminal disposal out of the whole read.
        const target = await query('Target.getTargetInfo');
        if (target.targetInfo.targetId !== targetId) throw refusal('EARLY_CDP_TARGET_CHANGED');
        const matches = scripts.filter(row => row.url.endsWith('/fixed-Lock.js') && row.executionContextId);
        if (matches.length !== 1) throw refusal('EARLY_CDP_MISSING_OR_DUPLICATE_SCRIPT');
        const script = matches[0];
        const context = contexts.find(row => row.id === script.executionContextId);
        if (!context?.auxData?.isDefault || context.auxData.frameId !== frameId) {
          throw refusal('EARLY_CDP_FOREIGN_CONTEXT');
        }
        const source = (await query('Debugger.getScriptSource', { scriptId: script.scriptId })).scriptSource;
        if (hash(source) !== LOCK_SHA256) throw refusal('EARLY_CDP_WRONG_SOURCE');
        const result = await query('Runtime.evaluate', {
          expression: 'globalThis.bg.LockDeferred', contextId: context.id,
          objectGroup: group, returnByValue: false, silent: true,
        });
        if (result.exceptionDetails || result.result.type !== 'function') throw refusal('EARLY_CDP_MISSING_EXPORT');
        exportHandle = result.result.objectId;
        const exported = await properties(exportHandle);
        const exportedLocation = location(exported);
        if (exportedLocation?.scriptId !== script.scriptId) throw refusal('EARLY_CDP_FOREIGN_EXPORT');
        scopeHandle = exported.internalProperties.find(row => row.name === '[[Scopes]]')?.value?.objectId;
        const scopeRows = (await properties(scopeHandle)).result;
        let dependencies;
        for (const row of scopeRows.filter(row => /^\d+$/.test(row.name))) {
          const members = (await properties(row.value?.objectId)).result;
          if (members.some(row => row.name === 'GetLockDeferredDefault')) { dependencies = members; break; }
        }
        const getter = dependencies?.find(row => row.name === 'GetLockDeferredDefault');
        const cache = dependencies?.find(row => row.name === 'LockDeferredDefault');
        if (getter?.value?.type !== 'function' || cache?.value?.type !== 'undefined') {
          throw refusal('EARLY_CDP_LEXICAL_MISMATCH');
        }
        getterHandle = getter.value.objectId;
        if (location(await properties(getterHandle))?.scriptId !== script.scriptId) {
          throw refusal('EARLY_CDP_FOREIGN_LEXICAL');
        }
        const same = await query('Runtime.callFunctionOn', {
          objectId: exportHandle, functionDeclaration: 'function(){return this===globalThis.bg.LockDeferred}',
          returnByValue: true, silent: true,
        });
        if (same.exceptionDetails || same.result.value !== true) throw refusal('EARLY_CDP_EXPORT_REPLACED');
        guard(); acquired = true; trace.push('same-page-scopes-retained');
        return { scriptId: script.scriptId, executionContextId: context.id, targetId,
          sourceSha256: hash(source), getterLocation: location(await properties(getterHandle)),
          trace: [...trace], nativeProvider: false };
      } catch (error) { throw hold(error); }
      finally { pending--; }
    },
    validate() { guard(); },
    async dispose() {
      if (pending) throw refusal('EARLY_CDP_PENDING_DISPOSAL');
      if (disposed) return;
      if (session) {
        await session.send('Runtime.releaseObjectGroup', { objectGroup: group });
        for (const objectId of [exportHandle, getterHandle, scopeHandle].filter(Boolean)) {
          let inaccessible = false;
          try { await session.send('Runtime.getProperties', { objectId, ownProperties: true }); }
          catch { inaccessible = true; }
          if (!inaccessible) throw refusal('EARLY_CDP_RELEASE_NOT_CONFIRMED');
        }
        await session.detach();
      }
      disposed = true; trace.push('original-group-released-session-detached');
    },
    facts() { return { held, first, pending, disposed, trace: [...trace], nativeProvider: false }; },
  };
}
