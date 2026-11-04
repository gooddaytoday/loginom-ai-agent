"""Independent raw sales ledger over the complete synthetic operating calendar."""
import csv
from datetime import datetime
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
ledger = {}
with (root / "data/sales_lines.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        key = (row["store_id"], datetime.fromisoformat(row["timestamp"]).date().isoformat())
        ledger[key] = ledger.get(key, Decimal(0)) + Decimal(row["amount"])
groups = {}
with (root / "data/operating_calendar.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        key = (row["region"], row["date"][:7], row["day_type"])
        values = groups.setdefault(key, [0, Decimal(0)])
        values[0] += 1
        values[1] += ledger.get((row["store_id"], row["date"]), Decimal(0))
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", quotechar='"', lineterminator="\n")
    writer.writerow(["region", "month", "day_type", "open_store_days", "revenue", "revenue_per_store_day"])
    for key, (days, revenue) in sorted(groups.items()):
        writer.writerow([*key, days, format(revenue, ".6f"), format(revenue / Decimal(days), ".6f")])
