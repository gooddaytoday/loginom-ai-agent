// Private owner operation; intentionally absent from the model tool catalog.
export function createSessionCompletion({ identity, execute, persist }) {
  let revision = 0, saved, locked = false;
  const receipts = new Map();
  const saves = new Map();
  const equal = (a,b) => !!a && !!b && Object.keys(a).length === Object.keys(b).length
    && Object.keys(a).every(key => a[key] === b[key]);
  const binding = () => {
    if (!saved || saved.revision !== revision) throw Error('LOGINOM_SESSION_SAVE_REQUIRED');
    const observed = identity();
    if (!observed || !observed.attemptId || !observed.documentId || !observed.account)
      throw Error('LOGINOM_SESSION_BINDING_INVALID');
    return {...observed, packagePath:saved.path, saveOperationId:saved.operation, mutationRevision:revision};
  };
  return {
    assertOpen() { if (locked) throw Error('LOGINOM_SESSION_COMPLETION_PENDING'); },
    mutated() {
      if (locked) throw Error('LOGINOM_SESSION_COMPLETION_PENDING');
      revision++;
    },
    saved(path, operation) {
      if (locked) throw Error('LOGINOM_SESSION_COMPLETION_PENDING');
      // An executor may return a cached SUCCEEDED receipt for the same operation.
      // It proves the original save only, never a save after a later mutation.
      const previous = saves.get(operation);
      if (previous) {
        if (previous.path !== path) throw Error('LOGINOM_SESSION_COMPLETION_CONFLICT');
        return;
      }
      saved = {path, operation, revision};
      saves.set(operation, saved);
    },
    options() { return structuredClone(binding()); },
    status(completionId) { return structuredClone(receipts.get(completionId) ?? null); },
    async finish(request) {
      if (!request || typeof request.completionId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(request.completionId) || !request.binding)
        throw Error('LOGINOM_SESSION_BINDING_INVALID');
      const previous = receipts.get(request.completionId);
      if (previous) {
        if (!equal(previous.binding, request.binding)) throw Error('LOGINOM_SESSION_COMPLETION_CONFLICT');
        return structuredClone(previous);
      }
      if (locked) throw Error('LOGINOM_SESSION_COMPLETION_PENDING');
      const actual = binding();
      if (!equal(actual, request.binding)) throw Error('LOGINOM_SESSION_COMPLETION_CONFLICT');
      locked = true;
      const unknown = {version:1, completionId:request.completionId, binding:actual,
        status:'UNKNOWN', packageClosed:false, loggedOut:false, reason:'COMPLETION_UNCONFIRMED'};
      receipts.set(request.completionId, unknown);
      // Save intent before the first possible external effect.
      await persist(unknown);
      let receipt;
      try {
        const result = await execute(actual);
        const succeeded = result?.status === 'SUCCEEDED' && result.package_closed === true && result.logged_out === true
          && result.unsaved_changes_discarded === false && result.packages_before === 1 && result.packages_after === 0
          && result.session_id === actual.sessionId && result.document_id === actual.documentId
          && result.account === actual.account && result.package_path === actual.packagePath;
        receipt = succeeded
          ? {...unknown, status:'SUCCEEDED', packageClosed:true, loggedOut:true, reason:null}
          : {...unknown, status:result?.status === 'BLOCKED' ? 'BLOCKED' : 'UNKNOWN', reason:'OWN_SESSION_CLEANUP_UNCONFIRMED'};
      } catch { receipt = unknown; }
      await persist(receipt);
      receipts.set(request.completionId, receipt);
      return structuredClone(receipt);
    },
  };
}
