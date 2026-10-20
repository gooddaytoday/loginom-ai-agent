#!/usr/bin/env python3
"""Deterministic synthetic inputs; Python standard library only."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SEED = 81022
FIELDS = ['Load', 'Heat', 'Vibration']
CENTERS = [(3, 5, 2), (30, 25, 35), (60, 65, 55)]
SIZES = [5, 7, 9]
rng = random.Random(SEED)
rows = []
for center, size in zip(CENTERS, SIZES):
    for _ in range(size):
        # Decimal quarters are exact in both the CSV and binary64.
        rows.append([f"{value + rng.randrange(-2, 3) / 4:.2f}" for value in center])
rng.shuffle(rows)
(ROOT / 'data').mkdir(exist_ok=True)
with (ROOT / 'data/bench.csv').open('w', encoding='utf-8', newline='') as stream:
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(['RowID', *FIELDS])
    writer.writerows([i, *row] for i, row in enumerate(rows, 1))
