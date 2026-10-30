#!/usr/bin/env python3
"""Independent Pearson proposal: exact rational sums and Decimal square root.

Python standard library only. No Loginom output, model, runtime or network input.
NULL uses pairwise deletion, observed in native UI on 2026-10-30.
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
             if row[left] != '?' and row[right] != '?']
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
        'status': 'proposal_pending_owner_approval',
        'tolerance': {'abs': 1e-6},
        'pair_order': 'native: second-set source order outside, first-set source order inside',
        'pairs': {name: [dict(first=a, second=b, pearson_r=pearson(read(name), a, b))
                         for b in ['Z', 'W'] for a in ['X', 'Y']]
                  for name in ['pairs.csv', 'update.csv']},
        'null_pairs': [dict(first=a, second=b, pearson_r=pearson(read('null.csv'), a, b))
                       for b in ['Z', 'W'] for a in ['X', 'Y']],
        'age_pressure': {
            'n': len(read('age-pressure.csv')),
            'age_mean': float(sum(Fraction(r['age']) for r in read('age-pressure.csv')) / len(read('age-pressure.csv'))),
            'pressure_mean': float(sum(Fraction(r['blood_pressure']) for r in read('age-pressure.csv')) / len(read('age-pressure.csv'))),
            'pearson_r': pearson(read('age-pressure.csv'), 'age', 'blood_pressure'),
        },
    }


def native_output(name, first=('X', 'Y'), second=('Z', 'W')):
    return dict(output_node_type='research.corr_analysis', output_port=0,
                ordered=True, column_order='exact', columns=[
                    dict(name='ColSet1', label='Поле1.Имя', type='string'),
                    dict(name='ColSet1_Label', label='Поле1.Метка', type='string'),
                    dict(name='ColSet2', label='Поле2.Имя', type='string'),
                    dict(name='ColSet2_Label', label='Поле2.Метка', type='string'),
                    dict(name='Pirson', label='Пирсона', type='real', tolerance=dict(abs=1e-6)),
                ], rows=[dict(ColSet1=a, ColSet1_Label=a, ColSet2=b, ColSet2_Label=b,
                              Pirson=pearson(read(name), a, b)) for b in second for a in first])


def expectations():
    def package(outputs):
        return dict(package_path='{{PACKAGE_PATH}}',
                    nodes=[dict(type=t) for t in ['imports.text', 'research.corr_analysis', 'exports.text']],
                    outputs=outputs)
    age = reference()['age_pressure']
    return {
        'expected.json': package([native_output('pairs.csv')]),
        'expected-update.json': package([native_output('update.csv')]),
        'expected-null.json': dict(package([native_output('null.csv')]), null_marker='?'),
        'expected-age-pressure.json': package([
            native_output('age-pressure.csv', ('age',), ('blood_pressure',)),
            dict(output_node_type='export_input', ordered=True, column_order='exact',
                 columns=[dict(name=k, label_any=True, type='integer' if k == 'n' else 'real',
                               **({} if k == 'n' else dict(tolerance=dict(abs=1e-6))))
                          for k in ['n', 'age_mean', 'pressure_mean', 'pearson_r']],
                 rows=[{k: v if k == 'n' else round(v, 6) for k, v in age.items()}])]),
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
    for name, value in expectations().items():
        path = ROOT / name
        if sys.argv[1:] == ['--write']:
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        elif sys.argv[1:] == ['--check']:
            assert json.loads(path.read_text(encoding='utf-8')) == value, name
    if sys.argv[1:] == ['--check']:
        print('PASS: independent Pearson numbers, analytic identities and fixture manifest')
