#!/usr/bin/env python3
"""Synthetic CSV fixture; deterministic seed 2204, no external inputs."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2204
rng = random.Random(SEED)


def write(name, columns, rows):
    with (ROOT / "data" / name).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)

sugars = [21.75, 22, 22.25, 20, 23, 22, 21, 24, 25, 19.5, 22.5, 21.5, 23.75, 20.25, 22, 24.25]
acidities = [4 + i / 4 for i in range(16)]
rng.shuffle(acidities)
rows = [[f"GR{i:02}", rng.choice(["East", "Hill", "River"]), f"{sugar:.2f}", f"{acid:.2f}"]
        for i, (sugar, acid) in enumerate(zip(sugars, acidities), 1)]
rng.shuffle(rows)
write("grapes.csv", ["SampleID", "Plot", "Sugar", "Acidity"], rows)
