"""Independent CSV oracle. Run from any directory; no Loginom/runtime imports."""
import csv
import itertools
import pathlib
import sys
from decimal import Decimal

case = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).parent
rows = list(csv.DictReader((case / 'data/sales.csv').open(encoding='utf-8')))
header = ['Region']
output = []
if case.name == 'crosstable-string-counts-null':
    header += [f'{c}_{f}' for c in ['A', 'B'] for f in ['count', 'unique', 'null']]
    for region in ['N', 'S']:
        line = [region]
        for category in ['A', 'B']:
            values = [r['Text'] for r in rows if (r['Region'], r['Category']) == (region, category)]
            line += [len(values), len(set(x for x in values if x != '?')), values.count('?')]
        output.append(line)
elif case.name == 'crosstable-column-cartesian':
    groups = list(itertools.product(['A', 'B'], ['web', 'shop']))
    header += [f'{a}_{b}' for a, b in groups]
    for region in ['N', 'S']:
        line = [region]
        for category, channel in groups:
            values = [Decimal(r['Amount']) for r in rows if (r['Region'], r['Category'], r['Channel']) == (region, category, channel)]
            line += [sum(values) if values else '']
        output.append(line)
elif case.name == 'crosstable-multi-facts':
    header += [f'{c}_{f}' for c in ['A', 'B'] for f in ['amount_sum', 'units_max']]
    for region in ['N', 'S']:
        line = [region]
        for category in ['A', 'B']:
            group = [r for r in rows if (r['Region'], r['Category']) == (region, category)]
            line += [sum(Decimal(r['Amount']) for r in group), max(int(r['Units']) for r in group)]
        output.append(line)
elif case.name == 'crosstable-local-variable-bindings':
    header += ['A_Amount_Sum', 'A_Amount_Count']
    for region in ['N', 'S']:
        group = [r for r in rows if (r['Region'], r['Category']) == (region, 'A')]
        output.append([region, sum(Decimal(r['Amount']) for r in group), len(group)])
else:
    raise ValueError('unassigned case')
writer = csv.writer(sys.stdout, lineterminator='\n')
writer.writerows([header] + output)
