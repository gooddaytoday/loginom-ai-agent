#!/usr/bin/env python3
"""Сводит конверсии по первому касанию и по последнему касанию, пропуская None."""
import csv
from collections import defaultdict
from pathlib import Path


def main():
    first = defaultdict(lambda: [0, 0.0])
    last = defaultdict(lambda: [0, 0.0])
    for row in read_rows():
        value = float(row["conversion_value"])
        first[row["touchpoint_1"]][0] += 1
        first[row["touchpoint_1"]][1] += value
        channel = last_touch(row)
        last[channel][0] += 1
        last[channel][1] += value
    channels = sorted(first, key=lambda channel: -first[channel][0])
    write_rows([
        [channel, first[channel][0], first[channel][1], last[channel][0], last[channel][1]]
        for channel in channels
    ], ["channel", "first_touch_conversions", "first_touch_value", "last_touch_conversions", "last_touch_value"])


def last_touch(row):
    for name in ("touchpoint_3", "touchpoint_2", "touchpoint_1"):
        if row[name] != "None":
            return row[name]
    raise SystemExit("у конверсии нет касания")


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
