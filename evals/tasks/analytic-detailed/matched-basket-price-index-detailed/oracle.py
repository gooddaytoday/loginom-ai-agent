"""Independent fixed-base basket index from eligible synthetic sale lines."""
import csv
from datetime import datetime
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
periods = [{}, {}]
with (root / "data/sales_lines.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        qty, amount = int(row["qty"]), Decimal(row["amount"])
        if qty <= 0 or amount <= 0:
            continue
        timestamp = datetime.fromisoformat(row["timestamp"])
        period = 0 if datetime(2026, 1, 1) <= timestamp < datetime(2026, 4, 1) else 1 if datetime(2026, 4, 1) <= timestamp < datetime(2026, 7, 1) else None
        if period is None:
            continue
        key = (row["category"], row["sku"])
        previous_qty, previous_amount = periods[period].get(key, (0, Decimal(0)))
        periods[period][key] = (previous_qty + qty, previous_amount + amount)
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", quotechar='"', lineterminator="\n")
    writer.writerow(["category", "base_skus", "matched_skus", "base_revenue_coverage", "basket_base_cost", "basket_current_cost", "price_index"])
    for category in sorted({category for category, sku in periods[0]}):
        base = {sku: values for (cat, sku), values in periods[0].items() if cat == category}
        current = {sku: values for (cat, sku), values in periods[1].items() if cat == category}
        matched = base.keys() & current.keys()
        base_revenue = sum((amount for qty, amount in base.values()), Decimal(0))
        base_cost = sum((base[sku][1] for sku in matched), Decimal(0))
        current_cost = sum((base[sku][0] * current[sku][1] / current[sku][0] for sku in matched), Decimal(0))
        coverage = base_cost / base_revenue
        index = 100 * current_cost / base_cost if base_cost else ""
        writer.writerow([category, len(base), len(matched), str(coverage), f"{base_cost:.6f}", f"{current_cost:.6f}", str(index)])
