"""Negative mutations of a real, independently verified terminal-failure case."""
import copy
import json
import sys
from pathlib import Path
from date_time_terminal_failure import verify, verify_native_failure


def run(directory):
    audit = json.loads((directory / 'r2-terminal-audit.json').read_text())
    assert audit['passed']
    proof = audit['proof']
    events = [json.loads(x) for x in (directory / 'execution-events.jsonl').read_text().splitlines()]
    request_id = 'node13-r2-failure'
    expected_path = json.loads((directory / 'r2-hide-source.json').read_text())['missing']
    results = []
    for mode in ('root', 'group_record', 'old_group', 'incomplete', 'reason', 'cancellable',
                 'group_not_loaded', 'owner', 'missing_source_child', 'child_completed', 'foreign_context'):
        baseline, snapshot, node, execution = [copy.deepcopy(proof[k]) for k in ('baseline', 'snapshot', 'node', 'execution')]
        group = next(p for p in snapshot['processes'] if p['process_id'] == execution['group_id'])
        child = next(p for p in snapshot['processes'] if p.get('owner', {}).get('node_id') == node['node_id']
                     and p['parent_id'] == group['process_id'])
        if mode == 'root': snapshot['root_id'] = 'foreign'
        elif mode == 'group_record': group['record_id'] = 'foreign'
        elif mode == 'old_group': baseline['processes'].append(copy.deepcopy(group))
        elif mode == 'incomplete': snapshot['inventory_complete'] = False
        elif mode == 'reason': group['error_details'] = ''
        elif mode == 'cancellable': group['progress_state']['can_cancel'] = True
        elif mode == 'group_not_loaded': group['children_loaded'] = False
        elif mode == 'owner': child['owner']['node_id'] = 'foreign'
        elif mode == 'missing_source_child': snapshot['processes'] = [p for p in snapshot['processes'] if not (p['parent_id'] == group['process_id'] and p.get('error'))]
        elif mode == 'child_completed': child['progress_state']['state'] = 'completed'
        elif mode == 'foreign_context': snapshot['node_context']['node_id'] = 'foreign'
        try:
            verify_native_failure(baseline, snapshot, node, execution, expected_path)
        except (ValueError, KeyError, TypeError, StopIteration) as error:
            results.append(dict(case=mode, rejected=True, reason=str(error)))
        else:
            raise AssertionError('Accepted mutation: ' + mode)
    for mode in ('cleanup', 'stale_output', 'read_phase', 'unverified_failure'):
        changed = copy.deepcopy(events)
        result = next(e['result'] for e in changed if e.get('operation_id') == request_id and e.get('phase') == 'node_checkpoint')
        if mode == 'cleanup': result['cleanup_complete'] = False
        elif mode == 'stale_output': result['output']['ports'] = [{'port': 0}]
        elif mode == 'read_phase': changed.append(dict(operation_id=request_id, phase='node_phase_prepared', receipt=dict(phase='read')))
        elif mode == 'unverified_failure': result['execution']['failure_verified'] = False
        checked = verify(changed, request_id, expected_path)
        assert not checked['passed'], mode
        results.append(dict(case=mode, rejected=True, reason=checked['failures']))
    result = dict(passed=True, rejected=len(results), cases=results)
    (directory / 'r2-terminal-negatives.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    return result


if __name__ == '__main__':
    result = run(Path(sys.argv[1]))
    print(json.dumps(result, ensure_ascii=False, indent=2))
