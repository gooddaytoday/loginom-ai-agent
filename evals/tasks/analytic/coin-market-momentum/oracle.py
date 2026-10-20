COLUMNS = ['coin', 'observations', 'mean_price_usd', 'mean_market_cap', 'mean_volume_24h', 'mean_change_24h_pct', 'mean_change_7d_pct', 'positive_24h_pct']

def solve(rows):
    groups=defaultdict(list)
    for row in rows:
        groups[row['coin']].append(row)
    result=[]
    for coin,items in groups.items():
        n=len(items)
        result.append([coin,n,*[sum(float(row[key]) for row in items)/n for key in ['current_price_usd','market_cap','volume_24h','24h_change','7d_change']],100*sum(float(row['24h_change'])>0 for row in items)/n])
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
