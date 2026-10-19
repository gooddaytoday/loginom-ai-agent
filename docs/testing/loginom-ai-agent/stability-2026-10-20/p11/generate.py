#!/usr/bin/env python3
"""Synthetic fixtures, fixed seed; Python standard library only."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2211
rng = random.Random(SEED)


def write(name, columns, rows):
    (ROOT / 'data').mkdir(exist_ok=True)
    with (ROOT / 'data' / name).open('w', encoding='utf-8', newline='') as stream:
        writer = csv.writer(stream, lineterminator='\n')
        writer.writerow(columns)
        writer.writerows(rows)


rows = []
for i in range(1, 17):
    x = i / 2
    noise = rng.choice([-0.50, -0.25, 0.25, 0.50])
    y = 4 + 2.5 * x + noise
    rows.append([i, f'{x:.2f}', f'{y:.2f}'])
rng.shuffle(rows)
write('seedlings.csv', ['Id', 'Light', 'Height'], rows)
