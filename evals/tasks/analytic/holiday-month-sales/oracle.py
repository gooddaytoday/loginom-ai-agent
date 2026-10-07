#!/usr/bin/env python3
import csv
from collections import defaultdict
from pathlib import Path

def main():
    groups = defaultdict(list)
    with (Path(__file__).parent / "data" / "dataset.csv").open(newline="", encoding="utf-8") as source:
        for row in csv.DictReader(source):
            groups[row["holidays"]].append(row)
    ranked = sorted(groups, key=lambda name: -sum(float(row["sales"]) for row in groups[name]))
    rows = []
    for name in ranked:
        items = groups[name]
        sales = [float(row["sales"]) for row in items]
        budget = [float(row["advertising_budget"]) for row in items]
        rows.append([name, len(items), sum(sales), sum(sales)/len(items), sum(budget)])
    with (Path(__file__).parent / "oracle.csv").open("w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target, lineterminator="\n")
        writer.writerow(["holidays", "months", "total_sales", "avg_sales", "advertising_budget"])
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
