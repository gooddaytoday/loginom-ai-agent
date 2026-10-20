#!/usr/bin/env python3
import csv
import math
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(lambda: defaultdict(list))
    for row in rows:
        groups[row["department"]][row["work_type"]].append(float(row["productivity_score"]))
    result = []
    for department, kinds in groups.items():
        office = kinds["Office"]
        remote = kinds["Remote"]
        hybrid = kinds["Hybrid"]
        avg_office = sum(office) / len(office)
        avg_remote = sum(remote) / len(remote)
        result.append([department, len(office), avg_office, len(remote), avg_remote,
                       len(hybrid), sum(hybrid) / len(hybrid), avg_remote - avg_office])
    return sorted(result, key=lambda row: (-row[-1], row[0]))


COLUMNS = ['department', 'office_employees', 'avg_office_productivity', 'remote_employees', 'avg_remote_productivity', 'hybrid_employees', 'avg_hybrid_productivity', 'remote_minus_office']

def main():
    root = Path(__file__).resolve().parent
    with (root / "data" / "dataset.csv").open(newline="", encoding="utf-8-sig") as source:
        rows = list(csv.DictReader(source))
    with (root / "oracle.csv").open("w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target, lineterminator="\n")
        writer.writerow(COLUMNS)
        writer.writerows([
            value if isinstance(value, str) else str(value) if isinstance(value, int) else f"{value:.6f}"
            for value in row
        ] for row in calculate(rows))


if __name__ == "__main__":
    main()
