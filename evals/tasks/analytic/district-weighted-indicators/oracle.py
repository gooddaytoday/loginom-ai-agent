import csv
from collections import defaultdict
from pathlib import Path


def calculate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row['region']].append(row)
    result = []
    for region, group in groups.items():
        population = sum(int(row['population']) for row in group)
        result.append([region,len(group),population,*[sum(int(row['population'])*float(row[field]) for row in group)/population for field in ['gdp_per_capita','average_salary','unemployment_rate','real_income_growth']]])
    return sorted(result,key=lambda row:(-row[6],row[0]))


def main():
    root = Path(__file__).resolve().parent
    with (root / 'data/dataset.csv').open(encoding='utf-8-sig', newline='') as source:
        result = calculate(list(csv.DictReader(source)))
    with (root / 'oracle.csv').open('w', encoding='utf-8', newline='') as target:
        writer = csv.writer(target, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[f'{value:.6f}' if isinstance(value, float) else value for value in row] for row in result])


COLUMNS = ['region', 'observations', 'total_population', 'weighted_gdp_per_capita', 'weighted_average_salary', 'weighted_unemployment_rate', 'weighted_real_income_growth']

if __name__ == '__main__':
    main()
