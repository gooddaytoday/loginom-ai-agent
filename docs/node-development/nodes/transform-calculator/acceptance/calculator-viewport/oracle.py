#!/usr/bin/env python3
"""Private independent expected-value calculation; never supplied to the model."""
import csv
import json
from pathlib import Path
from decimal import Decimal
root = Path(__file__).resolve().parent
rows = []
for source in csv.DictReader((root / 'data/sales.csv').open()):
    row = {'Id': source['Id'], 'Quantity': int(source['Quantity'])}
    row.update({key: float(Decimal(source[key])) for key in ['Price', 'UnitCost', 'Amount']})
    row['Amount'] += sum(range(1, 9))
    row['Revenue'] = row['Quantity'] * row['Price']
    row['Cost'] = row['Quantity'] * row['UnitCost']
    row['Profit'] = row['Revenue'] - row['Cost']
    rows.append(row)
expected = json.loads((root / 'expected.json').read_text())
assert expected['outputs'][0]['rows'] == rows
print(json.dumps(rows, ensure_ascii=False))
