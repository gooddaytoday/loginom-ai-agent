"""Independent centered-product ACF, exact Fraction arithmetic; no Loginom.

Undefined zero-variance and missing-value inputs have no invented coefficient.
Native conventions for those cases are documented separately from mathematics.
"""
import csv
import json
import math
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def acf(values, count):
    x = [Fraction(v) for v in values]
    mean = sum(x) / len(x)
    z = [v - mean for v in x]
    denominator = sum(v*v for v in z)
    assert denominator > 0
    rho = [sum(a*b for a, b in zip(z, z[k:])) / denominator
           for k in range(min(count, len(x)))]
    result = []
    for k, value in enumerate(rho):
        variance = Fraction(0) if k == 0 else (1 + 2*sum(r*r for r in rho[1:k])) / len(x)
        result.append(dict(Lag=k, X_ACF=float(value), X_StdErr=math.sqrt(variance),
                           X_Significant=value*value > variance))
    return result


def expected():
    with (ROOT / 'fixtures/lab1144-series.csv').open() as stream:
        x = [Fraction(r['X']) for r in csv.DictReader(stream)]
    rows = acf(x, 12)
    assert len(rows) == 8 and rows[0]['X_ACF'] == 1
    assert rows[-1]['X_ACF'] == float(Fraction(-5, 24))
    assert rows == acf(x[::-1], 12) == acf([3*v+11 for v in x], 12)
    assert acf([1, -1, 1, -1], 4)[1]['X_ACF'] == -0.75
    # Pearson over the two overlapping slices is a different statistic.
    assert rows[-1]['X_ACF'] != 1
    columns = [dict(name=n, label_any=True, type=t,
                    **(dict(tolerance=dict(abs=1e-8, rel=1e-10)) if t == 'real' else {}))
               for n, t in [('Lag', 'integer'), ('X_ACF', 'real'),
                            ('X_StdErr', 'real'), ('X_Significant', 'boolean')]]
    def output(table):
        return dict(output_node_type='research.auto_correlation', output_port=0,
                    ordered=True, column_order='exact', columns=columns, rows=table)
    return dict(status='proposal_pending_owner_approval',
                series=dict(count4=output(rows[:4]), count8=output(rows), count12=output(rows)),
                requested_lags=dict(range_2_6_step_2=[r for r in rows if r['Lag'] in [2,4,6]],
                                    explicit_1_3_7=[r for r in rows if r['Lag'] in [1,3,7]]),
                degenerate_math=dict(empty='undefined: no mean', one='undefined: zero variance',
                                     null='undefined without an explicit missing-data policy'),
                native_conventions=dict(
                    one=output([dict(Lag=0, X_ACF=1.0, X_StdErr=0.0, X_Significant=True)]),
                    empty=dict(status='platform_limitation', accepted_output=False,
                               observed='Access violation on empty input; inconsistent output cache is not a result'),
                    null=dict(status='execution_refused', accepted_output=False,
                              message='Данные содержат пустые значения')),
                unavailable=dict(start_lag=True, lag_step=True, explicit_lags=True,
                                 reason='No corresponding controls in Loginom 7.4.2 AutoCorrelationWizard'),
                model_delivery='Only task and CSV; never oracle or expected.')


if __name__ == '__main__':
    text = json.dumps(expected(), ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if sys.argv[1:] == ['--write']:
        (ROOT / 'expected.json').write_text(text, encoding='utf-8')
    elif sys.argv[1:] == ['--check']:
        assert (ROOT / 'expected.json').read_text(encoding='utf-8') == text
        print('PASS: exact centered products, cap, affine/reversal invariance, expected.json')
    else:
        print(text, end='')
