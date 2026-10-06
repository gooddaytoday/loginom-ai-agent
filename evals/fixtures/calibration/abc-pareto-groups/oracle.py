#!/usr/bin/env python3
import csv
from collections import defaultdict
from pathlib import Path

CASE = Path(__file__).resolve().parent


def main():
    with (CASE / "data" / "dataset.csv").open(newline="", encoding="utf-8") as source:
        items = sorted(csv.DictReader(source), key=lambda item: -float(item["annual_revenue"]))
    revenue = sum(float(item["annual_revenue"]) for item in items)
    classes = defaultdict(list)
    cumulative = 0.0
    for item in items:
        cumulative += float(item["annual_revenue"])
        share = cumulative / revenue
        classes["A" if share <= 0.8 else "B" if share <= 0.95 else "C"].append(item)
    rows = []
    for key, group in sorted(classes.items()):
        group_revenue = sum(float(item["annual_revenue"]) for item in group)
        rows.append(
            [
                key,
                len(group),
                group_revenue,
                100 * group_revenue / revenue,
                sum(float(item["profit"]) for item in group),
                sum(float(item["total_storage_cost"]) for item in group),
            ]
        )
    write(["abc_class", "items", "revenue", "revenue_share_pct", "profit", "storage_cost"], rows)


def write(header, rows):
    with (CASE / "oracle.csv").open("w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(
            [[cell if isinstance(cell, (str, int)) else f"{cell:.6f}".rstrip("0").rstrip(".") for cell in row] for row in rows]
        )


if __name__ == "__main__":
    main()
