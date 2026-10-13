#!/usr/bin/env python3
"""Считает средний риск и долю риска выше 0.5 по сроку кредита."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[int(row["loan_term_months"])].append(row)
    write_rows([metrics(term, groups[term]) for term in sorted(groups)], [
        "loan_term_months", "loans", "avg_default_risk", "high_risk_pct",
    ])


def metrics(term, rows):
    count = len(rows)
    return [
        term,
        count,
        sum(float(row["default_risk_score"]) for row in rows) / count,
        100 * sum(float(row["default_risk_score"]) > 0.5 for row in rows) / count,
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
