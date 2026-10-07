#!/usr/bin/env python3
"""Считает долю доставок строго дольше 15 дней по поставщику."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[row["supplier"]].append(row)
    ranked = sorted(groups, key=lambda name: -share(groups[name]))
    write_rows([
        [
            name,
            len(groups[name]),
            slow(groups[name]),
            share(groups[name]),
            sum(float(row["quality_score"]) for row in groups[name]) / len(groups[name]),
            sum(float(row["order_cost"]) for row in groups[name]),
        ]
        for name in ranked
    ], ["supplier", "orders", "slow_orders", "slow_pct", "avg_quality", "total_cost"])


def slow(rows):
    return sum(float(row["delivery_days"]) > 15 for row in rows)


def share(rows):
    return 100 * slow(rows) / len(rows)


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
