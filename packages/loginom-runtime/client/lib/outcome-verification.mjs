import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { assertActionOutcome, validateActionParameters } from './action-catalog.mjs';
import { requireCapability } from './capability-registry.mjs';

// An independent, versioned explanation of a receipt's proof boundaries.
// Preserve the original receipt for journal/reconciliation consumers.
export function outcomeVerification(outcome, action) {
  assertActionOutcome(outcome);
  const events = outcome.trace.map(item => item.event);
  const success = outcome.status === 'SUCCEEDED' && outcome.cleanup_complete === true;
  let domain = { state: 'unverified', kind: null };
  if (action && action.action_key === outcome.action_key && action.revision === outcome.action_revision) {
    const entry = requireCapability(action);
    domain.kind = entry.effectKind;
    if (success && events.includes('postcondition_verified')) {
      validateActionParameters(action.output_schema, outcome.output, 'output');
      // A permissive server schema cannot weaken this local save contract.
      const saveReady = entry.actionKey !== 'package.save_as' || (outcome.output.reopened === true
          && events.includes('reopened_package_observed'));
      const checkpointReady = entry.actionKey !== 'package.save_checkpoint' || (
        outcome.output.reopened === false && outcome.output.workflow_preserved === true
        && outcome.output.save_completed === true && outcome.output.persisted_content_verified === false
        && events.filter(e => e === 'save_flow_completed').length === 1
        && events.filter(e => e === 'open_saved_package_observed').length === 1
        && !events.includes('saved_package_closed') && !events.includes('reopened_package_observed')
        && outcome.trace.some(t => t.event === 'postcondition_verified'
          && t.proof === 'awaited_save_flow_same_open_workflow'));
      const configureReady = entry.actionKey !== 'node.configure_text_import' || (
        outcome.output.settings_readback_verified === true && outcome.output.package_saved === false
        && outcome.output.execution_started === false && Number.isInteger(outcome.output.internal_steps)
        && outcome.output.internal_steps > 0 && outcome.output.internal_steps <= 96
        && outcome.trace.some(e => e.event === 'postcondition_verified' && e.proof === 'text_import_settings_roundtrip'));
      if (saveReady && checkpointReady && configureReady) domain.state = 'verified';
    } else if (outcome.status === 'NOT_APPLIED' && outcome.cleanup_complete === true) domain.state = 'not_applied';
  }
  const truncation = outcome.output.ui?.truncated;
  const observed = !!outcome.output.ui;
  return {
    kind: 'dock_outcome_verification', schema_version: 1,
    operation_id: outcome.operation_id ?? null, action_key: outcome.action_key,
    receipt_sha256: createHash('sha256').update(JSON.stringify(outcome)).digest('hex'),
    gesture: { state: events.includes('ui_gesture_applied') ? 'performed' : 'not_proven' },
    domain_effect: domain,
    observation: { state: observed ? 'bounded' : 'not_provided',
      completeness: observed && truncation && Object.values(truncation).some(value => value === true)
        ? 'truncated' : 'not_proven',
      limitations: observed ? ['visible_DOM_only', 'no_dataset_revision', 'no_full_graph_proof'] : [] },
    settings: { state: domain.kind === 'configure' && domain.state === 'verified' ? 'verified' : 'not_checked' }, data: { state: 'not_checked' },
    goal: { state: 'not_verified', obligations: [] },
  };
}

export function assertOutcomeVerification(value, outcome, action) {
  if (!isDeepStrictEqual(value, outcomeVerification(outcome, action))) {
    throw new Error('Verification claims do not match the bound receipt and local contract');
  }
  return value;
}
