#!/usr/bin/env python3
"""Independent CSV/index oracle; imports no Loginom or runtime code.

Run here: python3 oracle.py [--check]. Generated JSON is a proposal for approval.
"""
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
TYPES = {'RowID': 'integer', 'I': 'integer', 'R': 'real', 'S': 'string',
         'B': 'boolean', 'D': 'datetime', 'X': 'integer', 'Y': 'integer',
         'Month': 'string', 'Sales': 'integer', 'Price': 'real'}
POLICIES = ('keep_incomplete', 'drop_added', 'drop_all_incomplete')


def load(path):
    with path.open(newline='', encoding='utf-8') as stream:
        reader = csv.DictReader(stream)
        names = reader.fieldnames
        rows = []
        for raw in reader:
            row = {}
            for name in names:
                value, kind = raw[name], TYPES[name]
                if value == '?':
                    row[name] = None
                elif kind == 'integer':
                    row[name] = int(value)
                elif kind == 'real':
                    row[name] = float(value)
                elif kind == 'boolean':
                    assert value in ('true', 'false')
                    row[name] = value == 'true'
                elif kind == 'datetime':
                    row[name] = value.replace(' ', 'T') + '.000'
                else:
                    row[name] = value
            rows.append(row)
    return names, rows


def output(path, windows, policy, existing_order=None):
    """Fresh native order: history, original, forecast for each input field.

    drop_all trims positions, regardless of actual NULL values. Window offsets
    address original CSV positions, never positions in an already filtered row list.
    """
    assert policy in POLICIES
    names, rows = load(path)
    assert set(windows) <= set(names)
    assert all(isinstance(n, int) and 0 <= n <= 134217727
               for pair in windows.values() for n in pair)
    fields = []
    for name in names:
        history, horizon = windows.get(name, (0, 0))
        offsets = list(range(-history, 0)) + [0] + list(range(1, horizon + 1))
        for offset in offsets:
            key = name if offset == 0 else f'{name}_{"H" if offset < 0 else "F"}_{abs(offset)}'
            column = {'name': key, 'label': name if offset == 0 else f'{name}[{offset:+d}]',
                      'type': TYPES[name], 'label_any': True}
            if column['type'] == 'real':
                column['tolerance'] = {'abs': 0, 'rel': 0}
            fields.append((name, offset, column))
    if existing_order is not None:
        assert len(existing_order) == len(set(existing_order))
        surviving = [field for key in existing_order for field in fields if field[2]['name'] == key]
        fields = surviving + [field for field in fields if field[2]['name'] not in existing_order]
    history = max((h for h, _ in windows.values()), default=0)
    horizon = max((f for _, f in windows.values()), default=0)
    positions = range(len(rows))
    if policy == 'keep_incomplete':
        positions = range(-horizon, len(rows) + history)
    if policy == 'drop_all_incomplete':
        positions = range(history, len(rows) - horizon)
    values = []
    for position in positions:
        values.append({column['name']: rows[position + offset][name]
                       if 0 <= position + offset < len(rows) else None
                       for name, offset, column in fields})
    return {'output_node_type': 'transform.sliding_window', 'output_port': 0,
            'ordered': True, 'column_order': 'exact',
            'columns': [column for _, _, column in fields], 'rows': values}


def documents():
    sales = output(ROOT / 'data/sales.csv', {'Sales': (3, 1), 'Price': (1, 0)},
                   'drop_all_incomplete')
    expected = {'package_path': '{{PACKAGE_PATH}}',
                'nodes': [{'type': 'imports.text'}, {'type': 'transform.sliding_window'},
                          {'type': 'exports.text'}],
                'outputs': [sales]}
    fixtures = ROOT.parent / 'fixtures'
    cases = {'sales.csv': {
        policy: output(ROOT / 'data/sales.csv', {'Sales': (3, 1), 'Price': (1, 0)}, policy)
        for policy in POLICIES}}
    windows = {'I': (2, 1), 'R': (1, 0), 'S': (1, 0), 'B': (1, 0), 'D': (1, 0)}
    specs = [('series.csv', {'X': (1, 1)}), ('null-inside.csv', {'X': (1, 1)}),
             ('replace.csv', {'X': (1, 1)}), ('two-windows.csv', {'X': (2, 1), 'Y': (1, 0)}),
             ('short.csv', {'X': (1, 1)}), ('empty.csv', {'X': (1, 1)}),
             ('help-example.csv', {'Sales': (2, 1)})]
    specs += [(name, windows) for name in ['types.csv', 'types-null.csv',
                                         'types-order.csv', 'types-short.csv', 'types-empty.csv']]
    for name, configuration in specs:
        cases[name] = {policy: output(fixtures / name, configuration, policy)
                       for policy in POLICIES}
    cases['types-zero'] = {policy: output(fixtures / 'types.csv', {}, policy)
                          for policy in POLICIES}
    cases['types-one-lag-existing'] = {
        policy: output(fixtures / 'types.csv', {'I': (1, 0)}, policy,
                       existing_order=['RowID', 'I', 'R', 'S', 'B', 'D'])
        for policy in POLICIES}
    cases['types-one-lag-reopened'] = {
        policy: output(fixtures / 'types.csv', {'I': (1, 0)}, policy)
        for policy in POLICIES}
    return {'expected.json': expected, 'fixture-expectations.json': cases}


if __name__ == '__main__':
    assert sys.argv[1:] in ([], ['--check']), 'usage: oracle.py [--check]'
    generated = documents()
    sales = generated['expected.json']['outputs'][0]['rows']
    assert len(sales) == 10
    assert sales[0] == {'Month': '2025-04', 'Sales_H_3': 100, 'Sales_H_2': 110,
                        'Sales_H_1': 120, 'Sales': 130, 'Sales_F_1': 140,
                        'Price_H_1': 10.5, 'Price': 10.75}
    assert sales[-1] == {'Month': '2026-01', 'Sales_H_3': 190, 'Sales_H_2': 200,
                         'Sales_H_1': 210, 'Sales': 220, 'Sales_F_1': 230,
                         'Price_H_1': 12.75, 'Price': 13.0}
    observed = generated['fixture-expectations.json']
    assert [r['RowID'] for r in observed['types-order.csv']['drop_all_incomplete']['rows']] == [5, 2]
    nulls = observed['types-null.csv']['drop_all_incomplete']['rows']
    assert [r['RowID'] for r in nulls] == [3, 4] and nulls[0]['I'] is None and nulls[1]['I_H_1'] is None
    empty = observed['types-empty.csv']['keep_incomplete']['rows']
    assert len(empty) == 3 and all(v is None for r in empty for v in r.values())
    assert not observed['types-short.csv']['drop_all_incomplete']['rows']
    for name, document in generated.items():
        text = json.dumps(document, ensure_ascii=False, indent=2) + '\n'
        target = ROOT / name
        if '--check' in sys.argv:
            assert target.read_text(encoding='utf-8') == text, f'stale {name}'
        else:
            target.write_text(text, encoding='utf-8')
    print('oracle: expected.json and fixture-expectations.json match' if '--check' in sys.argv
          else 'oracle: wrote proposed expectations')
