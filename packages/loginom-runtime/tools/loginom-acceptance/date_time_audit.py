"""Operator audit of one completed source diagnostic operation (not Hermes acceptance)."""
import argparse
import json
from pathlib import Path
from date_time_configuration_evidence import verify_date_time_configuration
from date_time_oracle import ROWS, calendar_value, verify_output
from calculator_output_evidence import verify_calculator_output

def audit(events, request, fixture_rows=ROWS):
    configuration = verify_date_time_configuration(events, request)
    checks = dict(configuration=configuration)
    if configuration['passed'] and request['finish'] == 'execute':
        projection = configuration['projection']
        rows = [[calendar_value(row[f['input']], f['operation']) if f.get('operation') else row[f['input']]
                 for f in projection] for row in fixture_rows]
        columns = [{k: f[k] for k in ('name', 'label', 'type')} for f in projection]
        # The reused CSV oracle parser accepts a space between date and time;
        # typed result values remain independently checked as local ISO below.
        csv_rows = [[value.replace('T', ' ') if column['type'] == 'datetime' and value is not None else value
                     for value, column in zip(row, columns)] for row in rows]
        checks['raw_output'] = verify_calculator_output(events, request, columns, csv_rows)
        try:
            checkpoints = [e['result'] for e in events if e.get('operation_id') == request['operation_id'] and e.get('phase') == 'node_checkpoint']
            checks['values'] = verify_output(checkpoints[0]['output']['ports'][0], projection, rows=fixture_rows)
        except (KeyError, IndexError, TypeError, ValueError) as error:
            checks['values'] = dict(passed=False, failures=[str(error)])
    return dict(passed=bool(checks) and all(c['passed'] for c in checks.values()), checks=checks,
                scope='source_diagnostic_operation', hermes_acceptance=False, package_persistence_verified=False)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    parser.add_argument('operation_id')
    parser.add_argument('--fixture', choices=['boundaries', 'empty'], default='boundaries')
    args = parser.parse_args()
    events = [json.loads(line) for line in (args.session / 'execution-events.jsonl').read_text().splitlines()]
    requests = [e['request'] for e in events if e.get('operation_id') == args.operation_id and e.get('phase') == 'node_apply_prepared']
    if len(requests) != 1:
        raise SystemExit('One original request required')
    result = audit(events, requests[0], fixture_rows=[] if args.fixture == 'empty' else ROWS)
    result['fixture'] = args.fixture
    (args.session / (args.operation_id + '-audit.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
