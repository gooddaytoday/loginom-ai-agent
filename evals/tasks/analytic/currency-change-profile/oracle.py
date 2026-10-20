COLUMNS = ['target_currency', 'observations', 'mean_rate', 'mean_change_pct', 'min_change_pct', 'max_change_pct', 'change_span_pp', 'negative_change_pct']

def solve(rows):
    groups=defaultdict(list)
    for row in rows:
        groups[row['target_currency']].append(row)
    result=[]
    for currency,items in groups.items():
        n=len(items)
        change=[float(row['change_pct']) for row in items]
        result.append([currency,n,sum(float(row['rate']) for row in items)/n,sum(change)/n,min(change),max(change),max(change)-min(change),100*sum(value<0 for value in change)/n])
    return sorted(result,key=lambda row:(-row[6],row[0]))


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
