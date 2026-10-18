#!/usr/bin/env python3
"""Independent three-group summary from original points; no runtime/output inputs."""
import csv
import json
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parents[4] / "node-development/nodes/datamining-clustering/acceptance/data"
with (DATA / "points.csv").open(encoding="utf-8", newline="") as source:
    points = list(csv.DictReader(source))
assert len(points) == 12 and len({p["RowID"] for p in points}) == 12
anchors = [(Decimal(0), Decimal(0)), (Decimal(20), Decimal(0)), (Decimal(0), Decimal(20))]
groups = [[] for _ in anchors]
for point in points:
    x, y = Decimal(point["X"]), Decimal(point["Y"])
    distances = [(x - ax) ** 2 + (y - ay) ** 2 for ax, ay in anchors]
    nearest = min(range(len(anchors)), key=distances.__getitem__)
    assert distances[nearest] < 1
    groups[nearest].append((x, y))
assert [len(group) for group in groups] == [4, 4, 4]
rows = [{"X": float(sum(p[0] for p in group) / len(group)),
         "Y": float(sum(p[1] for p in group) / len(group)), "PointCount": len(group)}
        for group in groups]
expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/datamining-clustering.lgp",
    "nodes": [{"type": kind} for kind in ("imports.text", "datamining.clustering", "exports.text")],
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": sys.argv[2] if len(sys.argv) > 2 else "/stability-2026-10-20/cluster-summary.csv",
        "ordered": False,
        "column_order": "exact",
        "columns": [{"name": name, "label": name, "type": kind,
                     **({"tolerance": {"abs": 1e-8, "rel": 0}} if kind == "real" else {})}
                    for name, kind in (("X", "real"), ("Y", "real"), ("PointCount", "integer"))],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
