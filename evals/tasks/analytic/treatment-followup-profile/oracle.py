#!/usr/bin/env python3
import csv
import math
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row["treatment"]].append(row)
    result = []
    for treatment in sorted(groups):
        items = groups[treatment]
        count = len(items)
        events = sum(int(row["event_occurred"]) == 1 for row in items)
        censored = sum(int(row["event_occurred"]) == 0 for row in items)
        result.append([treatment, count, events, censored, 100 * censored / count,
                       sum(float(row["time_months"]) for row in items) / count])
    return result


COLUMNS = ['treatment', 'patients', 'events', 'censored', 'censored_pct', 'avg_time_months']

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
