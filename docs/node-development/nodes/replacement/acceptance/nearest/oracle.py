#!/usr/bin/env python3
"""Independent Decimal matching and IEEE-754 binary64 Delta; never supplied to the model."""
import argparse
import csv
from decimal import Decimal
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def expectations(exact=False):
    columns = [('Id', 'integer'), ('R', 'real'), ('R_Replaced', 'boolean'),
               ('R_Delta', 'real'), ('I', 'integer'), ('I_Replaced', 'boolean'), ('I_Delta', 'real')]
    dictionaries = {'R': ({'10': 101, '10.5': 200, '-10': -100, '0': 300}, Decimal('.25')),
                    'I': ({'10': 1000, '12': 1200, '-10': -1000, '0': 3000}, Decimal(1))}
    if exact:
        columns = [(n, t) for n, t in columns if not n.endswith('_Delta')]
        dictionaries = {f: (pairs, Decimal(0)) for f, (pairs, _) in dictionaries.items()}
    rows = []
    with (ROOT / 'data/input.csv').open(newline='', encoding='utf-8') as stream:
        for source in csv.DictReader(stream, delimiter=';'):
            row = {'Id': int(source['Id'])}
            for field, (pairs, tolerance) in dictionaries.items():
                value = Decimal(source[field])
                keys = [Decimal(key) for key in pairs if abs(Decimal(key) - value) <= tolerance]
                # Native nearest distance; equal distances select the larger key,
                # observed again after reversing the first two table entries.
                key = min(keys, key=lambda k: (abs(k - value), -k)) if keys else None
                row[field] = pairs[str(key)] if key is not None else (int(value) if field == 'I' else float(value))
                row[field + '_Replaced'] = key is not None
                if not exact:
                    # Native Delta subtracts the stored binary64 operands, not decimals.
                    row[field + '_Delta'] = float(key) - float(value) if key is not None else None
            rows.append(row)
    return dict(package_path='{{PACKAGE_PATH}}', null_marker='NULL',
                nodes=[dict(type='imports.text'), dict(type='transform.replace_columns')],
                outputs=[dict(output_node_type='transform.replace_columns', output_port=0,
                              ordered=False, column_order='exact',
                              columns=[dict(name=name, type=kind, label_any=True) for name, kind in columns], rows=rows)])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exact', action='store_true')
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    expected = expectations(args.exact)
    path = ROOT / ('expected-exact.json' if args.exact else 'expected.json')
    if args.write:
        path.write_text(json.dumps(expected, indent=2) + '\n', encoding='utf-8')
    elif args.check:
        assert json.loads(path.read_text()) == expected
        print('PASS: Decimal nearest/boundaries/ties/negative/zero, integer and real')
    else:
        print(json.dumps(expected, indent=2))
