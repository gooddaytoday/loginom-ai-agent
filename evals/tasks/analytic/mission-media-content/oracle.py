COLUMNS = ['mission', 'media_type', 'events', 'images', 'hd_events', 'hd_event_pct', 'mean_keywords']

def solve(rows):
    groups=defaultdict(list)
    for row in rows:
        groups[(row['mission'],row['media_type'])].append(row)
    result=[]
    for (mission,media),items in sorted(groups.items()):
        n=len(items)
        hd=sum(int(row['hd_image']) for row in items)
        result.append([mission,media,n,sum(int(row['image_count']) for row in items),hd,100*hd/n,sum(float(row['keywords_count']) for row in items)/n])
    return result


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
