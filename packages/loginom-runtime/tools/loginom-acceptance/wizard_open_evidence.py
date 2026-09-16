"""Independent journal proof for opening a prepared node with deactivation."""
from node_procedure_evidence import verify_internal_sequence, bound_wizard_deactivation_confirmation


def verify_prepared_wizard_open(events, operation_id, expected_node, *, expect_deactivation):
    sequence = verify_internal_sequence(events, operation_id, max_steps=256)
    return verify_wizard_open_sequence(sequence, expected_node, expect_deactivation=expect_deactivation)


def verify_wizard_open_sequence(sequence, expected_node, *, expect_deactivation):
    failures = list(sequence['failures'])
    observations, actions = sequence['observations'], sequence['mutations']
    for _, state in observations:
        node = state.get('prepared_node_context', {})
        if (node.get('verified') is not True or any(not expected_node.get(k) or node.get(k) != expected_node[k]
                for k in ('document_id', 'workflow_id', 'node_id'))):
            failures.append('prepared_node_changed')
    begins = [(s, a, o) for s, a, o in actions if a.get('verb') == 'begin_wizard']
    confirmations = [(s, a, o) for s, a, o in actions if a.get('verb') == 'confirm_wizard_deactivation']
    if len(begins) != 1 or len(confirmations) != int(expect_deactivation):
        failures.append('opening_gesture_count')
    if any(a.get('verb') not in ('click', 'begin_wizard', 'confirm_wizard_deactivation') for _, a, _ in actions):
        failures.append('unexpected_opening_mutation')
    opening = None
    if len(begins) == 1:
        step, action, outcome = begins[0]
        before = next((s for n, s in reversed(observations) if n < step), {})
        node = before.get('prepared_node_context', {})
        controls = [e for e in before.get('ui', {}).get('elements', []) if e.get('ref') == action.get('ref')
                    and e.get('tid') == node.get('tid', '') + ';Setting' and e.get('wizard_open')]
        if node.get('surface') != 'graph' or len(controls) != 1:
            failures.append('opening_control_owner')
        else:
            opening = controls[0]['wizard_open']
        required = 'wizard_deactivation_question_observed' if expect_deactivation else 'wizard_open_verified'
        if len([t for t in outcome.get('trace', []) if t.get('event') == required]) != 1:
            failures.append('opening_receipt_missing')
        if expect_deactivation and len(confirmations) == 1:
            answer_step, action, outcome = confirmations[0]
            question = next((s for n, s in reversed(observations) if n < answer_step), {})
            binding = question.get('node_wizard_confirmation', {})
            if (answer_step <= step or not bound_wizard_deactivation_confirmation(question)
                    or binding.get('opening') != opening or binding.get('graph_tid') != node.get('tid')
                    or not any(e.get('ref') == action.get('ref') and e.get('tid') == 'msgbox;tlb;yes'
                               for e in question.get('ui', {}).get('elements', []))):
                failures.append('deactivation_answer_owner')
            if len([t for t in outcome.get('trace', []) if t.get('event') == 'wizard_open_verified']) != 1:
                failures.append('deactivation_open_receipt_missing')
    last_action = max((s for s, _, _ in actions), default=0)
    final = observations[-1][1] if observations else {}
    owner = final.get('wizard', {}).get('owner_context', {})
    if (not observations or observations[-1][0] <= last_action or final.get('wizard', {}).get('status') != 'observed'
            or final.get('prepared_node_context', {}).get('surface') != 'wizard' or owner.get('status') != 'observed'
            or not opening or [{k: x.get(k) for k in ('tid', 'label')} for x in owner.get('path', [])[:-2]] != opening.get('workflow_path')
            or owner.get('node', {}).get('tid') != (opening.get('workflow_path') or [{}])[-1].get('tid', '') + '>' + opening.get('node', {}).get('node_label', '')):
        failures.append('final_wizard_owner')
    return {'passed': not failures, 'failures': sorted(set(failures)),
            'deactivation_required': expect_deactivation, 'wizard_open_verified': not failures,
            'settings_applied_verified': False, 'execution_verified': False,
            'package_persistence_verified': False, 'hermes_acceptance_verified': False,
            'journal_authentication_verified': False}
