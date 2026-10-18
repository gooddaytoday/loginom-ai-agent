#!/usr/bin/env python3
"""Deterministic synthetic inputs; Python standard library only."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SEED = 91022
rng = random.Random(SEED)

rows = [[i, f'{i / 2:.2f}', f'{4 + 3 * i / 2 + (0.5 if i % 2 else -0.5):.2f}']
        for i in range(1, 17)]
header = ['RowID', 'X', 'Y']

rng.shuffle(rows)
(ROOT / 'data').mkdir(exist_ok=True)
with (ROOT / 'data/packing.csv').open('w', encoding='utf-8', newline='') as stream:
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(header)
    writer.writerows(rows)
