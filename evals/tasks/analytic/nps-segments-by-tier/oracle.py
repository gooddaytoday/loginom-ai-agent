#!/usr/bin/env python3
"""Считает средний балл и доли промоутеров и противников по тарифу."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[row["customer_tier"]].append(row)
    ranked = sorted(groups, key=lambda name: -average(groups[name]))
    write_rows([
        [name, len(groups[name]), average(groups[name]), promoters(groups[name]), detractors(groups[name])]
        for name in ranked
    ], ["customer_tier", "respondents", "avg_nps_score", "promoters_pct", "detractors_pct"])


def scores(rows):
    return [float(row["nps_score"]) for row in rows]


def average(rows):
    return sum(scores(rows)) / len(rows)


def promoters(rows):
    return 100 * sum(score >= 7 for score in scores(rows)) / len(rows)


def detractors(rows):
    return 100 * sum(score < 0 for score in scores(rows)) / len(rows)


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
