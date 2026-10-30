#!/usr/bin/env python3
"""Independent Pearson proposal: exact rational sums and Decimal square root.

Python standard library only. No Loginom output, model, runtime or network input.
NULL calculations below propose pairwise deletion; native semantics are unverified.
"""
import csv
import hashlib
import json
import sys
from decimal import Decimal, localcontext
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(name):
    with (ROOT / 'data' / name).open(encoding='utf-8', newline='') as stream:
        return list(csv.DictReader(stream))


def pearson(rows, left, right):
    pairs = [(Fraction(row[left]), Fraction(row[right])) for row in rows
             if row[left] not in ('', '?') and row[right] not in ('', '?')]
    n = len(pairs)
    if n < 2:
        return None
    sx, sy = sum(x for x, y in pairs), sum(y for x, y in pairs)
    a = n * sum(x * x for x, y in pairs) - sx * sx
    b = n * sum(y * y for x, y in pairs) - sy * sy
    c = n * sum(x * y for x, y in pairs) - sx * sy
    if a == 0 or b == 0:
        return None
    with localcontext() as context:
        context.prec = 50
        decimal = lambda value: Decimal(value.numerator) / Decimal(value.denominator)
        return float(decimal(c) / decimal(a * b).sqrt())


def reference():
    assert pearson([dict(x=str(i), y=str(2 * i + 3)) for i in range(1, 9)], 'x', 'y') == 1
    assert pearson([dict(x=str(i), y=str(-i)) for i in range(1, 9)], 'x', 'y') == -1
    assert pearson([dict(x='1', y='2'), dict(x='2', y='2')], 'x', 'y') is None
    return {
        'status': 'proposal_pending_native_output_schema_and_owner_approval',
        'tolerance': {'abs': 1e-6},
        'pair_order': 'proposed: first-set source order, then second-set source order',
        'pairs': {name: [dict(first=a, second=b, pearson_r=pearson(read(name), a, b))
                         for a in ['X', 'Y'] for b in ['Z', 'W']]
                  for name in ['pairs.csv', 'update.csv']},
        'null_proposal_only': [dict(first=a, second=b, pearson_r=pearson(read('null.csv'), a, b))
                               for a, b in [('X', 'Y'), ('X', 'Z')]],
        'age_pressure': {
            'n': len(read('age-pressure.csv')),
            'age_mean': float(sum(Fraction(r['age']) for r in read('age-pressure.csv')) / len(read('age-pressure.csv'))),
            'pressure_mean': float(sum(Fraction(r['blood_pressure']) for r in read('age-pressure.csv')) / len(read('age-pressure.csv'))),
            'pearson_r': pearson(read('age-pressure.csv'), 'age', 'blood_pressure'),
        },
    }


def manifest():
    return {
        'format': dict(encoding='UTF-8', delimiter=',', decimal_separator='.', header=True, null_marker='?'),
        'dependencies': 'Python 3 standard library: fractions, decimal (precision 50), csv; no third-party dependencies',
        'field_order': ['RowID', 'X', 'Y', 'Z', 'W'],
        'types': dict(RowID='integer', X='real', Y='real', Z='real', W='real'),
        'age_pressure_origin': 'Exact copy of evals/tasks/analytic/age-pressure-correlation/data/dataset.csv at 90b0cb816463360f024bbf33857a8861dee1ef10',
        'age_pressure_field_order': list(read('age-pressure.csv')[0]),
        'age_pressure_types': dict(age='integer', exercise_hours='real', sleep_hours='real', bmi='real', blood_pressure='real', stress_level='integer'),
        'files': {path.name: dict(bytes=len(path.read_bytes()), sha256=hashlib.sha256(path.read_bytes()).hexdigest(), rows=len(read(path.name)))
                  for path in sorted((ROOT / 'data').glob('*.csv'))},
    }


if __name__ == '__main__':
    files = {'pearson-reference.json': reference(), 'manifest.json': manifest()}
    assert sys.argv[1:] in ([], ['--write'], ['--check']), 'Use --write or --check'
    for name, value in files.items():
        path = ROOT.parent / 'fixtures' / name
        if sys.argv[1:] == ['--write']:
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        elif sys.argv[1:] == ['--check']:
            assert json.loads(path.read_text(encoding='utf-8')) == value, name
        else:
            print(json.dumps(value, ensure_ascii=False, indent=2))
    if sys.argv[1:] == ['--check']:
        print('PASS: independent Pearson numbers, analytic identities and fixture manifest')
