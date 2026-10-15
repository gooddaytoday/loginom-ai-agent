"""Independent boundary expectations, computed from input CSV bytes."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def source(name):
    with (ROOT / 'data' / name).open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream, delimiter=';')
        columns = [{'name': key, 'label': key, 'type': 'integer' if key == 'Amount' else 'string'} for key in reader.fieldnames]
        rows = [{key: None if value == 'NULL' else int(value) if key == 'Amount' else value
                 for key, value in row.items()} for row in reader]
    return columns, rows


def expected(package_path):
    main_columns, main = source('main.csv')
    wide_columns, wide = source('wide.csv')
    empty_columns, empty = source('empty.csv')
    assert empty == [] and empty_columns == main_columns
    cases = [('Пятнадцать входов', main_columns, main * 15),
             ('Восемь широких входов', wide_columns, wide * 8),
             ('Пустой вход', main_columns, empty + main)]
    return {'package_path': package_path, 'nodes': [{'type': 'transform.union_data'}],
            'outputs': [{'output_node_type': 'transform.union_data', 'output_node_label': label,
                         'columns': columns, 'rows': rows} for label, columns, rows in cases]}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--package-path', required=True)
    args = parser.parse_args()
    print(json.dumps(expected(args.package_path), ensure_ascii=False, indent=2))
