import csv
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row['acquisition_channel']].append(row)
    result = []
    for channel, group in groups.items():
        n = len(group)
        cac = sum(float(row['cac']) for row in group)/n
        ltv = sum(float(row['ltv']) for row in group)/n
        result.append([channel,n,cac,ltv,ltv/cac,ltv-cac,100*sum(float(row['gross_margin']) for row in group)/n])
    return sorted(result,key=lambda row:(-row[4],row[0]))


def main():
    root = Path(__file__).resolve().parent
    with (root / 'data/dataset.csv').open(encoding='utf-8-sig', newline='') as source:
        result = calculate(list(csv.DictReader(source)))
    with (root / 'oracle.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.writer(target, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[f'{value:.6f}' if isinstance(value, float) else value for value in row] for row in result])


COLUMNS = ['acquisition_channel', 'customers', 'mean_cac', 'mean_ltv', 'ltv_cac_ratio', 'ltv_cac_difference', 'mean_gross_margin_pct']

if __name__ == '__main__':
    main()
