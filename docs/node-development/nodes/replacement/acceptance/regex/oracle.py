#!/usr/bin/env python3
"""Independent regex-predicate oracle: Python stdlib, input CSV only.

The patterns deliberately use the common ASCII subset of regex engines.
This is search + whole-cell constant replacement, never re.sub/template expansion.
No Loginom package, runtime, saved result or UI snapshot is an input.
"""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT.parent.parent / 'fixtures' / 'regex'


def expectations(replace=False):
    with (FIXTURES / 'input.csv').open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=';')
        assert reader.fieldnames == ['Id', 'Code', 'Keep']
        source = list(reader)
    assert len(source) == 8 and len({row['Id'] for row in source}) == 8
    rules = [(re.compile(r'(?i)AB-([0-9]{2})' if replace else r'AB-([0-9]{2})'), 'SKU-$1')]
    if replace:
        rules.append((re.compile(r'^AB-00$'), 'ZERO'))
    rows = []
    for row in source:
        code = None if row['Code'] == 'NULL' else row['Code']
        matches = [replacement for pattern, replacement in rules
                   if code is not None and pattern.search(code) is not None]
        value = matches[0] if matches else None if replace else code
        # With other=null, the native flag is true even for an already NULL cell.
        replaced = bool(matches) or replace
        rows.append(dict(Id=int(row['Id']), Code=value if replace else code,
                         **({} if replace else {'Code_Replace': value}),
                         Code_Replaced=replaced, Keep=row['Keep']))
    def column(name, kind):
        return dict(name=name, type=kind, label_any=True)
    columns = [column('Id', 'integer'), column('Code', 'string')]
    if not replace:
        columns.append(column('Code_Replace', 'string'))
    columns += [column('Code_Replaced', 'boolean'), column('Keep', 'string')]
    return dict(package_path='{{PACKAGE_PATH}}', null_marker='NULL',
                nodes=[dict(type='imports.text'), dict(type='transform.replace_columns')],
                outputs=[dict(output_node_type='transform.replace_columns', output_port=0,
                              ordered=False, column_order='exact', columns=columns, rows=rows)])


def manifest():
    data = (FIXTURES / 'input.csv').read_bytes()
    return dict(file='input.csv', bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                encoding='UTF-8', bom=False, delimiter=';', line_ending='LF',
                header=True, records=8, null_marker='NULL', empty_string='',
                columns=[dict(name='Id', type='integer'), dict(name='Code', type='string'),
                         dict(name='Keep', type='string')], ordered=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    assert not (args.write and args.check), 'Choose --write or --check'
    artifacts = {ROOT / 'expected.json': expectations(),
                 ROOT / 'expected-replace.json': expectations(True),
                 FIXTURES / 'manifest.json': manifest()}
    for path, expected in artifacts.items():
        if args.write:
            path.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        elif args.check:
            assert json.loads(path.read_text(encoding='utf-8')) == expected, path.name
    if args.check:
        print('PASS: independent regex search, literal whole-cell values, flags, schema and input digest')
    elif not args.write:
        print(json.dumps({path.name: value for path, value in artifacts.items()}, ensure_ascii=False, indent=2))
