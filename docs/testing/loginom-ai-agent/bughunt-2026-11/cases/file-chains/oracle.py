#!/usr/bin/env python3
"""Read the original fixtures and calculate independent per-turn expectations."""

import argparse
from collections import defaultdict
import csv
from datetime import datetime
from decimal import Decimal
import json
from pathlib import Path
import sqlite3

from openpyxl import load_workbook


def schema(*fields):
    return [dict(name=name, type=kind, label_any=True) for name, kind in fields]


ORDERS = schema(('OrderID', 'integer'), ('ProductID', 'integer'), ('Revenue', 'real'))
PRODUCTS = schema(('ProductID', 'integer'), ('Category', 'string'))
JOINED = [*ORDERS, PRODUCTS[1]]
TOTALS = schema(('Category', 'string'), ('TotalRevenue', 'real'))
PAYMENTS = schema(('X', 'string'), ('Amount', 'real'), ('Note', 'string'))
DATED = [{**PAYMENTS[0], 'type': 'datetime'}, *PAYMENTS[1:]]
RECEIPTS = schema(('ReceiptID', 'integer'), ('Item', 'string'), ('Amount', 'real'))


def sheet_rows(book, sheet):
    _, *rows = book[sheet].values
    return rows


def text_rows(path, encoding, delimiter):
    with path.open(encoding=encoding, newline='') as stream:
        _, *rows = csv.reader(stream, delimiter=delimiter)
    return rows


def joined(orders, products):
    categories = dict(products)
    return [(*row, categories[row[1]]) for row in orders if row[1] in categories]


def node(key, kind, label=None):
    return dict(id=key, type=kind, **({'label': label} if label else {}))


def table(owner, columns, rows):
    return dict(output_node_type=owner['type'], output_node_label=owner['label'],
                output_port=0, column_order='exact', ordered=False, columns=columns,
                rows=[dict(zip((field['name'] for field in columns), row, strict=True)) for row in rows])


def link(source, target, input_port=0):
    return dict(source=source['id'], target=target['id'], output=0, input=input_port)


def expect(nodes, tables=(), links=(), outputs=()):
    return dict(nodes=[{k: v for k, v in n.items() if k != 'id'} for n in nodes],
                graph=dict(nodes=nodes, links=list(links)), outputs=list(outputs), tables=list(tables))


def excel_chain(data):
    with (data / 'sales.xlsx').open('rb') as stream:
        book = load_workbook(stream, read_only=True)
        orders = sheet_rows(book, 'Заказы')
        products = sheet_rows(book, 'Товары')
        book.close()
    rows = joined(orders, products)
    totals = defaultdict(Decimal)
    for _, _, revenue, category in rows:
        totals[category] += Decimal(str(revenue))
    orders_node = node('orders', 'imports.excel', 'Заказы')
    products_node = node('products', 'imports.excel', 'Товары')
    join_node = node('join', 'transform.join_data', 'Заказы с категориями')
    totals_node = node('totals', 'transform.group_data', 'Выручка по категориям')
    sources = [orders_node, products_node]
    links = [link(orders_node, join_node), link(products_node, join_node, 1)]
    return [
        expect([orders_node], [table(orders_node, ORDERS, orders)]),
        expect(sources, [table(products_node, PRODUCTS, products)]),
        expect([*sources, join_node], [table(join_node, JOINED, rows)], links),
        expect([*sources, join_node, totals_node],
               [table(totals_node, TOTALS, [(k, float(v)) for k, v in sorted(totals.items())])],
               [*links, link(join_node, totals_node)]),
    ]


def payment_chain(data):
    raw = [(stamp, float(value.replace(',', '.')), note)
           for stamp, value, note in text_rows(data / 'payments.tsv', 'cp1251', '\t')]
    parsed = [(datetime.strptime(stamp, '%d.%m.%Y'), value, note) for stamp, value, note in raw]
    dated = [(stamp.isoformat(timespec='milliseconds'), value, note) for stamp, value, note in parsed]
    filtered = [row for (stamp, _, _), row in zip(parsed, dated, strict=True) if stamp.year == 2025]
    source = node('payments', 'imports.text', 'Платежи')
    year = node('year', 'transform.filter_data', 'Платежи 2025')
    return [
        expect([source], [table(source, PAYMENTS, raw)]),
        expect([source], [table(source, DATED, dated)]),
        expect([source, year], [table(year, DATED, filtered)], [link(source, year)]),
    ]


def database_chain(data):
    path = data / 'sales.db'
    with sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True) as db:
        orders = db.execute('SELECT OrderID, ProductID, Revenue FROM orders').fetchall()
        products = db.execute('SELECT ProductID, Category FROM products').fetchall()
    rows = joined(orders, products)
    source = node('orders', 'imports.database', 'Заказы')
    query = node('query', 'imports.database', 'Заказы с категориями')
    export = node('export', 'exports.text')
    exported = table(query, JOINED, rows)
    for key in ('output_node_label', 'output_port'):
        del exported[key]
    exported.update(output_node_type='export_input', export_destination='joined_orders.csv')
    return [
        expect([source], [table(source, ORDERS, orders)]),
        expect([source, query], [table(query, JOINED, rows)]),
        expect([source, query, export], links=[link(query, export)], outputs=[exported]),
    ]


def receipt_chain(data):
    jan_rows, feb_rows = (
        [(int(receipt), item, float(amount))
         for receipt, item, amount in text_rows(data / name, encoding, delimiter)]
        for name, encoding, delimiter in (('january.csv', 'utf-8-sig', ','),
                                           ('february.csv', 'cp1251', ';'))
    )
    combined = jan_rows + feb_rows
    unique = list(dict.fromkeys(combined))
    jan = node('jan', 'imports.text', 'Январь')
    feb = node('feb', 'imports.text', 'Февраль')
    union = node('union', 'transform.union_data', 'Общий список')
    dedup = node('unique', 'transform.group_data', 'Уникальные строки')
    sources = [jan, feb]
    links = [link(jan, union), link(feb, union, 1)]
    return [
        expect(sources, [table(jan, RECEIPTS, jan_rows), table(feb, RECEIPTS, feb_rows)]),
        expect([*sources, union], [table(union, RECEIPTS, combined)], links),
        expect([*sources, union, dedup], [table(dedup, RECEIPTS, unique)], [*links, link(union, dedup)]),
    ]


def main(folder):
    stem, separator, suffix = folder.name.partition('-t')
    chain = {'bh-w47': excel_chain, 'bh-w48': payment_chain,
             'bh-w49': database_chain, 'bh-w50': receipt_chain}[stem]
    stages = chain(folder.parent / f'{stem}-t1' / 'data')
    print(json.dumps(stages[int(suffix) - 1 if separator else -1], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('case', type=Path)
    main(parser.parse_args().case)
