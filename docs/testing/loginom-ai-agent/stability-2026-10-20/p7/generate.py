#!/usr/bin/env python3
"""Synthetic CSV fixture; deterministic seed 2207, no external inputs."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2207
rng = random.Random(SEED)


def write(name, columns, rows):
    with (ROOT / "data" / name).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)

materials = [[f"M{i:02}", name] for i, name in enumerate([
    "Clay", "Flint", "Bronze", "Iron", "Glass", "Bone", "Wood", "Stone", "Shell", "Gold", "Silver", "Lead"], 1)]
finds = [[f"FD{i:02}", rng.choice(["T-A", "T-B", "T-C"]), materials[(i - 1) % 12][0]]
         for i in range(1, 19)]
rng.shuffle(materials)
rng.shuffle(finds)
write("materials.csv", ["MaterialCode", "Material"], materials)
write("finds.csv", ["FindID", "Trench", "MaterialCode"], finds)
