export const BROWSER_RECOVERY_BUDGET = Object.freeze({ calls: 30, ms: 600000 });
export const BROWSER_RECOVERY_VERIFY_MS = 240000;
export const BROWSER_RECOVERY_HANDOFF_MS = 60000;

export function browserRecoveryStepKey(step) {
  if (step.kind === 'save') return `save:${step.document_id}:${step.package_path}`;
  return `node:${step.document_id}:${step.workflow_id}:${step.node_id}:${step.phase}`;
}

export function browserRecoveryNextStep(basis, budget) {
  if (budget.calls_remaining <= 0 || budget.ms_remaining <= 0) {
    return { instruction: 'Бюджет восстановления исчерпан. Сообщи фактическое состояние шага.' };
  }
  return {
    tool: 'dock_browser_recovery',
    arguments: { action: 'start', operation_id: basis.operation_id },
    trigger: basis.trigger, reason_code: basis.reason_code, effect: basis.effect, step: basis.step,
    budget,
    instruction: 'Продолжи восстановление этого шага через dock_browser_recovery.',
  };
}

export function decideBrowserRecovery(basis, facts) {
  const required = basis.step.kind === 'save' ? ['saved_package'] :
    ['workspace', ...(basis.goal.execution ? ['execution'] : []),
      ...(basis.goal.output_schema ? ['output_schema'] : []), ...(basis.goal.file ? ['export_file'] : [])];
  const verified = Object.fromEntries(Object.entries(facts).filter(([key, fact]) =>
    fact?.verified === true && (key !== 'saved_package' || fact.modified === false)));
  const missing = required.filter((key) => !verified[key]);
  if (basis.step.kind === 'save') return { result: missing.length ? 'unresolved' : 'completed', verified, missing };
  if (!verified.workspace) return { result: 'unresolved', verified, missing };
  if (basis.goal.file) return {
    result: !missing.length ? 'completed' : basis.idempotent_retry ? 'continuable' : 'unresolved', verified, missing,
  };
  if (!basis.goal.execution) return { result: 'continuable', verified, missing };
  const result = !missing.length ? 'completed' : !verified.execution ? 'continuable' : 'unresolved';
  return { result, verified, missing };
}

export function classifyBrowserRecovery(view, history = []) {
  if (view.state === 'running' || (view.status === 'NOT_APPLIED' && view.effect_possible === false) ||
    view.cancel_requested || view.execution_status === 'cancelled' || view.error_code === 'LOGIN_REQUIRED' || view.transport_uncertain ||
    view.capability === 'artifact.upload' || view.browser_recovery_stopped || view.recovery_receipt_id) return null;
  const refused = view.state === 'pending' && view.pending_phase != null &&
    view.release_refused?.user_action && view.release_refused.phase === view.pending_phase;
  const repeated = view.node && view.pending_phase != null && (view.cause_code ?? view.error_code) &&
    view.target?.kind === 'existing' && history.some((prior) =>
    prior.checkpoint_kind === 'local_node_released' && prior.released_phase === view.pending_phase &&
    prior.node?.document_id === view.node.document_id && prior.node?.workflow_id === view.node.workflow_id &&
    prior.node?.node_id === view.node.node_id &&
    (prior.stopped_error?.cause_code ?? prior.stopped_error?.code) === (view.cause_code ?? view.error_code));
  const effect = view.node && view.checkpoint_kind === 'local_node_released' &&
    view.execution_status === 'unknown' ? 'execution' :
    view.export_download_unconfirmed === true ? 'export' :
    view.reconciled === true && view.state === 'pending' && view.status === 'AMBIGUOUS' &&
    ['package.save_checkpoint', 'package.save_as'].includes(view.action_key) ? 'save' : null;
  const noRecovery = view.node && view.state === 'pending' && view.pending_phase != null && !view.recovery_options?.length &&
    !view.next_tools?.some((tool) => [
      'dock_node_resume', 'dock_operation_recover', 'dock_artifact_verify', 'dock_artifact_delivery_resume',
    ].includes(tool)) && view.internal_resume_available !== true && !view.user_action;
  if (!refused && !repeated && !effect && !noRecovery) return null;
  const trigger = refused ? 'T1' : repeated ? 'T3' : effect ? 'T4' : 'T2';
  const selectedEffect = trigger === 'T4' ? effect : null;
  const execution = view.request_finish === 'execute';
  const exportFile = execution && view.target?.type === 'exports.text';
  return {
    trigger,
    reason_code: trigger === 'T1' ? 'NODE_RELEASE_REFUSED' : trigger === 'T3' ? 'REPEATED_PHASE_FAILURE' :
      trigger === 'T4' ? 'CONFIRMATION_LOST' : 'NO_RECOVERY_OPTIONS',
    effect: selectedEffect,
    operation_id: view.operation_id,
    step: selectedEffect === 'save' ? { kind: 'save', document_id: view.document_id,
      package_path: view.package_path, phase: 'save' } :
      { kind: 'node', ...view.node, phase: selectedEffect === 'execution' ? view.released_phase :
        selectedEffect === 'export' ? 'read' : view.pending_phase },
    goal: {
      execution: selectedEffect === 'save' ? false : execution,
      output_schema: selectedEffect !== 'save' && execution && !exportFile,
      ports: selectedEffect === 'save' ? [] : view.read_ports?.length ? view.read_ports : [0],
      file: selectedEffect !== 'save' && exportFile,
      saved_package: selectedEffect === 'save',
    },
    idempotent_retry: selectedEffect === 'execution' ||
      (view.target?.type === 'exports.text' && view.export_overwrite === 'replace'),
  };
}
