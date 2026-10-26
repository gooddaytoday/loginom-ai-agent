import csv
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row['source'],row['device'])].append(row)
    result = []
    for (source,device), group in groups.items():
        n = len(group)
        goals = sum(int(row['goal_reached']) for row in group)
        result.append([source,device,n,goals,100*goals/n,sum(float(row['visit_duration_sec']) for row in group)/n,sum(float(row['revenue']) for row in group)/n])
    return sorted(result,key=lambda row:(row[0],row[1]))


def main():
    root = Path(__file__).resolve().parent
    with (root / 'data/dataset.csv').open(encoding='utf-8-sig', newline='') as source:
        result = calculate(list(csv.DictReader(source)))
    with (root / 'oracle.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.writer(target, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[f'{value:.6f}' if isinstance(value, float) else value for value in row] for row in result])


COLUMNS = ['source', 'device', 'sessions', 'goals', 'conversion_pct', 'mean_duration_sec', 'revenue_per_session']

if __name__ == '__main__':
    main()
