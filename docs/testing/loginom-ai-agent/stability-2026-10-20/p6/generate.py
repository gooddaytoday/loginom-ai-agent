#!/usr/bin/env python3
"""Synthetic CSV fixture; deterministic seed 2206, no external inputs."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2206
rng = random.Random(SEED)


def write(name, columns, rows):
    with (ROOT / "data" / name).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)

rows = []
for i, free in enumerate([0, 1, 20, 0, 5, 10, 0, 30, 1, 0, 12, 8, 0, 15, 2, 0], 1):
    capacity = rng.choice([80, 100, 120])
    rows.append([f"SH{i:02}", rng.choice(["Main", "Small"]), capacity, capacity - free])
rng.shuffle(rows)
write("theatre.csv", ["ShowID", "Stage", "Capacity", "Reserved"], rows)
