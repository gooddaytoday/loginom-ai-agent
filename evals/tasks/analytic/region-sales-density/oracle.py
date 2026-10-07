#!/usr/bin/env python3
"""Считает выручку на квадратный метр из сумм региона, а не среднее частных."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[row["region"]].append(row)
    ranked = sorted(groups, key=lambda name: -density(groups[name]))
    write_rows([
        [name, len(groups[name]), total(groups[name], "monthly_sales"), total(groups[name], "store_area"), density(groups[name])]
        for name in ranked
    ], ["region", "stores", "total_sales", "total_area", "sales_per_sqm"])


def total(rows, column):
    return sum(float(row[column]) for row in rows)


def density(rows):
    return total(rows, "monthly_sales") / total(rows, "store_area")


def read_rows():
    with (Path(__file__).parent / "data" / "dataset.csv").open(newline="", encoding="utf-8") as source:
        return list(csv.DictReader(source))


def write_rows(rows, header):
    with (Path(__file__).parent / "oracle.csv").open("w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target, lineterminator="\n")
        writer.writerow(header)
        writer.writerows([[format_cell(value) for value in row] for row in rows])


def format_cell(value):
    if isinstance(value, str):
        return value
    if isinstance(value, int) or (isinstance(value, float) and value.is_integer()):
        return str(int(value))
    return f"{value:.6f}".rstrip("0").rstrip(".")


if __name__ == "__main__":
    main()
