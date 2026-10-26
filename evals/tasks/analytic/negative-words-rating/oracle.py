#!/usr/bin/env python3
import csv
import math
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row["product_category"], int(row["has_negative_words"]))].append(row)
    result = []
    for key in sorted(groups):
        items = groups[key]
        count = len(items)
        result.append([*key, count,
                       sum(float(row["rating"]) for row in items) / count,
                       sum(float(row["helpful_votes"]) for row in items) / count,
                       100 * sum(float(row["rating"]) <= 2 for row in items) / count])
    return result


COLUMNS = ['product_category', 'has_negative_words', 'reviews', 'avg_rating', 'avg_helpful_votes', 'low_rating_pct']

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
