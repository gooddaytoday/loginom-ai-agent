#!/usr/bin/env python3
"""Independent OLS oracle; Python standard library, exact rational arithmetic.

No Loginom modules, saved packages or observed outputs are inputs.
Run from any directory. Expected schemas are documented in discovery.md.
"""
import csv
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(name):
    with (ROOT / 'data' / name).open(encoding='utf-8', newline='') as stream:
        return list(csv.DictReader(stream))


def fit(name):
    rows = read(name)
    assert len(rows) > 2 and all(row['IsTest'] == 'false' for row in rows)
    x = [Fraction(row['X']) for row in rows]
    y = [Fraction(row['Y']) for row in rows]
    n = len(rows)
    sx, sy = sum(x), sum(y)
    denominator = n * sum(v * v for v in x) - sx * sx
    assert denominator != 0, 'Rank-deficient design'
    slope = (n * sum(a * b for a, b in zip(x, y)) - sx * sy) / denominator
    intercept = (sy - slope * sx) / n
    residual = [b - intercept - slope * a for a, b in zip(x, y)]
    rss = sum(e * e for e in residual)
    tss = sum((v - sy / n) ** 2 for v in y)
    return dict(intercept=intercept, slope=slope, train_count=n,
                predictor_count=1, df=n - 2, rss=rss, r_squared=1 - rss / tss)


def predict(model, name):
    return [dict(RowID=int(row['RowID']), X=float(row['X']),
                 predicted=float(model['intercept'] + model['slope'] * Fraction(row['X'])))
            for row in read(name)]


def reference():
    train = fit('train.csv')
    assert (train['intercept'], train['slope']) == (3, 2)
    forecast = predict(train, 'train.csv')
    assert [row['RowID'] for row in forecast] == [1, 2, 3, 4, 5, 6]
    assert [row['predicted'] for row in forecast] == [-1, 1, 3, 5, 7, 9]
    return dict(train=train, forecast=forecast,
                tolerance=dict(abs=1e-8, rel=1e-10))


def expectations():
    model = fit('train.csv')
    columns = [
        dict(name='Y_rergession', label='Y|Регрессия', type='real', tolerance=dict(abs=1e-8, rel=1e-10)),
        dict(name='X', label='X', type='real'),
        dict(name='Y', label='Y', type='real'),
        dict(name='RowID', label='RowID', type='integer'),
        dict(name='IsTest', label='IsTest', type='boolean'),
    ]
    forecast = [dict(Y_rergession=float(model['intercept'] + model['slope'] * Fraction(row['X'])),
                     X=float(row['X']), Y=float(row['Y']),
                     RowID=int(row['RowID']), IsTest=row['IsTest'] == 'true') for row in read('train.csv')]
    tables = dict(package_path='{{PACKAGE_PATH}}',
                  nodes=[dict(type=name) for name in ['imports.text', 'datamining.lin_regression', 'exports.text']],
                  outputs=[
                      dict(output_node_type='datamining.lin_regression', output_port=0,
                           columns=columns, rows=forecast),
                      dict(output_node_type='datamining.lin_regression', output_port=1,
                           columns=[dict(name='Name', label='Имена входных полей', type='string'),
                                    dict(name='Y_coefficients', label='Y|Коэффициенты', type='real',
                                         tolerance=dict(abs=1e-8, rel=1e-10))],
                           rows=[dict(Name='<Константа>', Y_coefficients=float(model['intercept'])),
                                 dict(Name='X', Y_coefficients=float(model['slope']))])])
    return {'expected.json': tables}


if __name__ == '__main__':
    reference()  # Independent rank and analytic checks on train.csv only.
    if sys.argv[1:] == ['--write']:
        for filename, expected in expectations().items():
            (ROOT / filename).write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    elif sys.argv[1:] == ['--check']:
        for filename, expected in expectations().items():
            assert json.loads((ROOT / filename).read_text(encoding='utf-8')) == expected, filename
        print('PASS: independent OLS and stage 1 train forecasts/coefficients')
    else:
        assert not sys.argv[1:], 'Use --write, --check or no arguments'
        print(json.dumps(reference(), ensure_ascii=False, indent=2,
                         default=lambda value: float(value) if isinstance(value, Fraction) else value))
