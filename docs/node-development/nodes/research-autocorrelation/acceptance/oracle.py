#!/usr/bin/env python3
"""Independent time-domain ACF proposal; Python standard library only.

Exact rational centered products; Decimal square root at precision 50.
Does not read Loginom outputs, runtime code, network or saved packages.
"""
import csv
import hashlib
import json
import sys
from decimal import Decimal, localcontext
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def acf(values, count):
    values = [Fraction(value) for value in values]
    n = len(values)
    assert n > 1 and 1 <= count <= n
    mean = sum(values) / n
    centered = [value - mean for value in values]
    denominator = sum(value * value for value in centered)
    assert denominator > 0
    correlations = [sum(centered[t] * centered[t + k] for t in range(n - k)) / denominator
                    for k in range(count)]
    rows = []
    with localcontext() as ctx:
        ctx.prec = 50
        for k, r in enumerate(correlations):
            variance = Fraction(0) if k == 0 else (Fraction(1) + 2 * sum(v * v for v in correlations[1:k])) / n
            error = (Decimal(variance.numerator) / Decimal(variance.denominator)).sqrt()
            rows.append(dict(lag=k, acf=float(r), error=float(error), significant=r * r > variance))
    return rows


def reference():
    result = {}
    for name in ['series', 'update']:
        with (ROOT / 'data' / (name + '.csv')).open(newline='', encoding='utf-8') as f:
            values = [row['X'] for row in csv.DictReader(f)]
        result[name] = {str(count): acf(values, count) for count in [1, 4, 8]}
    # Invariants independent of the fixture: exact affine/reversal invariance,
    # count includes lag 0, and alternating centered series has rho(1)=-3/4.
    assert acf([1, -1, 1, -1], 4)[1]['acf'] == -0.75
    x = [1, 2, 4, 3, 6, 5, 8, 7]
    assert acf(x, 8) == acf(x[::-1], 8) == acf([3 * v + 9 for v in x], 8)
    return result


def expectations(result):
    files = {'reference.json': result}
    for source in ['series', 'update']:
        for count in [1, 4, 8]:
            columns = [dict(name='Lag', label='Лаг', label_any=True, type='integer'),
                       dict(name='X_ACF', label='X: АКФ', label_any=True, type='real', tolerance=dict(abs=1e-8)),
                       dict(name='X_StdErr', label='X: Ошибка', label_any=True, type='real', tolerance=dict(abs=1e-8)),
                       dict(name='X_Significant', label='X: Значимость', label_any=True, type='boolean')]
            output = dict(output_node_type='research.auto_correlation', output_port=0,
                          ordered=True, column_order='exact', columns=columns,
                          rows=[dict(Lag=row['lag'], X_ACF=row['acf'], X_StdErr=row['error'],
                                     X_Significant=row['significant']) for row in result[source][str(count)]])
            expected = dict(package_path='{{PACKAGE_PATH}}',
                            nodes=[dict(type=t) for t in ['imports.text', 'research.auto_correlation', 'exports.text']],
                            outputs=[output])
            name = 'expected.json' if source == 'update' and count == 4 else f'expected-{source}-{count}.json'
            files[name] = expected
    return files


def manifest():
    files = {}
    for path in sorted(list((ROOT / 'data').glob('*.csv')) + list((ROOT.parent / 'fixtures').glob('*.csv'))):
        with path.open(encoding='utf-8', newline='') as stream:
            rows = list(csv.DictReader(stream))
        with path.open(encoding='utf-8', newline='') as stream:
            fields = next(csv.reader(stream))
        files[str(path.relative_to(ROOT.parent))] = dict(
            bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), rows=len(rows),
            field_order=fields, types={name: {'RowID': 'integer', 'X': 'real', 'S': 'string',
                                            'B': 'boolean', 'D': 'datetime'}[name] for name in fields})
    return dict(format=dict(encoding='UTF-8', newline='LF', delimiter=',', decimal_separator='.',
                            header=True, null_marker='?'),
                dependencies='Python 3 standard library only: Fraction exact sums, Decimal sqrt precision 50; no third-party dependencies',
                reference_environment='CPython 3.14.4; Fraction and Decimal from the standard library',
                import_types='Set types explicitly; values such as 1.0 can otherwise be inferred as datetime.',
                input_order='File record order; no automatic sort. RowID is not a selected series.', files=files)


if __name__ == '__main__':
    result = reference()
    files = expectations(result)
    files['../fixtures/manifest.json'] = manifest()
    for name, value in files.items():
        text = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        if '--write' in sys.argv:
            (ROOT / name).write_text(text, encoding='utf-8')
        if '--check' in sys.argv:
            assert (ROOT / name).read_text(encoding='utf-8') == text, name + ' is stale'
    if not {'--write', '--check'} & set(sys.argv):
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
