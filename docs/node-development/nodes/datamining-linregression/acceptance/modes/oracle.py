#!/usr/bin/env python3
"""Stage-0 proposals, not approved Loginom semantics. Python stdlib only.

Inputs are synthetic CSV fixtures and the mathematical contracts below. Never
consume Loginom, screenshots, a saved package, actual CSV or expected.json.
--write regenerates the proposals; --check checks committed reproducibility.
This is an offline oracle, NOT a runner or a new acceptance mechanism.
"""
import argparse
import csv
import itertools
import json
import math
from fractions import Fraction as Q
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent.parent / 'fixtures' / 'modes'
TOL = {'abs': 1e-8, 'rel': 1e-10}
# Shared expected documents keep this packet small. The matrix in README maps
# each cycle/variant to one of these; --case can materialize any named variant.
MATERIALIZED = ['forward-f', 'forward-r2', 'ridge', 'lasso', 'elastic',
                'normalization-minmax', 'partition-sequential',
                'coefficients', 'summary', 'auto-method', 'categorical', 'no-intercept', 'bindings-updated']


def read(name):
    with (FIXTURES / name).open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def inverse(a):
    n = len(a)
    m = [[Q(v) for v in row] + [Q(i == j) for j in range(n)] for i, row in enumerate(a)]
    for j in range(n):
        pivot = next(i for i in range(j, n) if m[i][j])
        m[j], m[pivot] = m[pivot], m[j]
        scale = m[j][j]
        m[j] = [v / scale for v in m[j]]
        for i in range(n):
            if i != j:
                scale = m[i][j]
                m[i] = [v - scale * w for v, w in zip(m[i], m[j])]
    return [row[n:] for row in m]


def ols(rows, fields):
    x = [[Q(1)] + [Q(r[k]) for k in fields] for r in rows]
    y = [Q(r['Y']) for r in rows]
    gram = [[sum(r[i] * r[j] for r in x) for j in range(len(x[0]))] for i in range(len(x[0]))]
    inv = inverse(gram)
    rhs = [sum(r[i] * t for r, t in zip(x, y)) for i in range(len(x[0]))]
    b = [sum(v * w for v, w in zip(row, rhs)) for row in inv]
    rss = sum((t - sum(v * w for v, w in zip(r, b))) ** 2 for r, t in zip(x, y))
    return b, rss, inv


def beta_fraction(a, b, x):
    """Continued fraction for incomplete beta, with a numerical convergence bound."""
    qab, qap, qam = a + b, a + 1, a - 1
    c, d = 1.0, 1 - qab * x / qap
    d = 1 / (d if abs(d) > 1e-300 else 1e-300)
    h = d
    for m in range(1, 501):
        for aa in [m * (b - m) * x / ((qam + 2*m) * (a + 2*m)),
                   -(a + m) * (qab + m) * x / ((a + 2*m) * (qap + 2*m))]:
            d = 1 + aa * d
            c = 1 + aa / c
            d = 1 / (d if abs(d) > 1e-300 else 1e-300)
            c = c if abs(c) > 1e-300 else 1e-300
            delta = d * c
            h *= delta
        if abs(delta - 1) < 1e-14:
            return h
    raise ArithmeticError('Incomplete beta did not converge')


def ibeta(a, b, x):
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    front = math.exp(math.lgamma(a+b) - math.lgamma(a) - math.lgamma(b)
                     + a*math.log(x) + b*math.log1p(-x))
    if x < (a+1) / (a+b+2):
        return front * beta_fraction(a, b, x) / a
    return 1 - front * beta_fraction(b, a, 1-x) / b


def t_pvalue(t, df):
    return ibeta(df/2, .5, df/(df+t*t))


def t_quantile(df, confidence=.95):
    lo, hi = 0.0, 100.0
    for _ in range(100):
        mid = (lo+hi)/2
        if t_pvalue(mid, df) > 1-confidence:
            lo = mid
        else:
            hi = mid
    return (lo+hi)/2


def statistics(rows, fields):
    b, rss, inv = ols(rows, fields)
    n, k = len(rows), len(b)
    df = n-k
    y = [Q(r['Y']) for r in rows]
    tss = sum((v-sum(y)/n)**2 for v in y)
    r2 = 1-rss/tss
    logl = -n/2 * (math.log(2*math.pi) + 1 + math.log(float(rss/n)))
    f = float((tss-rss)/(k-1)/(rss/df))
    values = dict(TotalSamples=n, TotalSelectedSamples=n, TrainSamples=n,
                  LogLikelihood=logl, R2=float(r2), AdjustedR2=float(1-(1-r2)*(n-1)/df),
                  StdDev=math.sqrt(float(rss/df)), DFE=df, ModelDF=k-1,
                  FStatistic=f, ModelPValue=ibeta(df/2, (k-1)/2, df/(df+(k-1)*f)),
                  AIC=(-2*logl+2*k)/n,
                  AICc=(-2*logl+2*k+2*k*(k+1)/(n-k-1))/n,
                  BIC=(-2*logl+k*math.log(n))/n,
                  HQC=(-2*logl+2*k*math.log(math.log(n)))/n)
    coeff = []
    for i, (name, value) in enumerate(zip(['<Константа>']+fields, b)):
        se = math.sqrt(float(rss/df*inv[i][i]))
        t = float(value)/se
        width = se*t_quantile(df)
        coeff.append(dict(Name=name, DisplayName=None if i == 0 else name, UniqueValues=None,
                          Y_coefficients=float(value), Y_stdError=se,
                          Y_TStat=t, Y_PValue=t_pvalue(t, df),
                          Y_lowerBound=float(value)-width, Y_upperBound=float(value)+width))
    return values, coeff


def select(rows, method, criterion):
    """Independent greedy selection; strict improvements avoid gratuitous ties."""
    universe = ['X1', 'X2', 'X3']
    selected = universe[:] if method == 'backward' else []
    n = len(rows)

    def score(fs):
        b, rss, _ = ols(rows, fs)
        k = len(b)
        if criterion == 'r2':
            return float(rss)
        if criterion == 'adjusted_r2':
            return float(rss/(n-k))
        ll = n*math.log(float(rss/n))
        return {'aic': ll+2*k, 'aicc': ll+2*k+2*k*(k+1)/(n-k-1),
                'bic': ll+k*math.log(n), 'hqc': ll+2*k*math.log(math.log(n))}[criterion]

    def add():
        options = [x for x in universe if x not in selected]
        if not options:
            return False
        if criterion == 'f':
            def p(x):
                _, rss0, _ = ols(rows, selected)
                _, rss1, _ = ols(rows, selected+[x])
                df = n-len(selected)-2
                f = float((rss0-rss1)/(rss1/df))
                return ibeta(df/2, .5, df/(df+max(0, f)))
            x = min(options, key=p)
            accept = p(x) < .05
        else:
            x = min(options, key=lambda x: score(selected+[x]))
            accept = score(selected+[x]) < score(selected)-1e-12
        if accept:
            selected.append(x)
        return accept

    def remove():
        if not selected:
            return False
        if criterion == 'f':
            def p(x):
                b, rss, inv = ols(rows, selected)
                i = selected.index(x)+1
                return t_pvalue(float(b[i])/math.sqrt(float(rss/(n-len(b))*inv[i][i])), n-len(b))
            x = max(selected, key=p)
            accept = p(x) > .1
        else:
            x = min(selected, key=lambda x: score([v for v in selected if v != x]))
            accept = score([v for v in selected if v != x]) < score(selected)-1e-12
        if accept:
            selected.remove(x)
        return accept

    if method == 'backward':
        while remove():
            pass
    else:
        while add():
            if method == 'stepwise':
                while remove():
                    pass
    return [x for x in universe if x in selected]


def expected(rows, b, fields, *, full_statistics=False, summary=False, train_rows=None):
    columns = [dict(name='Y_rergession', type='real', tolerance=TOL)]
    types = {k: 'boolean' if k == 'IsTest' else 'string' if k == 'Category' else
             'real' if k == 'Y' else 'integer' for k in rows[0]}
    columns += [dict(name=k, type=v) for k, v in types.items()]
    forecast = []
    for r in rows:
        converted = {k: v == 'true' if types[k] == 'boolean' else v if types[k] == 'string'
                     else None if v == '?' else float(v) if types[k] == 'real' else int(v) for k, v in r.items()}
        converted['Y_rergession'] = float(b[0]+sum(v*Q(r[k]) for v, k in zip(b[1:], fields)))
        forecast.append(converted)
    coeff = [dict(Name=n, Y_coefficients=float(v)) for n, v in zip(['<Константа>']+fields, b)]
    values = None
    if full_statistics or summary:
        values, all_coeff = statistics(train_rows or rows, fields)
        if full_statistics:
            coeff = all_coeff
    result = dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type=t, label_any=True) for t in
                  ['imports.text', 'datamining.lin_regression', 'exports.text']], outputs=[
        dict(output_node_type='datamining.lin_regression', output_port=0, columns=columns,
             rows=forecast, ordered=True),
        # Only Name/Y_coefficients labels are observed (discovery.md); the
        # other seven native labels are not, and the task does not set them.
        dict(output_node_type='datamining.lin_regression', output_port=1,
             columns=[dict(name=k, type='string' if k in ['Name', 'DisplayName', 'UniqueValues'] else 'real',
                           **({'tolerance': TOL} if k not in ['Name', 'DisplayName', 'UniqueValues'] else {}),
                           **({} if k in ['Name', 'Y_coefficients'] else {'label_any': True})) for k in coeff[0]],
             rows=coeff, ordered=True)])
    if summary:
        result['variable_inventory'] = dict(outputs=[dict(node=dict(type='datamining.lin_regression'),
            port=2, variables=[dict(name=k, type='integer' if isinstance(v, int) else 'real', value=v,
            **({} if isinstance(v, int) else {'tolerance': TOL})) for k, v in values.items()])], links=[])
    return result


def categorical():
    rows = read('categorical.csv')
    encoded = [dict(r, B=int(r['Category'] == 'B'), C=int(r['Category'] == 'C')) for r in rows]
    b, _, _ = ols(encoded, ['X', 'B', 'C'])
    result = expected(encoded, b, ['X', 'B', 'C'])
    output = result['outputs'][0]
    output['columns'] = [c for c in output['columns'] if c['name'] not in ['B', 'C']]
    for r in output['rows']:
        r.pop('B')
        r.pop('C')
    # Native Name repeats; UniqueValues is a string, confirmed in its column
    # editor. Dummy coding is independently solved; no invented Category_A names.
    result['outputs'][1]['columns'] = [dict(name=k, type='string') for k in
        ['Name', 'DisplayName', 'UniqueValues']] + [dict(name='Y_coefficients', type='real', tolerance=TOL)]
    result['outputs'][1]['rows'] = [
        dict(Name='<Константа>', DisplayName=None, UniqueValues=None, Y_coefficients=float(b[0])),
        dict(Name='X', DisplayName='X', UniqueValues=None, Y_coefficients=float(b[1])),
        *[dict(Name='Category', DisplayName='Category', UniqueValues=c, Y_coefficients=v)
          for c, v in zip(['A', 'B', 'C'], [0.0, float(b[2]), float(b[3])])]]
    return result


def proposals():
    fields = ['X1', 'X2', 'X3']
    design, selection = read('design.csv'), read('selection.csv')
    full, _, _ = ols(design, fields)
    cases = {}
    for method, criterion in itertools.product(['forward', 'backward', 'stepwise'],
                    ['f', 'r2', 'adjusted_r2', 'aic', 'aicc', 'bic', 'hqc']):
        fs = select(selection, method, criterion)
        b, _, _ = ols(selection, fs)
        cases[f'{method}-{criterion}'] = expected(selection, b, fs)
    centered = read('regularization.csv')
    b, _, _ = ols(centered, fields)
    # Proposed objective: RSS + L1*sum(abs(beta_j)) + L2*sum(beta_j**2),
    # j>0; orthogonal centered design, sum(X_j**2)=16. NOT inferred from UI.
    for mode, l1, l2 in [('ridge', 0, 1), ('lasso', 1, 0), ('elastic', 1, 1)]:
        regularized = [b[0]] + [max(Q(0), abs(v)-Q(l1, 32))*(1 if v >= 0 else -1)/(1+Q(l2, 16)) for v in b[1:]]
        cases[mode] = expected(centered, regularized, fields)
    # Positive affine normalization, denormalized coefficients: identical OLS.
    for norm in ['minmax', 'minus-one', 'zero-one', 'absolute', 'standard', 'ratio']:
        cases[f'normalization-{norm}'] = expected(design, full, fields)
    train = read('partition.csv')[:16]
    for split in ['sequential', 'column']:
        cases[f'partition-{split}'] = expected(read('partition.csv'), ols(train, fields)[0], fields)
    cases['coefficients'] = expected(design, full, fields, full_statistics=True)
    cases['summary'] = expected(design, full, fields, summary=True)
    # All predictor sums are zero, so omitting the constant leaves the same
    # slopes but shifts every fitted value by -3. This detects a no-op toggle.
    cases['no-intercept'] = expected(design, [Q(0)]+full[1:], fields)
    cases['no-intercept']['outputs'][1]['rows'] = cases['no-intercept']['outputs'][1]['rows'][1:]
    cases['bindings'] = cases['ridge']
    cases['bindings-updated'] = expected(centered, [b[0]]+[v/(1+Q(2, 16)) for v in b[1:]], fields)
    cases['categorical'] = categorical()
    # Smoke proposals only: all automatic choices have the same optimum when
    # Y=0. These do NOT establish hyperparameter/model-selection quality.
    for auto in ['lambda-ridge', 'lambda-lasso', 'lambda-elastic', 'method', 'kfold', 'monte-carlo', 'random-partition']:
        cases[f'auto-{auto}'] = expected(read('zero.csv'), [Q(0)]*4, fields)
        # Automatic method may choose a sparse model. Its coefficient row count
        # cannot be assumed independently of the still unknown search policy.
        cases[f'auto-{auto}']['outputs'] = cases[f'auto-{auto}']['outputs'][:1]
    return cases


def check_math():
    b, rss, _ = ols(read('design.csv'), ['X1', 'X2', 'X3'])
    assert b == [3, 2, Q(1, 2), 0] and rss == 1
    assert abs(t_quantile(13)-2.160368656461013) < 1e-11
    assert abs(ibeta(2, 3, .5)-.6875) < 1e-14
    for method in ['forward', 'backward', 'stepwise']:
        for criterion in ['f', 'adjusted_r2', 'aic', 'aicc', 'bic', 'hqc']:
            assert select(read('selection.csv'), method, criterion) == ['X1', 'X2']
        assert select(read('selection.csv'), method, 'r2') == ['X1', 'X2', 'X3']
    stats, _ = statistics(read('design.csv'), ['X1', 'X2'])
    assert stats['DFE'] == 13 and stats['FStatistic'] == 442


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--case')
    args = parser.parse_args()
    check_math()
    cases = proposals()
    if args.write or args.check:
        for name in MATERIALIZED:
            value = cases[name]
            path = HERE / 'expected' / (name+'.json')
            body = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n'
            if args.write:
                path.parent.mkdir(exist_ok=True)
                path.write_text(body, encoding='utf-8')
            if args.check:
                assert path.read_text(encoding='utf-8') == body, path.name
        print(f'{len(cases)} variants, {len(MATERIALIZED)} shared documents; independent algebra and statistics OK')
    else:
        print(json.dumps(cases[args.case or 'ridge'], ensure_ascii=False, indent=2, allow_nan=False))
