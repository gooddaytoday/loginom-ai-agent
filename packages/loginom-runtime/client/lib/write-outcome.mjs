import { stepWriteTool } from './step-retry.mjs';

const reads = new Set(['dock_workspace_observe', 'dock_action_describe', 'dock_operation_inspect',
  'dock_node_status', 'dock_node_wait', 'dock_node_source', 'dock_node_context', 'dock_artifact_delivery_status',
  'dock_storage_source', 'dock_storage_list', 'dock_storage_download_status', 'dock_storage_download_wait',
  'browser_snapshot', 'browser_find', 'browser_take_screenshot', 'browser_wait_for']);

export function savedPackagePath(value) {
  return typeof value === 'string' && /^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/i.test(value)
    && !value.split('/').some(part => part === '.' || part === '..') ? value : null;
}

export function writeIntent(input, workspace, { owner, uploadPath, knownOperation }) {
  const { name, arguments: args } = input;
  const prepare = name === 'dock_prepare';
  if (name === 'dock_node_stop' || name === 'dock_node_cancel')
    return { effect: 'control', owner, operationId: args?.operation_id };
  if (reads.has(name) || name === 'dock_node_read' && (args?.execution ?? 'existing') === 'existing'
    || name === 'dock_browser_recovery' && args?.action === 'status'
    || prepare && !input.packageArtifact && ['open_package', 'existing_workflow'].includes(args?.intent))
    return { effect: 'read' };
  const action = name === 'dock_action_run' && typeof args?.action_key === 'string' ? args.action_key : name;
  const save = name === 'dock_action_run' && stepWriteTool(name, args);
  const operationID = typeof args?.operation_id === 'string' && args.operation_id.length ? args.operation_id : null;
  const current = savedPackagePath(workspace?.package_ref?.path);
  const destination = savedPackagePath(save ? args?.parameters?.path : uploadPath);
  return {
    effect: save ? 'save' : prepare ? 'package' : name.startsWith('dock_node_') || action.startsWith('node.') ? 'node' : 'other',
    operation: action,
    paths: [...new Set([current, destination].filter(Boolean))],
    receipt: { owner, operationID, fresh: operationID !== null && !knownOperation(operationID) },
    baseline: {
      document: workspace?.document_id ?? null,
      workflow: workspace?.workflow_ref?.workflow_id ?? null,
      packagePath: destination ?? current,
      savedDigest: null,
      draft: workspace?.package_ref?.persisted === false || prepare && !input.packageArtifact && (args?.intent ?? 'new_draft') === 'new_draft',
    },
  };
}

export function writeReplyVerdict(reply, name, args) {
  if (stepWriteTool(name, args)) return;
  let result = reply.structuredContent;
  if (!result && reply.content?.[0]?.type === 'text') {
    try { result = JSON.parse(reply.content[0].text); } catch { return name?.startsWith('browser_') && !reply.isError ? 'applied' : undefined; }
  }
  const outcome = result?.outcome ?? result?.output?.outcome ?? result;
  if (['AMBIGUOUS', 'unresolved', 'pending'].includes(outcome?.status)) return;
  if (outcome?.status === 'FAILED' || outcome?.status === 'NOT_APPLIED')
    return outcome.effect_possible === false && outcome.cleanup_complete === true ? 'not_applied' : undefined;
  if (result?.state && result.state !== 'settled') return;
  if (result?.prepared === false || outcome?.cleanup_complete === false || outcome?.pending_phase) return;
  return reply.isError ? undefined : 'applied';
}
