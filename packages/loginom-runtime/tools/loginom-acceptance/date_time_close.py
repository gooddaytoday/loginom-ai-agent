"""Check a real Close between two independently audited configurations."""
import argparse
import json
from pathlib import Path
from date_time_audit import audit
from date_time_persistence import events_at, operation, public_success, semantic_configuration
from node_procedure_evidence import verify_internal_sequence


def verify(directory, before_id, close_id, after_id):
    failures = []
    try:
        events = events_at(directory)
        before_request, before = operation(events, before_id)
        request, closed = operation(events, close_id)
        after_request, after = operation(events, after_id)
        for req in (before_request, after_request):
            if not audit(events, req, fixture_rows=[])['passed']:
                failures.append('configuration_audit_failed')
        if not all(public_success(directory, op) for op in (before_id, close_id, after_id)):
            failures.append('public_success_missing')
        if not before['recorded_at'] < closed['recorded_at'] < after['recorded_at']:
            failures.append('operation_order')
        if (request['finish'] != 'close' or not request['parameters'].get('fields')
                or after_request['parameters'] != {} or after_request['mappings'] != []):
            failures.append('close_and_unchanged_readback_required')
        result = closed['result']
        if (result['status'] != 'SUCCEEDED' or result['configuration']['status'] != 'discarded'
                or result['checkpoint_kind'] != 'local_node_cancellation'):
            failures.append('close_result')
        if len({c['result']['node']['node_id'] for c in (before, closed, after)}) != 1:
            failures.append('node_identity_changed')
        if semantic_configuration(before) != semantic_configuration(after):
            failures.append('close_changed_configuration')
        sequence = verify_internal_sequence(events, close_id, max_steps=4096)
        failures.extend(sequence['failures'])
        observations = sequence['observations']
        if any(s.get('wizard', {}).get('stage') in ('input_mapping', 'output_mapping') for _, s in observations):
            failures.append('close_opened_mapping')
        for event in events:
            if event.get('operation_id') != close_id or event.get('phase') != 'node_step_prepared':
                continue
            action = event['action']
            if action['verb'] in ('wizard_step', 'finish_wizard', 'execute_wizard', 'execute_graph_node', 'fill', 'drag', 'set_wizard_field', 'set_checked', 'replace_expression'):
                failures.append('close_committing_action')
            # Every configured flag is represented in the observed UI metadata.
            if any(e.get('ref') == action.get('ref') and e.get('date_time_cell', {}).get('role') == 'flag'
                   for _, state in observations for e in state.get('ui', {}).get('elements', [])):
                failures.append('close_mutated_flag')
        receipts = {e['receipt']['phase']: e['receipt']['value'] for e in events
                    if e.get('operation_id') == close_id and e.get('phase') == 'node_phase_completed'}
        if not receipts['configure'].get('draft_edits_skipped') or not receipts['input_mapping'].get('not_applicable'):
            failures.append('close_draft_not_skipped')
        finish = receipts['finish']
        if (finish.get('draft_discarded') is not True or finish.get('settings_applied') is not False
                or finish.get('execution_started') is not False or finish.get('cleanup_complete') is not True):
            failures.append('close_finish')
    except (KeyError, ValueError, TypeError, IndexError) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=sorted(set(failures)), scope='source_date_time_close', hermes_acceptance=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    parser.add_argument('before')
    parser.add_argument('close')
    parser.add_argument('after')
    args = parser.parse_args()
    result = verify(args.session, args.before, args.close, args.after)
    (args.session / 'date-time-close-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
