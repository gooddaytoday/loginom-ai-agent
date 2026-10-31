#!/usr/bin/env python3
"""Independent binomial MLE and subset selection; Python stdlib, no Loginom.

Only authored selection.csv supplies numerical expectations. Deviance uses
likelihood-ratio tests for one added/removed continuous predictor (chi-square
with one degree of freedom). Information criteria count the intercept in k.
"""
import argparse
import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FACTORS = ("X", "Noise")
CRITERIA = ("deviance", "aic", "aicc", "bic", "hqic")


def source():
    with (ROOT / "fixtures/selection.csv").open(newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        assert reader.fieldnames == ["RowID", "X", "Noise", "Target", "Note"]
        rows = [{"RowID": int(r["RowID"]), "X": float(r["X"]),
                 "Noise": float(r["Noise"]), "Target": r["Target"],
                 "Note": None if r["Note"] == "?" else r["Note"]} for r in reader]
    assert len(rows) == 64 and len({r["RowID"] for r in rows}) == 64
    assert {r["Target"] for r in rows} == {"no", "yes"}
    return rows


def solve(matrix, vector):
    a = [list(row) + [value] for row, value in zip(matrix, vector)]
    for col in range(len(a)):
        pivot = max(range(col, len(a)), key=lambda row: abs(a[row][col]))
        a[col], a[pivot] = a[pivot], a[col]
        assert abs(a[col][col]) > 1e-12, "singular information matrix"
        scale = a[col][col]
        a[col] = [v / scale for v in a[col]]
        for row in range(len(a)):
            if row != col:
                scale = a[row][col]
                a[row] = [v - scale * w for v, w in zip(a[row], a[col])]
    return [row[-1] for row in a]


def fit(rows, factors):
    design = [[1.0, *[row[f] for f in factors]] for row in rows]
    beta = [0.0] * (len(factors) + 1)
    for _ in range(100):
        probabilities = [1 / (1 + math.exp(-sum(b * x for b, x in zip(beta, row))))
                         for row in design]
        score = [sum(x[j] * (int(r["Target"] == "yes") - p)
                     for x, r, p in zip(design, rows, probabilities)) for j in range(len(beta))]
        information = [[sum(x[j] * x[k] * p * (1 - p) for x, p in zip(design, probabilities))
                        for k in range(len(beta))] for j in range(len(beta))]
        step = solve(information, score)
        beta = [b + d for b, d in zip(beta, step)]
        if max(map(abs, step)) < 1e-13:
            break
    else:
        raise AssertionError("MLE did not converge")
    probabilities = [1 / (1 + math.exp(-sum(b * x for b, x in zip(beta, row)))) for row in design]
    ll = sum(math.log(p) if r["Target"] == "yes" else math.log1p(-p)
             for r, p in zip(rows, probabilities))
    return {"factors": list(factors), "beta": beta, "ll": ll, "probabilities": probabilities}


def quality(model, criterion, n):
    k = len(model["beta"])
    penalty = {"aic": 2 * k, "aicc": 2 * k + 2 * k * (k + 1) / (n - k - 1),
               "bic": k * math.log(n), "hqic": 2 * k * math.log(math.log(n))}
    return -2 * model["ll"] + penalty[criterion]


def lr_p(smaller, larger):
    return math.erfc(math.sqrt(max(0, 2 * (larger["ll"] - smaller["ll"])) / 2))


def select(rows, mode="stepwise", criterion="deviance", entry=0.01, removal=0.2):
    selected = list(FACTORS) if mode == "backward" else []
    history = []
    for _ in range(20):
        changed = False
        current = fit(rows, selected)
        if mode != "backward":
            candidates = []
            for factor in FACTORS:
                if factor in selected:
                    continue
                model = fit(rows, [*selected, factor])
                value = lr_p(current, model) if criterion == "deviance" else quality(model, criterion, len(rows))
                candidates.append((value, FACTORS.index(factor), factor))
            if candidates:
                value, _, factor = min(candidates)
                if value < (entry if criterion == "deviance" else quality(current, criterion, len(rows))):
                    selected.append(factor)
                    history.append({"action": "add", "factor": factor, "value": value})
                    changed = True
        if mode != "forward":
            while selected:
                current = fit(rows, selected)
                candidates = []
                for factor in selected:
                    model = fit(rows, [f for f in selected if f != factor])
                    value = lr_p(model, current) if criterion == "deviance" else quality(model, criterion, len(rows))
                    candidates.append((value, FACTORS.index(factor), factor))
                value, _, factor = (max(candidates) if criterion == "deviance" else min(candidates))
                if not (value > removal if criterion == "deviance" else value < quality(current, criterion, len(rows))):
                    break
                selected.remove(factor)
                history.append({"action": "remove", "factor": factor, "value": value})
                changed = True
        if not changed:
            return fit(rows, selected), history
    raise AssertionError("selection did not terminate")


def expected(mode="stepwise", criterion="deviance", entry=0.01, removal=0.2):
    rows = source()
    model, _ = select(rows, mode, criterion, entry, removal)
    columns = [
        {"name": "PredictionEvent", "type": "boolean", "label_any": True},
        {"name": "PredictionProbability", "type": "real", "label_any": True,
         "tolerance": {"abs": 1e-8, "rel": 1e-10}},
        {"name": "ActualEvent", "type": "boolean", "label_any": True},
        {"name": "Target_predicted", "type": "string", "label_any": True},
        *[{"name": name, "type": kind, "label": name} for name, kind in
          [("X", "real"), ("Noise", "real"), ("Target", "string"), ("RowID", "integer"), ("Note", "string")]],
    ]
    predictions = [{"PredictionEvent": p >= 0.8, "PredictionProbability": p,
                    "ActualEvent": r["Target"] == "yes", "Target_predicted": "yes" if p >= 0.8 else "no", **r}
                   for r, p in zip(rows, model["probabilities"])]
    return {"package_path": "{{PACKAGE_PATH}}", "null_marker": "?",
            "nodes": [{"type": "imports.text"}, {"type": "datamining.log_regression"}, {"type": "exports.text"}],
            "outputs": [{"output_node_type": "datamining.log_regression", "output_port": 0,
                         "ordered": True, "column_order": "exact", "columns": columns, "rows": predictions}]}


def check_csv(path, wanted):
    output = wanted["outputs"][0]
    with Path(path).open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        assert len(reader.fieldnames or []) == len(output["columns"])
        assert set(reader.fieldnames) == {c["name"] for c in output["columns"]}
        actual = list(reader)
    assert len(actual) == len(output["rows"])
    for row, target in zip(actual, output["rows"]):
        for column in output["columns"]:
            name, kind = column["name"], column["type"]
            text, value = row[name], target[name]
            if value is None:
                assert text == "?", (name, text, value)
            elif kind == "boolean":
                assert text.casefold() in ("true", "false")
                assert (text.casefold() == "true") == value, (name, text, value)
            elif kind in ("real", "integer"):
                number = float(text)
                tolerance = column.get("tolerance", {})
                assert math.isfinite(number) and abs(number - value) <= max(
                    tolerance.get("abs", 0), tolerance.get("rel", 0) * abs(value)), (name, text, value)
            else:
                assert text == value, (name, text, value)
    print(f"CSV PASS: {len(actual)} rows, {len(output['columns'])} columns")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("actual_csv", nargs="?", type=Path)
    parser.add_argument("--mode", choices=("forward", "backward", "stepwise"), default="stepwise")
    parser.add_argument("--criterion", choices=CRITERIA, default="deviance")
    parser.add_argument("--entry", type=float, default=0.01)
    parser.add_argument("--removal", type=float, default=0.2)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--diagnostic", action="store_true")
    args = parser.parse_args()
    assert 0 < args.entry < 1 and 0 < args.removal < 1
    if args.mode == "stepwise" and args.criterion == "deviance":
        assert args.entry < args.removal
    result = expected(args.mode, args.criterion, args.entry, args.removal)
    if args.actual_csv:
        check_csv(args.actual_csv, result)
    elif args.check:
        stored = json.loads((Path(__file__).parent / "expected.json").read_text())
        for mode in ("forward", "backward", "stepwise"):
            for criterion in CRITERIA:
                model, _ = select(source(), mode, criterion)
                assert model["factors"] == ["X"], (mode, criterion, model)
                assert expected(mode, criterion) == stored
        assert (ROOT / "fixtures/selection.csv").read_bytes() == (Path(__file__).parent / "data/selection.csv").read_bytes()
        full = fit(source(), FACTORS)
        selected, _ = select(source())
        assert max(abs(a - b) for a, b in zip(full["probabilities"], selected["probabilities"])) > 0.01
        assert select(source(), entry=1e-9, removal=0.2)[0]["factors"] == []
        assert select(source(), entry=0.95, removal=0.99)[0]["factors"] == list(FACTORS)
        for name, entry, removal in [("expected-strict.json", 1e-9, 0.2),
                                     ("expected-permissive.json", 0.95, 0.99)]:
            assert json.loads((Path(__file__).parent / name).read_text()) == expected(entry=entry, removal=removal)
        print("PASS: 15 mode/criterion combinations, fixture copy, Enter distinction, threshold sensitivity")
    elif args.diagnostic:
        rows = source()
        models = [fit(rows, factors) for factors in ([], ["X"], ["Noise"], list(FACTORS))]
        print(json.dumps([{k: v for k, v in model.items() if k != "probabilities"} for model in models], indent=2))
        print(json.dumps(select(rows, args.mode, args.criterion, args.entry, args.removal)[1], indent=2))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
