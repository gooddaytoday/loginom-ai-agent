#!/usr/bin/env python3
"""Считает число, среднее, максимум суммы и средний возраст счёта для fraud 0 и 1."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[int(row["fraud"])].append(row)
    write_rows([metrics(flag, groups[flag]) for flag in sorted(groups)], [
        "fraud", "transactions", "avg_amount", "max_amount", "avg_account_age_days",
    ])


def metrics(flag, rows):
    count = len(rows)
    amounts = [float(row["amount"]) for row in rows]
    return [flag, count, sum(amounts) / count, max(amounts), sum(int(row["account_age_days"]) for row in rows) / count]


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
    if isinstance(value, int):
        return str(value)
    return f"{value:.6f}".rstrip("0").rstrip(".")


if __name__ == "__main__":
    main()
