#!/usr/bin/env python3
"""Independent geometry oracle; no Loginom/runtime or actual-output input.

The seed-42 native numbering convention was established during discovery:
0 = upper group, 1 = right group, 2 = origin group. Numerical expectations
come only from the input CSV and arithmetic means/Euclidean distances.
"""
import argparse
import csv
import json
import math
from decimal import Decimal
from pathlib import Path


def expected(package_path):
    with (Path(__file__).parent / "data/points.csv").open(newline="") as source:
        reader = csv.DictReader(source)
        assert reader.fieldnames == ["RowID", "X", "Y"]
        points = [(int(r["RowID"]), Decimal(r["X"]), Decimal(r["Y"])) for r in reader]
    assert len(points) == 12 and len({r[0] for r in points}) == 12
    # These anchors describe the independently authored separated groups.
    anchors = [(0, 20), (20, 0), (0, 0)]
    groups = [[] for _ in anchors]
    for point in points:
        distances = [(point[1] - x) ** 2 + (point[2] - y) ** 2 for x, y in anchors]
        cluster = min(range(3), key=distances.__getitem__)
        assert distances[cluster] < 1
        groups[cluster].append(point)
    assert [len(g) for g in groups] == [4, 4, 4]
    centers = [(sum(p[1] for p in g) / len(g), sum(p[2] for p in g) / len(g)) for g in groups]
    column = lambda name, kind, label=None: {
        "name": name, "label": label or name, "type": kind,
        **({"tolerance": {"abs": 1e-8, "rel": 0}} if kind == "real" else {}),
    }
    rows = []
    for cluster, group in enumerate(groups):
        cx, cy = centers[cluster]
        for rowid, x, y in group:
            rows.append({"Cluster": cluster, "Distance": math.sqrt(float((x - cx) ** 2 + (y - cy) ** 2)),
                         "RowID": rowid, "X": float(x), "Y": float(y)})
    return {
        "package_path": package_path,
        "nodes": [{"type": "imports.text"}, {"type": "datamining.clustering"},
                  {"type": "exports.text"}, {"type": "exports.text"}],
        "outputs": [
            {"output_node_type": "datamining.clustering", "output_port": 0,
             "columns": [column("Cluster", "integer", "Номер кластера"),
                         column("Distance", "real", "Расстояние до центра кластера"),
                         column("X", "real"), column("Y", "real"), column("RowID", "integer")],
             "rows": sorted(rows, key=lambda r: r["RowID"])},
            {"output_node_type": "datamining.clustering", "output_port": 1,
             "columns": [column("Cluster", "integer", "Номер кластера"), column("X", "real"), column("Y", "real")],
             "rows": [{"Cluster": i, "X": float(x), "Y": float(y)} for i, (x, y) in enumerate(centers)]},
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-path", default="{{PACKAGE_PATH}}")
    args = parser.parse_args()
    print(json.dumps(expected(args.package_path), ensure_ascii=False, indent=2))
