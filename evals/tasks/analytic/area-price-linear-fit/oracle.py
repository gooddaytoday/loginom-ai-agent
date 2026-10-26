#!/usr/bin/env python3
import csv
import math
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    count = len(rows)
    x = [float(row["area_sqm"]) for row in rows]
    y = [float(row["price"]) for row in rows]
    sx = sum(x)
    sy = sum(y)
    a = count * sum(value * value for value in x) - sx * sx
    b = count * sum(value * value for value in y) - sy * sy
    c = count * sum(first * second for first, second in zip(x, y)) - sx * sy
    slope = c / a
    return [[count, slope, sy / count - slope * sx / count, c * c / (a * b)]]


COLUMNS = ['houses', 'slope', 'intercept', 'r_squared']

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
