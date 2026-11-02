import csv
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

COLUMNS = ['supplier', 'tariff_keys', 'consistent_keys', 'conflicting_keys', 'rows_in_conflicting_keys']


def summarize(rows):
    keys = defaultdict(list)
    for row in rows:
        keys[(row['supplier'], row['service'])].append((row['currency'], Decimal(row['price'])))
    suppliers = defaultdict(list)
    for (supplier, service), contents in keys.items():
        suppliers[supplier].append((len(set(contents)) > 1, len(contents)))
    return [(supplier, len(groups), sum(not conflict for conflict, count in groups),
             sum(conflict for conflict, count in groups), sum(count for conflict, count in groups if conflict))
            for supplier, groups in sorted(suppliers.items())]


if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    with (root / 'data/tariffs.csv').open(newline='', encoding='utf-8') as source:
        result = summarize(csv.DictReader(source))
    with (root / 'oracle.csv').open('w', newline='', encoding='utf-8') as target:
        writer = csv.writer(target, delimiter=';', quotechar='"', lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows(result)
