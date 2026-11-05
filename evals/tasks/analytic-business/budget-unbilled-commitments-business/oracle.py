"""Independent Decimal expense and remaining-order ledgers over the complete budget registry."""
import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
with (root / "data/budgets.csv").open(newline="", encoding="utf-8") as source:
    budgets = {(row["cost_center"], row["budget_item"]): Decimal(row["limit_amount"]) for row in csv.DictReader(source, delimiter=";")}
with (root / "data/orders.csv").open(newline="", encoding="utf-8") as source:
    orders = list(csv.DictReader(source, delimiter=";"))
spent = {key: Decimal(0) for key in budgets}
order_spent = {row["order_id"]: Decimal(0) for row in orders}
with (root / "data/expenses.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        amount = Decimal(row["amount"])
        spent[row["cost_center"], row["budget_item"]] += amount
        if row["order_id"]:
            order_spent[row["order_id"]] += amount
open_commitments = {key: Decimal(0) for key in budgets}
for row in orders:
    if row["status"] == "active":
        open_commitments[row["cost_center"], row["budget_item"]] += max(Decimal(row["committed_amount"]) - order_spent[row["order_id"]], Decimal(0))
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", lineterminator="\n")
    writer.writerow(["cost_center", "budget_item", "limit_amount", "spent", "open_commitments", "available"])
    for key in sorted(budgets):
        writer.writerow([*key, *(f"{value:.2f}" for value in [budgets[key], spent[key], open_commitments[key], budgets[key] - spent[key] - open_commitments[key]])])
