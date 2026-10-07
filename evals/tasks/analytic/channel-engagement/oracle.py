#!/usr/bin/env python3
"""Считает простое среднее вовлечённости в процентах, без веса просмотров."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[row["channel"]].append(row)
    ranked = sorted(groups, key=lambda name: -sum(float(row["views"]) for row in groups[name]))
    write_rows([
        [
            name,
            len(groups[name]),
            sum(float(row["views"]) for row in groups[name]),
            sum(float(row["forwards"]) for row in groups[name]),
            100 * sum(float(row["engagement_rate"]) for row in groups[name]) / len(groups[name]),
        ]
        for name in ranked
    ], ["channel", "messages", "total_views", "total_forwards", "avg_engagement_pct"])


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
