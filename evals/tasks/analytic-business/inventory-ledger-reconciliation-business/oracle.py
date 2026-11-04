"""Independent inventory ledger from raw synthetic registry, movements and count."""
import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
with (root / "data/opening_stock.csv").open(newline="", encoding="utf-8") as source:
    opening = {(row["sku"], row["warehouse"]): row for row in csv.DictReader(source, delimiter=";")}
ledger = {key: [Decimal(0), Decimal(0)] for key in opening}
with (root / "data/movements.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source, delimiter=";"):
        ledger[(row["sku"], row["warehouse"])][0 if row["direction"] == "in" else 1] += Decimal(row["qty"])
with (root / "data/physical_count.csv").open(newline="", encoding="utf-8") as source:
    counts = {(row["sku"], row["warehouse"]): Decimal(row["counted_qty"]) for row in csv.DictReader(source, delimiter=";")}
with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as result:
    writer = csv.writer(result, delimiter=";", lineterminator="\n")
    writer.writerow(["sku", "warehouse", "opening_qty", "received_qty", "issued_qty", "expected_qty", "counted_qty", "quantity_deviation", "value_deviation"])
    for key in sorted(opening):
        initial = Decimal(opening[key]["opening_qty"])
        received, issued = ledger[key]
        expected = initial + received - issued
        difference = counts[key] - expected
        value = difference * Decimal(opening[key]["unit_cost"])
        writer.writerow([*key, int(initial), int(received), int(issued), int(expected), int(counts[key]), int(difference), f"{value:.2f}"])
