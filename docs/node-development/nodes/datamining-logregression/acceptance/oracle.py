#!/usr/bin/env python3
"""Independent unweighted binomial MLE, intercept + X; stdlib only.

Reads authored fixtures, never Loginom, runtime code or observed results.
Newton's method solves the two score equations. Group proportions also
give the analytic cross-check beta=(0, log(3)). Schema is a discovery binding;
numerical expectations come exclusively from the input data.
"""
import argparse
import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(name):
    with (ROOT / "fixtures" / name).open(newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        assert reader.fieldnames == ["RowID", "X", "Target", "Note"]
        return [{"RowID": int(r["RowID"]), "X": float(r["X"]),
                 "Target": None if r["Target"] == "?" else r["Target"],
                 "Note": None if r["Note"] == "?" else r["Note"]} for r in reader]


def probability(a, b, x):
    return 1 / (1 + math.exp(-(a + b * x)))


def fit(rows):
    assert len({r["RowID"] for r in rows}) == len(rows)
    assert {r["Target"] for r in rows} == {"no", "yes"}
    a, b = 0.0, 0.0
    for _ in range(100):
        g0 = g1 = h00 = h01 = h11 = 0.0
        for row in rows:
            x = row["X"]
            p = probability(a, b, x)
            residual = int(row["Target"] == "yes") - p
            w = p * (1 - p)
            g0 += residual
            g1 += x * residual
            h00 += w
            h01 += w * x
            h11 += w * x * x
        determinant = h00 * h11 - h01 * h01
        assert determinant > 0, "non-identifiable model"
        da = (h11 * g0 - h01 * g1) / determinant
        db = (h00 * g1 - h01 * g0) / determinant
        a, b = a + da, b + db
        if max(abs(da), abs(db)) < 1e-13:
            return a, b
    raise AssertionError("MLE did not converge")


def expected(package_path, holdout=False):
    train = source("train.csv")
    a, b = fit(train)
    assert abs(a) < 1e-12 and abs(b - math.log(3)) < 1e-12
    columns = [
        {"name": "Target_regression", "type": "string", "label_any": True},
        {"name": "Target_probability", "type": "real", "label_any": True,
         "tolerance": {"abs": 1e-8, "rel": 1e-10}},
        *[{"name": name, "type": kind, "label": name} for name, kind in
          [("X", "real"), ("Target", "string"), ("RowID", "integer"), ("Note", "string")]],
    ]
    rows = []
    for row in source("holdout.csv") if holdout else train:
        p = probability(a, b, row["X"])
        rows.append({"Target_regression": "yes" if p > 0.8 else "no",
                     "Target_probability": p, **row})
    return {"package_path": package_path,
            "nodes": [{"type": "imports.text"}, {"type": "datamining.log_regression"},
                      {"type": "exports.text"}],
            "outputs": [{"output_node_type": "datamining.log_regression", "output_port": 0,
                         "ordered": True, "column_order": "exact", "columns": columns, "rows": rows}]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-path", default="{{PACKAGE_PATH}}")
    parser.add_argument("--holdout", action="store_true", help="research only: saved model, no retraining")
    args = parser.parse_args()
    print(json.dumps(expected(args.package_path, args.holdout), ensure_ascii=False, indent=2))
