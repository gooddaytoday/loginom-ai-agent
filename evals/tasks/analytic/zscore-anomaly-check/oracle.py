#!/usr/bin/env python3
import csv
import math
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    metrics = ("metric_1", "metric_2", "metric_3")
    count = len(rows)
    means = {metric: sum(float(row[metric]) for row in rows) / count for metric in metrics}
    stds = {metric: math.sqrt(sum(float(row[metric]) ** 2 for row in rows) / count - means[metric] ** 2) for metric in metrics}
    tp = fp = fn = tn = 0
    for row in rows:
        predicted = any(abs((float(row[metric]) - means[metric]) / stds[metric]) > 3 for metric in metrics)
        actual = int(row["is_anomaly"]) == 1
        tp += int(predicted and actual)
        fp += int(predicted and not actual)
        fn += int(not predicted and actual)
        tn += int(not predicted and not actual)
    return [[tp, fp, fn, tn, 100 * tp / (tp + fp) if tp + fp else 0.0,
             100 * tp / (tp + fn) if tp + fn else 0.0]]


COLUMNS = ['tp', 'fp', 'fn', 'tn', 'precision', 'recall']

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
