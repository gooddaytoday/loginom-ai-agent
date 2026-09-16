"""Compare independently audited Date/time configuration across a real package reopen."""
import argparse
import json
import re
from pathlib import Path
from date_time_audit import audit
from date_time_oracle import ROWS


def events_at(directory):
    return [json.loads(line) for line in (directory / 'execution-events.jsonl').read_text().splitlines()]


def operation(events, operation_id):
    requests = [e['request'] for e in events if e.get('operation_id') == operation_id and e.get('phase') == 'node_apply_prepared']
    checkpoints = [e for e in events if e.get('operation_id') == operation_id and e.get('phase') == 'node_checkpoint']
    if len(requests) != 1 or len(checkpoints) != 1:
        raise ValueError('one_original_operation_required')
    return requests[0], checkpoints[0]


def semantic_configuration(checkpoint):
    c = checkpoint['result']['configuration']['readback']
    return dict(mode=c['mode'], fields=[dict(name=f['name'], matrix=[{k: r[k] for k in
        ('func', 'iso', 'first', 'last', 'number', 'string', 'string_format')} for r in f['matrix']]) for f in c['fields']],
        input_mapping=c['input_mapping'], output_mapping=c['output_mapping'])


def opened_path(directory, package_path):
    for file in sorted(directory.glob('browser-*.json'), key=lambda p: int(p.stem.split('-')[-1])):
        value = json.loads(file.read_text())
        for content in value.get('content', []):
            match = re.search(r'^### Result\n([\s\S]*?)(?:\n### |$)', content.get('text', ''))
            if not match:
                continue
            try:
                result = json.loads(match[1])
            except ValueError:
                continue
            if (isinstance(result, dict) and result.get('operation_id') == 'base-open' and result.get('status') == 'READY'
                    and result.get('package_ref', {}).get('path') == package_path and result['package_ref'].get('persisted') is True):
                return True
    return False


def public_success(directory, operation_id):
    for line in (directory / 'public-api.jsonl').read_text().splitlines():
        event = json.loads(line)
        value = event.get('reply', {}).get('structuredContent', {})
        if (event.get('phase') == 'response' and value.get('operation_id') == operation_id and value.get('state') == 'settled'
                and value.get('outcome', {}).get('status') == 'SUCCEEDED'):
            return True
    return False


def verify(before_dir, before_id, after_dir, after_id, fixture_rows=ROWS):
    failures = []
    try:
        before_events, after_events = events_at(before_dir), events_at(after_dir)
        before_request, before = operation(before_events, before_id)
        after_request, after = operation(after_events, after_id)
        for events, request in [(before_events, before_request), (after_events, after_request)]:
            if not audit(events, request, fixture_rows=fixture_rows)['passed']:
                failures.append('operation_audit_failed')
        if not public_success(before_dir, before_id) or not public_success(after_dir, after_id):
            failures.append('public_success_reply_missing')
        if after_request['finish'] != 'execute' or after_request['parameters'] != {} or after_request['mappings'] != []:
            failures.append('reopen_must_execute_without_reconfiguration')
        saves = [e for e in before_events if e.get('phase') == 'completed' and e.get('action_key') == 'package.save_checkpoint'
                 and e.get('outcome', {}).get('status') == 'SUCCEEDED' and e['recorded_at'] > before['recorded_at']]
        if len(saves) != 1 or saves[0]['outcome']['output'].get('save_completed') is not True:
            raise ValueError('one_awaited_save_after_configuration_required')
        package_path = saves[0]['outcome']['output']['package_ref']['path']
        if before_dir == after_dir or not opened_path(after_dir, package_path):
            failures.append('independent_exact_package_open_missing')
        if before['result']['node']['node_id'] != after['result']['node']['node_id']:
            failures.append('saved_node_identity_changed')
        if semantic_configuration(before) != semantic_configuration(after):
            failures.append('saved_configuration_changed')
    except (KeyError, ValueError, TypeError, IndexError) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=sorted(set(failures)), scope='independent_date_time_save_reopen_execute',
                package_persistence_verified=not failures, hermes_acceptance=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('before', type=Path)
    parser.add_argument('before_operation')
    parser.add_argument('after', type=Path)
    parser.add_argument('after_operation')
    parser.add_argument('--fixture', choices=['boundaries', 'empty'], default='boundaries')
    args = parser.parse_args()
    result = verify(args.before, args.before_operation, args.after, args.after_operation, fixture_rows=[] if args.fixture == 'empty' else ROWS)
    (args.after / 'date-time-persistence.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
