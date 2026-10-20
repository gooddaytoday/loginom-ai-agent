#!/usr/bin/env python3
"""Deterministic synthetic inputs; Python standard library only."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SEED = 111022
rng = random.Random(SEED)
rows = [[f'REQ-{i:02}', f'probe-{rng.randrange(100000, 1000000)}'] for i in range(1, 13)]
rng.shuffle(rows)
(ROOT / 'data').mkdir(exist_ok=True)
with (ROOT / 'data/requests.csv').open('w', encoding='utf-8', newline='') as stream:
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(['RequestId', 'Key'])
    writer.writerows(rows)
