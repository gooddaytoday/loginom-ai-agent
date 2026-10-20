#!/usr/bin/env python3
"""Synthetic CSV fixture; deterministic seed 2203, no external inputs."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2203
rng = random.Random(SEED)


def write(name, columns, rows):
    with (ROOT / "data" / name).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)

rows = [[f"Slot{i:02}", hall, rng.randint(1, 30)]
        for i, hall in enumerate(["Ancient", "Modern", "Nature"] * 6, 1)]
rng.shuffle(rows)
write("museum.csv", ["Slot", "Hall", "Visits"], rows)
