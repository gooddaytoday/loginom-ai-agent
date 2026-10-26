#!/usr/bin/env python3
import csv
import math
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row["price_level"], row["quality"])].append(row)
    result = []
    for key, items in groups.items():
        count = len(items)
        result.append([*key, count,
                       sum(float(row["purchase_intent"]) for row in items) / count,
                       sum(float(row["rating"]) for row in items) / count,
                       100 * sum(float(row["purchase_intent"]) >= 7 for row in items) / count])
    return sorted(result, key=lambda row: (-row[3], row[0], row[1]))


COLUMNS = ['price_level', 'quality', 'respondents', 'avg_purchase_intent', 'avg_rating', 'high_intent_pct']

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
