"""Independent synthetic procurement ledger; reads only raw data/*.csv."""
import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
with (root / "data/po_lines.csv").open(newline="", encoding="utf-8") as source:
    orders = {row["po_line_id"]: row for row in csv.DictReader(source, delimiter=";")}
accepted = {key: Decimal(0) for key in orders}
billed = {key: Decimal(0) for key in orders}
deviations = {key: Decimal(0) for key in orders}
problems = {key: 0 for key in orders}
with (root / "data/receipts.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        accepted[row["po_line_id"]] += Decimal(row["accepted_qty"])
with (root / "data/invoice_lines.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        key = row["po_line_id"]
        quantity = Decimal(row["billed_qty"])
        difference = Decimal(row["billed_unit_price"]) - Decimal(orders[key]["agreed_unit_price"])
        billed[key] += quantity
        deviations[key] += difference * quantity
        problems[key] += int(difference != 0)
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", lineterminator="\n")
    writer.writerow(["po_line_id", "supplier_id", "ordered_qty", "accepted_qty", "billed_qty", "excess_billed_qty", "price_deviation", "price_problem_lines"])
    for key in sorted(orders):
        writer.writerow([key, orders[key]["supplier_id"], int(orders[key]["ordered_qty"]), int(accepted[key]), int(billed[key]), int(max(billed[key] - accepted[key], 0)), f"{deviations[key]:.2f}", problems[key]])
