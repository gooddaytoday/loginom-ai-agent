#!/usr/bin/env python3
"""Считает средний эффект и долю побочных эффектов по группе и дозе."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        groups[(row["treatment_group"], int(row["dosage_mg"]))].append(row)
    write_rows([
        [group, dosage, len(groups[(group, dosage)]), improvement(groups[(group, dosage)]), side_pct(groups[(group, dosage)])]
        for group, dosage in sorted(groups)
    ], ["treatment_group", "dosage_mg", "patients", "avg_improvement", "side_effect_pct"])


def improvement(rows):
    return sum(float(row["improvement"]) for row in rows) / len(rows)


def side_pct(rows):
    return 100 * sum(row["side_effects"] != "None" for row in rows) / len(rows)


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
