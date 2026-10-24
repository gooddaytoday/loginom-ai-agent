#!/usr/bin/env python3
"""Independent exact OLS via rational normal equations; only source CSV is read."""
import csv
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIELDS = ['X']
TARGET = 'Y'
with (ROOT / 'data/packing.csv').open(encoding='utf-8', newline='') as source:
    reader = csv.DictReader(source)
    assert reader.fieldnames == ['RowID', 'X', 'Y']
    raw = list(reader)
assert len({r['RowID'] for r in raw}) == len(raw)

records = [dict(RowID=int(r['RowID']), **{f: Fraction(r[f]) for f in [*FIELDS, TARGET]}) for r in raw]
assert len(records) == 16

design = [[Fraction(1), *(r[f] for f in FIELDS)] for r in records]
y = [r[TARGET] for r in records]
p = len(FIELDS) + 1
assert len(design) > p
# Gauss-Jordan on X'X | X'y; every nonzero pivot establishes full column rank.
matrix = [[sum(row[i] * row[j] for row in design) for j in range(p)] +
          [sum(row[i] * v for row, v in zip(design, y))] for i in range(p)]
for i in range(p):
    pivot = next((j for j in range(i, p) if matrix[j][i]), None)
    assert pivot is not None, 'Rank-deficient design'
    matrix[i], matrix[pivot] = matrix[pivot], matrix[i]
    divisor = matrix[i][i]
    matrix[i] = [v / divisor for v in matrix[i]]
    for j in range(p):
        if j != i:
            multiplier = matrix[j][i]
            matrix[j] = [a - multiplier * b for a, b in zip(matrix[j], matrix[i])]
coefficients = [row[-1] for row in matrix]
residuals = [value - sum(a * b for a, b in zip(row, coefficients)) for row, value in zip(design, y)]
assert all(sum(row[j] * e for row, e in zip(design, residuals)) == 0 for j in range(p))
records.sort(key=lambda r: r['RowID'])
rows = [dict(RowID=r['RowID'], **{f: float(r[f]) for f in [*FIELDS, TARGET]},
             Forecast=float(coefficients[0] + sum(coefficients[i + 1] * r[f] for i, f in enumerate(FIELDS))))
        for r in records]


def column(name, kind='real'):
    return dict(name=name, label_any=True, type=kind,
                **(dict(tolerance=dict(abs=1e-8, rel=1e-10)) if kind == 'real' else {}))


expected = dict(
    package_path=sys.argv[1] if len(sys.argv) > 1 else '/stability-2026-10-20/n9.lgp',
    nodes=[],
    outputs=[
        dict(output_node_type='export_input', ordered=True, column_order='exact',
             columns=[column('RowID', 'integer'), *[column(f) for f in [*FIELDS, TARGET, 'Forecast']]], rows=rows),
        dict(output_node_type='datamining.lin_regression', output_port=1, ordered=False, column_order='any',
             columns=[dict(name='Name', type='string', label_any=True),
                      dict(name=TARGET + '_coefficients', type='real', label_any=True,
                           tolerance=dict(abs=1e-8, rel=1e-10))],
             rows=[dict(Name=name, **{TARGET + '_coefficients': float(value)})
                   for name, value in zip(['<Константа>', *FIELDS], coefficients)])])
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8'))
