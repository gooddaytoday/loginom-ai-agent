#!/usr/bin/env python3
"""Independent CSV unpivot proposal, including typed Variant values."""
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
TYPES = {'I': ('integer', 4), 'R': ('real', 3), 'S': ('string', 5),
         'B': ('boolean', 1), 'D': ('datetime', 2)}


def expected(filename, skip_null=False, variant=False):
    with (ROOT / 'fixtures' / filename).open(newline='', encoding='utf-8') as stream:
        source = list(csv.DictReader(stream))
    rows = []
    for record in source:
        for name in (list(TYPES) if variant else ['S', 'I', 'R', 'B', 'D']):
            raw, (kind, code) = record[name], TYPES[name]
            value = None
            if raw != '?':
                if kind == 'boolean':
                    assert raw in ('true', 'false')
                    value = raw == 'true'
                elif kind == 'datetime':
                    value = raw + '.000'
                else:
                    value = {'integer': int, 'real': float, 'string': str}[kind](raw)
            if skip_null and value is None:
                continue
            field = {'I': 'Units', 'S': 'Text'}.get(name, name)
            rows.append({'RowID': int(record['Id']), 'Field': 'Cell' if variant else field,
                         'FieldLabel': 'Значение' if variant else field,
                         'Cell': None if value is None else {'cell_type': kind, 'value': value},
                         'Kind': 6 if variant else code})
    columns = [{'name': n, 'type': k, 'label_any': n != 'Cell',
                **({'label': 'Значение'} if n == 'Cell' else {})}
               for n, k in [('RowID', 'integer'), ('Field', 'string'), ('FieldLabel', 'string'),
                            ('Cell', 'variant'), ('Kind', 'integer')]]
    output = {'output_node_type': 'transform.collapse_columns', 'output_port': 0,
              'ordered': True, 'column_order': 'exact', 'columns': columns, 'rows': rows}
    # Two same-type nodes need distinct labels for the stock cold selector.
    if variant:
        output['output_node_label'] = 'Повторная свёртка'
    return {'package_path': '{{PACKAGE_PATH}}', 'null_marker': '?',
            'nodes': [{'type': t} for t in ('imports.text', 'transform.collapse_columns', 'exports.text')],
            'outputs': [output]}


if __name__ == '__main__':
    assert sys.argv[1:] in (['--write'], ['--check'])
    for name, filename, skip, variant in [
            ('expected.json', 'mixed.csv', False, False),
            ('expected-ignore.json', 'mixed.csv', True, False),
            ('expected-null.json', 'all-null.csv', False, False),
            ('expected-null-ignore.json', 'all-null.csv', True, False),
            ('expected-header.json', 'header-only.csv', False, False),
            ('expected-header-ignore.json', 'header-only.csv', True, False),
            ('expected-variant.json', 'mixed.csv', False, True)]:
        result = expected(filename, skip, variant)
        path = ROOT / name
        if sys.argv[1] == '--write':
            path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        else:
            assert json.loads(path.read_text(encoding='utf-8')) == result, name
    assert len(expected('mixed.csv', True)['outputs'][0]['rows']) == 10
    assert expected('mixed.csv', True)['outputs'][0]['rows'][5]['Cell'] == {'cell_type': 'string', 'value': ''}
    print('PASS: independent collapse expectations')
