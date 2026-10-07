#!/usr/bin/env python3
"""Считает показатели поддержки в порядке critical, high, medium, low."""
import csv
from pathlib import Path

ORDER = ["critical", "high", "medium", "low"]


def main():
    rows = read_rows()
    write_rows([metrics(priority, [row for row in rows if row["priority"] == priority]) for priority in ORDER], [
        "priority", "tickets", "avg_response_min", "avg_resolution_hours", "fcr_pct", "avg_satisfaction",
    ])


def metrics(priority, rows):
    count = len(rows)
    return [
        priority,
        count,
        sum(float(row["response_time_min"]) for row in rows) / count,
        sum(float(row["resolution_time_hours"]) for row in rows) / count,
        100 * sum(int(row["first_contact_resolution"]) for row in rows) / count,
        sum(int(row["satisfaction"]) for row in rows) / count,
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
