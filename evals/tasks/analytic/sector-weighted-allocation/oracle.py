COLUMNS = ['sector', 'assets', 'allocation_weight', 'weighted_return_pct', 'weighted_dividend_pct']

def solve(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row['sector']].append(row)
    result = []
    for sector, items in groups.items():
        weight = sum(float(row['allocation_percent']) for row in items)
        result.append([sector,len(items),weight,*[100*sum(float(row['allocation_percent'])*float(row[field]) for row in items)/weight for field in ['annual_return','dividend_yield']]])
    return sorted(result,key=lambda row:(-row[2],row[0]))


import csv
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

def format_cell(value):
    if isinstance(value, str):
        return value
    if isinstance(value, int):
        return str(value)
    text = format(Decimal(str(value)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP), 'f')
    return '0' if Decimal(text) == 0 else text.rstrip('0').rstrip('.')

def main():
    root = Path(__file__).parent
    with (root / 'data/dataset.csv').open(newline='', encoding='utf-8-sig') as file:
        rows = solve(list(csv.DictReader(file)))
    with (root / 'oracle.csv').open('w', newline='', encoding='utf-8') as file:
        writer = csv.writer(file, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[format_cell(value) for value in row] for row in rows])

if __name__ == '__main__':
    main()
