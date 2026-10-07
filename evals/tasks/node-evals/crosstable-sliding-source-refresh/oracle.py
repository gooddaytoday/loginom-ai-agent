import csv
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
case = root.name
def compute(source, target):
    rows = list(csv.DictReader((root / 'data' / source).open(newline='', encoding='utf-8')))
    keys = ['Region', 'Month'] if case == 'crosstable-multi-row-keys' else ['Region']
    categories = sorted({r['Category'] for r in rows})
    functions = ['min', 'max'] if case == 'crosstable-min-max' else ['sum']
    groups = defaultdict(list)
    for r in rows:
        groups[tuple(r[k] for k in keys), r['Category']].append(Decimal(r['Amount']))
    header = keys + [c + ('_' + f if len(functions) > 1 else '') for c in categories for f in functions]
    with (root / target).open('w', newline='', encoding='utf-8') as out:
        writer = csv.writer(out, lineterminator='\n')
        writer.writerow(header)
        for key in sorted({tuple(r[k] for k in keys) for r in rows}):
            values = []
            for category in categories:
                numbers = groups[key, category]
                assert numbers
                for function in functions:
                    values.append(str({'sum': sum, 'min': min, 'max': max}[function](numbers)))
            writer.writerow([*key, *values])

if case == 'crosstable-sliding-source-refresh':
    compute('sales-initial.csv', 'initial-oracle.csv')
    compute('sales-updated.csv', 'oracle.csv')
else:
    compute('sales.csv', 'oracle.csv')
