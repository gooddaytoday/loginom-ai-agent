#!/usr/bin/env python3
"""Independent scalar NULL oracle. No product code or model receipts are read."""
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
TYPES = {'RowID': 'integer', 'I': 'integer', 'R': 'real', 'A': 'integer', 'Keep': 'integer'}


def expected(case='core'):
    with (ROOT / 'data' / (('core' if case == 'mean' else case) + '.csv')).open(newline='') as stream:
        reader = csv.DictReader(stream)
        names = reader.fieldnames
        rows = [{name: None if raw[name] == '?' else
                 float(raw[name]) if TYPES[name] == 'real' else int(raw[name])
                 for name in names} for raw in reader]
    for name in ('I', 'R', 'A'):
        method = ('mean' if name != 'A' else None) if case == 'mean' else (
            'mean' if case == 'threshold' and name == 'I' else 'zero')
        if method is None:
            continue
        replacement = 0
        if method == 'mean':
            values = [row[name] for row in rows if row[name] is not None]
            # Compare exactly: mean obeys the statistical threshold; fixed zero does not.
            if not values or (len(rows) - len(values)) * 100 > len(rows) * (20 if case == 'threshold' else 100):
                continue
            replacement = sum(values) / len(values)
        for row in rows:
            if row[name] is None:
                row[name] = replacement
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': t} for t in ('imports.text', 'preprocessing.data_recovery', 'exports.text')],
            'outputs': [{'output_node_type': 'preprocessing.data_recovery', 'output_port': 0,
                         'ordered': True, 'column_order': 'exact',
                         'columns': [{'name': name, 'type': TYPES[name], 'label_any': True} for name in names],
                         'rows': rows}]}


if __name__ == '__main__':
    case = sys.argv[1] if len(sys.argv) > 1 else 'core'
    print(json.dumps(expected(case), indent=2, ensure_ascii=False))
