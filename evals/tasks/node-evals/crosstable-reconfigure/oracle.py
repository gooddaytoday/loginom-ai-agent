import csv
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
groups = defaultdict(list)
with (root / "data/sales.csv").open(newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source):
        groups[row["Region"], row["Category"]].append(Decimal(row["Amount"]))

def write(name, average):
    with (root / name).open("w", newline="", encoding="utf-8") as output:
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(["Region", "A", "B"])
        for region in ["N", "S"]:
            values = []
            for category in ["A", "B"]:
                amounts = groups[region, category]
                total = sum(amounts, Decimal(0))
                values.append(str(total / len(amounts) if average else total))
            writer.writerow([region, *values])

write("oracle.csv", True)
write("initial-oracle.csv", False)
