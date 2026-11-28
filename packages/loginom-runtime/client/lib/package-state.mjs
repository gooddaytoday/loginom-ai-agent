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
    const boundConnection = receipt?.stepSession?.connection ?? receipt?.openConnection;
    const boundSession = receipt?.stepSession?.nativeSession ?? receipt?.openServerSession;
    if (location.origin !== origin || app?.Version !== build || form?.FReconnecting === true
      || preparation?.document !== document || preparation?.id !== documentId
      || !['verified', 'superseded'].includes(receipt?.phase)
      || JSON.parse(receipt.request).session !== sessionId
      || connection?.Connected !== true || connection.UserName !== account
      || !connection.Session || boundConnection !== connection || boundSession !== connection.Session
      || !receipt.packageNode || !Number.isSafeInteger(map.PackageNodes?.Count) || map.PackageNodes.Count < 0) return null;
    const node = receipt.packageNode;
    // The first issued workflow ID for this native package is stable across branches.
    const workflowIds = [...new Set([...preparation.receipts.values()]
      .filter(entry => entry.packageNode === node && entry.workflowId && ['verified', 'superseded'].includes(entry.phase)
        && (entry.stepSession?.connection ?? entry.openConnection) === connection
        && (entry.stepSession?.nativeSession ?? entry.openServerSession) === connection.Session
        && JSON.parse(entry.request).session === sessionId)
      .map(entry => entry.workflowId))];
    const open = Array.from({ length: map.PackageNodes.Count }, (_, i) => map.PackageNodes.Items(i)).includes(node);
    const path = open && typeof node.PackageFileName === 'string' && node.PackageFileName
      ? '/' + node.PackageFileName.replaceAll('\\', '/').replace(/^\/+/, '')
      : null;
    return { receipt, connection, session: connection.Session, proxy: open ? node.Package : null, open, path, workflowIds };
  };

  const before = snapshot();
  if (!before) return null;
  if (!before.open) return { open: false, path: null, modified: null, workflowIds: before.workflowIds };
  let modified = null;
  if (before.proxy) {
    let timer;
    try {
      const value = await Promise.race([
        before.session.IsPackageModified(before.proxy),
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
  if (!after || Object.keys(before).some(key => key !== 'workflowIds' && before[key] !== after[key])
    || before.workflowIds.join() !== after.workflowIds.join()) return null;
  return { open: true, path: before.path, modified, workflowIds: before.workflowIds };
}

export function createPackageStateReader(metadata, loginomUrl, now = Date.now) {
  const origin = loginomUrl && new URL(loginomUrl).origin;
  let evaluation;
  let dirty;
  const confirmedPaths = new Map();
  let confirmedOwner;
  return async (context, lastSavedPackage, busy, openedPackage) => {
    const preparation = metadata.workspacePreparation;
    const prepared = preparation?.state;
    let observation = null;
    if (!preparation && !busy) observation = { open: false, path: null, modified: null };
    if (prepared && metadata.workspaceReady === true && origin && !busy && !evaluation) {
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
            // Include time before page code can run and keep at most one stalled evaluation.
            new Promise(resolve => { timer = setTimeout(resolve, 4000, null); }),
          ]);
        } catch {
          observation = null;
        } finally {
          clearTimeout(timer);
        }
      }
      if (metadata.workspacePreparation !== preparation || metadata.workspaceReady !== true) observation = null;
    }

    const current = metadata.workspacePreparation === preparation && metadata.workspaceReady === true
      && prepared?.status === 'READY';
    const workflowId = prepared?.workflow_ref?.workflow_id;
    if (current && observation?.workflowIds?.includes(workflowId)) {
      confirmedOwner = { preparation, workflowIds: Array.from(observation.workflowIds) };
    }
    const workflowIds = confirmedOwner && confirmedOwner.preparation === preparation ? confirmedOwner.workflowIds : undefined;
    const packageId = workflowIds?.[0];
    const identity = JSON.stringify([prepared?.document_id, packageId ?? workflowId, observation?.path]);
    if (observation?.open === false || observation?.modified === false) dirty = undefined;
    if (observation?.modified === true && dirty?.identity !== identity) dirty = { identity, at: now() };

    const ownsPath = (documentId, sourceWorkflow) => documentId === prepared?.document_id
      && (sourceWorkflow === workflowId || workflowIds?.includes(sourceWorkflow));
    const save = lastSavedPackage && ownsPath(lastSavedPackage.document_id, lastSavedPackage.workflow_id)
      ? lastSavedPackage : undefined;
    const openedPath = openedPackage && ownsPath(openedPackage.documentID, openedPackage.workflowID)
      ? openedPackage.path : undefined;
    const knownPath = save?.path ?? openedPath;
    const isPackagePath = path => typeof path === 'string' && /^\/[^\r\n]+\.lgp$/i.test(path);
    const preparedPath = prepared?.package_ref;
    // A prepared draft has no filename until Loginom assigns a saved path.
    const observedPath = current && packageId && isPackagePath(observation?.path)
      && (isPackagePath(knownPath) || preparedPath?.path === null || preparedPath?.persisted === true)
      ? observation.path : undefined;
    if (observedPath) confirmedPaths.set(packageId, { path: observedPath, at: now() });
    const confirmed = confirmedPaths.get(packageId);
    const path = observedPath ?? (confirmed && confirmed.at >= (save?.confirmedAt ?? 0) ? confirmed.path : knownPath);
    const copy = current && isPackagePath(path)
      ? {
          document_id: prepared.document_id,
          workflow_id: workflowId,
          ...(workflowIds ? { workflow_ids: workflowIds } : {}),
          path,
          lastSave: observation?.path !== path || observation?.modified !== false,
        }
      : null;
    return {
      open: observation?.open ?? null,
      path: observation?.path ?? null,
      modified: observation?.modified ?? null,
      modifiedDetectedAt: observation?.modified === true ? dirty.at : null,
      lastSave: save ? { path: save.path, confirmedAt: save.confirmedAt } : null,
      ...(copy ? { copy } : {}),
    };
  };
}
