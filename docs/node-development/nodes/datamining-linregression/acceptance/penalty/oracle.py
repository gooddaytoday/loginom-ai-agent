#!/usr/bin/env python3
"""Independent exact convex oracle; proposal, not a Loginom implementation.

Enumerate active sets and signs, solve rational normal equations, require KKT.
Read only authored CSV fixtures. No browser, runtime, actual or expected input.
"""
import argparse
import csv
import itertools
import json
from fractions import Fraction as F
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent.parent / 'fixtures' / 'penalty'
FIELDS = ['X1', 'X2', 'X3']
TOL = {'abs': 1e-8, 'rel': 1e-10}


def solve(a, b):
    m = [list(row) + [v] for row, v in zip(a, b)]
    for j in range(len(b)):
        pivot = next((i for i in range(j, len(b)) if m[i][j]), None)
        if pivot is None:
            raise ArithmeticError('singular active set')
        m[j], m[pivot] = m[pivot], m[j]
        scale = m[j][j]
        m[j] = [v / scale for v in m[j]]
        for i in range(len(b)):
            if i != j:
                scale = m[i][j]
                m[i] = [v - scale * w for v, w in zip(m[i], m[j])]
    return [row[-1] for row in m]


def optimum(rows, l1, l2):
    """RSS + l1*sum(|beta|) + l2*sum(beta[1:]**2), constant in L1 only."""
    x = [[F(1)] + [F(r[k]) for k in FIELDS] for r in rows]
    y = [F(r['Y']) for r in rows]
    gram = [[sum(r[i]*r[j] for r in x) + (l2 if i == j and i else 0)
             for j in range(4)] for i in range(4)]
    rhs = [sum(r[i]*v for r, v in zip(x, y)) for i in range(4)]
    for signs in itertools.product([-1, 0, 1], repeat=4):
        active = [i for i, sign in enumerate(signs) if sign]
        try:
            values = solve([[gram[i][j] for j in active] for i in active],
                           [rhs[i] - l1*F(signs[i], 2) for i in active])
        except ArithmeticError:
            continue
        beta = [F(0)]*4
        for i, value in zip(active, values):
            beta[i] = value
        if any(beta[i]*signs[i] <= 0 for i in active):
            continue
        gradient = [2*(sum(gram[i][j]*beta[j] for j in range(4))-rhs[i]) for i in range(4)]
        if not all(gradient[i] == -l1*signs[i] if signs[i] else abs(gradient[i]) <= l1 for i in range(4)):
            continue
        rss = sum((v-sum(a*b for a, b in zip(r, beta)))**2 for r, v in zip(x, y))
        return beta, rss
    raise ArithmeticError('no KKT solution')


def expected(rows, beta):
    types = {'RowID': 'integer', 'X1': 'integer', 'X2': 'integer',
             'X3': 'integer', 'Y': 'real', 'IsTest': 'boolean'}
    forecast = []
    for row in rows:
        converted = {k: row[k] == 'true' if kind == 'boolean' else
                     float(row[k]) if kind == 'real' else int(row[k]) for k, kind in types.items()}
        forecast.append(dict(Y_rergession=float(beta[0]+sum(beta[i+1]*F(row[k]) for i, k in enumerate(FIELDS))), **converted))
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': t, 'label_any': True} for t in
                      ['imports.text', 'datamining.lin_regression', 'exports.text']],
            'outputs': [
        {'output_node_type': 'datamining.lin_regression', 'output_port': 0,
         'columns': [{'name': 'Y_rergession', 'type': 'real', 'label_any': True, 'tolerance': TOL}] +
                    [{'name': k, 'type': v, 'label_any': True, **({'tolerance': TOL} if v == 'real' else {})} for k, v in types.items()],
         'rows': forecast, 'ordered': True, 'column_order': 'exact'},
        {'output_node_type': 'datamining.lin_regression', 'output_port': 1,
         'columns': [{'name': 'Name', 'type': 'string', 'label_any': True}, {'name': 'Y_coefficients', 'type': 'real', 'label_any': True, 'tolerance': TOL}],
         'rows': [{'Name': k, 'Y_coefficients': float(v)} for k, v in zip(['<Константа>']+FIELDS, beta)],
         'ordered': True, 'column_order': 'exact'}]}


def elastic_weights(lasso, ridge):
    # UI parameter map inferred from separate (1,1), (0,2), (2,0), (2,1)
    # native experiments; not the textbook addition of L1/L2 penalties.
    total = lasso + ridge
    if not total:
        raise ValueError('zero/zero Elastic Net not identified by these observations')
    return total, lasso/total


def proposals():
    cases = {}
    for fixture in ['shifted', 'duplicated', 'scaled', 'negative', 'correlated']:
        with (FIXTURES / (fixture+'.csv')).open(newline='') as f:
            rows = list(csv.DictReader(f))
        for mode, a, b in [('lasso', F(1), F(0)), ('elastic', *elastic_weights(F(1), F(1)))]:
            beta, rss = optimum(rows, a, b)
            cases[fixture+'-'+mode] = {'objective': {'rss': 'sum', 'l1_all_coefficients': str(a),
                 'l2_slopes_only': str(b)}, 'beta_exact': list(map(str, beta)), 'rss_exact': str(rss),
                 'expected': expected(rows, beta)}
    for name, fixture, lasso, ridge in [
            ('en-0-2', 'shifted', F(0), F(2)),
            ('en-2-0', 'shifted', F(2), F(0)),
            ('en-2-1', 'shifted', F(2), F(1)),
            ('duplicated-en-2-1', 'duplicated', F(2), F(1))]:
        with (FIXTURES/(fixture+'.csv')).open(newline='') as f:
            rows = list(csv.DictReader(f))
        a, b = elastic_weights(lasso, ridge)
        beta, rss = optimum(rows, a, b)
        cases[name] = {'objective': {'rss': 'sum', 'l1_all_coefficients': str(a),
                       'l2_slopes_only': str(b)}, 'beta_exact': list(map(str, beta)),
                       'rss_exact': str(rss), 'expected': expected(rows, beta)}
    # Only the two proposed acceptance tasks need full cell tables. Other
    # cases retain exact diagnostic vectors/RSS rather than duplicating data.
    for name, value in cases.items():
        if name not in ['shifted-lasso', 'shifted-elastic']:
            value.pop('expected')
    return {'status': 'proposal_requires_owner_approval', 'cases': cases}


def check_math():
    rows = [{'X1': str(a), 'X2': str(b), 'X3': str(c), 'Y': str(3+2*a+F(b, 2))}
            for a, b, c in itertools.product([-1, 1], repeat=3)]*2
    assert optimum(rows, F(1), F(0))[0] == [F(95, 32), F(63, 32), F(15, 32), 0]
    assert optimum(rows, F(2), F(1, 2))[0] == [F(47, 16), F(62, 33), F(14, 33), 0]
    for lasso, ridge, wanted in [(F(0), F(2), [F(47,16),F(31,16),F(7,16),0]),
                                (F(2), F(0), [F(47,16),F(31,17),F(7,17),0]),
                                (F(2), F(1), [F(93,32),F(183,100),F(39,100),0])]:
        assert optimum(rows, *elastic_weights(lasso, ridge))[0] == wanted
    # Correlated design exercises the active-set solver rather than an
    # orthogonal soft-threshold shortcut. Large L1 must yield the zero model.
    correlated = [dict(r, X2=str(F(r['X1'])+F(r['X2']))) for r in rows]
    assert optimum(correlated, F(10000), F(0))[0] == [0, 0, 0, 0]
    assert optimum(rows, F(0), F(0))[0] == [3, 2, F(1, 2), 0]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    check_math()
    result = proposals()
    body = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)+'\n'
    if args.write:
        (HERE/'expected.json').write_text(body, encoding='utf8')
    if args.check:
        assert (HERE/'expected.json').read_text(encoding='utf8') == body
    print(f"{len(result['cases'])} proposal cases; exact active-set/KKT checks OK" if args.write or args.check else body)
