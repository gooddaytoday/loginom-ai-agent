#!/usr/bin/env python3
"""Create the four chains' source files with stable contents and metadata."""

import argparse
import csv
from pathlib import Path
import re
import sqlite3
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
from io import BytesIO

from openpyxl import Workbook


def delimited(path, rows, encoding, delimiter):
    with path.open('w', encoding=encoding, newline='') as stream:
        csv.writer(stream, delimiter=delimiter).writerows(rows)


def xlsx(path):
    book = Workbook()
    book.active.title = 'Заказы'
    for name, rows in (
        ('Заказы', [('OrderID', 'ProductID', 'Revenue'), (101, 8, 13.25),
                    (102, 7, 22.5), (103, 8, 6.5), (104, 9, 4.25)]),
        ('Товары', [('ProductID', 'Category'), (7, 'Книги'), (8, 'Кофе'), (9, 'Книги')]),
        ('Архив', [('OrderID', 'ProductID', 'Revenue'), (900, 8, 500.25)]),
    ):
        sheet = book[name] if name in book else book.create_sheet(name)
        for row in rows:
            sheet.append(row)
    source = BytesIO()
    book.save(source)
    with ZipFile(source) as original, ZipFile(path, 'w') as stable:
        for name in sorted(original.namelist()):
            data = original.read(name)
            if name == 'docProps/core.xml':
                data = re.sub(rb'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ',
                              b'2025-01-01T00:00:00Z', data)
            stable.writestr(ZipInfo(name), data, compress_type=ZIP_DEFLATED)


def sqlite(path):
    db = sqlite3.connect(':memory:')
    try:
        with db:
            db.executescript("""
                CREATE TABLE orders (OrderID INTEGER, ProductID INTEGER, Revenue REAL);
                CREATE TABLE products (ProductID INTEGER PRIMARY KEY, Category TEXT);
                INSERT INTO orders VALUES (201, 10, 15.25), (202, 20, 2.50),
                    (203, 10, 4.75), (204, 30, 8.50);
                INSERT INTO products VALUES (10, 'Чай'), (20, 'Книги'), (40, 'Архив');
            """)
        path.write_bytes(db.serialize())
    finally:
        db.close()


def generate(out):
    inputs = {}
    for chain in (47, 48, 49, 50):
        inputs[chain] = out / f'bh-w{chain}-t1' / 'data'
        inputs[chain].mkdir(parents=True, exist_ok=True)

    xlsx(inputs[47] / 'sales.xlsx')
    delimited(inputs[48] / 'payments.tsv', [
        ('X', 'Amount', 'Note'),
        ('31.12.2024', '12,50', 'Аванс'),
        ('01.01.2025', '7,25', 'Оплата'),
        ('15.04.2025', '-3,75', 'Возврат'),
        ('31.12.2025', '18,50', 'Оплата'),
        ('01.01.2026', '9,25', 'Перенос'),
    ], 'cp1251', '\t')
    sqlite(inputs[49] / 'sales.db')
    header = ('ReceiptID', 'Item', 'Amount')
    delimited(inputs[50] / 'january.csv', [
        header, (1001, 'Кофе, молотый', 7.25), (1002, 'Чай; чёрный', 3.75),
        (1002, 'Чай; чёрный', 3.75),
    ], 'utf-8-sig', ',')
    delimited(inputs[50] / 'february.csv', [
        header, (1002, 'Чай; чёрный', 3.75), (1003, 'Книга', 18.5),
        (1003, 'Книга', 19.5),
    ], 'cp1251', ';')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    generate(parser.parse_args().out)
