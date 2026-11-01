"""Independent set/count oracle; never delivered to the model."""
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent


def expected(package):
    groups = {}
    with (ROOT / 'data/customers.csv').open(newline='') as stream:
        for row in csv.DictReader(stream, delimiter=';'):
            group = groups.setdefault(row['Region'], {'rows': 0, 'customers': set(), 'ids': set()})
            group['rows'] += 1
            if row['Customer'] != '\\N':
                group['customers'].add(row['Customer'])
            if row['CustomerId'] not in ['', '\\N']:
                group['ids'].add(int(row['CustomerId']))
    result = json.loads((ROOT / 'expected.json').read_text())
    rows = [dict(Region=key, Rows=value['rows'], UniqueCustomers=len(value['customers']),
                 UniqueIds=len(value['ids'])) for key, value in groups.items()]
    assert rows == result['outputs'][0]['rows'], 'Committed expected differs from independent oracle'
    result['package_path'] = package
    return result


if __name__ == '__main__':
    print(json.dumps(expected(sys.argv[1] if len(sys.argv) > 1 else '/acceptance/grouping-unique.lgp'), ensure_ascii=False))
