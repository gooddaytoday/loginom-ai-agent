#!/usr/bin/env python3
"""Independent HP proposal: exact rational normal equations; Python stdlib.

Minimize sum_observed (x[i]-t[i])**2 + lambda*sum (D2*t)**2.
Never imports Loginom/runtime or reads actual output. NULL has weight zero.
"""
import argparse
import csv
import json
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def smooth(values, strength):
    n = len(values)
    if n == 0:
        return []
    if n == 1 and values[0] is not None:
        return values[:]
    if sum(x is not None for x in values) < 2:
        raise ValueError("HP trend is not uniquely determined by fewer than two observations")
    a = [[Fraction(i == j and values[i] is not None) for j in range(n)] for i in range(n)]
    b = [Fraction(0) if x is None else x for x in values]
    for row in range(n - 2):
        for i, ci in enumerate((1, -2, 1)):
            for j, cj in enumerate((1, -2, 1)):
                a[row + i][row + j] += strength * ci * cj
    for col in range(n):
        pivot = next(i for i in range(col, n) if a[i][col])
        a[col], a[pivot] = a[pivot], a[col]
        b[col], b[pivot] = b[pivot], b[col]
        divisor = a[col][col]
        a[col] = [x / divisor for x in a[col]]
        b[col] /= divisor
        for row in range(n):
            if row == col:
                continue
            factor = a[row][col]
            a[row] = [x - factor * y for x, y in zip(a[row], a[col])]
            b[row] -= factor * b[col]
    return b


def expected(case, package, strength):
    with (ROOT / "fixtures" / (case + ".csv")).open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        assert reader.fieldnames == ["RowID", "X", "R", "Tag"]
        rows = [{"RowID": int(r["RowID"]), "X": None if r["X"] == "?" else int(r["X"]),
                 "R": None if r["R"] == "?" else float(r["R"]), "Tag": r["Tag"]} for r in reader]
    for field in ("X", "R"):
        values = [None if r[field] is None else Fraction(str(r[field])) for r in rows]
        for row, trend in zip(rows, smooth(values, strength)):
            row[field + "_S"] = float(trend)
    columns = [{"name": name, "type": kind, "label_any": True}
               for name, kind in [("RowID", "integer"), ("X", "integer"), ("R", "real"),
                                  ("Tag", "string"), ("X_S", "real"), ("R_S", "real")]]
    for column in columns:
        if column["type"] == "real":
            column["tolerance"] = {"abs": 1e-8, "rel": 1e-10} if column["name"].endswith("_S") else {"abs": 0, "rel": 0}
    return {"package_path": package, "nodes": [{"type": t} for t in
            ("imports.text", "preprocessing.smoothing", "exports.text")],
            "outputs": [{"output_node_type": "preprocessing.smoothing", "output_port": 0,
                         "ordered": True, "column_order": "exact", "columns": columns, "rows": rows}]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=("series", "update", "linear", "constant", "null", "edge-null", "all-null", "empty"), default="update")
    parser.add_argument("--lambda", dest="strength", type=Fraction, default=Fraction(1))
    parser.add_argument("--package", default="{{PACKAGE_PATH}}")
    args = parser.parse_args()
    if args.strength < Fraction(1, 16):
        parser.error("lambda must be >= 0.0625")
    print(json.dumps(expected(args.case, args.package, args.strength), ensure_ascii=False, indent=2, allow_nan=False))
