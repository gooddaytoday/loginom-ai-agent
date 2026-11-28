// Runs in the Loginom page. A verified preparation receipt identifies the
// conversation's package even when another package is active.
export async function readPackageState({ origin, build, documentId, operationId, account, sessionId }) {
  const snapshot = () => {
    const app = globalThis.bg?.app;
    const form = app?.Application?.FInstance?.FMainForm;
    const map = form?.FMapTree;
    const connection = map?.FServerConnection;
    const preparation = globalThis.__loginomDockPreparationV1;
    const receipt = preparation?.receipts?.get(operationId);
    if (location.origin !== origin || app?.Version !== build || form?.FReconnecting === true
      || preparation?.document !== document || preparation?.id !== documentId
      || !['verified', 'superseded'].includes(receipt?.phase)
      || JSON.parse(receipt.request).session !== sessionId
      || connection?.Connected !== true || connection.UserName !== account
      || !connection.Session || receipt.stepSession?.connection !== connection
      || receipt.stepSession.nativeSession !== connection.Session
      || !receipt.packageNode || !Number.isSafeInteger(map.PackageNodes?.Count) || map.PackageNodes.Count < 0) return null;
    const node = receipt.packageNode;
    const open = Array.from({ length: map.PackageNodes.Count }, (_, i) => map.PackageNodes.Items(i)).includes(node);
    const path = open && typeof node.PackageFileName === 'string' && node.PackageFileName
      ? '/' + node.PackageFileName.replaceAll('\\', '/').replace(/^\/+/, '')
      : null;
    return { preparation, receipt, node, connection, session: connection.Session, proxy: open ? node.Package : null, open, path };
  };

  const before = snapshot();
  if (!before) return null;
  if (!before.open) return { open: false, path: null, modified: null };
  const { preparation } = before;
  let modified = null;
  // The RPC deadline only bounds the wait. Keep the native read registered
  // until Loginom settles it, even when a new preparation receipt is active.
  if (before.proxy && !preparation.packageStateRead) {
    let timer;
    try {
      const pending = Promise.resolve(before.session.IsPackageModified(before.proxy))
        .finally(() => { delete preparation.packageStateRead; });
      preparation.packageStateRead = pending;
      const value = await Promise.race([
        pending,
        new Promise(resolve => { timer = setTimeout(resolve, 3000); }),
      ]);
      if (typeof value === 'boolean') modified = value;
    } catch {
      // The inventory can still establish that the package is open.
    } finally {
      clearTimeout(timer);
    }
  }
  const after = snapshot();
  if (!after || Object.keys(before).some(key => before[key] !== after[key])) return null;
  // A pathless draft and a replacement node can have identical paths.
  if (preparation.packageStateIdentity?.node !== before.node) {
    preparation.packageStateIdentity = { node: before.node, id: (preparation.packageStateIdentity?.id ?? 0) + 1 };
  }
  return { open: true, path: before.path, modified, packageId: preparation.packageStateIdentity.id };
}

export function createPackageStateReader(metadata, loginomUrl, now = Date.now) {
  const origin = loginomUrl && new URL(loginomUrl).origin;
  const browserPending = Symbol('browser read pending');
  let evaluation;
  let dirty;
  let lastConfirmed;
  return async (context, lastConfirmedSave, busy) => {
    const lastSave = lastConfirmedSave ? { path: lastConfirmedSave.path, confirmedAt: lastConfirmedSave.confirmedAt } : null;
    const preparation = metadata.workspacePreparation;
    const prepared = preparation?.state;
    const stillPrepared = () => !!prepared && metadata.workspaceReady === true && metadata.workspacePreparation === preparation;
    const cachedSnapshot = () => ({
      ...lastConfirmed.snapshot,
      lastSave,
      staleForSeconds: Math.floor(Math.max(0, now() - lastConfirmed.at) / 1000),
    });
    let observation = evaluation ? browserPending : null;
    if (!preparation && !busy) observation = { open: false, path: null, modified: null };
    if (stillPrepared() && origin && !busy && !evaluation) {
      const pages = context.pages().filter(page => URL.canParse(page.url()) && new URL(page.url()).origin === origin);
      if (pages.length === 1) {
        let timer;
        try {
          evaluation = pages[0].evaluate(readPackageState, {
            origin,
            build: metadata.targetIdentity?.loginom_build,
            documentId: prepared.document_id,
            operationId: preparation.operation_id,
            account: prepared.loginom_account,
            sessionId: metadata.sessionId,
          }).finally(() => { evaluation = undefined; });
          observation = await Promise.race([
            evaluation,
            // Bound the browser round trip, including time before page code can run.
            new Promise(resolve => { timer = setTimeout(resolve, 4000, browserPending); }),
          ]);
        } catch {
          observation = null;
        } finally {
          clearTimeout(timer);
        }
      }
      if (!stillPrepared()) observation = null;
    }

    if (stillPrepared() && lastConfirmed?.preparation === preparation) {
      if (busy || observation === browserPending) return cachedSnapshot();
      // Without a valid binding, future requests need a fresh observation.
      if (observation === null) lastConfirmed = undefined;
    }
    if (observation === browserPending) observation = null;

    const identity = JSON.stringify([prepared?.document_id, prepared?.loginom_account, observation?.packageId, observation?.path]);
    if (observation?.open && observation.modified === null && lastConfirmed?.identity === identity
      && typeof lastConfirmed.snapshot.modified === 'boolean') {
      // The browser verified the same package under this preparation.
      lastConfirmed.preparation = preparation;
      return cachedSnapshot();
    }
    if (observation?.open === false || observation?.modified === false) dirty = undefined;
    const at = now();
    if (observation?.modified === true && dirty?.identity !== identity) dirty = { identity, at };
    const snapshot = {
      open: observation?.open ?? null,
      path: observation?.path ?? null,
      modified: observation?.modified ?? null,
      modifiedDetectedAt: observation?.modified === true ? dirty.at : null,
      lastSave,
      staleForSeconds: null,
    };
    if (observation) lastConfirmed = { snapshot, at, identity, preparation };
    return snapshot;
  };
}
