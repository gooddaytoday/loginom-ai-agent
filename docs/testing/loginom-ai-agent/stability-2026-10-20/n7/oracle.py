#!/usr/bin/env python3
"""Independent separated-cloud geometry from CSV; no cluster IDs or runtime input."""
import csv
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIELDS = ['Visits', 'Items']
K = 2
with (ROOT / 'data/pickup.csv').open(encoding='utf-8', newline='') as source:
    reader = csv.DictReader(source)
    assert reader.fieldnames == ['RowID', *FIELDS]
    raw = list(reader)
assert len(raw) == 14 and len({r['RowID'] for r in raw}) == len(raw)
points = sorted(tuple(Fraction(row[f]) for f in FIELDS) for row in raw)
# Independently recover the separated clouds from the K-1 largest gaps on the
# first axis; do not use generator centers, row IDs, or known group sizes.
gaps = [(points[i][0] - points[i - 1][0], i) for i in range(1, len(points))]
cuts = sorted(i for _, i in sorted(gaps, reverse=True)[:K - 1])
bounds = [0, *cuts, len(points)]
groups = [points[a:b] for a, b in zip(bounds, bounds[1:])]
centers = [tuple(sum(p[j] for p in group) / len(group) for j in range(len(FIELDS)))
           for group in groups]


def distance(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b))


within = max(distance(a, b) for group in groups for a in group for b in group)
between = min(distance(a, b) for i, group in enumerate(groups)
              for other in groups[i + 1:] for a in group for b in other)
assert within > 0 and between > 100 * within, 'Clouds insufficiently separated'
for i, group in enumerate(groups):
    assert all(distance(p, centers[i]) < distance(p, center)
               for p in group for j, center in enumerate(centers) if i != j)
columns = [dict(name='Points', label_any=True, type='integer')]
columns += [dict(name='Mean' + f, label_any=True, type='real',
                 tolerance=dict(abs=1e-8, rel=1e-10)) for f in FIELDS]
rows = [dict(Points=len(group), **{'Mean' + f: float(center[j]) for j, f in enumerate(FIELDS)})
        for group, center in zip(groups, centers)]
expected = dict(
    package_path=sys.argv[1] if len(sys.argv) > 1 else '/stability-2026-10-20/n7.lgp',
    nodes=[dict(type=t) for t in ['imports.text', 'datamining.clustering', 'exports.text']],
    outputs=[dict(output_node_type='export_input', ordered=False, column_order='exact',
                  columns=columns, rows=rows)])
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8'))
