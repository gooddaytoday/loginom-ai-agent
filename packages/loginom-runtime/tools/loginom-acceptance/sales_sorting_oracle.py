"""Versioned sales oracle. Decimal arithmetic, no Loginom/runtime dependencies."""
import csv
import hashlib
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

FIXTURE = Path(__file__).parent / 'fixtures/sales-sorting-v1/sales.csv'


def expected(path=FIXTURE):
    data = path.read_bytes()
    rows = list(csv.DictReader(data.decode('utf-8').splitlines()))
    revenue = []
    totals = {key: defaultdict(Decimal) for key in ('Product', 'Region')}
    for row in rows:
        value = Decimal(row['Quantity']) * Decimal(row['UnitPrice'])
        revenue.append([int(row['Id']), str(value)])
        for key in totals:
            totals[key][row[key]] += value
    groups = {key: [[name, str(value)] for name, value in sorted(values.items(), key=lambda item: (-item[1], item[0]))] for key, values in totals.items()}
    return {'fixture_sha256': hashlib.sha256(data).hexdigest(), 'rows': len(rows), 'revenue': revenue, 'sorted_groups': groups}


if __name__ == '__main__':
    import json
    print(json.dumps(expected(), indent=2))
