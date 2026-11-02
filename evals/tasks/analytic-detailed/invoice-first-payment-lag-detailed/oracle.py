import csv
from datetime import datetime
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
snapshot = datetime.fromisoformat("2026-03-01T00:00:00")
columns = ["issue_month", "invoices", "prepayment", "same_month", "next_month", "later", "no_payment"]
first = {}
with (root / "data/payments.csv").open(encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f, delimiter=";"):
        paid = datetime.fromisoformat(row["paid_at"])
        if row["status"] != "posted" or Decimal(row["amount"]) <= 0 or paid > snapshot:
            continue
        first[row["invoice_id"]] = min(first.get(row["invoice_id"], paid), paid)

totals = {}
with (root / "data/invoices.csv").open(encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f, delimiter=";"):
        issued = datetime.fromisoformat(row["issued_at"])
        if issued > snapshot:
            continue
        group = totals.setdefault(issued.strftime("%Y-%m"), dict.fromkeys(columns[1:], 0))
        paid = first.get(row["invoice_id"])
        category = "no_payment"
        if paid is not None:
            category = "prepayment"
            if paid >= issued:
                lag = 12 * (paid.year - issued.year) + paid.month - issued.month
                category = {0: "same_month", 1: "next_month"}.get(lag, "later")
        group["invoices"] += 1
        group[category] += 1

with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=columns, delimiter=";", quotechar='"', lineterminator="\n")
    writer.writeheader()
    writer.writerows({"issue_month": month, **totals[month]} for month in sorted(totals))
