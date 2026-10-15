"""Independent append oracle, derived from input bytes before model execution."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def expected(package_path):
    names = ['Code', 'Amount', 'Note', 'Extra']
    mappings = [('main.csv', ['Code', 'Amount', 'Note']),
                ('second.csv', ['Note', 'Amount', 'Code']),
                ('third.csv', names)]
    rows = []
    for filename, destinations in mappings:
        with (ROOT / 'data' / filename).open(encoding='utf-8', newline='') as stream:
            records = csv.reader(stream, delimiter=';')
            next(records)
            for values in records:
                assert len(values) == len(destinations)
                row = dict.fromkeys(names)
                for name, value in zip(destinations, values):
                    row[name] = None if value == 'NULL' else int(value) if name == 'Amount' else value
                rows.append(row)
    return {'package_path': package_path,
            'nodes': [{'type': 'transform.union_data'}],
            'output_node_type': 'transform.union_data',
            'columns': [{'name': name, 'label': name,
                         'type': 'integer' if name == 'Amount' else 'string'} for name in names],
            'rows': rows}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--package-path', default='/lab-72-union/union-worker-01.lgp')
    args = parser.parse_args()
    print(json.dumps(expected(args.package_path), ensure_ascii=False, indent=2))
