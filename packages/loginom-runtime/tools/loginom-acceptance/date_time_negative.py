"""Mutate one verified source journal in memory; no UI or model execution."""
import argparse
import json
from copy import deepcopy
from pathlib import Path
from date_time_audit import audit
from date_time_oracle import ROWS

def negative_checks(events, request, fixture_rows=ROWS):
    baseline = audit(events, request, fixture_rows=fixture_rows)
    if not baseline['passed']:
        raise ValueError('A passing baseline is required')
    op = request['operation_id']
    checks = {}
    def changed(phase, mutate):
        indexes = [i for i, e in enumerate(events) if e.get('operation_id') == op and e.get('phase') == phase]
        if not indexes:
            raise ValueError('Missing negative target: ' + phase)
        copied = list(events)
        for index in indexes:
            copied[index] = deepcopy(events[index])
            mutate(copied[index])
        return copied
    mutations = {
        'wrong_checkpoint_owner': ('node_checkpoint', lambda e: e['result']['node'].update(node_id='foreign')),
        'false_execution_id': ('node_checkpoint', lambda e: e['result']['execution'].update(execution_id='stale')),
        'wrong_output_value': ('node_checkpoint', lambda e: e['result']['output']['ports'][0]['sample'][0][0].update(value='999')),
        'incomplete_output': ('node_checkpoint', lambda e: e['result']['output']['ports'][0].update(sample_complete=False)),
        'unverified_phase': ('node_phase_completed', lambda e: e['receipt'].update(status='unverified') if e['receipt']['phase'] == 'configure' else None),
        'wrong_output_owner': ('node_phase_completed', lambda e: e['receipt']['value']['native_mapping']['node_context'].update(node_id='foreign') if e['receipt']['phase'] == 'output_mapping' else None),
        'missing_finish': ('node_phase_completed', lambda e: e['receipt']['value'].update(settings_applied=False) if e['receipt']['phase'] == 'finish' else None),
        'missing_matrix': ('node_phase_completed', lambda e: e['receipt']['value']['configuration'].update(field_matrices=[]) if e['receipt']['phase'] == 'configure' else None),
    }
    if request['finish'] != 'execute':
        for name in ('false_execution_id', 'wrong_output_value', 'incomplete_output'):
            mutations.pop(name)
    if request['target']['kind'] == 'existing' and request['parameters'].get('fields'):
        mutations['original_output_committed'] = ('node_phase_completed', lambda e: e['receipt']['value']['preconfiguration']['close'].update(settings_applied=True) if e['receipt']['phase'] == 'open' else None)
        mutations['missing_original_binding'] = ('node_phase_completed', lambda e: e['receipt']['value']['preconfiguration']['native_mapping']['source_fields'].pop() if e['receipt']['phase'] == 'open' else None)
    if request['finish'] == 'execute' and not fixture_rows:
        mutations.pop('wrong_output_value')
        mutations['false_empty_row_count'] = ('node_checkpoint', lambda e: e['result']['output']['ports'][0].update(row_count=1))
        mutations['missing_empty_schema_column'] = ('node_checkpoint', lambda e: e['result']['output']['ports'][0]['schema'].pop())
    for name, (phase, mutate) in mutations.items():
        report = audit(changed(phase, mutate), request, fixture_rows=fixture_rows)
        checks[name] = dict(passed=report['passed'] is False)
    input_mapping = next((m for m in request['mappings'] if m['direction'] == 'input' and m.get('fields')), None)
    if input_mapping:
        for kind in ('order', 'label'):
            changed_request = deepcopy(request)
            fields = next(m['fields'] for m in changed_request['mappings'] if m['direction'] == 'input' and m.get('fields'))
            if kind == 'order':
                if len(fields) < 2: continue
                fields[0], fields[1] = fields[1], fields[0]
            else: fields[0]['label'] = 'Unrequested label'
            checks['wrong_requested_input_' + kind] = dict(passed=audit(events, changed_request, fixture_rows=fixture_rows)['passed'] is False)
    output_mapping = next((m for m in request['mappings'] if m['direction'] == 'output' and m.get('fields')), None)
    if output_mapping:
        final_fields = next(e['result']['configuration']['readback']['output_mapping']['fields'] for e in events
                            if e.get('operation_id') == op and e.get('phase') == 'node_checkpoint')
        for index, original in enumerate(output_mapping['fields']):
            effective_excluded = next(f['excluded'] for f in final_fields if f['name'] == original.get('name', original['source']['name']))
            for key in ('name', 'label', 'excluded'):
                changed_request = deepcopy(request)
                field = next(m['fields'] for m in changed_request['mappings'] if m['direction'] == 'output')[index]
                field[key] = not effective_excluded if key == 'excluded' else ('UnrequestedOutput' if key == 'name' else 'Unrequested output label')
                checks[f'wrong_requested_output_{index}_{key}'] = dict(passed=audit(events, changed_request, fixture_rows=fixture_rows)['passed'] is False)
    return dict(passed=all(c['passed'] for c in checks.values()), checks=checks)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    parser.add_argument('operation_id')
    parser.add_argument('--fixture', choices=['boundaries', 'empty'], default='boundaries')
    args = parser.parse_args()
    events = [json.loads(line) for line in (args.session / 'execution-events.jsonl').read_text().splitlines()]
    requests = [e['request'] for e in events if e.get('phase') == 'node_apply_prepared' and e.get('operation_id') == args.operation_id]
    if len(requests) != 1:
        raise SystemExit('One original request required')
    report = negative_checks(events, requests[0], fixture_rows=[] if args.fixture == 'empty' else ROWS)
    (args.session / (args.operation_id + '-negative.json')).write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['passed'] else 1)
