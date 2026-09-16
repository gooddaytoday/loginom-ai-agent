"""Independent Done/Close/reexecution audit for Replacement diagnostic evidence."""
from replacement_configuration_evidence import verify_replacement_configuration, normalized, rule_from_native
from node_procedure_evidence import verify_internal_sequence


def checkpoint(events, operation):
    found = [e['result'] for e in events if e.get('phase') == 'node_checkpoint' and e.get('operation_id') == operation]
    if len(found) != 1 or found[0].get('status') != 'SUCCEEDED':
        raise ValueError('unique_successful_checkpoint')
    return found[0]


def settings(result):
    return {k: v for k, v in result['configuration']['readback'].items() if k not in ('node', 'receipt_ids')}


def verify_close(events, request, before_request, after_request):
    failures = []
    try:
        before = checkpoint(events, before_request['operation_id'])
        closed = checkpoint(events, request['operation_id'])
        after = checkpoint(events, after_request['operation_id'])
        declared = [e.get('request') for e in events if e.get('operation_id') == request['operation_id'] and e.get('phase') == 'node_apply_prepared']
        if declared != [request]: failures.append('close_request_binding')
        seq = verify_internal_sequence(events, request['operation_id'], max_steps=4096)
        failures += seq['failures']
        if request['finish'] != 'close' or request['inputs'] or request['mappings'] or request['target']['ref'] != before['node'] or closed['node'] != before['node'] or after['node'] != before['node']:
            failures.append('close_node_or_contract')
        if closed['configuration']['status'] != 'discarded' or closed['execution']['status'] != 'not_requested' or closed['output']['status'] != 'not_refreshed':
            failures.append('close_semantics')
        phases = [e['receipt'] for e in events if e.get('operation_id') == request['operation_id'] and e.get('phase') == 'node_phase_completed']
        finishes = [p['value'] for p in phases if p['phase'] == 'finish']
        if len(finishes) != 1 or finishes[0].get('mode') != 'close' or finishes[0].get('settings_applied') is not False or finishes[0].get('verified') is not True:
            failures.append('close_finish_receipt')
        native = [s['node_replacement'] for _, s in seq['observations'] if s.get('node_replacement', {}).get('verified') is True and not s['node_replacement'].get('editor_open')]
        last = {}
        for state in native:
            owner = state.get('node_context', {})
            if any(owner.get(k) != before['node'][k] for k in ('document_id', 'workflow_id', 'node_id')):
                failures.append('close_draft_owner')
            if state.get('selected'): last[state['selected']] = rule_from_native(state)
        wanted = {r['field']['name']: normalized(r) for r in request['parameters']['rules']}
        if any(last.get(name) != rule for name, rule in wanted.items()): failures.append('close_draft_not_observed')
        if settings(before) != settings(after): failures.append('close_persisted_settings_changed')
        if after_request['parameters'] or after_request['mappings'] or after_request['finish'] != 'execute': failures.append('close_readback_reconfigured')
        for r in (before_request, after_request): failures += verify_replacement_configuration(events, r)['failures']
        positions = {op: [i for i, e in enumerate(events) if e.get('operation_id') == op and e.get('phase') == 'node_checkpoint'][0] for op in (before_request['operation_id'], request['operation_id'], after_request['operation_id'])}
        if not positions[before_request['operation_id']] < positions[request['operation_id']] < positions[after_request['operation_id']]: failures.append('close_order')
    except (KeyError, TypeError, ValueError, IndexError, StopIteration) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=failures, scope='replacement_close_draft_and_unchanged_reexecution')


def verify_response_loss(events, request, receipt):
    failures = []
    try:
        result = checkpoint(events, request['operation_id'])
        dropped = receipt['dropped_response']['result']['structuredContent']
        if receipt.get('fault_injection') is not True or receipt['error'].get('code') != -32001 or dropped.get('operation_id') != request['operation_id'] or dropped.get('state') != 'running': failures.append('response_was_not_dropped')
        state = receipt['state']
        if state.get('operation_id') != request['operation_id'] or state.get('state') != 'settled' or state.get('outcome', {}).get('status') != 'SUCCEEDED' or state['outcome']['output'] != result: failures.append('recovered_checkpoint')
        declared = [e.get('request') for e in events if e.get('operation_id') == request['operation_id'] and e.get('phase') == 'node_apply_prepared']
        if declared != [request] or request['finish'] != 'done' or result['execution']['status'] != 'not_requested': failures.append('one_operation_after_loss')
        failures += verify_replacement_configuration(events, request)['failures']
    except (KeyError, TypeError, ValueError, IndexError) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=failures, scope='diagnostic_mcp_response_loss_recovery', fault_injection=True, autonomous_acceptance=False)
