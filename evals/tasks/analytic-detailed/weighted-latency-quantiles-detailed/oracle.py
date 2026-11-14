"""Закрытый draft: развёртка точных целочисленных частот, без selfjoin."""
import csv
from fractions import Fraction as F
from pathlib import Path


def calculate(variant="correct"):
    data = Path(__file__).parent / "data"
    services = [r["service_id"] for r in csv.DictReader((data/"latency_services.csv").open(), delimiter=";")]
    expanded = {s: [] for s in services}
    seen = set()
    for r in csv.DictReader((data/"latency_frequencies.csv").open(), delimiter=";"):
        assert r["bucket_id"] not in seen
        seen.add(r["bucket_id"])
        n, latency = int(r["requests"]), int(r["latency_ms"])
        assert n >= 0 and latency >= 0
        if variant == "unweighted":
            n = int(n > 0)
        expanded[r["service_id"]].extend([latency]*n)
    result = []
    for service in sorted(services):
        values = sorted(expanded[service])
        n = len(values)
        p50 = p90 = tail = None
        if n:
            def quantile(p):
                position = p*n
                index = (position.numerator+position.denominator-1)//position.denominator-1
                if variant == "strict-quantile":
                    index = min(n-1, position.numerator//position.denominator)
                if variant == "linear-interpolation":
                    h = (n-1)*p
                    lo = h.numerator//h.denominator
                    return float(values[lo] + (h-lo)*(values[min(lo+1, n-1)]-values[lo]))
                return values[index]
            p50, p90 = quantile(F(1, 2)), quantile(F(9, 10))
            count = sum(x >= p90 if variant == "tail-inclusive" else x > p90 for x in values)
            tail = float(F(count, n))
        elif variant == "empty-zero":
            p50 = p90 = tail = 0
        result.append(dict(service_id=service, total_requests=n, p50_ms=p50, p90_ms=p90, exceed_p90_share=tail))
    return result


if __name__ == "__main__":
    import io
    import json
    import sys
    here = Path(__file__).parent
    columns = ['service_id', 'total_requests', 'p50_ms', 'p90_ms', 'exceed_p90_share']
    good = calculate()
    assert all(set(r) == set(columns) for r in good)
    if "--self-check" in sys.argv:
        traps = [{'name': 'unweighted', 'expected_failed': ['weights'], 'expected_oracle_pass': False, 'semantic_defect': 'Каждая bucket-строка считается одним запросом.'}, {'name': 'strict-quantile', 'expected_failed': ['quantiles'], 'expected_oracle_pass': False, 'semantic_defect': 'Первый cumulative строго больше p*n вместо ≥.'}, {'name': 'linear-interpolation', 'expected_failed': ['quantiles'], 'expected_oracle_pass': False, 'semantic_defect': 'Применена линейная интерполяция квантиля развёрнутых наблюдений.'}, {'name': 'tail-inclusive', 'expected_failed': ['tail'], 'expected_oracle_pass': False, 'semantic_defect': 'В хвост включены запросы с latency=p90.'}, {'name': 'empty-zero', 'expected_failed': ['tail'], 'expected_oracle_pass': False, 'semantic_defect': 'Отсутствующие квантили заменены нулями.'}]
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
