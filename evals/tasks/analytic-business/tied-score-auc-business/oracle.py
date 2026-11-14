"""Закрытый draft: ROC trapezoids по tie-блокам, сверка прямыми парами."""
import csv
from fractions import Fraction as F
from pathlib import Path


def calculate(variant="correct"):
    data = Path(__file__).parent / "data"
    models = [r["model_id"] for r in csv.DictReader((data/"auc_models.csv").open(), delimiter=";")]
    cases = {m: [] for m in models}
    keys = set()
    for r in csv.DictReader((data/"auc_scores.csv").open(), delimiter=";"):
        key = r["model_id"], r["case_id"]
        assert key not in keys
        keys.add(key)
        cases[r["model_id"]].append((int(r["outcome"]), F(r["score"])))
    result = []
    for model in sorted(models):
        rows = cases[model]
        positive = [s for y, s in rows if y == 1]
        negative = [s for y, s in rows if y == 0]
        pairs = len(positive)*len(negative)
        wins = sum(a > b for a in positive for b in negative)
        ties = sum(a == b for a in positive for b in negative)
        auc = None
        if pairs:
            auc = F(0)
            tpr = F(0)
            for score in sorted({s for _, s in rows}, reverse=True):
                delta_tpr = F(sum(y == 1 and s == score for y, s in rows), len(positive))
                delta_fpr = F(sum(y == 0 and s == score for y, s in rows), len(negative))
                auc += delta_fpr*(tpr + delta_tpr/2)
                tpr += delta_tpr
            assert auc == F(2*wins+ties, 2*pairs)
            if variant == "ties-zero":
                auc = F(wins, pairs)
            if variant == "threshold-accuracy":
                auc = F(sum((s >= F(1, 2)) == bool(y) for y, s in rows), len(rows))
            if variant == "auto-flip":
                auc = max(auc, 1-auc)
        if auc is None and variant == "undefined-zero":
            auc = F(0)
        result.append(dict(model_id=model, positive_cases=len(positive), negative_cases=len(negative),
                           comparable_pairs=pairs, concordant_pairs=wins, tied_pairs=ties,
                           auc=None if auc is None else float(auc)))
    return result


if __name__ == "__main__":
    import io
    import json
    import sys
    here = Path(__file__).parent
    columns = ['model_id', 'positive_cases', 'negative_cases', 'comparable_pairs', 'concordant_pairs', 'tied_pairs', 'auc']
    good = calculate()
    assert all(set(r) == set(columns) for r in good)
    if "--self-check" in sys.argv:
        traps = [{'name': 'ties-zero', 'expected_failed': ['ties'], 'expected_oracle_pass': False, 'semantic_defect': 'Равные scores дают нулевой вклад.'}, {'name': 'threshold-accuracy', 'expected_failed': ['ranking'], 'expected_oracle_pass': False, 'semantic_defect': 'В auc записана accuracy при пороге 0.5.'}, {'name': 'auto-flip', 'expected_failed': ['ties'], 'expected_oracle_pass': False, 'semantic_defect': 'auc заменён max(auc,1-auc).'}, {'name': 'undefined-zero', 'expected_failed': ['classes'], 'expected_oracle_pass': False, 'semantic_defect': 'Неопределённый auc заменён 0.'}]
        evidence = []
        for trap in traps:
            bad = calculate(trap["name"])
            witnesses = []
            for i, (left, right) in enumerate(zip(good, bad)):
                for col in columns:
                    a, b = left[col], right[col]
                    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
                        differs = abs(a-b) > 0.000001
                    else:
                        differs = a != b
                    if differs:
                        witnesses.append({"row": i+1, "column": col, "correct": a, "wrong": b})
            assert witnesses, "Non-sensitive trap: " + trap["name"]
            evidence.append({**trap, "distinguishable_above_tolerance_or_exact": True,
                             "changed_cells": len(witnesses), "witnesses": witnesses})
        print(json.dumps({"status": "PASS", "kind": "offline-math-only", "tolerance": 0.000001,
                          "row_count": len(good), "correct_rows": good, "traps": evidence}, ensure_ascii=False, indent=2))
    else:
        w = csv.DictWriter(sys.stdout, fieldnames=columns, delimiter=";", lineterminator="\n")
        w.writeheader()
        for row in good:
            w.writerow({k: "" if v is None else f"{v:.6f}" if isinstance(v, float) else v for k, v in row.items()})
