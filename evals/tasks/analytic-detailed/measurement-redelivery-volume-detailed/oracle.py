import csv
from collections import Counter
from pathlib import Path

root = Path(__file__).parent
counts = Counter()
measurements = {}
with (root / "data/deliveries.csv").open(encoding="utf-8", newline="") as stream:
    for row in csv.DictReader(stream, delimiter=";"):
        counts[row["device"]] += 1
        measurements[row["measurement_id"]] = (row["device"], int(row["quantity"]))
totals = {}
for device, quantity in measurements.values():
    values = totals.setdefault(device, [0, 0])
    values[0] += 1
    values[1] += quantity
with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.writer(stream, delimiter=";", lineterminator="\n")
    writer.writerow(["device", "deliveries", "measurements", "repeated_deliveries", "total_quantity"])
    for device in sorted(counts):
        facts, quantity = totals[device]
        writer.writerow([device, counts[device], facts, counts[device] - facts, quantity])
