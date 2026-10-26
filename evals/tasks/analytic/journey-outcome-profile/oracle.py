import csv
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row['journey_stage_4']].append(row)
    result = []
    for outcome, group in groups.items():
        n = len(group)
        result.append([outcome,n,*[sum(float(row[field]) for row in group)/n for field in ['days_in_awareness','days_in_consideration','days_in_decision','total_days','touchpoints']]])
    return sorted(result,key=lambda row:row[0])


def main():
    root = Path(__file__).resolve().parent
    with (root / 'data/dataset.csv').open(encoding='utf-8-sig', newline='') as source:
        result = calculate(list(csv.DictReader(source)))
    with (root / 'oracle.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.writer(target, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[f'{value:.6f}' if isinstance(value, float) else value for value in row] for row in result])


COLUMNS = ['outcome', 'customers', 'mean_awareness_days', 'mean_consideration_days', 'mean_decision_days', 'mean_total_days', 'mean_touchpoints']

if __name__ == '__main__':
    main()
