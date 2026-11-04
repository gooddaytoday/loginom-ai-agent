#!/usr/bin/env python3
"""Proposal: independent integer arithmetic; only task/CSV reach the model."""
import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def expected(amount):
    rows = []
    with (ROOT / 'fixtures/variables.csv').open(encoding='utf-8', newline='') as source:
        reader = csv.DictReader(source, delimiter=';')
        assert reader.fieldnames == ['RowID', 'Amount']
        for raw in reader:
            value = None if raw['Amount'] == 'NULL' else int(raw['Amount'])
            rows.append({'RowID': int(raw['RowID']), 'Amount': value,
                         'Shifted': None if value is None else value + amount,
                         'ScenarioAmount': amount})
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': 'imports.text'}, {'type': 'transform.calculator'}],
            'outputs': [{'output_node_type': 'transform.calculator', 'output_port': 0,
                         'ordered': False, 'column_order': 'exact',
                         'columns': [{'name': name, 'type': 'integer', 'label_any': True}
                                     for name in ['RowID', 'Amount', 'Shifted', 'ScenarioAmount']],
                         'rows': rows}]}


def artifacts():
    # Read business inputs only; never interpret the manifest's Loginom formulas.
    source = json.loads((ROOT / 'fixtures/variables.json').read_text(encoding='utf-8'))
    variable = source['scenario_variable']
    assert variable['name'] == 'Amount' and variable['type'] == 'integer'
    return {'expected-initial.json': expected(variable['initial']),
            'expected.json': expected(variable['updated'])}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for filename, value in artifacts().items():
        path = ROOT / 'acceptance' / filename
        text = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        if args.write:
            path.write_text(text, encoding='utf-8')
        else:
            assert path.read_text(encoding='utf-8') == text, f'{filename} differs from oracle'
    print('oracle: PASS')
