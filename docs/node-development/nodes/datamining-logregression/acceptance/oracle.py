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
from fractions import Fraction
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


def expected(package_path, holdout=False, threshold=0.8):
    train = source("train.csv")
    a, b = fit(train)
    assert abs(a) < 1e-12 and abs(b - math.log(3)) < 1e-12
    columns = [
        {"name": "PredictionEvent", "type": "boolean", "label_any": True},
        {"name": "PredictionProbability", "type": "real", "label_any": True,
         "tolerance": {"abs": 1e-8, "rel": 1e-10}},
        {"name": "ActualEvent", "type": "boolean", "label_any": True},
        {"name": "Target_predicted", "type": "string", "label_any": True},
        *[{"name": name, "type": kind, "label": name} for name, kind in
          [("X", "real"), ("Target", "string"), ("RowID", "integer"), ("Note", "string")]],
    ]
    # Exact group odds at X=1 provide a rational solution for integer X.
    # Cross-check every training group against the independent Newton fit.
    group = [r for r in train if r["X"] == 1]
    events = sum(r["Target"] == "yes" for r in group)
    odds = Fraction(events, len(group) - events)
    assert odds == 3
    rows = []
    for row in source("holdout.csv") if holdout else train:
        assert row["X"].is_integer()
        q = odds ** int(row["X"])
        p = float(q / (1 + q))
        assert abs(p - probability(a, b, row["X"])) < 1e-12
        rows.append({"PredictionEvent": p >= threshold, "PredictionProbability": p,
                     "ActualEvent": None if row["Target"] is None else row["Target"] == "yes",
                     "Target_predicted": "yes" if p >= threshold else "no", **row})
    return {"package_path": package_path,
            "nodes": [{"type": "imports.text"}, {"type": "datamining.log_regression"},
                      {"type": "exports.text"}],
            "outputs": [{"output_node_type": "datamining.log_regression", "output_port": 0,
                         "ordered": True, "column_order": "exact", "columns": columns, "rows": rows}]}


def check_csv(path):
    """Runner convention: oracle.py ACTUAL.csv; all cells, source row order."""
    output = expected("{{PACKAGE_PATH}}")['outputs'][0]
    with Path(path).open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        assert reader.fieldnames and len(reader.fieldnames) == len(output['columns'])
        assert set(reader.fieldnames) == {c['name'] for c in output['columns']}
        rows = list(reader)
    assert len(rows) == len(output['rows'])
    for actual, wanted in zip(rows, output['rows']):
        for column in output['columns']:
            name, kind = column['name'], column['type']
            text, value = actual[name], wanted[name]
            if value is None:
                assert text in ['', '?'], (name, text, value)
                continue
            if kind == 'boolean':
                assert text.casefold() in ['true', 'false'], (name, text)
                assert (text.casefold() == 'true') == value, (name, text, value)
                continue
            if kind in ['real', 'integer']:
                number = float(text)
                assert math.isfinite(number)
                tolerance = column.get('tolerance', {})
                assert abs(number - value) <= max(tolerance.get('abs', 0),
                                                  tolerance.get('rel', 0) * abs(value)), (name, text, value)
                continue
            assert text == value, (name, text, value)
    print(f"CSV PASS: {len(rows)} rows, {len(output['columns'])} columns")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("actual_csv", nargs="?", type=Path)
    parser.add_argument("--package-path", default="{{PACKAGE_PATH}}")
    parser.add_argument("--holdout", action="store_true", help="research only: saved model, no retraining")
    parser.add_argument("--threshold", type=float, default=0.8)
    parser.add_argument("--check", action="store_true", help="verify authored expectations and model input copy")
    args = parser.parse_args()
    if args.actual_csv:
        check_csv(args.actual_csv)
    elif args.check:
        for name, holdout, threshold in [('expected.json', False, 0.8),
                                         ('holdout-expected.json', True, 0.8),
                                         ('threshold-half-expected.json', False, 0.5)]:
            assert json.loads((ROOT / 'acceptance' / name).read_text()) == expected('{{PACKAGE_PATH}}', holdout, threshold)
        assert (ROOT / 'fixtures/train.csv').read_bytes() == (ROOT / 'acceptance/data/train.csv').read_bytes()
        print('Oracle / expectations / model input: PASS')
    else:
        print(json.dumps(expected(args.package_path, args.holdout, args.threshold), ensure_ascii=False, indent=2))
