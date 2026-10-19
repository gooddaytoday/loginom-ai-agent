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


raw = read('hives.csv')
FIELDS = ['Flight', 'Pollen']
K = 2
raw = [r for r in raw if r['Season'] == 'summer']
assert len({r['HiveID'] for r in raw}) == len(raw)
points = sorted(tuple(Fraction(r[f]) for f in FIELDS) for r in raw)
# Recover the clouds from the largest observed first-coordinate gaps.
# No generator centers, IDs, labels, or fixed group sizes enter the calculation.
gaps = [(points[i][0] - points[i - 1][0], i) for i in range(1, len(points))]
cuts = sorted(i for _, i in sorted(gaps, reverse=True)[:K - 1])
bounds = [0, *cuts, len(points)]
groups = [points[a:b] for a, b in zip(bounds, bounds[1:])]
centers = [tuple(sum(p[j] for p in group) / len(group) for j in range(len(FIELDS)))
           for group in groups]


# Confirm geometric separation both raw and after unit-range / z-score scaling.
# This fixture does not turn an unspecified normalization into a hidden rule.
for denominators in ([Fraction(1)] * len(FIELDS),
                     [(max(p[j] for p in points) - min(p[j] for p in points)) ** 2
                      for j in range(len(FIELDS))],
                     [sum((p[j] - sum(q[j] for q in points) / len(points)) ** 2
                          for p in points) / len(points) for j in range(len(FIELDS))]):
    def scaled_distance(a, b):
        return sum((x - y) ** 2 / scale for x, y, scale in zip(a, b, denominators))
    within = max(scaled_distance(a, b) for group in groups for a in group for b in group)
    between = min(scaled_distance(a, b) for i, group in enumerate(groups)
                  for other in groups[i + 1:] for a in group for b in other)
    assert within > 0 and between > 100 * within, 'Clouds insufficiently separated'
    assert all(scaled_distance(p, centers[i]) < scaled_distance(p, center)
               for i, group in enumerate(groups) for p in group
               for j, center in enumerate(centers) if i != j)
rows = [{'Hives': len(group), 'MeanFlight': float(center[0]), 'TotalPollen': float(sum(p[1] for p in group))} for group, center in zip(groups, centers)]

columns = [('Hives', 'integer'), ('MeanFlight', 'real'), ('TotalPollen', 'real')]
expected = {
    'package_path': sys.argv[1] if len(sys.argv) > 1 else '/stability-2026-10-20/p15.lgp',
    'nodes': [{'type': kind} for kind in ['imports.text', 'datamining.clustering', 'exports.text']],
    'outputs': [{
        'output_node_type': 'export_input',
        'export_destination': '/stability-2026-10-20/summer-hives.csv',
        'ordered': False,
        'column_order': 'any',
        'columns': [{'name': name, 'type': kind, 'label_any': True,
                     **({'tolerance': {'abs': 1e-8, 'rel': 1e-10}} if kind == 'real' else {})}
                    for name, kind in columns],
        'rows': rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8'))
