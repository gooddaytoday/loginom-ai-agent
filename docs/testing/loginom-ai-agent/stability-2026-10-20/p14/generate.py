#!/usr/bin/env python3
"""Synthetic fixtures, fixed seed; XLSX writer pinned in requirements.txt."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = 2214
rng = random.Random(SEED)


def write(name, columns, rows):
    (ROOT / 'data').mkdir(exist_ok=True)
    with (ROOT / 'data' / name).open('w', encoding='utf-8', newline='') as stream:
        writer = csv.writer(stream, lineterminator='\n')
        writer.writerow(columns)
        writer.writerows(rows)


rows = [[i, rng.choice(['East', 'West', 'Atrium']), f'{rng.randrange(1, 161) / 4:.2f}']
        for i in range(1, 16)]
rng.shuffle(rows)
write('exhibits.csv', ['Id', 'Gallery', 'Weight'], rows)
# The CSV is an operator-only source copy; the model receives only the workbook.
# Use the same complete XLSX writer as the accepted Excel stage1 corpus.
# Loginom 7.4.2 exposes COL1 for the previous hand-written minimal OOXML.
import datetime
from io import BytesIO
from zipfile import ZipFile, ZipInfo, ZIP_STORED
import xlsxwriter

buffer = BytesIO()
with xlsxwriter.Workbook(buffer) as book:
    book.set_properties({'created': datetime.datetime(2026, 10, 19)})
    sheet = book.add_worksheet('Exhibits')
    sheet.write_row(0, 0, ['Id', 'Gallery', 'Weight'])
    for index, (identifier, gallery, weight) in enumerate(rows, 1):
        sheet.write_row(index, 0, [identifier, gallery, float(weight)])

# Fixed ZIP timestamps/order keep the workbook reproducible.
with ZipFile(buffer) as source, ZipFile(ROOT / 'data/exhibits.xlsx', 'w') as target:
    for name in sorted(source.namelist()):
        info = ZipInfo(name, date_time=(2026, 10, 19, 0, 0, 0))
        info.compress_type = ZIP_STORED
        info.create_system = 0
        target.writestr(info, source.read(name))
