#!/usr/bin/env python3
"""Independent exact concentration oracle; reads only the adjacent runtime data."""
import csv
from decimal import Decimal, localcontext
from fractions import Fraction
from pathlib import Path

root = Path(__file__).resolve().parent
fields = ['Fresh', 'Milk', 'Grocery', 'Frozen', 'Detergents_Paper', 'Delicassen']
with (root / 'data/wholesale-customers.csv').open(encoding='utf-8', newline='') as source:
    rows = list(csv.DictReader(source, delimiter=';'))

with (root / 'oracle.csv').open('w', encoding='utf-8', newline='') as output:
    writer = csv.writer(output, delimiter=';', quotechar='"', lineterminator='\n')
    writer.writerow(['customer_id', 'total_spend', 'hhi', 'effective_categories', 'max_category_share'])
    for row in sorted(rows, key=lambda item: item['customer_id']):
        values = [int(row[field]) for field in fields]
        total = sum(values)
        assert all(value >= 0 for value in values) and total > 0
        hhi = Fraction(sum(value * value for value in values), total * total)
        metrics = [hhi, 1 / hhi, Fraction(max(values), total)]
        with localcontext() as context:
            context.prec = 50
            writer.writerow([
                row['customer_id'], f'{total}.00',
                *(format(Decimal(value.numerator) / Decimal(value.denominator), '.10f') for value in metrics),
            ])
