#!/usr/bin/env python3
"""Считает помесячный спрос из data/dataset.csv."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[int(row["date"][5:7])].append(row)
    write_rows([
        [
            month,
            len(groups[month]),
            total(groups[month], "daily_demand"),
            total(groups[month], "daily_demand") / len(groups[month]),
            max(float(row["daily_demand"]) for row in groups[month]),
            sum(int(row["promotion"]) for row in groups[month]),
        ]
        for month in range(1, 13)
    ], ["month", "days", "total_demand", "avg_demand", "max_demand", "promo_days"])


def read_rows():
    with (Path(__file__).parent / "data" / "dataset.csv").open(newline="", encoding="utf-8") as source:
        return list(csv.DictReader(source))


def total(rows, column):
    return sum(float(row[column]) for row in rows)


def write_rows(rows, header):
    with (Path(__file__).parent / "oracle.csv").open("w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target, lineterminator="\n")
        writer.writerow(header)
        writer.writerows([[format_cell(value) for value in row] for row in rows])


def format_cell(value):
    if isinstance(value, str):
        return value
    if isinstance(value, int):
        return str(value)
    return f"{value:.6f}".rstrip("0").rstrip(".")


if __name__ == "__main__":
    main()
