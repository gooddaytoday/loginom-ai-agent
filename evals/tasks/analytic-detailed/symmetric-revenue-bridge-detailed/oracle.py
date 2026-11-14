"""Закрытый draft: независимые контрфактические вклады, не Loginom export."""
import csv
from fractions import Fraction as F
from pathlib import Path


def calculate(variant="correct"):
    periods = {}
    for row in csv.DictReader((Path(__file__).parent / "data/bridge_observations.csv").open(), delimiter=";"):
        key = row["division"], row["sku"]
        assert row["period"] not in periods.setdefault(key, {})
        periods[key][row["period"]] = F(row["quantity"]), F(row["unit_price"])
    totals = {}
    raw = {}
    for (division, _), observations in periods.items():
        assert set(observations) == {"base", "current"}
        q0, p0 = observations["base"]
        q1, p1 = observations["current"]
        r00, r10, r01, r11 = p0*q0, p1*q0, p0*q1, p1*q1
        price = ((r10-r00) + (r11-r01))/2
        quantity = ((r11-r10) + (r01-r00))/2
        assert price + quantity == r11-r00
        assert price == (p1-p0)*(q0+q1)/2
        if variant == "base-only":
            price, quantity = r10-r00, r01-r00
        if variant == "price-first":
            price, quantity = r10-r00, r11-r10
        t = totals.setdefault(division, [F(0)]*4)
        for i, value in enumerate([r00, r11, price, quantity]):
            t[i] += value
        raw.setdefault(division, []).append((q0, p0, q1, p1))
    result = []
    for division, (base, current, price, quantity) in sorted(totals.items()):
        if variant == "aggregate-before-products":
            items = raw[division]
            q0, q1 = sum(x[0] for x in items), sum(x[2] for x in items)
            p0, p1 = sum(x[1] for x in items)/len(items), sum(x[3] for x in items)/len(items)
            price, quantity = (p1-p0)*(q0+q1)/2, (q1-q0)*(p0+p1)/2
        result.append(dict(division=division, base_revenue=float(base), current_revenue=float(current),
                           revenue_change=float(current-base), price_effect=float(price),
                           quantity_effect=float(quantity), reconciliation=float(current-base-price-quantity)))
    return result


if __name__ == "__main__":
    import io
    import json
    import sys
    here = Path(__file__).parent
    columns = ['division', 'base_revenue', 'current_revenue', 'revenue_change', 'price_effect', 'quantity_effect', 'reconciliation']
    good = calculate()
    assert all(set(r) == set(columns) for r in good)
    if "--self-check" in sys.argv:
        traps = [{'name': 'base-only', 'expected_failed': ['interaction'], 'expected_oracle_pass': False, 'semantic_defect': 'В обоих вкладах используются только базовые множители; interaction потерян.'}, {'name': 'price-first', 'expected_failed': ['interaction'], 'expected_oracle_pass': False, 'semantic_defect': 'Всё взаимодействие отнесено количеству при последовательной цене первой.'}, {'name': 'aggregate-before-products', 'expected_failed': ['bridge'], 'expected_oracle_pass': False, 'semantic_defect': 'Периодические цены и количества агрегированы до произведений; потеряны веса SKU.'}]
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
