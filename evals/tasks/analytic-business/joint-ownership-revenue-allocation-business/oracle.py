"""Independent Decimal allocation over the complete synthetic orders register."""
import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
ownership = {}
with (root / "data/ownership.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        ownership.setdefault(row["order_id"], []).append((row["owner_id"], Decimal(row["share"])))
with (root / "data/orders.csv").open(newline="", encoding="utf-8") as source:
    orders = sorted(csv.DictReader(source, delimiter=";"), key=lambda row: row["order_id"])
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", lineterminator="\n")
    writer.writerow(["order_id", "owner_id", "revenue", "share", "share_sum", "allocation_status", "allocated_revenue"])
    for order in orders:
        order_id = order["order_id"]
        revenue = Decimal(order["revenue"])
        owners = ownership.get(order_id, [])
        if not owners:
            writer.writerow([order_id, "", str(revenue), "", "", "missing_ownership", ""])
            continue
        share_sum = sum((share for owner, share in owners), Decimal(0))
        valid = abs(share_sum - 1) <= Decimal("0.000001")
        for owner, share in sorted(owners):
            writer.writerow([order_id, owner, str(revenue), str(share), str(share_sum),
                             "valid" if valid else "invalid_share_sum",
                             str(revenue * share) if valid else ""])
