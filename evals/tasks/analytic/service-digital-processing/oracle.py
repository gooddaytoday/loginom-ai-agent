import csv
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row['service'],int(row['is_digital']))].append(row)
    result = []
    for (service,digital), group in groups.items():
        n = len(group)
        result.append([service,digital,n,sum(float(row['processing_days']) for row in group)/n,sum(float(row['satisfaction']) for row in group)/n,100*sum(row['status']=='Approved' for row in group)/n])
    return sorted(result,key=lambda row:(row[0],row[1]))


def main():
    root = Path(__file__).resolve().parent
    with (root / 'data/dataset.csv').open(encoding='utf-8-sig', newline='') as source:
        result = calculate(list(csv.DictReader(source)))
    with (root / 'oracle.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.writer(target, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[f'{value:.6f}' if isinstance(value, float) else value for value in row] for row in result])


COLUMNS = ['service', 'is_digital', 'applications', 'mean_processing_days', 'mean_satisfaction', 'approved_pct']

if __name__ == '__main__':
    main()
