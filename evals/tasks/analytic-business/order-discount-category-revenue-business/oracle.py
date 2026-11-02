import csv
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

root = Path(__file__).parent
with (root / "data/orders.csv").open() as handle:
    discounts = {row["order_id"]: Decimal(row["order_discount"]) for row in csv.DictReader(handle, delimiter=";")}
with (root / "data/lines.csv").open() as handle:
    lines = list(csv.DictReader(handle, delimiter=";"))
gross = {row["line_id"]: Decimal(row["qty"]) * Decimal(row["unit_price"]) for row in lines}
totals = defaultdict(Decimal)
for row in lines:
    totals[row["order_id"]] += gross[row["line_id"]]
orders = defaultdict(set)
category_gross = defaultdict(Decimal)
category_discount = defaultdict(Decimal)
for row in lines:
    category = row["category"]
    orders[category].add(row["order_id"])
    category_gross[category] += gross[row["line_id"]]
    category_discount[category] += discounts[row["order_id"]] * gross[row["line_id"]] / totals[row["order_id"]]
with (root / "oracle.csv").open("w", newline="") as handle:
    writer = csv.writer(handle, delimiter=";", lineterminator="\n")
    writer.writerow(["category", "orders", "gross_revenue", "allocated_discount", "net_revenue"])
    for category in sorted(orders):
        writer.writerow([category, len(orders[category]), f"{category_gross[category]:.6f}", f"{category_discount[category]:.6f}", f"{category_gross[category] - category_discount[category]:.6f}"])
