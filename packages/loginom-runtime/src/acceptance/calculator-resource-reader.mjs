// Private Calculator caller capability. Native references stay in their Page;
// only the current session's bounded observations cross the handle boundary.
export async function createCalculatorResourceReader(owner) {
  const binding = owner.readinessBinding;
  const assertOwner = () => {
    if (!binding || owner.closed || owner.id !== binding.id || owner.account !== binding.account
        || owner.origin !== binding.origin || owner.page !== binding.page || owner.context !== binding.context
        || owner.deadline !== binding.deadline || owner.signal !== binding.signal
        || binding.page.isClosed() || binding.context.pages().length !== 1
        || binding.context.pages()[0] !== binding.page) throw Error('LOGINOM_CALCULATOR_OWNER_CHANGED');
    if (binding.signal?.aborted) throw binding.signal.reason;
  };
  assertOwner();
  let operation, disposed = false, handle, readStarted = false, readFailure;
  const start = async (fn, deadline = null) => {
    assertOwner();
    if (deadline != null && (!Number.isSafeInteger(deadline) || Date.now() >= deadline))
      throw Error('LOGINOM_CALCULATOR_READ_DEADLINE');
    if (disposed || operation?.state === 'pending') throw Error('LOGINOM_CALCULATOR_READ_PENDING');
    const current = {state: 'pending'};
    operation = current;
    const promise = Promise.resolve().then(fn).then(value => {
      current.state = 'fulfilled'; assertOwner(); return value;
    }, error => { current.state = 'rejected'; current.error = error; throw error; });
    let timer, abort;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('LOGINOM_CALCULATOR_READ_DEADLINE')),
          Math.max(0, Math.min(5000, deadline == null ? 5000 : deadline - Date.now())));
        abort = () => reject(binding.signal.reason);
        binding.signal?.addEventListener('abort', abort, {once: true});
      })]);
    } finally { clearTimeout(timer); binding.signal?.removeEventListener('abort', abort); }
  };
  // Install custody before the first asynchronous Page operation, including
  // handle acquisition. A lost response never authorizes context disposal.
  const reader = Object.freeze({
    async read({deadline = null} = {}) {
      if (readStarted) { if (readFailure) throw readFailure.value; throw Error('LOGINOM_CALCULATOR_READ_CONSUMED'); }
      readStarted = true;
      try { return await start(() => handle.evaluate(async refs => {
        const same = () => {
          const marker = globalThis.__loginomStartupV1;
          const app = globalThis.bg?.app;
          const tree = app?.Application?.FInstance?.FMainForm?.FMapTree;
          return document === refs.document && marker === refs.marker && marker?.document === document
            && marker.id === refs.id && marker.account === refs.account && location.origin === refs.origin
            && app?.Version === '7.4.2' && tree === refs.tree && tree.FServerConnection === refs.connection
            && refs.connection.Session === refs.session && refs.connection.Connected === true
            && refs.connection.UserName === refs.account && tree.PackageNodes === refs.packages;
        };
        if (!same()) throw Error('LOGINOM_CALCULATOR_NATIVE_IDENTITY_CHANGED');
        const count = refs.packages.Count, running = refs.tree.HasRunningNodes();
        if (!Number.isSafeInteger(count) || count < 0)
          throw new Error('LOGINOM_CALCULATOR_RESOURCE_FACT_UNKNOWN', {cause: count});
        if (typeof running !== 'boolean')
          throw new Error('LOGINOM_CALCULATOR_RESOURCE_FACT_UNKNOWN', {cause: running});
        const user = await refs.session.get_CurrentUser();
        if (!same()) throw Error('LOGINOM_CALCULATOR_NATIVE_IDENTITY_CHANGED');
        const name = await user.get_Name();
        if (!same() || name !== refs.account || refs.packages.Count !== count
            || refs.tree.HasRunningNodes() !== running) throw Error('LOGINOM_CALCULATOR_RESOURCE_CHANGED');
        return {scope: 'current-owned-session', owner: refs.id, account: refs.account,
          package_count: count, running, observed_at: new Date().toISOString(),
          historical_cleanup_verified: false, account_wide_safety_verified: false};
      }), deadline); } catch (value) { readFailure = {value}; throw value; }
    },
    assertSettled() {
      if (operation?.state === 'pending') throw Error('LOGINOM_CALCULATOR_READ_PENDING');
    },
    async dispose() {
      reader.assertSettled();
      if (disposed) return;
      assertOwner();
      // Disposal participates in the same custody guard; no second disposal
      // or native cleanup may overtake an unresolved original callback.
      await start(async () => { if (handle) await handle.dispose(); });
      disposed = true;
    },
  });
  if (owner.calculatorResourceReader) throw Error('LOGINOM_CALCULATOR_READER_ALREADY_BOUND');
  owner.calculatorResourceReader = reader;
  await start(async () => { handle = await binding.page.evaluateHandle(expected => {
    const marker = globalThis.__loginomStartupV1, app = globalThis.bg?.app;
    const tree = app?.Application?.FInstance?.FMainForm?.FMapTree;
    const connection = tree?.FServerConnection;
    if (marker?.document !== document || marker.id !== expected.id || marker.account !== expected.account
        || location.origin !== expected.origin || app?.Version !== '7.4.2'
        || connection?.Connected !== true || connection.UserName !== expected.account
        || !connection.Session || !tree.PackageNodes) throw Error('LOGINOM_CALCULATOR_NATIVE_BINDING_REFUSED');
    return {document, marker, tree, connection, session: connection.Session, packages: tree.PackageNodes, ...expected};
  }, {id: binding.id, account: binding.account, origin: binding.origin}); }, binding.deadline);
  return reader;
}
