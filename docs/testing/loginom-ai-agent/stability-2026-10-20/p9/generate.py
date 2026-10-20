#!/usr/bin/env python3
"""Synthetic fixtures, fixed seed; Python standard library only."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2209
rng = random.Random(SEED)


def write(name, columns, rows):
    (ROOT / 'data').mkdir(exist_ok=True)
    with (ROOT / 'data' / name).open('w', encoding='utf-8', newline='') as stream:
        writer = csv.writer(stream, lineterminator='\n')
        writer.writerow(columns)
        writer.writerows(rows)


centers = [(8, 12, 5), (80, 120, 9)]
rows = []
for x, y, count in centers:
    for _ in range(count):
        offset = rng.randrange(-2, 3) / 4
        rows.append([f'R{len(rows) + 1:02}', f'{x + offset:.2f}', f'{y + offset:.2f}'])
rng.shuffle(rows)
write('clients.csv', ['ClientID', 'Visits', 'Spend'], rows)
