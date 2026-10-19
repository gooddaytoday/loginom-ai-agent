#!/usr/bin/env python3
"""Synthetic fixtures, fixed seed; Python standard library only."""
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


from xml.sax.saxutils import escape
from zipfile import ZipFile, ZipInfo, ZIP_STORED

rows = [[i, rng.choice(['East', 'West', 'Atrium']), f'{rng.randrange(1, 161) / 4:.2f}']
        for i in range(1, 16)]
rng.shuffle(rows)
write('exhibits.csv', ['Id', 'Gallery', 'Weight'], rows)
# The CSV is an operator-only source copy; the model receives only the workbook.
ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
xml_rows = []
for index, values in enumerate([['Id', 'Gallery', 'Weight'], *rows], 1):
    cells = []
    for column, value in zip('ABC', values):
        ref = f'{column}{index}'
        if index == 1 or column == 'B':
            cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>')
        else:
            cells.append(f'<c r="{ref}" t="n"><v>{value}</v></c>')
    xml_rows.append(f'<row r="{index}">{"".join(cells)}</row>')
parts = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Exhibits" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': f'<worksheet xmlns="{ns}"><dimension ref="A1:C16"/><sheetData>{"".join(xml_rows)}</sheetData></worksheet>',
}
# Fixed ZIP timestamps and stored bytes make XLSX reproducible across cwd and runs.
with ZipFile(ROOT / 'data/exhibits.xlsx', 'w', compression=ZIP_STORED) as book:
    for name, value in parts.items():
        info = ZipInfo(name, date_time=(2026, 10, 19, 0, 0, 0))
        info.compress_type = ZIP_STORED
        info.create_system = 0
        book.writestr(info, value.encode('utf-8'))
