#!/usr/bin/env python3
"""Считает оборачиваемость и маржу категории из сумм, а не из средних долей."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[row["category"]].append(row)
    rows = [metrics(category, groups[category]) for category in groups]
    rows.sort(key=lambda row: -row[5])
    write_rows(rows, ["category", "products", "total_stock", "total_demand", "turnover", "margin_pct"])


def metrics(category, rows):
    stock = sum(int(row["stock_level"]) for row in rows)
    demand = sum(int(row["demand_30d"]) for row in rows)
    selling = sum(float(row["selling_price"]) for row in rows)
    cost = sum(float(row["cost_price"]) for row in rows)
    return [category, len(rows), stock, demand, demand / stock, (selling - cost) / selling * 100]


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
