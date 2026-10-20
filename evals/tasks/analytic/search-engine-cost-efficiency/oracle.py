import csv
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row['search_engine']].append(row)
    result = []
    for engine, group in groups.items():
        impressions = sum(int(row['impressions']) for row in group)
        clicks = sum(int(row['clicks']) for row in group)
        conversions = sum(int(row['conversions']) for row in group)
        cost = sum(float(row['cost']) for row in group)
        result.append([engine,len(group),impressions,clicks,conversions,cost,100*clicks/impressions,100*conversions/clicks,cost/clicks,cost/conversions])
    return sorted(result,key=lambda row:(row[9],row[0]))


def main():
    root = Path(__file__).resolve().parent
    with (root / 'data/dataset.csv').open(encoding='utf-8-sig', newline='') as source:
        result = calculate(list(csv.DictReader(source)))
    with (root / 'oracle.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.writer(target, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[f'{value:.6f}' if isinstance(value, float) else value for value in row] for row in result])


COLUMNS = ['search_engine', 'keywords', 'total_impressions', 'total_clicks', 'total_conversions', 'total_cost', 'ctr_pct', 'conversion_pct', 'cpc', 'cpa']

if __name__ == '__main__':
    main()
