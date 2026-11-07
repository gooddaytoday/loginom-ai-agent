"""Independent relational proposals; no Loginom imports or output-derived values.

--check verifies each v040/<case>/expected.json. Empty-side full semantics are
not asserted until observed and approved; these cases use two nonempty inputs.
"""
import argparse
import csv
import json
from decimal import Decimal
from itertools import product
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CASES = ('cross', 'full-no-keys', 'key-coercion')


def expected(case):
    def source(side):
        with (ROOT.parent / f'fixtures/v040/{side}.csv').open(encoding='utf-8', newline='') as data:
            return list(csv.DictReader(data, delimiter=';'))
    rows = []
    for left, right in product(source('left'), source('right')):
        if case == 'key-coercion' and Decimal(left['LeftKey']) != Decimal(right['RightKey']):
            continue
        rows.append({'LeftID': left['LeftID'], 'LeftKey': int(left['LeftKey']),
                     'RightID': right['RightID'], 'RightKey': float(right['RightKey'])
                     if case == 'key-coercion' else int(right['RightKey'])})
    columns = [('LeftID', 'string'), ('LeftKey', 'integer'), ('RightID', 'string'),
               ('RightKey', 'real' if case == 'key-coercion' else 'integer')]
    return {'package_path': '{{PACKAGE_PATH}}', 'null_marker': 'NULL',
            'nodes': [{'type': 'transform.join_data'}], 'outputs': [{
                'output_node_type': 'transform.join_data', 'output_port': 0,
                'ordered': False, 'column_order': 'exact',
                'columns': [{'name': n, 'type': t, 'label_any': True} for n, t in columns], 'rows': rows}]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=CASES, default='cross')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.check:
        for case in CASES:
            assert json.loads((ROOT / 'v040' / case / 'expected.json').read_text(encoding='utf-8')) == expected(case), case
        print('join proposals: OK')
    else:
        print(json.dumps(expected(args.case), ensure_ascii=False, indent=2))
