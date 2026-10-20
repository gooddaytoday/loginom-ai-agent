#!/usr/bin/env python3
import csv
import math
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        tenure = float(row["tenure_months"])
        band = "01_le12" if tenure <= 12 else "02_13_36" if tenure <= 36 else "03_gt36"
        groups[band].append(row)
    result = []
    for band in sorted(groups):
        items = groups[band]
        count = len(items)
        churned = sum(int(row["churn"]) == 1 for row in items)
        result.append([band, count, churned, 100 * churned / count,
                       sum(float(row["monthly_charges"]) for row in items) / count,
                       sum(float(row["support_calls"]) for row in items) / count])
    return result


COLUMNS = ['tenure_band', 'customers', 'churned', 'churn_pct', 'avg_monthly_charges', 'avg_support_calls']

def main():
    root = Path(__file__).resolve().parent
    with (root / "data" / "dataset.csv").open(newline="", encoding="utf-8-sig") as source:
        rows = list(csv.DictReader(source))
    with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target, lineterminator="\n")
        writer.writerow(COLUMNS)
        writer.writerows([
            value if isinstance(value, str) else str(value) if isinstance(value, int) else f"{value:.6f}"
            for value in row
        ] for row in calculate(rows))


if __name__ == "__main__":
    main()
