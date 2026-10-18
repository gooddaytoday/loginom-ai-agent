#!/usr/bin/env python3
"""Synthetic CSV fixture; deterministic seed 2202, no external inputs."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2202
rng = random.Random(SEED)


def write(name, columns, rows):
    with (ROOT / "data" / name).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)

blurs = [i / 4 for i in range(1, 17)]
rng.shuffle(blurs)
rows = [[f"FR{i:02}", rng.choice(["Nebula", "Galaxy", "Cluster"]), f"{blur:.2f}"]
        for i, blur in enumerate(blurs, 1)]
write("frames.csv", ["FrameID", "Target", "Blur"], rows)
