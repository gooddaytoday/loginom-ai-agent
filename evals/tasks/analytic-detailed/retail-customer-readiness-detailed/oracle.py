import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).parent
with (root / "data/categories.csv").open(encoding="utf-8", newline="") as stream:
    categories = sorted(csv.DictReader(stream, delimiter=";"), key=lambda row: int(row["sort_order"]))
totals = {row["quality_bucket"]: [0, set(), Decimal(0)] for row in categories}
for name in ["uci-retail.csv", "synthetic-boundary.csv"]:
    with (root / "data" / name).open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream, delimiter=";"):
            bucket = (
                "missing_customer" if row["CustomerID"] == "" else
                "missing_description" if row["Description"] == "" else
                "credit_note" if row["InvoiceNo"].startswith("C") else
                "sale"
            )
            totals[bucket][0] += 1
            totals[bucket][1].add(row["InvoiceNo"])
            totals[bucket][2] += Decimal(row["Quantity"]) * Decimal(row["UnitPrice"])
with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.writer(stream, delimiter=";", lineterminator="\n")
    writer.writerow(["quality_bucket", "rows", "invoices", "signed_revenue"])
    for category in categories:
        bucket = category["quality_bucket"]
        rows, invoices, revenue = totals[bucket]
        writer.writerow([bucket, rows, len(invoices), revenue])
