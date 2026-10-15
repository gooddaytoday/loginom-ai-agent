"""Independent expectations for the saved Sorting outputs, from CSV/Decimal."""
import argparse
import csv
import json
from decimal import Decimal
from pathlib import Path

FIXTURE = Path(__file__).parent / 'data/edges.csv'


def expected(package_path, path=FIXTURE):
    with path.open(encoding='utf-8', newline='') as source:
        rows = [dict(Id=int(row['Id']),
                     Key=None if row['Key'] == r'\N' else Decimal(row['Key']),
                     Text=row['Text']) for row in csv.DictReader(source)]
    # Binary comparison ignores case for Latin letters only, not all Unicode.
    latin_lower = str.maketrans('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')
    specifications = [
        ('Ключ вверх', lambda row: (-row['Id'], row['Key'] is not None, row['Key'] or Decimal(0))),
        ('Ключ вниз', lambda row: (row['Key'] is None, -(row['Key'] or Decimal(0)), row['Id'])),
        ('Текст', lambda row: (row['Text'].translate(latin_lower), row['Id'])),
    ]
    outputs = []
    for label, key in specifications:
        ordered = [dict(row, Key=None if row['Key'] is None else float(row['Key']))
                   for row in sorted(rows, key=key)]
        outputs.append(dict(output_node_type='transform.sorting', output_node_label=label, ordered=True,
                            columns=[dict(name='Id', type='integer'), dict(name='Key', type='real'),
                                     dict(name='Text', type='string')], rows=ordered))
    return dict(package_path=package_path,
                nodes=[dict(type='imports.text'), dict(type='transform.sorting')], outputs=outputs)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--package-path', required=True)
    args = parser.parse_args()
    print(json.dumps(expected(args.package_path), ensure_ascii=False, indent=2))
