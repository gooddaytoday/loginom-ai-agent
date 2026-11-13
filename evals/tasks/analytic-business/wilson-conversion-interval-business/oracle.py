"""Закрытый draft: инверсия score-неравенства Decimal-бисекцией."""
import csv
from decimal import Decimal as D, localcontext
from pathlib import Path


def bounds(n, k):
    with localcontext() as ctx:
        ctx.prec = 50
        n, k, z = D(n), D(k), D("1.96")
        p = k/n
        def residual(q):
            return (k-n*q)**2 - z*z*n*q*(1-q)
        low, high = D(0), p
        for _ in range(180):
            mid = (low+high)/2
            if residual(mid) > 0:
                low = mid
            else:
                high = mid
        lower = D(0) if k == 0 else (low+high)/2
        low, high = p, D(1)
        for _ in range(180):
            mid = (low+high)/2
            if residual(mid) > 0:
                high = mid
            else:
                low = mid
        upper = D(1) if k == n else (low+high)/2
        denominator = 1+z*z/n
        center = (p+z*z/(2*n))/denominator
        half = z*(p*(1-p)/n+z*z/(4*n*n)).sqrt()/denominator
        assert abs(lower-(center-half)) < D("1e-40")
        assert abs(upper-(center+half)) < D("1e-40")
        return lower, upper


def calculate(variant="correct"):
    data = Path(__file__).parent / "data"
    cohorts = {r["cohort_id"]: D(r["target_rate"]) for r in csv.DictReader((data/"wilson_cohorts.csv").open(), delimiter=";")}
    batches = {c: [] for c in cohorts}
    seen = set()
    for r in csv.DictReader((data/"wilson_batches.csv").open(), delimiter=";"):
        assert r["batch_id"] not in seen
        seen.add(r["batch_id"])
        n, k = int(r["trials"]), int(r["successes"])
        assert 0 <= k <= n and n >= 1
        batches[r["cohort_id"]].append((n, k))
    result = []
    for cohort, target in sorted(cohorts.items()):
        n = sum(n for n, k in batches[cohort])
        k = sum(k for n, k in batches[cohort])
        rate = lower = upper = None
        decision = "no_data"
        if n:
            rate = D(k)/n
            lower, upper = bounds(n, k)
            if variant == "wald":
                half = D("1.96")*(rate*(1-rate)/n).sqrt()
                lower, upper = max(D(0), rate-half), min(D(1), rate+half)
            if variant == "mean-batch-rate":
                rate = sum(D(bk)/bn for bn, bk in batches[cohort])/len(batches[cohort])
                lower, upper = bounds(n, rate*n)
            decision = "above" if lower > target else "below" if upper < target else "uncertain"
            if variant == "point-decision":
                decision = "above" if rate > target else "below" if rate < target else "uncertain"
        elif variant == "empty-zero":
            rate = lower = upper = D(0)
            decision = "below"
        result.append(dict(cohort_id=cohort, trials=n, successes=k,
                           observed_rate=None if rate is None else float(rate),
                           lower=None if lower is None else float(lower),
                           upper=None if upper is None else float(upper),
                           target_rate=float(target), decision=decision))
    return result


if __name__ == "__main__":
    import io
    import json
    import sys
    here = Path(__file__).parent
    columns = ['cohort_id', 'trials', 'successes', 'observed_rate', 'lower', 'upper', 'target_rate', 'decision']
    good = calculate()
    assert all(set(r) == set(columns) for r in good)
    if "--self-check" in sys.argv:
        traps = [{'name': 'wald', 'expected_failed': ['interval'], 'expected_oracle_pass': False, 'semantic_defect': 'Wilson заменён Wald, включая вырожденные endpoints.'}, {'name': 'mean-batch-rate', 'expected_failed': ['denominator'], 'expected_oracle_pass': False, 'semantic_defect': 'Доли batches усреднены без весов.'}, {'name': 'point-decision', 'expected_failed': ['decision'], 'expected_oracle_pass': False, 'semantic_defect': 'Решение принимается по observed_rate вместо bounds.'}, {'name': 'empty-zero', 'expected_failed': ['denominator'], 'expected_oracle_pass': False, 'semantic_defect': 'no_data превращён в наблюдаемый нулевой rate и bounds.'}]
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
