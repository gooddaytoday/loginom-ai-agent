// Private operator admission. Saved packages require an exact independently
// assigned path; passing persisted=true never relaxes the draft constructor.
export async function bindJavascriptPackage({page, prepared, account, savedPath}) {
  const request = javascriptPackageBindingRequest({prepared, account, savedPath});
  return page.evaluateHandle(observeJavascriptPackageBinding, request);
}

export function javascriptPackageBindingRequest({prepared, account, savedPath}) {
  if (account !== 'jsteach' || prepared?.status !== 'READY' || !prepared.document_id
    || typeof prepared.document_id !== 'string' || !prepared.workflow_ref
    || ['workflow_id', 'prefix', 'tab_tid'].some(key => typeof prepared.workflow_ref[key] !== 'string' || !prepared.workflow_ref[key]))
    throw Error('JavaScript package preparation incomplete');
  if (savedPath === undefined) {
    if (prepared.package_ref?.persisted !== false || prepared.package_ref.path != null)
      throw Error('Own JavaScript draft required');
  } else {
    requireJavascriptSavedPackagePath(savedPath);
    if (prepared.package_ref?.persisted !== true || prepared.package_ref.path !== savedPath)
      throw Error('Exact owned saved JavaScript package required');
  }
  return {prepared: structuredClone(prepared), account, path: savedPath ?? null};
}

export function requireJavascriptSavedPackagePath(path) {
  if (typeof path !== 'string'
    || !/^\/jsteach\/js-g2-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/JavaScript-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.lgp$/.test(path))
    throw Error('Exact owned saved JavaScript package required');
  return path;
}

// Serialized read-only native observation; no server calls or setters. The
// optional previous handle proves the same objects, not just matching GUIDs.
export function observeJavascriptPackageBinding({prepared, account, path, previous, checkOnly = false}) {
  const app = globalThis.bg?.app, form = app?.Application?.FInstance?.FMainForm;
  const preparation = globalThis.__loginomDockPreparationV1, map = form?.FMapTree;
  const card = form?.Items?.Workspace?.getActiveTab?.(), controller = card?.Controller;
  const workflow = controller?.Node?.data?.node, diagram = controller?.FController?.FDiagram;
  if (location.origin !== 'http://logi-test-plan.bg.local' || app?.Version !== '7.4.2'
    || account !== 'jsteach' || map?.FServerConnection?.UserName !== account || map.FServerConnection.Connected !== true
    || preparation?.document !== document || preparation.id !== prepared.document_id
    || !(preparation.receipts instanceof Map) || preparation.receipts.size > 128 || !workflow
    || map.PackageNodes?.Count !== 1) throw Error('JavaScript package native admission changed');
  const records = [...preparation.receipts.values()].filter(row => row.phase === 'verified'
    && row.workflowId === prepared.workflow_ref.workflow_id);
  if (records.length !== 1) throw Error('JavaScript package receipt is not unique');
  const packageNode = map.PackageNodes.Items(0), tab = records[0].tab;
  const rawPath = packageNode?.PackageFileName;
  const actualPath = typeof rawPath === 'string' && rawPath.length ? '/' + rawPath.replaceAll('\\', '/').replace(/^\/+/, '') : null;
  const ancestors = new Set();
  for (let node = workflow; node && ancestors.size < 32 && !ancestors.has(node); node = node.ParentNode) ancestors.add(node);
  const container = diagram?.FmxGraph?.container;
  if (typeof rawPath !== 'string' || actualPath !== path || !ancestors.has(packageNode)
    || records[0].packageNode !== packageNode
    || (records[0].nodeTargetWorkflowNode && records[0].nodeTargetWorkflowNode !== workflow)
    || !tab?.isConnected || tab.getAttribute('data-tid') !== prepared.workflow_ref.tab_tid
    || !tab.classList.contains('x-tab-active') || !container?.isConnected
    || container.getAttribute('data-tid') !== prepared.workflow_ref.prefix + ';ModelForm;cmpDiagram')
    throw Error('JavaScript package path/workflow binding differs');
  const result = {document, card, controller, workflow, packageNode, tab, diagram, container};
  if (previous && Object.keys(result).some(key => result[key] !== previous[key]))
    throw Error('JavaScript package native owner replaced');
  if (checkOnly) return {verified: true, document_id: prepared.document_id,
    workflow_id: prepared.workflow_ref.workflow_id, package_path: actualPath, package_name: packageNode.PackageName ?? null};
  return result;
}
