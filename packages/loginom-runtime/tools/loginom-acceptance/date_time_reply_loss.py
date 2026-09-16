"""Audit one executed flag click whose successful reply was withheld from the driver."""
import argparse
import copy
import json
import re
from pathlib import Path


def verify(directory):
    failures = []
    try:
        read = lambda name: json.loads((directory / name).read_text())
        fault = read('injected-date-flag-reply-loss.json')
        operation_id, internal_id = fault['operationId'], fault['pendingId']
        result = read('small-lost-flag.json')
        replay = read('replay-lost-flag.json')
        before, after = read('loss-before-replay.json'), read('loss-after-replay.json')
        if (fault.get('consumed') is not True or fault.get('actual_status') != 'SUCCEEDED'
                or fault.get('actual_cleanup_complete') is not True
                or result['status'] != 'AMBIGUOUS' or result['phase'] != 'configure'
                or result['effect_possible'] is not True or result['cleanup_complete'] is not False):
            failures.append('executed_click_not_reported_as_uncertain')
        contents = read(fault['browser_reply'])['content']
        matches = [re.search(r'^### Result\n([\s\S]*?)(?:\n### |$)', c.get('text', '')) for c in contents]
        values = [json.loads(m[1]) for m in matches if m]
        actual = values[0]['output']['value']
        if (actual.get('operation_id') != internal_id or actual.get('action_key') != 'ui.act'
                or actual.get('status') != 'SUCCEEDED' or actual.get('cleanup_complete') is not True
                or len([t for t in actual.get('trace', []) if t.get('event') == 'ui_gesture_applied']) != 1):
            failures.append('one_actual_gesture_receipt_required')
        events = [json.loads(line) for line in (directory / 'execution-events.jsonl').read_text().splitlines()]
        previous, flag_steps = None, []
        for event in events:
            if event.get('operation_id') != operation_id:
                continue
            if event.get('phase') == 'node_observation_completed':
                previous = event['outcome']['output']
            if event.get('phase') == 'node_step_prepared' and event.get('action', {}).get('verb') == 'click':
                cell = next((e.get('date_time_cell') for e in previous['ui']['elements'] if e['ref'] == event['action']['ref']), None)
                if cell and cell.get('role') == 'flag':
                    flag_steps.append((event, cell, previous['node_date_time']))
        if len(flag_steps) != 1:
            raise ValueError('exactly_one_flag_gesture_required')
        event, cell, original = flag_steps[0]
        if (event['internal_operation_id'] != internal_id or cell != fault['before']
                or cell['checked'] is not False or cell['iso'] is not False
                or cell['func'] != fault['func'] or cell['flag'] != fault['flag']
                or original['selected']['name'] != fault['field']):
            failures.append('wrong_flag_owner')
        expected = copy.deepcopy(original['matrix'])
        flag = {'DoNumber': 'number', 'DoDateTimeFirst': 'first', 'DoDateTimeLast': 'last', 'DoString': 'string'}[fault['flag']]
        next(r for r in expected if r['func'] == fault['func'] and r['iso'] is False)[flag] = True
        for state in (before, after):
            if (state.get('verified') is not True or state.get('inventory_complete') is not True
                    or state['node_context'] != original['node_context']
                    or state['selected']['name'] != fault['field'] or state['matrix'] != expected):
                failures.append('flag_inverted_or_another_value_changed')
        if not replay['before'] == replay['afterReplay'] == replay['afterResume']:
            failures.append('replay_issued_browser_calls')
        if replay['replay'].get('threw') or replay['replay'].get('outcome', {}).get('status') != 'AMBIGUOUS':
            failures.append('replay_did_not_preserve_uncertainty')
        if replay['resume'].get('outcome', {}).get('status') == 'SUCCEEDED':
            failures.append('unsafe_resume_succeeded')
        public = [json.loads(line) for line in (directory / 'public-api.jsonl').read_text().splitlines()]
        calls = [e for e in public if e.get('phase') == 'request' and e['request']['name'] in ('dock_node_apply', 'dock_node_resume')
                 and e['request']['arguments'].get('operation_id') == operation_id]
        if (len(calls) != 3 or [c['request']['name'] for c in calls] != ['dock_node_apply', 'dock_node_apply', 'dock_node_resume']
                or any(c['request']['arguments'] != calls[0]['request']['arguments'] for c in calls)):
            failures.append('identical_public_replay_and_resume_required')
    except (KeyError, TypeError, ValueError, IndexError, StopIteration) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=sorted(set(failures)), scope='source_date_time_reply_loss',
                automatic_recovery_verified=False, hermes_acceptance=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    args = parser.parse_args()
    result = verify(args.session)
    (args.session / 'date-time-reply-loss-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
