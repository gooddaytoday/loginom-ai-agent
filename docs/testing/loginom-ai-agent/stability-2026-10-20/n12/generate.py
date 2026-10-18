#!/usr/bin/env python3
"""Deterministic synthetic inputs; Python standard library only."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SEED = 121022
rng = random.Random(SEED)

rows = []
for i in range(1, 19):
    discount = rng.randrange(1, 5) / 2
    rows.append([i, 'true', f'{i / 2:.2f}', f'{7 + 2.5 * i / 2 + discount:.2f}', f'{discount:.2f}'])
# Inactive outliers and nonpositive confirmed rows make a skipped filter visible.
rows += [[19, 'false', '5.00', '400.00', '2.00'],
         [20, 'false', '8.00', '600.00', '3.00'],
         [21, 'false', '12.00', '900.00', '4.00'],
         [22, 'true', '0.00', '200.00', '1.00'],
         [23, 'true', '-2.00', '300.00', '1.50'],
         [24, 'false', '-1.00', '500.00', '2.50']]
header = ['RowID', 'Approved', 'X', 'Gross', 'Discount']

rng.shuffle(rows)
(ROOT / 'data').mkdir(exist_ok=True)
with (ROOT / 'data/batches.csv').open('w', encoding='utf-8', newline='') as stream:
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(header)
    writer.writerows(rows)
