"""Independent Date/time terminal-failure audit of the authenticated journal."""
import argparse
import json
from pathlib import Path
from node_procedure_evidence import verify_internal_sequence
from import_execution_evidence import retained_history_matches


def require(value, message):
    if not value:
        raise ValueError(message)


def verify_native_failure(baseline, snapshot, node, execution, expected_path):
    for state in (baseline, snapshot):
        require(all(state.get(k) is True for k in ('verified', 'inventory_complete', 'show_completed')), 'incomplete_history')
        owner = state.get('node_context', {})
        require(owner.get('verified') is True and all(owner.get(k) == node[k] for k in node), 'foreign_owner')
        rows = state['processes']
        ids = [p['process_id'] for p in rows]
        records = [p['record_id'] for p in rows]
        require(len(ids) == len(set(ids)) and len(records) == len(set(records)), 'duplicate_records')
        require(all(p['parent_id'] is None or p['parent_id'] in ids for p in rows), 'incomplete_parent_history')
    require(retained_history_matches(baseline, snapshot), 'old_or_changed_history')
    old_ids = {p['process_id'] for p in baseline['processes'] if p['parent_id'] is None}
    fresh = [p for p in snapshot['processes'] if p['parent_id'] is None and p['process_id'] not in old_ids]
    require(len(fresh) == 1, 'one_fresh_group_required')
    group = fresh[0]
    require(group['record_id'] not in {p['record_id'] for p in baseline['processes']}, 'reused_group_record')
    require(execution['root_id'] == snapshot['root_id'] and execution['group_id'] == group['process_id']
            and execution['group_record_id'] == group['record_id']
            and execution['execution_id'] == node['document_id'] + ':' + snapshot['root_id'] + ':' + group['process_id'], 'execution_identity')
    progress = group.get('progress_state', {})
    require(group.get('error') is True and progress.get('verified') is True
            and progress.get('source') == 'native_progress_record' and progress.get('state') == 'failed'
            and progress.get('terminal') is True and progress.get('can_cancel') is False, 'not_terminal_failure')
    require(group.get('children_loaded') is True, 'group_children_not_loaded')
    children = [p for p in snapshot['processes'] if p['parent_id'] == group['process_id']]
    owned = [p for p in children if p.get('owner', {}).get('verified') is True
             and p['owner'].get('source') == 'native_process_model_identity'
             and p['owner'].get('node_id') == node['node_id']]
    require(len(owned) == 1 and owned[0].get('progress_state', {}).get('state') == 'parent_failed', 'requested_child_not_parent_failed')
    failed_sources = [p for p in children if p.get('error') is True
                      and expected_path in p.get('error_details', '')
                      and p.get('progress_state', {}).get('state') == 'failed']
    require(len(failed_sources) == 1, 'failed_source_child_missing')
    reason = group.get('error_details', '')
    require(expected_path in reason and 'не найден' in reason, 'missing_native_reason')
    return dict(root_id=snapshot['root_id'], group=group, native_reason=reason)


def verify(events, operation_id, expected_path):
    failures = []
    proof = None
    try:
        rows = [e for e in events if e.get('operation_id') == operation_id]
        requests = [e['request'] for e in rows if e.get('phase') == 'node_apply_prepared']
        checkpoints = [e['result'] for e in rows if e.get('phase') == 'node_checkpoint']
        require(len(requests) == len(checkpoints) == 1, 'one_request_checkpoint')
        request, result = requests[0], checkpoints[0]
        node, execution = result['node'], result['execution']
        require(request['target']['ref'] == node and request['target']['type'] == 'transform.date_time', 'requested_node')
        require(result['status'] == 'FAILED' and result['checkpoint_kind'] == 'local_node_failed'
                and result['cleanup_complete'] is True and execution['status'] == 'failed'
                and execution['failure_verified'] is True, 'terminal_checkpoint')
        require(result['output']['status'] == 'not_refreshed' and result['output']['ports'] == []
                and result['output']['evidence_ref'] is None, 'stale_output')
        require(not any(e.get('phase') in ('node_phase_prepared', 'node_phase_completed')
                        and e.get('receipt', {}).get('phase') == 'read' for e in rows), 'output_read_after_failure')
        sequence = verify_internal_sequence(events, operation_id, max_steps=1000)
        require(sequence['passed'], 'invalid_internal_sequence:' + ','.join(sequence['failures']))
        observations, mutations = sequence['observations'], sequence['mutations']
        launches = [(n, a, o) for n, a, o in mutations if a.get('verb') == 'execute_graph_node']
        require(len(launches) == 1, 'one_graph_launch')
        step, action, outcome = launches[0]
        before = next(s for n, s in reversed(observations) if n < step)
        control = next(e for e in before['ui']['elements'] if e['ref'] == action['ref'])
        require(control.get('graph_execution', {}).get('node_id') == node['node_id']
                and control['graph_execution']['source'] == 'native_selected_graph_node'
                and outcome['status'] == 'SUCCEEDED' and outcome['output']['gesture_applied'] is True, 'native_launch_owner')
        baseline = next(s['node_processes'] for n, s in reversed(observations) if n < step
                        and s.get('node_processes', {}).get('verified') is True
                        and s['node_processes'].get('inventory_complete') is True)
        closes = []
        for n, a, o in mutations:
            prior = next((s for i, s in reversed(observations) if i < n), {})
            element = next((e for e in prior.get('ui', {}).get('elements', []) if e['ref'] == a.get('ref')), {})
            if n > step and a.get('verb') == 'click' and element.get('tid') == 'ConsoleForm;btnClose':
                require(o['status'] == 'SUCCEEDED' and o['cleanup_complete'] is True, 'console_close_receipt')
                closes.append((n, prior))
        require(len(closes) == 1, 'one_failed_console_close')
        close_step, closing = closes[0]
        proof = verify_native_failure(baseline, closing['node_processes'], node, execution, expected_path)
        require(result['error']['code'] == 'NODE_EXECUTION_FAILED'
                and result['error']['message'] == proof['native_reason'][:1000], 'public_native_reason')
        after = [s for n, s in observations if n > close_step]
        require(after and after[-1]['ui']['dialogs'] == [] and after[-1]['ui']['masks'] == []
                and not any(e.get('tid') == 'ConsoleForm' for e in after[-1]['ui']['elements']), 'cleanup_surface')
        owner = after[-1].get('prepared_node_context', {})
        require(owner.get('verified') is True and all(owner.get(k) == node[k] for k in node), 'cleanup_owner')
        proof.update(node=node, execution=execution, baseline=baseline, snapshot=closing['node_processes'])
    except (KeyError, TypeError, ValueError, IndexError, StopIteration) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=failures, proof=proof,
                scope='date_time_terminal_failure', hermes_acceptance=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    parser.add_argument('--operation', default='node13-r2-failure')
    parser.add_argument('--missing-path', required=True)
    args = parser.parse_args()
    events = [json.loads(line) for line in (args.session / 'execution-events.jsonl').read_text().splitlines()]
    result = verify(events, args.operation, args.missing_path)
    (args.session / 'r2-terminal-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({k:v for k,v in result.items() if k != 'proof'}, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
