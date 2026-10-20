import csv
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row['category'],int(row['is_top']))].append(row)
    result = []
    for (category,top), group in groups.items():
        n = len(group)
        views = sum(int(row['views']) for row in group)
        days = sum(int(row['days_active']) for row in group)
        favorites = sum(int(row['favorites']) for row in group)
        result.append([category,top,n,views/days,100*favorites/views,100*sum(float(row['response_rate']) for row in group)/n])
    return sorted(result,key=lambda row:(row[0],row[1]))


def main():
    root = Path(__file__).resolve().parent
    with (root / 'data/dataset.csv').open(encoding='utf-8-sig', newline='') as source:
        result = calculate(list(csv.DictReader(source)))
    with (root / 'oracle.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.writer(target, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[f'{value:.6f}' if isinstance(value, float) else value for value in row] for row in result])


COLUMNS = ['category', 'is_top', 'listings', 'views_per_active_day', 'favorites_pct', 'mean_response_pct']

if __name__ == '__main__':
    main()
