#!/usr/bin/env python3
import csv
import math
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    result = []
    for subject in ("math_score", "reading_score", "writing_score"):
        values = [float(row[subject]) for row in rows]
        count = len(values)
        mean = sum(values) / count
        variance = sum(value * value for value in values) / count - mean * mean
        result.append([subject, count, mean, min(values), max(values), math.sqrt(variance)])
    return result


COLUMNS = ['subject', 'students', 'mean_score', 'min_score', 'max_score', 'population_stddev']

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
