"""Закрытый draft: unit-first изменения, а не period-first граф."""
import csv
from fractions import Fraction as F
from pathlib import Path


def calculate(variant="correct"):
    data = Path(__file__).parent / "data"
    units = {}
    for r in csv.DictReader((data/"did_units.csv").open(), delimiter=";"):
        key = r["program_id"], r["unit_id"]
        assert key not in units
        units[key] = (r["arm"], {})
    for r in csv.DictReader((data/"did_outcomes.csv").open(), delimiter=";"):
        obs = units[r["program_id"], r["unit_id"]][1]
        assert r["period"] not in obs
        obs[r["period"]] = F(r["outcome"])
    for _, obs in units.values():
        assert set(obs) == {"pre2", "pre1", "post"}
    result = []
    for program in sorted({p for p, _ in units}):
        row = {"program_id": program}
        changes, prechanges = {}, {}
        for arm, prefix in [("T", "t"), ("C", "c")]:
            panel = [obs for (p, _), (a, obs) in units.items() if p == program and a == arm]
            row[prefix+"_units"] = len(panel)
            for period in ["pre2", "pre1", "post"]:
                row[prefix+"_"+period] = float(sum(obs[period] for obs in panel)/len(panel))
            changes[arm] = sum(obs["post"]-obs["pre1"] for obs in panel)/len(panel)
            prechanges[arm] = sum(obs["pre1"]-obs["pre2"] for obs in panel)/len(panel)
        did, gap = changes["T"]-changes["C"], prechanges["T"]-prechanges["C"]
        assert abs(float(did) - ((row["t_post"]-row["t_pre1"])-(row["c_post"]-row["c_pre1"]))) < 1e-12
        if variant == "treated-only":
            did = changes["T"]
        if variant == "post-gap":
            did = F(str(row["t_post"]))-F(str(row["c_post"]))
        if variant == "wrong-preperiod":
            gap = changes["T"]-changes["C"]
        row.update(treated_change=float(changes["T"]), control_change=float(changes["C"]),
                   did_estimate=float(did), pretrend_gap=float(gap),
                   parallel_compatible=int(abs(gap) < 1 if variant == "strict-boundary" else abs(gap) <= 1))
        result.append(row)
    return result


if __name__ == "__main__":
    import io
    import json
    import sys
    here = Path(__file__).parent
    columns = ['program_id', 't_units', 'c_units', 't_pre2', 't_pre1', 't_post', 'c_pre2', 'c_pre1', 'c_post', 'treated_change', 'control_change', 'did_estimate', 'pretrend_gap', 'parallel_compatible']
    good = calculate()
    assert all(set(r) == set(columns) for r in good)
    if "--self-check" in sys.argv:
        traps = [{'name': 'treated-only', 'expected_failed': ['control'], 'expected_oracle_pass': False, 'semantic_defect': 'Контрольное изменение не вычтено.'}, {'name': 'post-gap', 'expected_failed': ['control'], 'expected_oracle_pass': False, 'semantic_defect': 'В did записана разность уровней T/C после программы.'}, {'name': 'wrong-preperiod', 'expected_failed': ['pretrend'], 'expected_oracle_pass': False, 'semantic_defect': 'Диагностический gap заменён post/pre1 gap.'}, {'name': 'strict-boundary', 'expected_failed': ['pretrend'], 'expected_oracle_pass': False, 'semantic_defect': 'Использована граница <1 вместо ≤1.'}]
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
