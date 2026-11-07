#!/usr/bin/env python3
"""Independent CSV/Decimal proposal; no Loginom, runtime or actual output."""
import csv
from decimal import Decimal, ROUND_HALF_EVEN
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent


def expected(swap):
    with (ROOT / 'fixtures/reform.csv').open(newline='', encoding='utf-8') as stream:
        rows = list(csv.DictReader(stream))
    names = ['RowID', 'B', 'A', 'R', 'S'] if swap else ['RowID', 'A', 'B', 'R', 'S']
    types = ['integer', 'integer', 'integer', 'integer' if swap else 'real', 'string']
    values = []
    for row in rows:
        amount = Decimal(row['R'])
        assert abs(amount % 1) != Decimal('0.5'), 'Half-way conversion is outside this proposal'
        converted = int(amount.to_integral_value(rounding=ROUND_HALF_EVEN)) if swap else float(amount)
        values.append(dict(zip(names, [int(row['RowID']), int(row['A']), int(row['B']), converted, row['S']])))
    columns = [{'name': n, 'type': t, 'label_any': not (swap and n in ('A', 'B')),
                **({'label': n} if swap and n in ('A', 'B') else {}),
                **({'tolerance': {'abs': 0, 'rel': 0}} if t == 'real' else {})}
               for n, t in zip(names, types)]
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': t} for t in ('imports.text', 'transform.reform_columns', 'exports.text')],
            'outputs': [{'output_node_type': 'transform.reform_columns', 'output_port': 0,
                         'ordered': True, 'column_order': 'exact', 'columns': columns, 'rows': values}]}


if __name__ == '__main__':
    assert sys.argv[1:] in (['--write'], ['--check'])
    assert [r['R'] for r in expected(True)['outputs'][0]['rows']] == [2, -3, 0]
    assert expected(True)['outputs'][0]['rows'][0]['B'] == 10
    assert expected(True)['outputs'][0]['rows'][0]['A'] == 100
    for name, swap in [('expected.json', True), ('expected-cache.json', False)]:
        result = expected(swap)
        path = ROOT / name
        if sys.argv[1] == '--write':
            path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        else:
            assert json.loads(path.read_text(encoding='utf-8')) == result, name
    print('PASS: independent reform expectations')
