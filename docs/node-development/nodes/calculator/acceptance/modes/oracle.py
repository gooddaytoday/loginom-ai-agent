#!/usr/bin/env python3
"""Proposed arithmetic oracle; no Loginom, JavaScript or handler imports."""
import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def expected():
    names = ['RowID', 'Quantity', 'UnitPrice', 'Amount', 'Bare',
             'FromField', 'JsTotal', 'FromExpr']
    rows = []
    with (ROOT / 'fixtures/modes.csv').open(encoding='utf-8', newline='') as source:
        reader = csv.DictReader(source, delimiter=';')
        assert reader.fieldnames == ['RowID', 'Quantity', 'UnitPrice', 'Amount']
        for raw in reader:
            values = {name: None if value == 'NULL' else int(value)
                      for name, value in raw.items()}
            amount = (None if values['Quantity'] is None
                      else values['Quantity'] * values['UnitPrice'])
            rows.append({'RowID': values['RowID'], 'Quantity': values['Quantity'],
                         'UnitPrice': values['UnitPrice'], 'Amount': amount,
                         'Bare': values['Amount'], 'FromField': values['Amount'],
                         'JsTotal': 2 * (values['Amount'] + 1), 'FromExpr': amount})
    assert len(rows) == 4 and len({row['RowID'] for row in rows}) == 4
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': 'imports.text'}, {'type': 'transform.calculator'}],
            'outputs': [{'output_node_type': 'transform.calculator', 'output_port': 0,
                         'ordered': False, 'column_order': 'exact',
                         'columns': [{'name': name, 'type': 'integer', 'label_any': True}
                                     for name in names], 'rows': rows}]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text = json.dumps(expected(), ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    path = Path(__file__).with_name('expected.json')
    if args.write:
        path.write_text(text, encoding='utf-8')
    else:
        assert path.read_text(encoding='utf-8') == text, 'expected.json differs from oracle'
    print('oracle: PASS (proposal only; native output is not certified)')
