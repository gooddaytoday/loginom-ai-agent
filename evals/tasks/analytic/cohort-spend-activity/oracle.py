#!/usr/bin/env python3
"""Считает расходы и долю активных по текстовой метке когорты."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[row["cohort"]].append(row)
    write_rows([
        [
            name,
            len(groups[name]),
            sum(float(row["months_active"]) for row in groups[name]) / len(groups[name]),
            sum(float(row["total_spend"]) for row in groups[name]),
            100 * sum(int(row["is_active"]) for row in groups[name]) / len(groups[name]),
        ]
        for name in sorted(groups)
    ], ["cohort", "users", "avg_months_active", "total_spend", "active_pct"])


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
