"""Targeted N11-R1 audit: unchanged settings/output around a refused partial request.

The caller fixes the expected small output independently. This is Codex live
regression evidence, not autonomous acceptance or a package persistence proof.
"""
from replacement_evidence_audit import audit
from replacement_configuration_evidence import normalized, rule_from_native
from replacement_lifecycle_evidence import checkpoint, settings
from node_procedure_evidence import verify_internal_sequence


def verify_partial_refusal(events, before_request, request, after_request, expected):
    failures = []
    try:
        op = request['operation_id']
        before = checkpoint(events, before_request['operation_id'])
        after = checkpoint(events, after_request['operation_id'])
        own = [e for e in events if e.get('operation_id') == op]
        declarations = [e.get('request') for e in own if e.get('phase') == 'node_apply_prepared']
        if declarations != [request] or request['target']['ref'] != before['node'] or after['node'] != before['node']:
            raise ValueError('refusal_request_owner')
        # Refused operations have the public completed outcome, not a successful node checkpoint.
        results = [e['outcome']['output'] for e in own if e.get('phase') == 'completed' and e.get('action_key') == 'node.apply']
        if len(results) != 1: raise ValueError('refusal_unique_checkpoint')
        result = results[0]
        if result['status'] != 'FAILED' or result['cleanup_complete'] is not True or result.get('pending_phase') is not None or result['execution']['status'] != 'not_requested' or result['output']['status'] != 'not_refreshed':
            failures.append('refusal_result')
        refused = [e['receipt'] for e in own if e.get('phase') == 'node_phase_refused']
        if len(refused) != 1: raise ValueError('refusal_receipt')
        receipt = refused[0]; proof = receipt['proof']; closed = proof['closed']
        if receipt['phase'] != 'configure' or receipt['verification'] != 'replacement_effective_preflight_completed' or receipt['settings_unchanged'] is not True or closed['settings_applied'] is not False or closed['draft_discarded'] is not True or closed['cleanup_complete'] is not True:
            failures.append('refusal_cancellation')
        if any(closed['node_context'].get(k) != before['node'][k] for k in ('document_id', 'workflow_id', 'node_id')):
            failures.append('refusal_close_owner')
        saved = {r['field']['name']: normalized(r) for r in before['configuration']['readback']['rules']}
        if {r['field']['name']: normalized(r) for r in proof['saved_rules']} != saved:
            failures.append('refusal_saved_rules')
        sequence = verify_internal_sequence(events, op, max_steps=4096)
        failures += sequence['failures']
        last = sequence['observations'][-1][1]
        if last.get('wizard', {}).get('status') != 'absent' or last.get('prepared_node_context') != closed['node_context']:
            failures.append('refusal_close_not_raw')
        seed = next(e for e in events if e.get('operation_id') == before_request['operation_id'] and e.get('phase') == 'node_checkpoint')
        if any(seed.get(k) is None or any(e.get(k) != seed[k] for e in own) for k in ('session_id', 'runtime_revision', 'manifest_sha256', 'target')):
            failures.append('refusal_runtime_identity')
        native = [s['node_replacement'] for _, s in sequence['observations'] if s.get('node_replacement', {}).get('verified')]
        observed = {}
        for n in native:
            if any(n['node_context'].get(k) != before['node'][k] for k in ('document_id', 'workflow_id', 'node_id')):
                failures.append('refusal_raw_owner')
            if {f['name'] for f in n['input_fields'] if f['mode'] == 'manual'} != set(saved):
                failures.append('refusal_raw_membership')
            if n.get('selected') in saved and not n.get('editor_open'):
                observed[n['selected']] = rule_from_native(n)
                if observed[n['selected']] != saved[n['selected']]: failures.append('refusal_raw_rule_changed')
        if observed != saved: failures.append('refusal_raw_rules_incomplete')
        start = next(i for i, e in enumerate(own) if e.get('phase') == 'node_phase_prepared' and e['receipt']['phase'] == 'configure')
        steps = {e['step'] for e in own[start:] if e.get('phase') == 'node_step_prepared'}
        for step, action, _ in sequence['mutations']:
            if step not in steps: continue
            previous = [s for n, s in sequence['observations'] if n < step][-1]
            element = next((e for e in previous['ui']['elements'] if e['ref'] == action.get('ref')), {})
            tid = element.get('tid', '')
            allowed = action['verb'] == 'wizard_step' and tid.endswith((';btnNext', ';btnPrev'))
            allowed |= action['verb'] == 'click' and (tid.endswith((';btnClose', ';rbTable;DisplayEl')) or ';ReplaceColumnsWizard;colInputData_' in tid)
            allowed |= action['verb'] == 'confirm_wizard_close' and tid == 'msgbox;tlb;yes'
            if not allowed: failures.append('refusal_configuration_mutation')
        if request['parameters'].get('output_mode') is None:
            mode = proof['mode_observation']
            maps = [s['node_mapping'] for _, s in sequence['observations'] if s.get('node_mapping')]
            if mode not in maps or mode['produce_mode'] != 'supplement' or proof['output_mode'] != 'add':
                failures.append('refusal_saved_mode_not_raw')
        if settings(before) != settings(after): failures.append('refusal_settings_changed')
        if after_request['parameters'] or after_request['mappings'] or after_request['finish'] != 'execute':
            failures.append('refusal_after_reconfigured')
        if before['execution']['execution_id'] == after['execution']['execution_id']: failures.append('refusal_execution_not_fresh')
        for r in (before_request, after_request):
            if not audit(events, r, expected)['passed']: failures.append('refusal_output_' + r['operation_id'])
        indices = [next(i for i, e in enumerate(events) if e.get('operation_id') == key and e.get('phase') == phase) for key, phase in [(before_request['operation_id'], 'node_checkpoint'), (op, 'node_apply_prepared'), (op, 'completed'), (after_request['operation_id'], 'node_apply_prepared')]]
        if indices != sorted(indices) or len(set(indices)) != 4: failures.append('refusal_order')
    except (KeyError, TypeError, ValueError, IndexError, StopIteration) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=failures, scope='codex_replacement_partial_refusal', autonomous_acceptance=False)
