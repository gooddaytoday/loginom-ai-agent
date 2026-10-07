#!/usr/bin/env python3
import csv
from collections import defaultdict
from pathlib import Path

CASE = Path(__file__).resolve().parent


def main():
    groups = defaultdict(list)
    with (CASE / "data" / "dataset.csv").open(newline="", encoding="utf-8") as source:
        for item in csv.DictReader(source):
            groups[item["category"]].append(item)
    rows = []
    for key, items in groups.items():
        count = len(items)
        rows.append([key, count, total(items, "total"), total(items, "quantity") / count, total(items, "unit_price") / count])
    rows.sort(key=lambda row: -row[2])
    write(["category", "transactions", "revenue", "avg_quantity", "avg_unit_price"], rows)


def total(items, column):
    return sum(float(item[column]) for item in items)


def write(header, rows):
    with (CASE / "oracle.csv").open("w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(
            [[cell if isinstance(cell, (str, int)) else f"{cell:.6f}".rstrip("0").rstrip(".") for cell in row] for row in rows]
        )


if __name__ == "__main__":
    main()
