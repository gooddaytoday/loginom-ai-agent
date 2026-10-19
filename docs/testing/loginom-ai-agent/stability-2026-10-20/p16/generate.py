#!/usr/bin/env python3
"""Synthetic fixtures, fixed seed; Python standard library only."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2216
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
    background = rng.randrange(1, 9) / 4
    signal = 5 + 3 * x + noise + background
    rows.append([i, 'work', f'{x:.2f}', f'{signal:.2f}', f'{background:.2f}'])
rows += [[i, 'control', f'{i / 2:.2f}', f'{400 + 20 * i:.2f}', '1.00'] for i in range(17, 21)]
rng.shuffle(rows)
write('sensors.csv', ['Id', 'Mode', 'Load', 'Signal', 'Background'], rows)
