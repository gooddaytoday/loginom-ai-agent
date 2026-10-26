COLUMNS = ['feature', 'used', 'users', 'converters', 'conversion_pct']

def solve(rows):
    fields = ['feature_dashboard','feature_reports','feature_settings','feature_integrations','feature_api','feature_notifications','feature_export','feature_team']
    result = []
    for field in sorted(fields):
        for used in (1, 0):
            selected = [row for row in rows if int(row[field]) == used]
            if selected:
                converters = sum(int(row['converted']) for row in selected)
                result.append([field,used,len(selected),converters,100*converters/len(selected)])
    return result


import csv
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

def format_cell(value):
    if isinstance(value, str):
        return value
    if isinstance(value, int):
        return str(value)
    text = format(Decimal(str(value)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP), 'f')
    return '0' if Decimal(text) == 0 else text.rstrip('0').rstrip('.')

def main():
    root = Path(__file__).parent
    with (root / 'data/dataset.csv').open(newline='', encoding='utf-8-sig') as file:
        rows = solve(list(csv.DictReader(file)))
    with (root / 'oracle.csv').open('w', newline='', encoding='utf-8') as file:
        writer = csv.writer(file, lineterminator='\n')
        writer.writerow(COLUMNS)
        writer.writerows([[format_cell(value) for value in row] for row in rows])

if __name__ == '__main__':
    main()
