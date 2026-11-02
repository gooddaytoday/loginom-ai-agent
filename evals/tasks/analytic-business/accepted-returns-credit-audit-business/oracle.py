"""Independent quantity and Decimal money ledgers over the complete order-line registry."""
import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
with (root / "data/order_lines.csv").open(newline="", encoding="utf-8") as source:
    lines = {row["order_line_id"]: row for row in csv.DictReader(source, delimiter=";")}
accepted = {line: 0 for line in lines}
with (root / "data/returns.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        if row["status"] == "accepted":
            accepted[row["order_line_id"]] += int(row["qty"])
credited = {line: 0 for line in lines}
money = {line: Decimal(0) for line in lines}
with (root / "data/credits.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        if row["status"] == "posted":
            credited[row["order_line_id"]] += int(row["qty"])
            money[row["order_line_id"]] += Decimal(row["amount"])
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", lineterminator="\n")
    writer.writerow(["order_line_id", "accepted_qty", "credited_qty", "uncovered_qty", "excess_credited_qty", "expected_credit", "actual_credit", "deviation"])
    for line in sorted(lines):
        expected = accepted[line] * Decimal(lines[line]["net_unit_price"])
        actual = money[line]
        writer.writerow([
            line, accepted[line], credited[line], max(accepted[line] - credited[line], 0),
            max(credited[line] - accepted[line], 0),
            *(f"{value:.2f}" for value in [expected, actual, actual - expected]),
        ])
