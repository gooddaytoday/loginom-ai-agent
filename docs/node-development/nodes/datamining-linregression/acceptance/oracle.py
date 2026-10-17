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
    train, replacement, noisy = (fit(name) for name in ['train.csv', 'replace.csv', 'noisy.csv'])
    assert (train['intercept'], train['slope']) == (3, 2)
    assert (replacement['intercept'], replacement['slope']) == (7, -3)
    holdout = predict(train, 'holdout.csv')
    assert [row['RowID'] for row in holdout] == [7, 8]
    assert [row['predicted'] for row in holdout] == [11, 13]
    assert not {row['RowID'] for row in read('train.csv')} & {row['RowID'] for row in read('holdout.csv')}
    assert all(row['Y'] == '?' and row['IsTest'] == 'true' for row in read('holdout.csv'))
    return dict(train=train, holdout=holdout, replacement=replacement,
                replacement_holdout=predict(replacement, 'holdout.csv'), noisy=noisy,
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
    forecast = [dict(Y_rergession=row['predicted'], X=row['X'], Y=None,
                     RowID=row['RowID'], IsTest=True) for row in predict(model, 'holdout.csv')]
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
    # A proposed W4 contract, deliberately separate: current cold-check cannot
    # validate variables, and a table-only match must not imply full PASS.
    variables = dict(status='requires_W4', output_node_type='datamining.lin_regression', output_port=2,
                     port_kind='variables', variables=[
                         dict(name=name, label=label, type='integer', value=value)
                         for name, label, value in [
                             ('TotalSamples', 'Всего примеров', model['train_count']),
                             ('TotalSelectedSamples', 'Всего отобранных примеров', model['train_count']),
                             ('TrainSamples', 'Примеров в обучающем множестве', model['train_count']),
                             ('DFE', 'Число степеней свободы ошибки', model['df']),
                             ('ModelDF', 'Число степеней свободы модели', model['predictor_count']),
                         ]])
    return {'expected.json': tables, 'expected-variables.json': variables}


if __name__ == '__main__':
    reference()  # Input independence, rank and known analytic cases.
    if sys.argv[1:] == ['--write']:
        for filename, expected in expectations().items():
            (ROOT / filename).write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    elif sys.argv[1:] == ['--check']:
        for filename, expected in expectations().items():
            assert json.loads((ROOT / filename).read_text(encoding='utf-8')) == expected, filename
        print('PASS: independent OLS, holdout isolation and both expectation files')
    else:
        assert not sys.argv[1:], 'Use --write, --check or no arguments'
        print(json.dumps(reference(), ensure_ascii=False, indent=2,
                         default=lambda value: float(value) if isinstance(value, Fraction) else value))
