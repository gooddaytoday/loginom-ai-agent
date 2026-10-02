"""Independent small-fixture mathematics. No Loginom handler or live oracle.
Run from this directory: python3 math_reference.py --check
The proposed expected format is intentionally not accepted by cold-check.mjs.
"""
import argparse
import csv
import json
import math
from fractions import Fraction
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def pearson(x, y):
    x = [Fraction(v) for v in x]
    y = [Fraction(v) for v in y]
    if len(x) < 2:
        return None
    dx = [v - sum(x) / len(x) for v in x]
    dy = [v - sum(y) / len(y) for v in y]
    xx, yy = sum(v*v for v in dx), sum(v*v for v in dy)
    if not xx or not yy:
        return None
    return float(sum(a*b for a, b in zip(dx, dy))) / math.sqrt(float(xx*yy))


def ranks(x):
    ordered = sorted(x)
    return [Fraction(sum(i+1 for i, v in enumerate(ordered) if v == item), ordered.count(item)) for item in x]


def tau_b(x, y):
    p = q = tx = ty = both = 0
    for i, j in combinations(range(len(x)), 2):
        a, b = (x[j] > x[i]) - (x[j] < x[i]), (y[j] > y[i]) - (y[j] < y[i])
        if a == 0 and b == 0:
            both += 1
        elif a == 0:
            tx += 1
        elif b == 0:
            ty += 1
        elif a == b:
            p += 1
        else:
            q += 1
    denominator_squared = (p+q+tx)*(p+q+ty)
    return {'value': (p-q)/math.sqrt(denominator_squared) if denominator_squared else None,
            'concordant': p, 'discordant': q, 'tied_x_only': tx, 'tied_y_only': ty,
            'tied_both': both, 'denominator_squared': denominator_squared}


def coefficients(x, y):
    return {'pearson': pearson(x, y), 'spearman': pearson(ranks(x), ranks(y)), 'kendall_tau_b': tau_b(x, y)}


def curve(x, y, centered):
    # Hypothesis only: full-series mean/energy, zero-padding outside support.
    # Positive k compares x[t] with y[t+k]; no claim about Loginom's sign.
    a = [Fraction(v) for v in x]
    b = [Fraction(v) for v in y]
    if centered:
        a, b = [v-sum(a)/len(a) for v in a], [v-sum(b)/len(b) for v in b]
    energy = math.sqrt(float(sum(v*v for v in a)*sum(v*v for v in b)))
    return [{'lag': k, 'value': float(sum(a[t]*b[t+k] for t in range(len(a)) if 0 <= t+k < len(b)))/energy if energy else None}
            for k in range(1-len(a), len(b))]


def derive():
    rows = list(csv.DictReader((ROOT/'data/analytic.csv').open()))
    fields = ['x', 'positive', 'negative', 'square', 'tie_x', 'tie_y']
    values = {f: [int(row[f]) for row in rows] for f in fields}
    pairs = [{'left': a, 'right': b, 'n': len(rows), 'mathematics': coefficients(values[a], values[b])}
             for a in fields for b in fields]
    category_rows = list(csv.DictReader((ROOT/'data/categories.csv').open()))
    x = [int(r['ordinal']) for r in category_rows]
    y = [int(r['measurement']) for r in category_rows]
    category = coefficients(x, y)
    shifts = list(csv.DictReader((ROOT/'data/lag.csv').open()))
    lag = {}
    for name in ['delayed', 'inverted', 'periodic', 'periodic_negative']:
        a = [int(r['signal' if name in ['delayed', 'inverted'] else 'periodic']) for r in shifts]
        b = [int(r[name]) for r in shifts]
        lag[name] = {'uncentered_full_energy': curve(a,b,False), 'global_centered_full_energy': curve(a,b,True)}
    null_rows = list(csv.DictReader((ROOT/'data/nulls.csv').open()))
    complete_pair = [r for r in null_rows if r['x'] != 'NULL' and r['y'] != 'NULL']
    complete_all = [r for r in null_rows if all(r[f] != 'NULL' for f in ['x','y','z'])]
    nulls = {name: {'n': len(data), 'mathematics': coefficients([int(r['x']) for r in data], [int(r['y']) for r in data])}
             for name, data in [('pairwise_hypothesis',complete_pair),('listwise_hypothesis',complete_all)]}
    tie_rows = list(csv.DictReader((ROOT/'data/ccf-ties.csv').open()))
    a, b = [int(r['signal']) for r in tie_rows], [int(r['paired']) for r in tie_rows]
    tie_curves = {name: curve(a,b,centered) for name,centered in [('uncentered_full_energy',False),('global_centered_full_energy',True)]}
    return {'format': 'corranalysis-planning-expected-v1-proposed', 'product_base_sha': '9b17e7dd947c016395e8e32e439ca775b1cbe780',
            'status': 'MATHEMATICS_ONLY_NOT_LIVE_PASS',
            'native_schema': {'status': 'discovery_required', 'columns': None},
            'tolerance_proposal': {'absolute': 1e-12, 'relative': 1e-12, 'lag': 'exact integer', 'null': 'exact typed null; pending native representation'},
            'analytic_pairs': pairs, 'ascii_categories_dense_ordinal_hypothesis': category,
            'null_policy_hypotheses': nulls, 'ccf_hypotheses_not_native_expected': lag,
            'ccf_tie_hypotheses_not_native_expected': tie_curves}


def check():
    result = derive()
    expected = json.loads((ROOT/'expected.json').read_text())
    if expected != result:
        raise SystemExit('Independent calculations differ from committed expected.json')
    # Hand-derived anchors: detect a tau-a implementation and incorrect tied ranks.
    base = {(p['left'],p['right']):p['mathematics'] for p in result['analytic_pairs']}
    assert abs(base['x','positive']['pearson']-1) < 1e-15
    assert abs(base['x','negative']['spearman']+1) < 1e-15
    assert abs(base['x','square']['pearson']-math.sqrt(5145/5369)) < 1e-15
    assert base['tie_x','tie_y']['kendall_tau_b']['concordant'] == 11
    assert base['tie_x','tie_y']['kendall_tau_b']['discordant'] == 0
    assert abs(base['tie_x','tie_y']['kendall_tau_b']['value']-11/13) < 1e-15
    assert ranks([1,1,2,3]) == [Fraction(3,2),Fraction(3,2),3,4]
    assert tau_b([1,1],[2,2])['value'] is None
    assert pearson([],[]) is None
    assert pearson([1],[1]) is None
    for candidate in result['ccf_tie_hypotheses_not_native_expected'].values():
        peak = max(abs(v['value']) for v in candidate)
        assert [v['lag'] for v in candidate if abs(v['value']) == peak] == [-1,1]
        assert abs(peak-math.sqrt(3)/2) < 1e-15
    print('MATHEMATICS_CHECKED; no Loginom execution or handler PASS')


if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--check', action='store_true')
    if args.parse_args().check:
        check()
    else:
        print(json.dumps(derive(), indent=2, ensure_ascii=False, allow_nan=False))
