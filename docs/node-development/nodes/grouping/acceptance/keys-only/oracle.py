"""Independent full-row set oracle; never delivered to the model."""
import csv
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent


def expected(package):
    rows = {}
    for path in sorted((ROOT / 'data').glob('*.csv')):
        with path.open(newline='') as stream:
            for row in csv.DictReader(stream, delimiter=';'):
                key = None if row['Key'] == '\\N' else int(row['Key'])
                text = None if row['Text'] == '\\N' else row['Text']
                rows.setdefault((key, text), dict(Key=key, Text=text))
    result = json.loads((ROOT / 'expected.json').read_text())
    assert list(rows.values()) == result['outputs'][0]['rows'], 'Expected differs from full-row set oracle'
    result['package_path'] = package
    return result


if __name__ == '__main__':
    print(json.dumps(expected(sys.argv[1] if len(sys.argv) > 1 else '/acceptance/grouping-keys-only.lgp'), ensure_ascii=False))
