import csv
import sys
from collections import defaultdict
from decimal import Decimal

totals = defaultdict(Decimal)
with open(sys.argv[1], newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source):
        totals[row["Category"]] += Decimal(row["Revenue"]) - Decimal(row["Cost"])
writer = csv.writer(sys.stdout, lineterminator="\n")
writer.writerow(["Category", "Profit"])
writer.writerows(sorted(totals.items(), key=lambda pair: (-pair[1], pair[0])))
