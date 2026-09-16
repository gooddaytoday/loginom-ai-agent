// These contracts describe effects, not executable actions. Admission still
// requires a separately registered local handler for the exact action key.
export const EFFECT_CONTRACTS = Object.freeze({
  create: Object.freeze({ precondition: 'owned_context_and_snapshot', postcondition: 'exact_created_object_diff', reconciliation: 'snapshot_diff_before_retry', ownership: 'created_objects_and_declared_incident_edges' }),
  save: Object.freeze({ precondition: 'owned_package_path_and_conflict_policy', postcondition: 'same_path_reopened_content', reconciliation: 'completed_save_receipt', ownership: 'exact_package_destination' }),
  persist: Object.freeze({ precondition: 'owned_package_path_and_conflict_policy', postcondition: 'awaited_save_flow_same_path_and_open_workflow', reconciliation: 'completed_save_receipt_without_retry', ownership: 'exact_package_destination' }),
  configure: Object.freeze({ precondition: 'owned_settings_identity_and_original_values', postcondition: 'applied_typed_settings_readback', reconciliation: 'original_expected_actual_settings', ownership: 'declared_fields_and_mappings' }),
  delete: Object.freeze({ precondition: 'owned_object_and_dependency_snapshot', postcondition: 'object_absent_unrelated_objects_preserved', reconciliation: 'identity_and_dependency_diff', ownership: 'selected_object_and_declared_dependencies' }),
  execute: Object.freeze({ precondition: 'owned_node_and_graph_revision', postcondition: 'new_execution_identity_and_terminal_status', reconciliation: 'same_execution_status_without_restart', ownership: 'declared_execution' }),
  inspect: Object.freeze({ precondition: 'scoped_identity_and_revision', postcondition: 'readout_with_revision_and_completeness', reconciliation: 'fresh_read_same_revision_or_restart_observation', ownership: 'no_mutation' }),
  transfer: Object.freeze({ precondition: 'authorized_artifact_digest_and_destination_policy', postcondition: 'destination_bytes_digest_and_size', reconciliation: 'partial_destination_and_transfer_receipt', ownership: 'exact_artifact_destination' }),
});

export function validateEffect(effect) {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)
      || !Object.hasOwn(EFFECT_CONTRACTS, effect.kind)
      || typeof effect.resource !== 'string' || !/^[a-z]+(?:\.[a-z_]+)*$/.test(effect.resource)
      || Object.keys(effect).some(key => !['kind', 'resource', 'allowed_roots', 'destination_policy'].includes(key))) {
    throw new Error('Invalid local effect contract');
  }
  if (effect.destination_policy !== undefined && (effect.destination_policy !== 'session_storage'
      || !['save', 'persist'].includes(effect.kind) || effect.resource !== 'package'
      || effect.allowed_roots !== undefined)) throw new Error('Invalid session storage effect policy');
  if (effect.allowed_roots !== undefined) {
    if (!['save', 'persist', 'transfer'].includes(effect.kind) || !Array.isArray(effect.allowed_roots) || !effect.allowed_roots.length
        || effect.allowed_roots.some(root => typeof root !== 'string' || !root.startsWith('/')
          || /[\\%?#\x00-\x1f]/.test(root) || root.slice(1).split('/').some(part => !part || part === '.' || part === '..'))
        || new Set(effect.allowed_roots).size !== effect.allowed_roots.length) throw new Error('Invalid effect destination roots');
  }
  return EFFECT_CONTRACTS[effect.kind];
}
