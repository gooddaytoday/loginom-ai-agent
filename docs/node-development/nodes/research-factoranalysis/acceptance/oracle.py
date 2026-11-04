#!/usr/bin/env python3
"""Independent PCA reference: Python stdlib, no Loginom/runtime imports.

Sample covariance, Jacobi symmetric eigensolver, descending eigenvalues.
Each eigenvector is oriented by its first nonzero component. Native signs
must be aligned once per factor, jointly for scores and loadings.
"""
import argparse
import copy
import csv
import json
import math
from pathlib import Path


def pca(path, standardize=True):
    with Path(path).open() as stream:
        source = list(csv.DictReader(stream))
    fields = ["X", "Y", "Z"]
    if len(source) < 2:
        raise ValueError("At least two complete observations are required")
    values = [[float(row[f]) for f in fields] for row in source]
    if not all(math.isfinite(v) for row in values for v in row):
        raise ValueError("Finite complete numeric observations are required")
    n, m = len(values), len(fields)
    means = [sum(row[j] for row in values) / n for j in range(m)]
    sd = [math.sqrt(sum((row[j] - means[j]) ** 2 for row in values) / (n - 1)) for j in range(m)]
    if min(sd) == 0:
        raise ValueError("Constant features are outside the proposed training slice")
    scale = sd if standardize else [1.0] * m
    centered = [[(row[j] - means[j]) / scale[j] for j in range(m)] for row in values]
    covariance = [[sum(row[i] * row[j] for row in centered) / (n - 1) for j in range(m)] for i in range(m)]
    a = [row[:] for row in covariance]
    vectors = [[float(i == j) for j in range(m)] for i in range(m)]
    for _ in range(100):
        p, q = max(((i, j) for i in range(m) for j in range(i + 1, m)), key=lambda ij: abs(a[ij[0]][ij[1]]))
        if abs(a[p][q]) < 1e-14:
            break
        angle = 0.5 * math.atan2(2 * a[p][q], a[q][q] - a[p][p])
        c, s = math.cos(angle), math.sin(angle)
        for k in range(m):
            a[k][p], a[k][q] = c * a[k][p] - s * a[k][q], s * a[k][p] + c * a[k][q]
            vectors[k][p], vectors[k][q] = c * vectors[k][p] - s * vectors[k][q], s * vectors[k][p] + c * vectors[k][q]
        for k in range(m):
            a[p][k], a[q][k] = c * a[p][k] - s * a[q][k], s * a[p][k] + c * a[q][k]
    else:
        raise ArithmeticError("Jacobi iteration did not converge")
    order = sorted(range(m), key=lambda j: a[j][j], reverse=True)
    eigenvalues = [a[j][j] for j in order]
    eigenvectors = [[vectors[i][j] for j in order] for i in range(m)]
    for j in range(m):
        first = next(eigenvectors[i][j] for i in range(m) if abs(eigenvectors[i][j]) > 1e-12)
        if first < 0:
            for i in range(m):
                eigenvectors[i][j] *= -1
    residual = max(abs(sum(covariance[i][k] * eigenvectors[k][j] for k in range(m)) - eigenvalues[j] * eigenvectors[i][j]) for i in range(m) for j in range(m))
    assert residual < 1e-10
    scores = [[sum(row[i] * eigenvectors[i][j] for i in range(m)) for j in range(2)] for row in centered]
    return dict(fields=fields, means=means, sample_sd=sd, covariance=covariance,
                eigenvalues=eigenvalues, eigenvectors=eigenvectors,
                loadings=[[eigenvectors[i][j] * math.sqrt(eigenvalues[j]) for j in range(2)] for i in range(m)],
                scores=scores, unit_variance_scores=[[row[j] / math.sqrt(eigenvalues[j]) for j in range(2)] for row in scores],
                source=source, residual=residual)


def expected(path):
    reference = pca(path)
    n = len(reference['source'])
    # Loginom's observed scores have population variance 1. The eigenproblem
    # is the correlation matrix; sqrt(n/(n-1)) converts the sample-SD scores.
    scores = [[value * math.sqrt(n / (n - 1)) for value in row]
              for row in reference['unit_variance_scores']]
    def column(name, kind):
        return dict(name=name, type=kind, label_any=True,
                    **({'tolerance': {'abs': 1e-8, 'rel': 1e-10}} if name.startswith('Factor') else {}))
    factor_columns = [column('Factor' + str(i), 'real') for i in range(1, 4)]
    rows0 = [dict(Factor1=scores[i][0], Factor2=scores[i][1], Factor3=None,
                  RowID=int(row['RowID']), X=float(row['X']), Y=float(row['Y']),
                  Z=float(row['Z']), Tag=row['Tag']) for i, row in enumerate(reference['source'])]
    rows1 = [dict(ColumnName=name, ColumnDisplayName=name,
                  Factor1=reference['loadings'][i][0], Factor2=reference['loadings'][i][1], Factor3=0.0)
             for i, name in enumerate(reference['fields'])]
    def output(port, columns, rows):
        return dict(output_node_type='research.factor_analysis', output_port=port,
                    ordered=True, column_order='exact', columns=columns, rows=rows)
    return dict(package_path='{{PACKAGE_PATH}}', nodes=[{'type': 'imports.text'},
                {'type': 'research.factor_analysis'}, {'type': 'exports.text'}, {'type': 'exports.text'}],
                factor_signs={'status': 'proposal_requires_acceptance_integration',
                              'columns': ['Factor1', 'Factor2'], 'ports': [0, 1],
                              'rule': 'one joint sign per factor across every score and loading; no factor permutation'},
                outputs=[output(0, factor_columns + [column('RowID', 'integer'), column('X', 'real'),
                                                    column('Y', 'real'), column('Z', 'real'), column('Tag', 'string')], rows0),
                         output(1, [column('ColumnName', 'string'), column('ColumnDisplayName', 'string')] + factor_columns, rows1)])


def compare(want, actual):
    """Offline proposal oracle, not a replacement for run-check or cold-check.

    actual.outputs must contain port, columns(name/type) and row dictionaries.
    Both ports are required and one sign is shared across their two tables.
    """
    got = copy.deepcopy(actual)
    assert len(got['outputs']) == 2
    ports = {o['output_port']: o for o in got['outputs']}
    assert set(ports) == {0, 1}
    reference = {o['output_port']: o for o in want['outputs']}
    for port in ports:
        a, b = ports[port], reference[port]
        assert [(c['name'], c['type']) for c in a['columns']] == [(c['name'], c['type']) for c in b['columns']]
        assert len(a['rows']) == len(b['rows'])
    for factor in ['Factor1', 'Factor2']:
        dot = sum(a[factor] * b[factor] for a, b in zip(ports[1]['rows'], reference[1]['rows']))
        sign = -1 if dot < 0 else 1
        for port in ports:
            for row in ports[port]['rows']:
                if row[factor] is not None:
                    row[factor] *= sign
    for port, table in ports.items():
        target = reference[port]
        for row, expected_row in zip(table['rows'], target['rows']):
            assert row.keys() == expected_row.keys()
            for col in target['columns']:
                name, value, correct = col['name'], row[col['name']], expected_row[col['name']]
                if value is None or correct is None:
                    assert value is correct, (port, name, value, correct)
                else:
                    assert (col['type'] == 'real' and type(value) in (int, float) and math.isfinite(value)
                            or col['type'] == 'integer' and type(value) is int
                            or col['type'] == 'string' and type(value) is str), (port, name, 'value type')
                    if col['type'] == 'real' and name.startswith('Factor'):
                        assert abs(value - correct) <= max(1e-8, 1e-10 * abs(correct)), (port, name, value, correct)
                    else:
                        assert value == correct, (port, name, value, correct)
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", nargs="?", default=str(Path(__file__).parents[1] / "fixtures/matrix.csv"))
    parser.add_argument("--covariance", action="store_true")
    parser.add_argument("--expected", action="store_true")
    parser.add_argument("--compare", type=Path)
    args = parser.parse_args()
    result = (compare(expected(args.csv), json.loads(args.compare.read_text())) if args.compare else
              expected(args.csv) if args.expected else pca(args.csv, not args.covariance))
    print(json.dumps(result, indent=2, ensure_ascii=False))
