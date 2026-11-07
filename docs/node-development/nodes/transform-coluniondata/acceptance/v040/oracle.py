#!/usr/bin/env python3
"""Independent three-table positional oracle; the UI result is never an input."""
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
MAPPINGS = [('main.csv', [('RowID', 'RowID', 'integer'), ('Code', 'MainCode', 'string'), ('Amount', 'Amount', 'real')]),
            ('attached.csv', [('AttachedID', 'AttachedID', 'integer'), ('Code', 'AttachedCode', 'string')]),
            ('third.csv', [('ThirdID', 'ThirdID', 'integer'), ('Code', 'ThirdCode', 'string')])]


def expected(determining):
    tables, columns = [], []
    for filename, fields in MAPPINGS:
        with (ROOT / 'fixtures' / filename).open(newline='', encoding='utf-8') as stream:
            raw = list(csv.DictReader(stream))
        tables.append([{dest: {'integer': int, 'real': float, 'string': str}[kind](row[src])
                        for src, dest, kind in fields} for row in raw])
        columns.extend({'name': dest, 'type': kind, 'label_any': True,
                        **({'tolerance': {'abs': 0, 'rel': 0}} if kind == 'real' else {})}
                       for _, dest, kind in fields)
    count = len(tables[2]) if determining else max(map(len, tables))
    rows = []
    for i in range(count):
        row = {}
        for table in tables:
            # These fixtures are nonempty; general empty/padding cases stay in the existing kit.
            assert table
            row.update(table[i % len(table)] if not determining else table[i])
        rows.append(row)
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': 'imports.text'}, {'type': 'transform.col_union_data'}, {'type': 'exports.text'}],
            'outputs': [{'output_node_type': 'transform.col_union_data', 'output_port': 0,
                         'ordered': True, 'column_order': 'exact', 'columns': columns, 'rows': rows}]}


if __name__ == '__main__':
    assert sys.argv[1:] in (['--write'], ['--check'])
    assert len(expected(False)['outputs'][0]['rows']) == 3
    assert len(expected(True)['outputs'][0]['rows']) == 1
    for name, determining in [('expected.json', False), ('expected-third.json', True)]:
        result = expected(determining)
        path = ROOT / name
        if sys.argv[1] == '--write':
            path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        else:
            assert json.loads(path.read_text(encoding='utf-8')) == result, name
    print('PASS: independent three-input expectations')
