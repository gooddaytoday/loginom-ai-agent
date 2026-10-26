import csv
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row['channel']].append(row)
    result = []
    for channel, group in groups.items():
        impressions = sum(int(row['impressions']) for row in group)
        engagements = sum(int(row['likes'])+int(row['shares'])+int(row['comments']) for row in group)
        budget = sum(float(row['campaign_budget']) for row in group)
        revenue = sum(float(row['revenue_generated']) for row in group)
        result.append([channel,len(group),impressions,engagements,budget,revenue,100*engagements/impressions,revenue/budget])
    return sorted(result,key=lambda row:(-row[7],row[0]))


def main():
    root = Path(__file__).resolve().parent
    with (root / 'data/dataset.csv').open(encoding='utf-8-sig', newline='') as source:
        result = calculate(list(csv.DictReader(source)))
    with (root / 'oracle.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.writer(target, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[f'{value:.6f}' if isinstance(value, float) else value for value in row] for row in result])


COLUMNS = ['channel', 'posts', 'total_impressions', 'total_engagements', 'total_budget', 'total_revenue', 'engagement_pct', 'revenue_budget_ratio']

if __name__ == '__main__':
    main()
