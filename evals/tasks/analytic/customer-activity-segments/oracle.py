#!/usr/bin/env python3
"""Делит клиентов на active, at_risk и churned по давности покупки."""
import csv
from collections import defaultdict
from pathlib import Path

ORDER = ["active", "at_risk", "churned"]


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[segment(int(row["days_since_last_purchase"]))].append(row)
    write_rows([metrics(name, groups[name]) for name in ORDER], [
        "segment", "customers", "avg_total_spent", "avg_transactions", "avg_order_value",
    ])


def segment(days):
    if days <= 90:
        return "active"
    if days <= 180:
        return "at_risk"
    return "churned"


def metrics(name, rows):
    count = len(rows)
    return [
        name,
        count,
        sum(float(row["total_spent"]) for row in rows) / count,
        sum(int(row["total_transactions"]) for row in rows) / count,
        sum(float(row["avg_order_value"]) for row in rows) / count,
    ]


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
