#!/usr/bin/env python3
"""Independent exact 1D two-means optimum, enumerating all contiguous splits."""
import csv
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parents[4] / "node-development/nodes/datamining-clustering/acceptance/data"
with (DATA / "points.csv").open(encoding="utf-8", newline="") as source:
    points = list(csv.DictReader(source))
assert len(points) == 12 and len({p["RowID"] for p in points}) == 12
values = sorted(Fraction(point["X"]) for point in points)
candidates = []
for split in range(1, len(values)):
    if values[split - 1] == values[split]:
        continue
    groups = [values[:split], values[split:]]
    centers = [sum(group) / len(group) for group in groups]
    error = sum((value - center) ** 2 for group, center in zip(groups, centers) for value in group)
    candidates.append((error, groups, centers))
candidates.sort(key=lambda item: item[0])
assert candidates[0][0] < candidates[1][0], "Two-means optimum must be unique"
error, groups, centers = candidates[0]
assert error == Fraction(3, 25) and list(map(len, groups)) == [8, 4]
rows = [{"X": float(center), "PointCount": len(group)} for group, center in zip(groups, centers)]
expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/datamining-clustering.lgp",
    "nodes": [{"type": kind} for kind in ("imports.text", "datamining.clustering", "exports.text")],
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": sys.argv[2] if len(sys.argv) > 2 else "/stability-2026-10-20/cluster-x-two.csv",
        "ordered": False,
        "column_order": "exact",
        "columns": [{"name": "X", "label": "X", "type": "real", "tolerance": {"abs": 1e-8, "rel": 0}},
                    {"name": "PointCount", "label": "PointCount", "type": "integer"}],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
