"""Independent proposal oracle: Python csv/datetime and IEEE-754 binary64.

No Loginom imports or formulas; writes expected.json only with --write.
"""
import argparse
import csv
import json
import math
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def expected():
    variables = json.loads((ROOT / 'fixtures/variables.json').read_text())
    with (ROOT / 'fixtures/transactions.csv').open(newline='') as stream:
        rows = list(csv.DictReader(stream, delimiter=';'))
    for row in rows:
        row['Id'] = int(row['Id'])
        row['Amount'] = int(row['Amount'])
        row['Share'] = None if row['Share'] == '' else float(row['Share'])
        assert row['Share'] is None or math.isfinite(row['Share'])
        datetime.fromisoformat(row['OccurredAt'])

    def phase(items):
        by_name = {v['name']: v for v in items}
        start = datetime.fromisoformat(by_name['report_date']['value'])
        end = start + timedelta(days=1)
        threshold = float(by_name['threshold']['value'])
        report = [r for r in rows if start <= datetime.fromisoformat(r['OccurredAt']) < end]
        above = [r for r in rows if r['Share'] is not None and r['Share'] > threshold]

        def output(selected):
            return {'rows': [[r[k] for k in ('Id', 'OccurredAt', 'Share', 'Amount')] for r in selected],
                    'count': len(selected), 'amount_sum': sum(r['Amount'] for r in selected)}

        return {'variables': items, 'day_report': output(report), 'above_threshold': output(above)}

    initial = variables['initial']
    patch = {v['name']: v for v in variables['patch']}
    updated = [patch.get(v['name'], v) for v in initial]
    return {'status': 'proposal_not_runtime_cold_schema',
            'schema': [{'name': n, 'type': t} for n, t in
                       [('Id', 'integer'), ('OccurredAt', 'datetime'), ('Share', 'real'), ('Amount', 'integer')]],
            'comparison': {'real': 'same binary64, no tolerance', 'datetime': 'civil millisecond, no timezone conversion',
                           'row_order': 'compare by Id', 'null': 'explicit; distinct from empty/zero/false'},
            'initial': phase(initial), 'updated': phase(updated)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    target = ROOT / 'acceptance/expected.json'
    result = expected()
    if args.write:
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    else:
        assert json.loads(target.read_text()) == result, 'expected.json differs from independent oracle'
        print('PASS: initial and updated variables, both business outputs')
