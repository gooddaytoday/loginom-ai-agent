#!/usr/bin/env python3
import csv
import math
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    counts = [[0, 0, 0, 0] for _ in range(4)]
    for row in rows:
        counts[int(row["segment"])][int(row["predicted_segment"])] += 1
    return [[segment, *counts[segment]] for segment in range(4)]


COLUMNS = ['segment', 'predicted_0', 'predicted_1', 'predicted_2', 'predicted_3']

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
