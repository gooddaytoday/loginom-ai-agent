"""Prove cancellation of an existing import edit, then unchanged fresh output.

This is a component audit: runtime inventory and package persistence are separate.
The baseline comes from the independently checked seed, never the cancelled edit.
"""
from import_limits import import_operation_step_budget

from existing_import_evidence import _verify_existing_import_output
from import_done_evidence import _verify_text_import
from import_patch_evidence import verify_import_patch_observations
from import_source_binding import source_ordered_settings
from node_procedure_evidence import verify_internal_sequence


def verify_existing_import_close(events, seed, cancelled, restored, source_bytes):
    checks, failures = {}, []
    try:
        ids = [r['operation_id'] for r in (seed, cancelled, restored)]
        if (len(set(ids)) != 3 or cancelled.get('finish') != 'close'
                or cancelled.get('target', {}).get('kind') != 'existing'
                or cancelled.get('read', {}).get('ports') or cancelled.get('mappings')
                or restored.get('parameters', {}).get('settings') != {} or restored.get('mappings')
                or not cancelled['parameters']['settings']):
            failures.append('close_declared_contract')
        for key in ('document_id', 'workflow_ref'):
            if not seed.get(key) == cancelled.get(key) == restored.get(key):
                failures.append('close_' + key)
        if (cancelled['parameters']['source'] != seed['parameters']['source']
                or cancelled['target'].get('ref') != restored['target'].get('ref')):
            failures.append('close_source_or_node')
        previous = -1
        for request in (seed, cancelled, restored):
            rows = [(i, e) for i, e in enumerate(events) if e.get('operation_id') == request['operation_id']]
            starts = [(i, e) for i, e in rows if e.get('phase') == 'node_apply_prepared']
            ends = [(i, e) for i, e in rows if e.get('phase') == 'node_checkpoint']
            if (len(starts) != 1 or len(ends) != 1 or starts[0][1].get('request') != request
                    or not previous < starts[0][0] < ends[0][0]):
                failures.append('close_operation_order')
            else:
                previous = ends[0][0]
                if request is cancelled and ends[0][1].get('result', {}).get('node') != restored['target'].get('ref'):
                    failures.append('close_checkpoint_node')
        identity_rows = [e for e in events if e.get('operation_id') in ids and e.get('phase') == 'node_apply_prepared']
        if identity_rows and any(any(e.get(k) != identity_rows[0].get(k) or not e.get(k)
                for k in ('session_id', 'runtime_revision', 'target')) for e in identity_rows):
            failures.append('close_journal_identity')
        if any(e.get('phase') == 'node_apply_prepared' and e.get('operation_id') not in ids for e in events):
            failures.append('close_unaccounted_node_operation')
        sequence = verify_internal_sequence(events, cancelled['operation_id'], max_steps=import_operation_step_budget(events, cancelled['operation_id']))
        rows = [e for e in events if e.get('operation_id') == cancelled['operation_id']]
        starts = [i for i,e in enumerate(rows) if e.get('phase') == 'node_phase_prepared' and e.get('receipt', {}).get('phase') == 'configure']
        ends = [i for i,e in enumerate(rows) if e.get('phase') == 'node_phase_completed' and e.get('receipt', {}).get('phase') == 'configure']
        if len(starts) != 1 or len(ends) != 1 or starts[0] >= ends[0]:
            raise ValueError('configure interval missing')
        steps = {e.get('step') for e in rows[starts[0]+1:ends[0]] if e.get('internal_provenance') == 'client_node_procedure_v1'}
        baseline = source_ordered_settings(seed['parameters']['settings'], source_bytes)
        for column in baseline['columns']:
            column.pop('source_name', None)
        checks['draft'] = verify_import_patch_observations(
            [(n,s) for n,s in sequence['observations'] if n in steps],
            [(n,a,o) for n,a,o in sequence['mutations'] if n in steps],
            baseline, cancelled['parameters']['settings'], sequence['failures'])
        if checks['draft']['passed'] and checks['draft']['expected_settings'] == baseline:
            failures.append('close_no_actual_edit')
        if checks['draft']['passed']:
            checks['close'] = _verify_text_import(events, cancelled, source_bytes, 'close',
                settings_override=checks['draft']['expected_settings'])
        if not failures and checks.get('close', {}).get('passed'):
            checks['restored'] = _verify_existing_import_output(events, seed, restored, source_bytes, cancelled_edit=True)
    except (KeyError, ValueError, TypeError, IndexError) as error:
        failures.append('malformed_close_evidence:' + type(error).__name__)
    return dict(passed=not failures and len(checks) == 3 and all(c['passed'] for c in checks.values()),
        failures=failures, checks=checks, scope='existing_import_cancel_then_unchanged_fresh_output',
        package_persistence_verified=False, hermes_acceptance_verified=False)
