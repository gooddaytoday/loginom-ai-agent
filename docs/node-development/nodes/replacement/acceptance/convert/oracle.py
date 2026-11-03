#!/usr/bin/env python3
"""Independent exact dictionaries; Python numeric/calendar parsing, no runtime/UI inputs."""
import argparse
import csv
from datetime import datetime
from decimal import Decimal
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def expectations():
    with (ROOT / 'data/input.csv').open(encoding='utf-8', newline='') as stream:
        source = list(csv.DictReader(stream, delimiter=';'))
    assert len(source) == 8 and len({r['Id'] for r in source}) == 8
    dictionaries = {
        'IntText': {s: int(s) for s in ['12', '-7', '42']},
        'RealText': {s: float(Decimal(s)) for s in ['1.25', '-2.5', '9.125']},
        'DateText': {s: datetime.fromisoformat(s).isoformat(timespec='milliseconds') for s in ['2026-11-01', '2024-02-29', '2024-01-01']},
    }
    rows = []
    for source_row in source:
        row = dict(Id=int(source_row['Id']))
        for field, dictionary in dictionaries.items():
            # Native other=null is applied even to NULL and numeric-looking text.
            row[field] = dictionary.get(source_row[field])
            row[field + '_Replaced'] = True
        rows.append(dict(row, Keep=source_row['Keep']))
    columns = [('Id', 'integer'), ('IntText', 'integer'), ('IntText_Replaced', 'boolean'),
               ('RealText', 'real'), ('RealText_Replaced', 'boolean'),
               ('DateText', 'datetime'), ('DateText_Replaced', 'boolean'), ('Keep', 'string')]
    return dict(package_path='{{PACKAGE_PATH}}', null_marker='NULL',
                nodes=[dict(type='imports.text'), dict(type='transform.replace_columns')],
                outputs=[dict(output_node_type='transform.replace_columns', output_port=0,
                              ordered=False, column_order='exact',
                              columns=[dict(name=name, type=kind, label_any=True) for name, kind in columns], rows=rows)])

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    expected = expectations()
    if args.write:
        (ROOT / 'expected.json').write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    elif args.check:
        assert json.loads((ROOT / 'expected.json').read_text(encoding='utf-8')) == expected
        print('PASS: independent typed dictionaries, unmatched text/NULL/empty, flags and schema')
    else:
        print(json.dumps(expected, ensure_ascii=False, indent=2))
