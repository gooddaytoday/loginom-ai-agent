"""Stage-0 proposal: literal membership, independent of Loginom and runtime.

Only task-value-list.md and fixtures/v040/rows.csv are model inputs.
Run with --check to compare the committed expected-v040.json.
"""
import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def expected():
    with (ROOT.parent / 'fixtures/v040/rows.csv').open(encoding='utf-8', newline='') as source:
        rows = [{'RowID': int(r['RowID']), 'Region': None if r['Region'] == 'NULL' else r['Region'],
                 'Amount': int(r['Amount'])} for r in csv.DictReader(source, delimiter=';')]
    columns = [{'name': name, 'type': kind, 'label_any': True}
               for name, kind in [('RowID', 'integer'), ('Region', 'string'), ('Amount', 'integer')]]
    return {'package_path': '{{PACKAGE_PATH}}', 'null_marker': 'NULL',
            'nodes': [{'type': 'transform.filter_data'}], 'outputs': [
                {'output_node_type': 'transform.filter_data', 'output_port': port,
                 'ordered': False, 'column_order': 'exact', 'columns': columns,
                 'rows': [r for r in rows if (r['Region'] in ('North', 'South')) == (port == 0)]}
                for port in (0, 1)]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    value = expected()
    if args.check:
        assert json.loads((ROOT / 'expected-v040.json').read_text(encoding='utf-8')) == value
        print('literal-list proposal: OK')
    else:
        print(json.dumps(value, ensure_ascii=False, indent=2))
