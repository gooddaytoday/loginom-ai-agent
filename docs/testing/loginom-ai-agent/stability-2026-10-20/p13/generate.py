#!/usr/bin/env python3
"""Synthetic fixtures, fixed seed; Python standard library only."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2213
rng = random.Random(SEED)


def write(name, columns, rows):
    (ROOT / 'data').mkdir(exist_ok=True)
    with (ROOT / 'data' / name).open('w', encoding='utf-8', newline='') as stream:
        writer = csv.writer(stream, lineterminator='\n')
        writer.writerow(columns)
        writer.writerows(rows)


rows = [[f'CHK{i:02}', rng.choice(['east', 'west', 'local'])] for i in range(1, 13)]
rng.shuffle(rows)
write('checks.csv', ['Code', 'Route'], rows)
