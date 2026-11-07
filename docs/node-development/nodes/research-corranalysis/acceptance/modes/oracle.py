"""Independent numerical proposals, not a runner or a Loginom reader."""
import csv
import json
import math
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def pearson(x, y):
    n = len(x)
    a = n * sum(v * v for v in x) - sum(x) ** 2
    b = n * sum(v * v for v in y) - sum(y) ** 2
    return float((n * sum(u * v for u, v in zip(x, y)) - sum(x) * sum(y)) / math.sqrt(a * b)) if a * b else None


def ranks(values):
    return [Fraction(1 + sum(v < x for v in values)) + Fraction(sum(v == x for v in values) - 1, 2) for x in values]


def tau_b(x, y):
    c = d = tx = ty = 0
    for i in range(len(x)):
        for j in range(i):
            dx, dy = x[i] - x[j], y[i] - y[j]
            c += dx * dy > 0
            d += dx * dy < 0
            tx += dx == 0 and dy != 0
            ty += dy == 0 and dx != 0
    denominator = (c + d + tx) * (c + d + ty)
    return (c - d) / math.sqrt(denominator) if denominator else None


def expected():
    with (ROOT / 'fixtures/ranks.csv').open() as stream:
        rows = list(csv.DictReader(stream))
    x, y = ([Fraction(r[key]) for r in rows] for key in ['X', 'Y'])
    with (ROOT / 'fixtures/lag.csv').open() as stream:
        lag = list(csv.DictReader(stream))
    a, b = ([Fraction(r[key]) for r in lag] for key in ['X', 'Y'])
    # Explicit mathematical convention: +k compares X[t] with Y[t+k].
    correlations = {str(k): pearson(a[max(0, -k):min(len(a), len(a)-k)], b[max(0, k):min(len(b), len(b)+k)]) for k in range(-2, 3)}
    assert ranks([1, 2, 2, 4]) == [1, Fraction(5, 2), Fraction(5, 2), 4]
    assert tau_b([1, 2, 3], [3, 2, 1]) == -1
    assert pearson(ranks([1, 2, 3]), ranks([3, 2, 1])) == -1
    assert correlations['1'] == 1
    def output(column, pairs):
        names = ['ColSet1', 'ColSet1_Label', 'ColSet2', 'ColSet2_Label', column]
        return dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type=t) for t in ['imports.text', 'research.corr_analysis', 'exports.text']],
                    outputs=[dict(output_node_type='research.corr_analysis',output_port=0,ordered=True,column_order='exact',
                                  columns=[dict(name=name,type='string' if i<4 else 'real',label_any=True,**({} if i<4 else dict(tolerance=dict(abs=1e-8,rel=1e-10)))) for i,name in enumerate(names)],
                                  rows=[dict(zip(names,['X','X',name,name,value])) for name,value in pairs])])
    spearman = pearson(ranks(x), ranks(y))
    kendall = tau_b(x, y)
    discrete = [Fraction(r['Z']) for r in rows]
    text_order = sorted({r['Tag'] for r in rows})
    text_codes = [Fraction(text_order.index(r['Tag'])) for r in rows]
    categorical = {name:dict(pearson=pearson(x,values),spearman=pearson(ranks(x),ranks(values)),kendall_tau_b=tau_b(x,values)) for name,values in [('Z',discrete),('Tag',text_codes)]}
    return dict(status='proposal_pending_owner_approval',
                numeric_pair=dict(first='X', second='Y', spearman=spearman, kendall_tau_b=kendall),
                text_order=text_order, categorical_pairs=categorical,
                cases=dict(spearman=output('Spearman',[('Y',spearman)]),kendall=output('TauBKendall',[('Y',kendall)]),
                           discrete_spearman=output('Spearman',[(name,v['spearman']) for name,v in categorical.items()]),
                           discrete_kendall=output('TauBKendall',[(name,v['kendall_tau_b']) for name,v in categorical.items()])),
                lag_convention='X[t] versus Y[t+k], overlap means and variances',
                lag_correlations=correlations,
                unresolved=['native lag sign/range and extremum definition', 'text collation beyond the lowercase ASCII fixture', 'fresh empty-input behavior'],
                tolerance=dict(abs=1e-8, rel=1e-10))


if __name__ == '__main__':
    text = json.dumps(expected(), ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if sys.argv[1:] == ['--write']:
        (ROOT / 'expected.json').write_text(text)
    elif sys.argv[1:] == ['--check']:
        assert (ROOT / 'expected.json').read_text() == text
        print('PASS: tied ranks, tau-b identities, shifted overlap and expected.json')
    else:
        print(text, end='')
