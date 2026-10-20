COLUMNS = ['country_code', 'requests', 'unique_ips', 'providers', 'timezones']

def solve(rows):
    groups=defaultdict(list)
    for row in rows:
        groups[row['country_code']].append(row)
    result=[]
    for country,items in groups.items():
        result.append([country,len(items),*[len({row[key] for row in items}) for key in ['ip','isp','timezone']]])
    return sorted(result,key=lambda row:(-row[1],row[0]))


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
