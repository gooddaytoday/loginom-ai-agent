import csv
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row['campaign_type'],row['region'])].append(row)
    result = []
    for (campaign,region), group in groups.items():
        n = len(group)
        negative = sum(float(row['roi'])<0 for row in group)
        cost = sum(float(row['cost']) for row in group)
        conversions = sum(int(row['conversions']) for row in group)
        result.append([campaign,region,n,negative,100*negative/n,cost,conversions,cost/conversions,sum(float(row['roi']) for row in group)/n])
    return sorted(result,key=lambda row:(-row[4],-row[5],row[0],row[1]))


def main():
    root = Path(__file__).resolve().parent
    with (root / 'data/dataset.csv').open(encoding='utf-8-sig', newline='') as source:
        result = calculate(list(csv.DictReader(source)))
    with (root / 'oracle.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.writer(target, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[f'{value:.6f}' if isinstance(value, float) else value for value in row] for row in result])


COLUMNS = ['campaign_type', 'region', 'campaigns', 'negative_roi_count', 'negative_roi_pct', 'total_cost', 'total_conversions', 'cpa', 'mean_roi']

if __name__ == '__main__':
    main()
