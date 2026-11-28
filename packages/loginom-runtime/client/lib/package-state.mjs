// Runs in the Loginom page. A verified preparation receipt identifies the
// conversation's package even when another package is active.
export async function readPackageState({ origin, build, documentId, operationId, account, sessionId, save }) {
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
      || !connection.Session || receipt.openConnection !== connection || receipt.openServerSession !== connection.Session
      || !receipt.packageNode || !Number.isSafeInteger(map.PackageNodes?.Count) || map.PackageNodes.Count < 0) return null;
    const node = receipt.packageNode;
    const open = Array.from({ length: map.PackageNodes.Count }, (_, i) => map.PackageNodes.Items(i)).includes(node);
    const path = open && typeof node.PackageFileName === 'string' && node.PackageFileName
      ? '/' + node.PackageFileName.replaceAll('\\', '/').replace(/^\/+/, '')
      : null;
    return { receipt, connection, session: connection.Session, node, form, proxy: open ? node.Package : null,
      open, path, packageCount: map.PackageNodes.Count };
  };

  const before = snapshot();
  if (!before) return null;
  if (!before.open) return { open: false, path: null, modified: null, packageCount: before.packageCount };
  const readModified = async (timeout = 3000) => {
    if (!before.proxy || timeout <= 0) return null;
    let timer;
    try {
      const value = await Promise.race([
        before.session.IsPackageModified(before.proxy),
        new Promise(resolve => { timer = setTimeout(resolve, timeout); }),
      ]);
      return typeof value === 'boolean' ? value : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const modified = await readModified();
  const after = snapshot();
  if (!after || Object.keys(before).some(key => before[key] !== after[key])) return null;
  if (save) {
    if (save.path !== before.path || typeof modified !== 'boolean') return null;
    if (!modified) return { status: 'clean' };
    if (before.node.ReadOnly !== false || before.node.HasRunningNodes() !== false) return null;
    const active = () => {
      let node = before.form.Items.Workspace.getActiveTab()?.Controller?.Node?.data?.node;
      for (let depth = 0; node && depth < 32; depth++, node = node.ParentNode) if (node === before.node) return true;
      return false;
    };
    const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    const blocked = () => [...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible);
    const button = tid => {
      const matches = [...document.querySelectorAll(`[data-tid="${tid}"]`)].filter(visible);
      return matches.length === 1 && !matches[0].closest('[aria-disabled="true"],.x-item-disabled,.x-btn-disabled,[disabled]') ? matches[0] : null;
    };
    const same = (allowNewPath = false) => {
      const current = snapshot();
      return current && Object.keys(before).every(key => key === 'path' && allowNewPath && before.path === null
        || current[key] === before[key]) ? current : null;
    };
    const saveButton = () => button(before.path === null ? 'MF;MainMenuForm;btnSaveAsPackage' : 'MF;MainMenuForm;btnSavePackage');
    if (!active() || blocked()) return null;
    if (!saveButton()) button('MF;cntMain;tlbMainToolbar;btnPackagesMenu')?.click();
    const menuDeadline = Date.now() + 2000;
    const wait = () => new Promise(resolve => setTimeout(resolve, 100));
    while (!saveButton() && Date.now() < menuDeadline && same() && active() && !blocked()) await wait();
    const control = saveButton();
    if (!control || Date.now() >= menuDeadline || !same() || !active() || blocked() || before.node.HasRunningNodes() !== false) return null;
    control.click();
    const deadline = Date.now() + (before.path === null ? 45000 : 8000);
    while (Date.now() < deadline && same(true)) {
      if (!blocked() && !saveButton() && await readModified(Math.min(3000, deadline - Date.now())) === false) {
        const confirmed = same(true);
        if (confirmed?.path?.endsWith('.lgp') && !blocked())
          return { status: 'saved', lastSave: { path: confirmed.path, confirmedAt: Date.now() } };
      }
      await wait();
    }
    return null;
  }
  return { open: true, path: before.path, modified };
}

export function packageTarget(metadata, context, origin) {
  const preparation = metadata.workspacePreparation;
  const prepared = preparation?.state;
  if (!prepared || metadata.workspaceReady !== true || !origin) return null;
  const pages = context.pages().filter(page => URL.canParse(page.url()) && new URL(page.url()).origin === origin);
  if (pages.length !== 1) return null;
  return { page: pages[0], owner: {
    origin, build: metadata.targetIdentity?.loginom_build, documentId: prepared.document_id,
    operationId: preparation.operation_id, account: prepared.loginom_account, sessionId: metadata.sessionId,
  } };
}

export function createPackageStateReader(metadata, loginomUrl, now = Date.now) {
  const origin = loginomUrl && new URL(loginomUrl).origin;
  let dirty;
  return async (context, lastSavedPackage, busy) => {
    const preparation = metadata.workspacePreparation;
    const prepared = preparation?.state;
    const lastSave = lastSavedPackage ? { path: lastSavedPackage.path, confirmedAt: lastSavedPackage.confirmedAt } : null;
    let observation = null;
    if (!preparation && !busy) observation = { open: false, path: null, modified: null };
    const target = !busy && packageTarget(metadata, context, origin);
    if (target) {
      observation = await target.page.evaluate(readPackageState, target.owner).catch(() => null);
      if (metadata.workspacePreparation !== preparation || metadata.workspaceReady !== true) observation = null;
    }

    const identity = JSON.stringify([prepared?.document_id, prepared?.workflow_ref?.tab_tid, observation?.path]);
    if (observation?.open === false || observation?.modified === false) dirty = undefined;
    if (observation?.modified === true && dirty?.identity !== identity) dirty = { identity, at: now() };
    return {
      open: observation?.open ?? null,
      path: observation?.path ?? null,
      modified: observation?.modified ?? null,
      modifiedDetectedAt: observation?.modified === true ? dirty.at : null,
      lastSave,
    };
  };
}
