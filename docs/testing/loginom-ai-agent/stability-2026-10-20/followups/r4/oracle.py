#!/usr/bin/env python3
"""Independent rational OLS refit on replacement CSV only; no prior oracle import."""
import csv
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parents[4] / "node-development/nodes/datamining-linregression/acceptance/data"
with (DATA / "replace.csv").open(encoding="utf-8", newline="") as source:
    train = list(csv.DictReader(source))
assert len(train) == 6 and all(row["IsTest"] == "false" for row in train)
x, y = [[Fraction(row[name]) for row in train] for name in ("X", "Y")]
n, sx, sy = len(x), sum(x), sum(y)
denominator = n * sum(value ** 2 for value in x) - sx ** 2
assert denominator > 0
slope = (n * sum(a * b for a, b in zip(x, y)) - sx * sy) / denominator
intercept = (sy - slope * sx) / n
assert (intercept, slope) == (7, -3)
rows = [{"RowID": int(row["RowID"]), "X": float(row["X"]),
         "Forecast": float(intercept + slope * Fraction(row["X"]))} for row in train]
expected = {
    "package_path": sys.argv[1] if len(sys.argv) > 1 else "/stability-2026-10-20/datamining-linregression.lgp",
    "nodes": [{"type": kind} for kind in ("imports.text", "datamining.lin_regression", "exports.text")],
    "outputs": [{
        "output_node_type": "export_input",
        "export_destination": sys.argv[2] if len(sys.argv) > 2 else "/stability-2026-10-20/forecast-refit.csv",
        "ordered": False,
        "column_order": "exact",
        "columns": [{"name": name, "label": name, "type": kind,
                     **({"tolerance": {"abs": 1e-8, "rel": 1e-10}} if name == "Forecast" else {})}
                    for name, kind in (("RowID", "integer"), ("X", "real"), ("Forecast", "real"))],
        "rows": rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8"))
