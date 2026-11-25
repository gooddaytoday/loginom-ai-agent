#!/usr/bin/env python3
"""Materialize --cases fixtures from the CSV snapshot that seeded sales."""

import argparse
from collections import Counter, defaultdict
import csv
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import json
from pathlib import Path
import secrets
import shutil


TABLES = {
    'customers': (1000, 'customer_id', 'full_name', 'region', 'segment', 'signup_date', 'email'),
    'products': (200, 'product_id', 'product_name', 'category', 'list_price'),
    'orders': (20000, 'order_id', 'customer_id', 'order_date', 'status'),
    'order_items': (60114, 'item_id', 'order_id', 'product_id', 'quantity', 'unit_price', 'discount_pct'),
}
IMPORT = 'imports.database'
GROUP = 'transform.group_data'
JOIN = 'transform.join_data'
CONNECTION = 'bg-vendor-icon-postgresqlunidacdbconnection'


def read_table(seed, table):
    size, primary_key, *fields = TABLES[table]
    path = seed / (table + '.csv')
    with path.open(encoding='utf-8-sig', newline='') as raw:
        dialect = csv.Sniffer().sniff(raw.readline(), delimiters=',;\t')
        raw.seek(0)
        reader = csv.DictReader(raw, dialect=dialect)
        if set(reader.fieldnames or []) != {primary_key, *fields} or len(reader.fieldnames) != len(fields) + 1:
            raise ValueError(f'{path.name}: unexpected CSV header')
        rows = {}
        for row in reader:
            if None in row or None in row.values():
                raise ValueError(f'{path.name}:{reader.line_num}: incomplete CSV record')
            identifier = int(row[primary_key])
            if identifier in rows:
                raise ValueError(f'{path.name}:{reader.line_num}: duplicate primary key')
            rows[identifier] = row
    if len(rows) != size:
        raise ValueError(f'{path.name}: expected {size} records, got {len(rows)}')
    return rows


def nullable(value):
    return None if value in ('', r'\N', 'NULL') else value


def round_money(amount):
    return amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def node(key, kind, label=None):
    return dict(id=key, type=kind, **({'label': label} if label else {}))


def edge(source, target):
    return dict(source=source, target=target)


def output(filename, kind, schema, rows, *, label=None, ordered=False):
    columns = []
    for name, data_type in schema:
        column = dict(name=name, label_any=True, type=data_type)
        if data_type == 'real':
            column['tolerance'] = {'abs': 1e-7, 'rel': 0}
        columns.append(column)
    expected = dict(output_node_type=kind, output_port=0, export_destination=filename,
                    column_order='exact', ordered=ordered, columns=columns, rows=rows)
    if label:
        expected['output_node_label'] = label
    return expected


def contract(nodes, links, outputs=()):
    return dict(nodes=[dict(type=kind, label_any=True) for kind in dict.fromkeys(n['type'] for n in nodes)],
                outputs=list(outputs), graph=dict(nodes=nodes, links=links))


def expected_cases(seed, export_table):
    customers = read_table(seed, 'customers')
    products = read_table(seed, 'products')
    orders = read_table(seed, 'orders')
    items = read_table(seed, 'order_items')
    customers_rows = []
    region_counts, region_email_counts = Counter(), Counter()
    for customer_id, customer in customers.items():
        region = customer['region']
        email = nullable(customer['email'])
        region_counts[region] += 1
        region_email_counts[region] += email is not None
        customers_rows.append(dict(customer, customer_id=customer_id, email=email,
                                   signup_date=date.fromisoformat(customer['signup_date']).isoformat() + 'T00:00:00'))
    if sum(region_email_counts.values()) != len(customers) - 79:
        raise ValueError('customers.csv: expected 79 NULL email values')
    if sum(nullable(row['discount_pct']) is None for row in items.values()) != 36260:
        raise ValueError('order_items.csv: expected 36260 NULL discounts')

    regions = {customers[int(order['customer_id'])]['region'] for order in orders.values()}
    if len(regions) < 2:
        raise ValueError('Expected orders in at least two regions for the parameterized case')
    selected_region = min(regions, key=lambda region: (-region_counts[region], region))
    orders_by_segment, returns_by_segment, regional_orders_by_segment = Counter(), Counter(), Counter()
    for order in orders.values():
        customer = customers[int(order['customer_id'])]
        segment = customer['segment']
        orders_by_segment[segment] += 1
        if customer['region'] == selected_region:
            regional_orders_by_segment[segment] += 1
        if order['status'] == 'Возврат':
            returns_by_segment[segment] += 1
    if not returns_by_segment:
        raise ValueError('orders.csv: no orders with status Возврат')

    monthly_revenue, product_revenue = defaultdict(Decimal), defaultdict(Decimal)
    for item in items.values():
        order = orders[int(item['order_id'])]
        customer = customers[int(order['customer_id'])]
        product_id = int(item['product_id'])
        if product_id not in products:
            raise ValueError(f'order_items.csv: product_id {product_id} is absent from products.csv')
        discount = Decimal(nullable(item['discount_pct']) or '0')
        amount = int(item['quantity']) * Decimal(item['unit_price']) * (1 - discount / 100)
        month = date.fromisoformat(order['order_date']).isoformat()[:7]
        monthly_revenue[customer['region'], month] += amount
        product_revenue[product_id] += amount
    ranked = sorted((-round_money(amount), product_id) for product_id, amount in product_revenue.items())[:10]

    results = {}
    results['bh-d101'] = contract([node('query', IMPORT)], [], [
        output('bh-d101-revenue.csv', IMPORT, [('region', 'string'), ('month', 'string'), ('revenue', 'real')],
               [dict(region=region, month=month, revenue=float(round_money(amount)))
                for (region, month), amount in sorted(monthly_revenue.items())])
    ])
    customer_import = node('customers', IMPORT, 'Клиенты')
    summary = node('summary', GROUP, 'Сводка клиентов')
    results['bh-d102'] = contract([customer_import, summary], [edge('customers', 'summary')], [
        output('bh-d102-customers.csv', IMPORT, [
            ('customer_id', 'integer'), ('full_name', 'string'), ('region', 'string'), ('segment', 'string'),
            ('signup_date', 'datetime'), ('email', 'string'),
        ], customers_rows, label='Клиенты'),
        output('bh-d102-counts.csv', GROUP, [('region', 'string'), ('customer_count', 'integer'), ('email_count', 'integer')],
               [dict(region=region, customer_count=count, email_count=region_email_counts[region])
                for region, count in sorted(region_counts.items())], label='Сводка клиентов'),
    ])
    results['bh-d103'] = contract([node('query', IMPORT)], [], [
        output('bh-d103-top-products.csv', IMPORT, [('product_id', 'integer'), ('product_name', 'string'), ('revenue', 'real')],
               [dict(product_id=product_id, product_name=products[product_id]['product_name'], revenue=float(-amount))
                for amount, product_id in ranked], ordered=True),
    ])

    def segment_output(filename, kind, counts, column='order_count', **kwargs):
        return output(filename, kind, [('segment', 'string'), (column, 'integer')],
                      [dict(segment=segment, **{column: count}) for segment, count in sorted(counts.items())], **kwargs)

    results['bh-d104'] = contract([node('query', IMPORT)], [], [
        segment_output('bh-d104-returns.csv', IMPORT, returns_by_segment, 'return_count'),
    ])
    results['bh-d105'] = contract([node('region', 'variables.user'), node('query', IMPORT)], [edge('region', 'query')], [
        segment_output('bh-d105-region-orders.csv', IMPORT, regional_orders_by_segment),
    ])
    results['bh-d106'] = contract(
        [customer_import, summary, node('write', 'exports.database'), node('verify', IMPORT, 'Проверка таблицы')],
        [edge('customers', 'summary'), edge('summary', 'write')], [
            output('bh-d106-readback.csv', IMPORT, [('region', 'string'), ('customer_count', 'integer'), ('table_name', 'string')],
                   [dict(region=region, customer_count=count, table_name=export_table)
                    for region, count in sorted(region_counts.items())], label='Проверка таблицы'),
        ])

    connection = node('connection', CONNECTION, 'База продаж')
    orders_import = node('orders', IMPORT, 'Заказы')
    joined = node('joined', JOIN, 'Заказы и клиенты')
    linked = [edge('orders', 'joined'), edge('customers', 'joined')]
    results['bh-d107'] = contract([connection], [])
    results['bh-d108'] = contract([connection, orders_import], [])
    results['bh-d109'] = contract([connection, orders_import, customer_import, joined], linked)
    results['bh-d110'] = contract(
        [connection, orders_import, customer_import, joined, node('summary', GROUP, 'Заказы по сегментам')],
        [*linked, edge('joined', 'summary')], [
            segment_output('bh-d110-segments.csv', GROUP, orders_by_segment, label='Заказы по сегментам'),
        ])
    return selected_region, results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', required=True, type=Path, help='Directory with the four sales seed CSV files')
    parser.add_argument('--out', required=True, type=Path, help='New --cases root')
    args = parser.parse_args()
    oracle = Path(__file__).resolve()
    export_table = 'bh_d106_' + secrets.token_hex(6)
    region, results = expected_cases(args.seed, export_table)
    args.out.mkdir(parents=True)
    for name, expected in results.items():
        source = oracle.parent / 'cases' / name
        target = args.out / name
        target.mkdir()
        task = (source / 'task.md').read_text(encoding='utf-8')
        task = task.replace('{{REGION}}', region).replace('{{EXPORT_TABLE}}', export_table)
        (target / 'task.md').write_text(task, encoding='utf-8')
        if (source / 'case.json').is_file():
            shutil.copyfile(source / 'case.json', target / 'case.json')
        (target / 'oracle.py').symlink_to(oracle)
        (target / 'expected.json').write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
