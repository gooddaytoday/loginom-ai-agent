#!/usr/bin/env python3
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    with (Path(__file__).parent / "data" / "dataset.csv").open(newline="", encoding="utf-8") as source:
        for row in csv.DictReader(source):
            groups[row['season']].append(row)
    ranked = sorted(groups, key=lambda name: -(sum(float(row["dynamic_price"]) for row in groups[name]) / sum(float(row["base_price"]) for row in groups[name]) * 100 - 100))
    rows = []
    for name in ranked:
        items = groups[name]
        rows.append([name, len(items), sum(float(row["units_sold"]) for row in items), sum(float(row["base_price"]) for row in items) / len(items), sum(float(row["dynamic_price"]) for row in items) / len(items), (sum(float(row["dynamic_price"]) for row in items) / len(items)) / (sum(float(row["base_price"]) for row in items) / len(items)) * 100 - 100])
    with (Path(__file__).parent / "oracle.csv").open("w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target, lineterminator="\n")
        writer.writerow(['season', 'products', 'units', 'avg_base_price', 'avg_dynamic_price', 'markup_pct'])
        for row in rows:
            writer.writerow([format_cell(value) for value in row])


def format_cell(value):
    if isinstance(value, str):
        return value
    if isinstance(value, int) or (isinstance(value, float) and value.is_integer()):
        return str(int(value))
    return f"{value:.6f}".rstrip("0").rstrip(".")


if __name__ == "__main__":
    main()
