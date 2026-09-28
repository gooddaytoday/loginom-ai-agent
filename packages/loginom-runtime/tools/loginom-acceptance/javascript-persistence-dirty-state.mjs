// Serialized read-only observation after a verified save. The retained owner
// must still be the one admitted before the save; a matching path is not enough.
export async function readJavascriptSavedDirtyState({owner, request}) {
  const snapshot = () => {
    const app = globalThis.bg?.app, form = app?.Application?.FInstance?.FMainForm;
    const map = form?.FMapTree, connection = map?.FServerConnection;
    const preparation = globalThis.__loginomDockPreparationV1;
    const card = form?.Items?.Workspace?.getActiveTab?.(), controller = card?.Controller;
    const packageNode = map?.PackageNodes?.Count === 1 ? map.PackageNodes.Items(0) : null;
    const rawPath = packageNode?.PackageFileName;
    const path = typeof rawPath === 'string' && rawPath.length
      ? '/' + rawPath.replaceAll('\\', '/').replace(/^\/+/, '') : null;
    const records = preparation?.receipts instanceof Map
      ? [...preparation.receipts.values()].filter(row => row.phase === 'verified'
        && row.workflowId === request.prepared.workflow_ref.workflow_id) : [];
    const tab = records[0]?.tab;
    const container = controller?.FController?.FDiagram?.FmxGraph?.container;
    if (location.origin !== 'http://logi-test-plan.bg.local' || app?.Version !== '7.4.2'
      || request.account !== 'jsteach' || connection?.Connected !== true || connection.UserName !== request.account
      || preparation?.document !== document || preparation.id !== request.prepared.document_id
      || preparation.receipts.size > 128 || records.length !== 1 || records[0].packageNode !== owner.packageNode
      || card !== owner.card || controller !== owner.controller
      || controller?.Node?.data?.node !== owner.workflow || packageNode !== owner.packageNode
      || tab !== owner.tab || !tab?.isConnected || !tab.classList.contains('x-tab-active')
      || tab.getAttribute('data-tid') !== request.prepared.workflow_ref.tab_tid
      || container !== owner.container || !container?.isConnected
      || container.getAttribute('data-tid') !== request.prepared.workflow_ref.prefix + ';ModelForm;cmpDiagram'
      || request.prepared.package_ref?.persisted !== true || request.prepared.package_ref.path !== request.path
      || path !== request.path || packageNode.ReadOnly !== false || packageNode.HasRunningNodes?.() !== false
      || !packageNode.Package || !connection.Session || typeof connection.Session.IsPackageModified !== 'function')
      throw Error('Saved JavaScript dirty-state owner changed');
    return {card, controller, packageNode, packageProxy: packageNode.Package,
      connection, session: connection.Session};
  };
  const before = snapshot();
  const modified = await before.session.IsPackageModified(before.packageProxy);
  const after = snapshot();
  if (Object.keys(before).some(key => before[key] !== after[key]) || typeof modified !== 'boolean')
    throw Error('Saved JavaScript dirty-state result unconfirmed');
  return {version: 1, document_id: request.prepared.document_id,
    workflow_id: request.prepared.workflow_ref.workflow_id, package_path: request.path,
    modified, read_only: true, observation: 'after_confirmed_save'};
}

export function verifyJavascriptSavedDirtyState(state, request) {
  if (state?.version !== 1 || state.document_id !== request.prepared.document_id
    || state.workflow_id !== request.prepared.workflow_ref.workflow_id
    || state.package_path !== request.path || typeof state.modified !== 'boolean'
    || state.read_only !== true || state.observation !== 'after_confirmed_save')
    throw Error('Saved JavaScript dirty-state receipt differs');
  return state;
}
