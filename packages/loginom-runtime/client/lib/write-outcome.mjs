import { randomUUID } from 'node:crypto';
import { outcomeVerification } from './outcome-verification.mjs';

const reads = new Set(['dock_workspace_observe', 'dock_action_describe', 'dock_operation_inspect',
  'dock_node_status', 'dock_node_wait', 'dock_node_source', 'dock_node_context', 'dock_artifact_delivery_status',
  'dock_storage_source', 'dock_storage_list', 'dock_storage_download_status', 'dock_storage_download_wait',
  'browser_snapshot', 'browser_find', 'browser_take_screenshot', 'browser_wait_for']);
const saves = new Set(['package.save_as', 'package.save_checkpoint']);

export function savedPackagePath(value) {
  return typeof value === 'string' && /^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/i.test(value)
    && !value.split('/').some(part => part === '.' || part === '..') ? value : null;
}

export function writeIntent(input, workspace, { owner, uploadPath, knownOperation }) {
  const { name, arguments: args } = input;
  const prepare = name === 'dock_prepare';
  if (reads.has(name) || name === 'dock_node_read' && (args?.execution ?? 'existing') === 'existing'
    || name === 'dock_browser_recovery' && args?.action === 'status'
    || prepare && !input.packageArtifact && ['open_package', 'existing_workflow'].includes(args?.intent))
    return { effect: 'read' };
  const action = name === 'dock_action_run' && typeof args?.action_key === 'string' ? args.action_key : name;
  const save = saves.has(action);
  const operationID = typeof args?.operation_id === 'string' && args.operation_id.length ? args.operation_id
    : save && args?.operation_id === undefined ? randomUUID() : null;
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

export function writeVerdict(outcome, action, entry) {
  const node = entry.operation === 'dock_node_apply' && outcome?.action_key === 'node.apply';
  if (!outcome || outcome.operation_id !== entry.receipt.operationID || outcome.cleanup_complete !== true
    || !node && (action?.action_key !== entry.operation || outcome.action_key !== entry.operation)
    || outcome.error?.code === 'SAVE_RESULT_MISMATCH') return 'unknown';
  if (outcome.status === 'NOT_APPLIED' && outcome.effect_possible === false) return 'not_applied';
  if (outcome.status !== 'SUCCEEDED' || outcome.error !== null) return 'unknown';
  if (node) {
    return outcome.output?.pending_phase === null && outcome.phase === 'node_ready' ? 'applied' : 'unknown';
  }
  if (saves.has(entry.operation) && (!entry.baseline.packagePath || outcome.output?.package_ref?.path !== entry.baseline.packagePath))
    return 'unknown';
  return outcomeVerification(outcome, action).domain_effect.state === 'verified' ? 'applied' : 'unknown';
}

export function writeReplySettled(reply, name) {
  let result = reply.structuredContent;
  if (!result && reply.content?.[0]?.type === 'text') {
    try { result = JSON.parse(reply.content[0].text); } catch { return name?.startsWith('browser_') && !reply.isError; }
  }
  const outcome = result?.outcome ?? result?.output?.outcome ?? result;
  if (['AMBIGUOUS', 'unresolved', 'pending'].includes(outcome?.status) || outcome?.error?.code === 'SAVE_RESULT_MISMATCH') return false;
  if (outcome?.status === 'FAILED' || outcome?.status === 'NOT_APPLIED')
    return outcome.effect_possible === false && outcome.cleanup_complete === true;
  if (result?.state && result.state !== 'settled') return false;
  if (result?.prepared === false || outcome?.cleanup_complete === false || outcome?.pending_phase) return false;
  return !reply.isError;
}
