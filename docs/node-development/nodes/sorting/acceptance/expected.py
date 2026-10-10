"""Independent CSV/Decimal expectations. No runtime or handler imports."""
import argparse
import csv
import json
from decimal import Decimal
from pathlib import Path

BASE = Path(__file__).parent


def expected(package_path):
    sales = list(csv.DictReader((BASE / 'data/sales.csv').read_text().splitlines()))
    calc = [dict(Id=int(r['Id']), Product=r['Product'], Region=r['Region'],
                 Quantity=int(r['Quantity']), UnitPrice=float(r['UnitPrice']),
                 Revenue=float(Decimal(r['Quantity']) * Decimal(r['UnitPrice']))) for r in sales]
    outputs = [dict(output_node_type='transform.calculator', output_node_label='Выручка',
                    columns=[dict(name=n, type=t) for n, t in [('Id', 'integer'), ('Product', 'string'),
                              ('Region', 'string'), ('Quantity', 'integer'), ('UnitPrice', 'real'), ('Revenue', 'real')]], rows=calc)]
    for field, label in [('Product', 'Рейтинг товаров'), ('Region', 'Рейтинг регионов')]:
        totals = {}
        for r in sales:
            totals[r[field]] = totals.get(r[field], Decimal(0)) + Decimal(r['Quantity']) * Decimal(r['UnitPrice'])
        rows = [{field: k, 'Total': float(v)} for k, v in sorted(totals.items(), key=lambda x: (-x[1], x[0]))]
        outputs.append(dict(output_node_type='transform.sorting', output_node_label=label,
                            columns=[dict(name=field, type='string'), dict(name='Total', type='real')], rows=rows))
    source = list(csv.DictReader((BASE / 'data/edges.csv').read_text().splitlines()))
    rows = [dict(Id=int(r['Id']), Key=None if r['Key'] == r'\N' else Decimal(r['Key']), Text=r['Text']) for r in source]
    specifications = [('Ключ вверх', lambda r: (r['Key'] is not None, r['Key'] or Decimal(0), -r['Id'])),
                      ('Ключ вниз', lambda r: (r['Key'] is None, -(r['Key'] or Decimal(0)), r['Id'])),
                      ('Текст', lambda r: (r['Text'].translate(str.maketrans('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')), r['Id']))]
    for label, key in specifications:
        ordered = [dict(r, Key=None if r['Key'] is None else float(r['Key'])) for r in sorted(rows, key=key)]
        outputs.append(dict(output_node_type='transform.sorting', output_node_label=label,
                            columns=[dict(name='Id', type='integer'), dict(name='Key', type='real'), dict(name='Text', type='string')], rows=ordered))
    return dict(package_path=package_path, nodes=[dict(type=t) for t in ['imports.text', 'transform.calculator', 'transform.group_data', 'transform.sorting', 'exports.text']], outputs=outputs)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--package-path', required=True)
    args = parser.parse_args()
    print(json.dumps(expected(args.package_path), ensure_ascii=False, indent=2))
