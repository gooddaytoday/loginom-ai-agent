#!/usr/bin/env python3
"""Считает средний чек и долю возвратов по числу категорий в заказе."""
import csv
from collections import defaultdict
from pathlib import Path

FLAGS = ["has_electronics", "has_clothing", "has_books", "has_home", "has_sports"]


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[sum(int(row[flag]) for flag in FLAGS)].append(row)
    write_rows([
        [
            width,
            len(groups[width]),
            sum(float(row["order_value"]) for row in groups[width]) / len(groups[width]),
            100 * sum(int(row["returned"]) for row in groups[width]) / len(groups[width]),
        ]
        for width in sorted(groups)
    ], ["category_count", "orders", "avg_order_value", "return_pct"])


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
