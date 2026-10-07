#!/usr/bin/env python3
"""Считает уровень брака по линии и смене из сумм, а не из среднего defect_rate."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[(row["production_line"], row["shift"])].append(row)
    pairs = sorted(groups, key=lambda pair: -rate(groups[pair]))
    write_rows([
        [
            line,
            shift,
            len(groups[(line, shift)]),
            sum(int(row["total_produced"]) for row in groups[(line, shift)]),
            sum(int(row["defect_count"]) for row in groups[(line, shift)]),
            rate(groups[(line, shift)]),
        ]
        for line, shift in pairs
    ], ["production_line", "shift", "batches", "total_produced", "defects", "defect_rate_pct"])


def rate(rows):
    return 100 * sum(int(row["defect_count"]) for row in rows) / sum(int(row["total_produced"]) for row in rows)


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
