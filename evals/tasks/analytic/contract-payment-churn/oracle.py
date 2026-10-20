#!/usr/bin/env python3
import csv
import math
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row["contract_type"], row["payment_method"])].append(row)
    result = []
    for key, items in groups.items():
        count = len(items)
        churned = sum(int(row["churn"]) == 1 for row in items)
        result.append([*key, count, churned, 100 * churned / count,
                       sum(float(row["monthly_charges"]) for row in items) / count])
    return sorted(result, key=lambda row: (-row[4], row[0], row[1]))


COLUMNS = ['contract_type', 'payment_method', 'customers', 'churned', 'churn_pct', 'avg_monthly_charges']

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
