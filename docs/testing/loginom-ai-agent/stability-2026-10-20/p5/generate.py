#!/usr/bin/env python3
"""Synthetic CSV fixture; deterministic seed 2205, no external inputs."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2205
rng = random.Random(SEED)


def write(name, columns, rows):
    with (ROOT / "data" / name).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)

rows = [[f"AN{i:02}", rng.choice(["Cat", "Dog", "Rabbit"]), status]
        for i, status in enumerate(["Q", "R", "A", "Hold"] * 4, 1)]
rng.shuffle(rows)
write("shelter.csv", ["AnimalID", "Species", "Status"], rows)
