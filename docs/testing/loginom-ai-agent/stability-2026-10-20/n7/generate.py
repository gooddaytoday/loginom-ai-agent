#!/usr/bin/env python3
"""Deterministic synthetic inputs; Python standard library only."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SEED = 71022
FIELDS = ['Visits', 'Items']
CENTERS = [(2, 4), (25, 30)]
SIZES = [6, 8]
rng = random.Random(SEED)
rows = []
for center, size in zip(CENTERS, SIZES):
    for _ in range(size):
        # Decimal quarters are exact in both the CSV and binary64.
        rows.append([f"{value + rng.randrange(-2, 3) / 4:.2f}" for value in center])
rng.shuffle(rows)
(ROOT / 'data').mkdir(exist_ok=True)
with (ROOT / 'data/pickup.csv').open('w', encoding='utf-8', newline='') as stream:
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(['RowID', *FIELDS])
    writer.writerows([i, *row] for i, row in enumerate(rows, 1))
