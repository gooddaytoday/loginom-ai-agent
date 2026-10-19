#!/usr/bin/env python3
"""Independent calculation from delivered input only; no generator/expected/network."""
import csv
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(name):
    with (ROOT / 'data' / name).open(encoding='utf-8', newline='') as stream:
        return list(csv.DictReader(stream))


raw = read('seedlings.csv')
assert len({r['Id'] for r in raw}) == len(raw)
X, Y = 'Light', 'Height'
records = [{**r, 'Id': int(r['Id'])} for r in raw]
for r in records:
    for field in ['Light', 'Height']:
        r[field] = Fraction(r[field])
# Exact centered OLS; independent from the noisy generating formula.
mean_x = sum(r[X] for r in records) / len(records)
mean_y = sum(r[Y] for r in records) / len(records)
variance = sum((r[X] - mean_x) ** 2 for r in records)
assert variance > 0
slope = sum((r[X] - mean_x) * (r[Y] - mean_y) for r in records) / variance
intercept = mean_y - slope * mean_x
residuals = [r[Y] - intercept - slope * r[X] for r in records]
assert any(residuals), 'Fixture must exercise fitting, not an exact line'
assert sum(residuals) == 0
assert sum(r[X] * e for r, e in zip(records, residuals)) == 0
rows = [{**{k: float(v) if isinstance(v, Fraction) else v for k, v in r.items()},
         'PredictedHeight': float(intercept + slope * r[X])} for r in records]

columns = [('Id', 'integer'), ('Light', 'real'), ('Height', 'real'), ('PredictedHeight', 'real')]
expected = {
    'package_path': sys.argv[1] if len(sys.argv) > 1 else '/stability-2026-10-20/p11.lgp',
    'nodes': [{'type': kind} for kind in ['imports.text', 'datamining.lin_regression', 'exports.text']],
    'outputs': [{
        'output_node_type': 'export_input',
        'export_destination': '/stability-2026-10-20/seedlings-predicted.csv',
        'ordered': False,
        'column_order': 'any',
        'columns': [{'name': name, 'type': kind, 'label_any': True,
                     **({'tolerance': {'abs': 1e-8, 'rel': 1e-10}} if kind == 'real' else {})}
                    for name, kind in columns],
        'rows': rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8'))
