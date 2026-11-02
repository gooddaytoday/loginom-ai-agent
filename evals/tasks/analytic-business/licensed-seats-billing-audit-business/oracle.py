"""Independent seat sets and Decimal bill ledger for a full synthetic month."""
import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
with (root / "data/accounts.csv").open(newline="", encoding="utf-8") as source:
    accounts = {row["account_id"]: row for row in csv.DictReader(source, delimiter=";")}
with (root / "data/plans.csv").open(newline="", encoding="utf-8") as source:
    prices = {row["plan"]: Decimal(row["seat_price"]) for row in csv.DictReader(source, delimiter=";")}
seats = {account: set() for account in accounts}
with (root / "data/seats.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        if row["enabled"] == "1" and row["billable"] == "1":
            seats[row["account_id"]].add(row["seat_id"])
bills = {account: Decimal(0) for account in accounts}
with (root / "data/bills.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        bills[row["account_id"]] += Decimal(row["amount"])
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", lineterminator="\n")
    writer.writerow(["account_id", "active_billable_seats", "minimum_seats", "billed_seats", "expected_bill", "actual_bill", "deviation"])
    for account in sorted(accounts):
        active = len(seats[account])
        minimum = int(accounts[account]["minimum_seats"])
        billed = max(active, minimum)
        expected = billed * prices[accounts[account]["plan"]]
        actual = bills[account]
        writer.writerow([account, active, minimum, billed, *(f"{value:.2f}" for value in [expected, actual, actual - expected])])
