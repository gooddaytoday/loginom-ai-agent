#!/usr/bin/env python3
"""Считает статьи по авторам; пустой author становится Unknown."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[row["author"] or "Unknown"].append(row)
    authors = sorted(groups, key=lambda author: -len(groups[author]))
    write_rows([
        [
            author,
            len(groups[author]),
            sum(float(row["popularity_score"]) for row in groups[author]) / len(groups[author]),
            100 * sum(row["sentiment"] == "positive" for row in groups[author]) / len(groups[author]),
        ]
        for author in authors
    ], ["author", "articles", "avg_popularity", "positive_pct"])


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
