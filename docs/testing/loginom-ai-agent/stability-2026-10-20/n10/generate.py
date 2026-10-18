#!/usr/bin/env python3
"""Deterministic synthetic inputs; Python standard library only."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SEED = 101022
rng = random.Random(SEED)

rows = [[i + 1, f'{x:.2f}', f'{z:.2f}', f'{12 + 2 * x - 0.75 * z + (0.5 if z in (1, 4) else -0.5):.2f}']
        for i, (x, z) in enumerate((x, z) for x in range(1, 6) for z in range(1, 5))]
header = ['RowID', 'X', 'Z', 'Y']

rng.shuffle(rows)
(ROOT / 'data').mkdir(exist_ok=True)
with (ROOT / 'data/energy.csv').open('w', encoding='utf-8', newline='') as stream:
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(header)
    writer.writerows(rows)
