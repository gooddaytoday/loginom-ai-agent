"""Independent audit of one original Date/time configure continuation."""
import argparse
import json
import re
from pathlib import Path
from date_time_configuration_evidence import verify_date_time_configuration


def verify(directory):
    failures = []
    try:
        read = lambda name: json.loads((directory / name).read_text())
        events = [json.loads(x) for x in (directory / 'execution-events.jsonl').read_text().splitlines()]
        public = [json.loads(x) for x in (directory / 'public-api.jsonl').read_text().splitlines()]
        fault = read('injected-date-flag-reply-loss.json')
        op, gesture = fault['operationId'], fault['pendingId']
        calls = [e['request'] for e in public if e.get('phase') == 'request'
                 and e['request']['name'] in ('dock_node_apply', 'dock_node_resume')
                 and e['request']['arguments'].get('operation_id') == op]
        if not calls or calls[0]['name'] != 'dock_node_apply' or not any(c['name'] == 'dock_node_resume' for c in calls):
            raise ValueError('original_public_apply_resume_required')
        request = calls[0]['arguments']
        if any(c['arguments'] != request for c in calls):
            failures.append('changed_original_request')
        configuration = verify_date_time_configuration(events, request)
        failures.extend(configuration['failures'])
        loss, resumed = read('r1-loss.json'), read('r1-resume.json')['result']
        if loss['status'] != 'AMBIGUOUS' or loss['cleanup_complete'] is not False or loss['phase'] != 'configure':
            failures.append('original_uncertainty_required')
        if resumed['status'] != 'SUCCEEDED' or resumed['operation_id'] != op or resumed['cleanup_complete'] is not True:
            failures.append('same_operation_not_completed')
        receipts = [e for e in events if e.get('operation_id') == op and e.get('phase') == 'node_step_completed'
                    and e.get('internal_operation_id') == gesture]
        if len(receipts) != 1 or receipts[0]['outcome']['status'] != 'SUCCEEDED':
            failures.append('original_receipt_not_acknowledged_once')
        values = []
        for c in read(fault['browser_reply'])['content']:
            m = re.search(r'^### Result\n([\s\S]*?)(?:\n### |$)', c.get('text', ''))
            if m:
                values.append(json.loads(m[1]))
        actual = values[0]['output']['value']
        if actual['operation_id'] != gesture or actual['status'] != 'SUCCEEDED' or actual['cleanup_complete'] is not True:
            failures.append('lost_browser_receipt_unverified')
        previous, clicks = None, []
        for e in events:
            if e.get('operation_id') != op:
                continue
            if e.get('phase') == 'node_observation_completed':
                previous = e['outcome']['output']
            if e.get('phase') == 'node_step_prepared' and e.get('action', {}).get('verb') == 'click':
                element = next((x for x in previous['ui']['elements'] if x['ref'] == e['action']['ref']), {})
                cell = element.get('date_time_cell', {})
                if cell.get('role') == 'flag':
                    clicks.append((previous['node_date_time']['selected']['name'], cell['func'], cell['iso'], cell['flag'], e['internal_operation_id']))
        if len({c[:4] for c in clicks}) != len(clicks):
            failures.append('verified_flag_toggled_again')
        lost = [c for c in clicks if c[:4] == (fault['field'], fault['func'], False, fault['flag'])]
        if len(lost) != 1 or lost[0][4] != gesture:
            failures.append('unknown_flag_replayed')
        if not any(c[0] == fault['field'] and c[1] == 12 and c[3] == 'DoNumber' for c in clicks):
            failures.append('remaining_hour_not_configured')
        boundaries = [e for e in events if e.get('operation_id') == op and e.get('phase') == 'node_phase_prepared'
                      and e.get('receipt', {}).get('phase') == 'configure']
        if len(boundaries) != 1:
            failures.append('configure_boundary_replaced')
        proofs = [e for e in events if e.get('operation_id') == op and e.get('phase') == 'node_configure_continuation_checked']
        if not proofs or any(e['receipt_id'] != gesture or len(e['matrices']) != 2
                             or any(len(f['matrix']) != 29 for f in e['matrices']) for e in proofs):
            failures.append('complete_original_draft_proof_missing')
        repeat = read('r1-repeat.json')
        if not repeat['before'] == repeat['middle'] == repeat['after'] or repeat['repeat'] != 'SUCCEEDED' or repeat['resume'] != 'SUCCEEDED':
            failures.append('completed_operation_replayed_effects')
        negative = read('r1-negative.json')
        if 'selected field differs' not in negative['outcome'].get('error', ''):
            failures.append('foreign_selection_not_refused')
    except (KeyError, ValueError, TypeError, IndexError, StopIteration) as error:
        failures.append(str(error))
    return {'passed': not failures, 'failures': sorted(set(failures)),
            'scope': 'same_session_date_time_configure_continuation', 'hermes_acceptance': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    args = parser.parse_args()
    result = verify(args.session)
    (args.session / 'date-time-continuation-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
