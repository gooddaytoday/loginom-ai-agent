"""Audit one complete Replacement operation against a separately fixed fixture.

This is an operation audit, not an autonomous scenario/persistence admission.
"""
import argparse
import json
from pathlib import Path
from replacement_configuration_evidence import verify_replacement_configuration
from calculator_output_evidence import verify_calculator_output


def audit(events, request, expected):
    columns = []
    for index, (name, kind) in enumerate(zip(expected['names'], expected['types'])):
        label = name
        if name.endswith('_Replace'): label = name[:-8] + ' Замена'
        if name.endswith('_Replaced'): label = name[:-9] + ' Заменен'
        if 'labels' in expected: label = expected['labels'][index]
        columns.append(dict(name=name, label=label, type=kind,
                            data_kind='Непрерывный' if kind == 'real' else 'Дискретный'))
    checks = dict(configuration=verify_replacement_configuration(events, request),
                  output=verify_calculator_output(events, request, columns, expected['rows']))
    checkpoints = [e['result'] for e in events if e.get('operation_id') == request['operation_id'] and e.get('phase') == 'node_checkpoint']
    schema_ok = False
    if len(checkpoints) == 1:
        ports = checkpoints[0].get('output', {}).get('ports', [])
        if len(ports) == 1:
            observed = ports[0].get('schema', [])
            schema_ok = len(observed) == len(columns) and all(f.get('index') == i and all(f.get(k) == wanted[k] for k in ('name', 'label', 'type', 'data_kind')) for i, (f, wanted) in enumerate(zip(observed, columns)))
    checks['returned_schema'] = dict(passed=schema_ok)
    return dict(passed=all(c['passed'] for c in checks.values()), checks=checks,
                scope='replacement_single_operation', source_identity_verified=False,
                package_persistence_verified=False, autonomous_acceptance=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--events', type=Path, required=True)
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--expected', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = audit([json.loads(line) for line in args.events.read_text().splitlines()],
                   json.loads(args.request.read_text()), json.loads(args.expected.read_text()))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(0 if result['passed'] else 1)
