#!/usr/bin/env python3
import csv
from pathlib import Path

CASE = Path(__file__).resolve().parent


def main():
    columns = ["company_id", "industry", "current_ratio", "current_assets", "current_liabilities"]
    with (CASE / "data" / "dataset.csv").open(newline="", encoding="utf-8") as source:
        items = [item for item in csv.DictReader(source) if float(item["current_ratio"]) < 1]
    items.sort(key=lambda item: (float(item["current_ratio"]), int(item["company_id"])))
    with (CASE / "oracle.csv").open("w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target, lineterminator="\n")
        writer.writerow(columns)
        writer.writerows([[item[column] for column in columns] for item in items])


if __name__ == "__main__":
    main()
