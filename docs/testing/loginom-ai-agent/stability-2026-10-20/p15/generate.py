#!/usr/bin/env python3
"""Synthetic fixtures, fixed seed; Python standard library only."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2215
rng = random.Random(SEED)


def write(name, columns, rows):
    (ROOT / 'data').mkdir(exist_ok=True)
    with (ROOT / 'data' / name).open('w', encoding='utf-8', newline='') as stream:
        writer = csv.writer(stream, lineterminator='\n')
        writer.writerow(columns)
        writer.writerows(rows)


centers = [(12, 18, 6), (120, 180, 8)]
rows = []
for x, y, count in centers:
    for _ in range(count):
        offset = rng.randrange(-2, 3) / 4
        rows.append([f'R{len(rows) + 1:02}', f'{x + offset:.2f}', f'{y + offset:.2f}'])
rows = [[row[0], 'summer', *row[1:]] for row in rows]
rows += [[f'W{i}', 'winter', f'{500 + i:.2f}', f'{800 + i:.2f}'] for i in range(1, 5)]
rng.shuffle(rows)
write('hives.csv', ['HiveID', 'Season', 'Flight', 'Pollen'], rows)
