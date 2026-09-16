"""Deliberate corruption of a successful real Replacement evidence export."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
from replacement_evidence_audit import audit


def verify_negative_cases(events, request, expected):
    if not audit(events, request, expected)['passed']: raise ValueError('negative_baseline_must_pass')
    op = request['operation_id']
    def checkpoint(es): return next(e['result'] for e in es if e.get('operation_id') == op and e.get('phase') == 'node_checkpoint')
    def configured(es): return next(e['receipt']['value'] for e in es if e.get('operation_id') == op and e.get('phase') == 'node_phase_completed' and e['receipt']['phase'] == 'configure')
    cases = {
        'foreign_node': lambda es, r: checkpoint(es)['node'].__setitem__('node_id', 'foreign'),
        'stale_execution': lambda es, r: checkpoint(es)['output']['ports'][0].__setitem__('execution_id', 'stale'),
        'missing_row': lambda es, r: checkpoint(es)['output']['ports'][0]['sample'].pop(),
        'false_null_flag': lambda es, r: checkpoint(es)['output']['ports'][0]['sample'][1][3].__setitem__('value', False),
        'null_as_text': lambda es, r: checkpoint(es)['output']['ports'][0]['sample'][1][2].update(is_null=False, value='null'),
        'rounded_int64': lambda es, r: checkpoint(es)['output']['ports'][0]['sample'][0][5].__setitem__('value', '9223372036854775808'),
        'wrong_mode_receipt': lambda es, r: checkpoint(es)['configuration']['readback'].__setitem__('output_mode', 'replace'),
        'altered_rule_receipt': lambda es, r: configured(es)['configuration']['rules'][0]['pairs'][0]['to'].__setitem__('value', 'Wrong'),
        'wrong_requested_field': lambda es, r: r['parameters']['rules'][0]['field'].__setitem__('name', 'Keep'),
        'wrong_requested_case': lambda es, r: r['parameters']['rules'][0].__setitem__('case_sensitive', False),
        'wrong_column': lambda es, r: checkpoint(es)['output']['ports'][0]['schema'][0].__setitem__('name', 'OtherId'),
        'duplicate_checkpoint': lambda es, r: es.append(deepcopy(next(e for e in es if e.get('operation_id') == op and e.get('phase') == 'node_checkpoint'))),
    }
    checks = {}
    for name, mutate in cases.items():
        copied, wanted = deepcopy(events), deepcopy(request)
        mutate(copied, wanted)
        result = audit(copied, wanted, expected)
        checks[name] = dict(passed=result['passed'] is False, rejection=result['checks'])
    return dict(passed=all(c['passed'] for c in checks.values()), count=len(checks), checks=checks)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('events', 'request', 'expected', 'output'): parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    report = verify_negative_cases([json.loads(line) for line in args.events.read_text().splitlines()], json.loads(args.request.read_text()), json.loads(args.expected.read_text()))
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(passed=report['passed'], count=report['count'], failed=[k for k, v in report['checks'].items() if not v['passed']])))
    raise SystemExit(0 if report['passed'] else 1)
