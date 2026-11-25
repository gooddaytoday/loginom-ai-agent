import csv
from collections import defaultdict
from decimal import Decimal
import json
from pathlib import Path

source = Path(__file__).resolve().parents[1] / 'bh-t0-import/data/sales.csv'
sums = defaultdict(Decimal)
with source.open(encoding='utf-8', newline='') as sales:
    for row in csv.DictReader(sales, delimiter=';'):
        sums[row['Region']] += Decimal(row['Revenue'])

expected = {
    'graph': {
        'nodes': [
            {'id': 'sales', 'type': 'imports.text', 'label': 'Продажи'},
            {'id': 'regions', 'type': 'transform.group_data', 'label_contains': 'по регионам'},
            {'id': 'export', 'type': 'exports.text'},
        ],
        'links': [
            {'source': 'sales', 'target': 'regions', 'output': 0, 'input': 0},
            {'source': 'regions', 'target': 'export', 'output': 0, 'input': 0},
        ],
    },
    'outputs': [{
        'output_node_type': 'export_input',
        'export_destination': 'regions.csv',
        'ordered': False,
        'column_order': 'exact',
        'columns': [
            {'name': 'Region', 'type': 'string'},
            {'name': 'TotalRevenue', 'type': 'real'},
        ],
        'rows': [{'Region': region, 'TotalRevenue': float(total)} for region, total in sorted(sums.items())],
    }],
}
print(json.dumps(expected, ensure_ascii=False, indent=2))
