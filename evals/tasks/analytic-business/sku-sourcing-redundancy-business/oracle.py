"""Independent full catalog classification using active supplier sets per SKU."""
import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
suppliers = {}
with (root / "data/supplier_quotes.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        if row["active"] == "1":
            suppliers.setdefault(row["sku"], set()).add(row["supplier_id"])
groups = {}
with (root / "data/products.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        count = len(suppliers.get(row["sku"], set()))
        values = groups.setdefault(row["category"], [0, 0, 0, 0])
        values[0] += 1
        values[1 if count == 0 else 2 if count == 1 else 3] += 1
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", quotechar='"', lineterminator="\n")
    writer.writerow(["category", "products", "no_supplier", "one_supplier", "multiple_suppliers", "single_source_share"])
    for category, counts in sorted(groups.items()):
        writer.writerow([category, *counts, str(Decimal(counts[2]) / Decimal(counts[0]))])
