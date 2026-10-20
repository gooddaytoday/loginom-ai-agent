COLUMNS = ['store', 'n', 'bread_count', 'milk_count', 'both_count', 'support', 'confidence', 'lift']

def solve(rows):
    groups=defaultdict(list)
    for row in rows:
        groups[row['store']].append(set(row['items'].split(' | ')))
    result=[]
    for store, baskets in groups.items():
        n=len(baskets)
        bread=sum('Bread' in basket for basket in baskets)
        milk=sum('Milk' in basket for basket in baskets)
        both=sum('Bread' in basket and 'Milk' in basket for basket in baskets)
        result.append([store,n,bread,milk,both,100*both/n,100*both/bread,both*n/(bread*milk)])
    return sorted(result,key=lambda row:(-row[-1],row[0]))


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
