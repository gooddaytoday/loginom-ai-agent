#!/usr/bin/env python3
"""Synthetic CSV fixture; deterministic seed 2201, no external inputs."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2201
rng = random.Random(SEED)


def write(name, columns, rows):
    with (ROOT / "data" / name).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)

rows = [[f"BK{i:02}", rng.choice(["Fiction", "Science", "History"]), days]
        for i, days in enumerate([0, 1, 7, 8, 12, 0, 6, 9, 21, 3, 7, 14, 2, 8, 30, 4], 1)]
rng.shuffle(rows)
write("library.csv", ["BookID", "Shelf", "DaysOverdue"], rows)
