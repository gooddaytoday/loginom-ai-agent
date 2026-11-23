"""Direct sums, independent DFT and residual PACF; no Loginom inputs."""
import cmath
import csv
import importlib.util
import json
import math
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('time_oracle', ROOT.parent / 'oracle.py')
time_oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(time_oracle)


def spectral_acf(values):
    n = len(values)
    centered = [v - sum(values) / n for v in values] + [0] * n
    size = len(centered)
    spectrum = [sum(x * cmath.exp(-2j * math.pi * k * t / size) for t, x in enumerate(centered)) for k in range(size)]
    products = [sum(abs(spectrum[k]) ** 2 * cmath.exp(2j * math.pi * k * lag / size) for k in range(size)).real / size for lag in range(n)]
    return [p / products[0] for p in products]


def residuals(design, values):
    p = len(design[0])
    a = [[sum(row[i]*row[j] for row in design) for j in range(p)] + [sum(row[i]*v for row,v in zip(design,values))] for i in range(p)]
    for i in range(p):
        pivot = next(j for j in range(i,p) if a[j][i])
        a[i], a[pivot] = a[pivot], a[i]
        divisor = a[i][i]
        a[i] = [v/divisor for v in a[i]]
        for j in range(p):
            if j != i:
                multiplier = a[j][i]
                a[j] = [v-multiplier*w for v,w in zip(a[j],a[i])]
    coefficients = [row[-1] for row in a]
    result = [v-sum(c*w for c,w in zip(row,coefficients)) for row,v in zip(design,values)]
    assert all(sum(row[j]*v for row,v in zip(design,result)) == 0 for j in range(p))
    return result


def pacf(values, count):
    x = [Fraction(v) for v in values]
    result = [1.0]
    for lag in range(1,count):
        # Partial corr(X[t], X[t+k] | X[t+1], ..., X[t+k-1]);
        # each lag has its own overlapping window and fitted intercept.
        design = [[Fraction(1)] + x[t+1:t+lag] for t in range(len(x)-lag)]
        u, v = residuals(design,x[:-lag]), residuals(design,x[lag:])
        result.append(float(sum(a*b for a,b in zip(u,v)) / math.sqrt(sum(a*a for a in u)*sum(b*b for b in v))))
    return result


def expected():
    with (ROOT / 'fixtures/series.csv').open() as stream:
        rows = list(csv.DictReader(stream))
    series = {}
    for name in ['X', 'Y']:
        values = [int(r[name]) for r in rows]
        direct = time_oracle.acf(values, 8)
        frequency = spectral_acf(values)
        assert max(abs(a['acf'] - b) for a, b in zip(direct, frequency)) < 1e-12
        partial = pacf(values,4)
        assert max(abs(a-b) for a,b in zip(partial,pacf([3*v+7 for v in values],4))) < 1e-12
        series[name] = [dict(lag=r['lag'], acf=r['acf'], error=r['error'], significant=r['significant'], pacf=partial[i]) for i, r in enumerate(direct[:4])]
    def output(fields, partial):
        names = ['Lag'] + [f+'_'+suffix for f in fields for suffix in ['ACF','StdErr','Significant']] + ([f+'_PACF' for f in fields] if partial else [])
        columns = [dict(name=n,label_any=True,type='integer' if n=='Lag' else 'boolean' if n.endswith('_Significant') else 'real',**({} if n=='Lag' or n.endswith('_Significant') else dict(tolerance=dict(abs=1e-8,rel=1e-10)))) for n in names]
        rows = []
        for i in range(4):
            values = [i] + [series[f][i][k] for f in fields for k in ['acf','error','significant']] + ([series[f][i]['pacf'] for f in fields] if partial else [])
            rows.append(dict(zip(names,values)))
        return dict(package_path='{{PACKAGE_PATH}}',nodes=[dict(type=t) for t in ['imports.text','research.auto_correlation','exports.text']],
                    outputs=[dict(output_node_type='research.auto_correlation',output_port=0,ordered=True,column_order='exact',columns=columns,rows=rows)])
    return dict(status='proposal_pending_owner_approval', series=series,
                frequency_definition='linear autocovariance through zero-padded DFT, not circular correlation',
                pacf_definition='Pearson of residuals of lag endpoints on an intercept and all intermediate lags, using N-k overlapping rows; lag zero is one',
                cases=dict(frequency=output(['X'],False),pacf=output(['X'],True),multiple=output(['X','Y'],True)),
                null_case=dict(proposal='readable refusal, no imputation or stale result',native_message='Данные содержат пустые значения'),
                unresolved=['additional non-power-of-two length comparison for spectral padding'],
                tolerance=dict(abs=1e-8, rel=1e-10))


if __name__ == '__main__':
    text = json.dumps(expected(), ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if sys.argv[1:] == ['--write']:
        (ROOT / 'expected.json').write_text(text)
    elif sys.argv[1:] == ['--check']:
        assert (ROOT / 'expected.json').read_text() == text
        print('PASS: direct/DFT equality, exact OLS residual orthogonality, affine PACF invariance and expected.json')
    else:
        print(text, end='')
