#!/usr/bin/env python3
"""Synthetic CSV fixture; deterministic seed 2208, no external inputs."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2208
rng = random.Random(SEED)


def write(name, columns, rows):
    with (ROOT / "data" / name).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(columns)
        writer.writerows(rows)

rows = [[f"OB{i:02}", species, weather, rng.randint(1, 15)]
        for i, (species, weather) in enumerate(
            [(s, w) for s in ["Tern", "Gull", "Heron"] for w in ["calm", "windy"]] * 3, 1)]
rng.shuffle(rows)
write("birds.csv", ["ObservationID", "Species", "Weather", "Count"], rows)
