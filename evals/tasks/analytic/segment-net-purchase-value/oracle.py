import csv
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row['segment']].append(row)
    result = []
    for segment, group in groups.items():
        n = len(group)
        result.append([segment,n,sum(float(row['recency_days']) for row in group)/n,sum(float(row['frequency']) for row in group)/n,sum(float(row['monetary_value']) for row in group)/n,sum(float(row['avg_order_value'])*float(row['frequency'])*(1-float(row['return_rate'])) for row in group)/n])
    return sorted(result,key=lambda row:(-row[5],row[0]))


def main():
    root = Path(__file__).resolve().parent
    with (root / 'data/dataset.csv').open(encoding='utf-8-sig', newline='') as source:
        result = calculate(list(csv.DictReader(source)))
    with (root / 'oracle.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.writer(target, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[f'{value:.6f}' if isinstance(value, float) else value for value in row] for row in result])


COLUMNS = ['segment', 'customers', 'mean_recency_days', 'mean_frequency', 'mean_monetary_value', 'mean_net_purchase_value']

if __name__ == '__main__':
    main()
