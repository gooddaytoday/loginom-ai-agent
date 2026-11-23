"""Independent projection/concatenation/set proposals, never sent to the model.

--check verifies v040/<case>/expected.json. Does not certify native UI modes.
Automatic node label is intentionally unconstrained in table expectations.
"""
import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CASES = ('two-stage', 'distinct', 'auto-label')


def expected(case):
    rows = []
    for name, backup in [('main', 'Backup'), ('second', 'Reserve')]:
        with (ROOT.parent / f'fixtures/v040/{name}.csv').open(encoding='utf-8', newline='') as source:
            rows += [{'Code': r['Code'], 'Backup': r[backup], 'Amount': int(r['Amount'])} for r in csv.DictReader(source, delimiter=';')]
    if case == 'distinct':
        # Full-row identity, not deduplication on the code alone.
        rows = [dict(zip(('Code', 'Backup', 'Amount'), pair))
                for pair in sorted({(r['Code'], r['Backup'], r['Amount']) for r in rows})]
    return {'package_path': '{{PACKAGE_PATH}}', 'null_marker': 'NULL',
            'nodes': [{'type': 'transform.union_data'}], 'outputs': [{
                'output_node_type': 'transform.union_data', 'output_port': 0,
                'ordered': False, 'column_order': 'exact',
                'columns': [{'name': 'Code', 'type': 'string', **({'label_any': True} if case == 'distinct' else {'label': 'Код'})},
                            {'name': 'Backup', 'type': 'string', **({'label_any': True} if case == 'distinct' else {'label': 'Резерв'})},
                            {'name': 'Amount', 'type': 'integer', **({'label_any': True} if case == 'distinct' else {'label': 'Сумма'})}], 'rows': rows}]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=CASES, default='two-stage')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.check:
        for case in CASES:
            assert json.loads((ROOT / 'v040' / case / 'expected.json').read_text(encoding='utf-8')) == expected(case), case
        print('union proposals: OK')
    else:
        print(json.dumps(expected(args.case), ensure_ascii=False, indent=2))
