COLUMNS = ['n', 'age_mean', 'pressure_mean', 'pearson_r']

def solve(rows):
    n=len(rows)
    x=[float(row['age']) for row in rows]
    y=[float(row['blood_pressure']) for row in rows]
    a=n*sum(v*v for v in x)-sum(x)**2
    b=n*sum(v*v for v in y)-sum(y)**2
    c=n*sum(v*w for v,w in zip(x,y))-sum(x)*sum(y)
    return [[n,sum(x)/n,sum(y)/n,c/(a*b)**0.5]]


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
