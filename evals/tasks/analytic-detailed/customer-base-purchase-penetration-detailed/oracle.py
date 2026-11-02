"""Independent buyer sets and Decimal revenue over the complete synthetic customer base."""
import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
with (root / "data/customers.csv").open(newline="", encoding="utf-8") as source:
    customers = {row["customer_id"]: row["segment"] for row in csv.DictReader(source, delimiter=";")}
buyers = set()
revenue = {customer: Decimal(0) for customer in customers}
with (root / "data/sales_lines.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        buyers.add(row["customer_id"])
        revenue[row["customer_id"]] += Decimal(row["amount"])
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", lineterminator="\n")
    writer.writerow(["segment", "customers", "buyers", "buyer_share", "revenue", "revenue_per_customer"])
    for segment in sorted(set(customers.values())):
        members = {customer for customer in customers if customers[customer] == segment}
        count = len(members)
        purchased = len(members & buyers)
        amount = sum((revenue[customer] for customer in members), Decimal(0))
        writer.writerow([segment, count, purchased, str(Decimal(purchased) / count), f"{amount:.2f}", f"{amount / count:.2f}"])
