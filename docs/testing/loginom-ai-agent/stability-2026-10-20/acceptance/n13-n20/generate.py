#!/usr/bin/env python3
"""Regenerate synthetic inputs only; Python standard library, fixed seeds."""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def save(case, name, fields, rows):
    path = ROOT / f'n{case}' / 'data' / name
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8', newline='') as output:
        writer = csv.writer(output, lineterminator='\n')
        writer.writerow(fields)
        writer.writerows(rows)

for case in range(13, 21):
    rng = random.Random(20261000 + case)
    if case == 13:
        rows = [[shop, month, rng.randint(1, 19)]
                for shop in ['East', 'North', 'South', 'West']
                for month in ['Sep', 'Oct', 'Nov']
                if (shop, month) != ('West', 'Oct') for _ in range(11)]
        rng.shuffle(rows)
        save(case, 'rentals.csv', ['Shop', 'Month', 'Quantity'], rows)
    if case == 14:
        fees = [[p, w, 10 + 3 * i + j]
                for i, p in enumerate(['A', 'B', 'C', 'D'])
                for j, w in enumerate(['East', 'North', 'West'])
                if (p, w) != ('D', 'West')]
        orders = [[i, rng.choice(['A', 'B', 'C', 'D']),
                   rng.choice(['East', 'North', 'West']), rng.randint(1, 9)]
                  for i in range(1, 91)]
        orders[0] = [1, 'D', 'West', 2]
        rng.shuffle(orders)
        rng.shuffle(fees)
        save(case, 'orders.csv', ['OrderID', 'Product', 'Warehouse', 'Quantity'], orders)
        save(case, 'fees.csv', ['Product', 'Warehouse', 'UnitFee'], fees)
    if case == 15:
        morning = [[i, f'Guest {i}', f'guest{i}@example.test'] for i in range(1, 41)]
        evening = [[i, f'Guest {i}', f'555{i:05d}'] for i in range(41, 81)]
        morning += morning[:5]
        evening += evening[:5]
        rng.shuffle(morning)
        rng.shuffle(evening)
        save(case, 'morning.csv', ['Ticket', 'Name', 'Email'], morning)
        # Deliberately different column order as well as different fields.
        save(case, 'evening.csv', ['Phone', 'Name', 'Ticket'],
             [[r[2], r[1], r[0]] for r in evening])
    if case == 16:
        rows = []
        for i in range(1, 65):
            due = date(2024, 2, 20) + timedelta(days=i)
            returned = due + timedelta(days=(i % 9) - 3)
            rows.append([i, rng.choice(['  alice ', ' BoB', 'carol  ', ' dAvE ']),
                         str(due), str(returned)])
        rng.shuffle(rows)
        save(case, 'returns.csv', ['LoanID', 'Reader', 'Due', 'Returned'], rows)
    if case == 17:
        rows = [[i, i % 5, str(date(2026, 10, 1) + timedelta(days=i // 5)),
                 f'Parcel {i}'] for i in range(1, 81)]
        rng.shuffle(rows)
        save(case, 'parcels.csv', ['ParcelID', 'Priority', 'Due', 'Description'], rows)
    if case == 18:
        rows = [[1, 'B:2|A:1|B:3'], [2, 'Z:1'], [3, 'A:9|C:2|A:4|C:1']]
        for i in range(4, 73):
            parts = [f'{rng.choice("ABCDE")}:{rng.randint(1, 12)}'
                     for _ in range(rng.randint(2, 7))]
            rows.append([i, '|'.join(parts)])
        rng.shuffle(rows)
        save(case, 'baskets.csv', ['OrderID', 'Items'], rows)
    if case == 19:
        rows = [[30 * group + j + 1, round(center + rng.uniform(-.3, .3), 3),
                 round(center + rng.uniform(-.3, .3), 3)]
                for group, center in enumerate([2., 12., 22.]) for j in range(30)]
        rng.shuffle(rows)
        save(case, 'workshops.csv', ['ID', 'Hours', 'Materials'], rows)
    if case == 20:
        rows = [[6 * i + j + 1, i + 1, j + 1,
                 round(5 + 1.7 * (i + 1) + 2.4 * (j + 1) + rng.uniform(-.15, .15), 3)]
                for i in range(10) for j in range(6)]
        rng.shuffle(rows)
        save(case, 'deliveries.csv', ['ID', 'Hours', 'Distance', 'Cost'], rows)
