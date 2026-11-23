#!/usr/bin/env python3
"""Arithmetic oracle for calculator-expression-options; no Loginom or handler imports."""
import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAMES = ['RowID', 'Quantity', 'UnitPrice', 'Amount', 'Tail', 'Doubled']


def expected():
    rows = []
    with (ROOT / 'fixtures/modes.csv').open(encoding='utf-8', newline='') as source:
        reader = csv.DictReader(source, delimiter=';')
        assert reader.fieldnames == ['RowID', 'Quantity', 'UnitPrice', 'Amount']
        for raw in reader:
            values = {name: None if value == 'NULL' else int(value) for name, value in raw.items()}
            quantity, price = values['Quantity'], values['UnitPrice']
            helper = None if quantity is None else quantity + 1
            rows.append({'RowID': values['RowID'], 'Quantity': quantity, 'UnitPrice': price,
                         'Amount': None if quantity is None else quantity * price,
                         'Tail': price * 2, 'Doubled': None if helper is None else helper + helper})
    assert len(rows) == 4 and len({row['RowID'] for row in rows}) == 4
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': 'imports.text'}, {'type': 'transform.calculator'}],
            'outputs': [{'output_node_type': 'transform.calculator', 'output_port': 0,
                         'ordered': False, 'column_order': 'exact',
                         'columns': [{'name': name, 'type': 'integer', 'label_any': True} for name in NAMES],
                         'rows': rows}]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text = json.dumps(expected(), ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    path = Path(__file__).with_name('expected-expression-options.json')
    if args.write:
        path.write_text(text, encoding='utf-8')
    else:
        assert path.read_text(encoding='utf-8') == text, 'expected-expression-options.json differs from oracle'
    print('oracle: PASS (arithmetic only; native output is not certified)')
