#!/usr/bin/env python3
"""Сводит одобренные заявки с fraud_score строго больше 0.8 по типу полиса."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    groups = defaultdict(list)
    for row in read_rows():
        if row["claim_status"] == "Approved" and float(row["fraud_score"]) > 0.8:
            groups[row["policy_type"]].append(row)
    policies = sorted(groups, key=lambda policy: -sum(float(row["payout_amount"]) for row in groups[policy]))
    write_rows([
        [
            policy,
            len(groups[policy]),
            sum(float(row["claim_amount"]) for row in groups[policy]),
            sum(float(row["payout_amount"]) for row in groups[policy]),
            sum(float(row["fraud_score"]) for row in groups[policy]) / len(groups[policy]),
        ]
        for policy in policies
    ], ["policy_type", "claims", "total_claimed", "total_payout", "avg_fraud_score"])


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
