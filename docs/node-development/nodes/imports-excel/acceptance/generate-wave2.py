"""Deterministic XlsxWriter fixtures; expected values are read independently by oracle.py."""
from pathlib import Path
import datetime
import zipfile
import xlsxwriter

ROOT = Path(__file__).parent


def workbook(case, filename, sheets):
    path = ROOT / case / 'data' / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    book = xlsxwriter.Workbook(path)
    book.set_properties({'created': datetime.datetime(2026, 1, 1)})
    date = book.add_format({'num_format': 'yyyy-mm-dd hh:mm:ss'})
    for name, headers, rows in sheets:
        sheet = book.add_worksheet(name)
        sheet.write_row(0, 0, headers)
        for r, row in enumerate(rows, 1):
            for c, value in enumerate(row):
                if isinstance(value, datetime.datetime):
                    sheet.write_datetime(r, c, value, date)
                elif value is not None:
                    sheet.write(r, c, value)
    book.close()
    with zipfile.ZipFile(path) as archive:
        entries = {n: archive.read(n) for n in archive.namelist()}
    with zipfile.ZipFile(path, 'w') as archive:
        for name, value in sorted(entries.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            archive.writestr(info, value)


day = datetime.datetime(2026, 2, 3, 12, 34, 56)
workbook('excel-import-sheet', 'departments.xlsx', [
    ('Описание', ['Description'], [['Служебный лист, не продажи']]),
    ('Продажи 2026', ['Id', 'Region', 'Amount'], [
        [1, 'Север', 10], [2, None, -2.5], [3, 'Юг', None], [4, 'Запад', 0],
    ]),
    ('Archive', ['ArchiveCode', 'Closed'], [['OLD', day]]),
])
workbook('excel-import-wide', 'wide.xlsx', [
    ('Wide', ['Id', 'Region', 'Amount', 'Occurred', 'Units', 'Note', 'Rate', 'Booked',
              'Code', 'Cost', 'Comment', 'Balance'], [
        [1, 'North', 10, day, 3, 'Привет', 1.25, day, '001', 0, 'far right', 7],
        [2, None, -2.5, None, None, 'a;b', None, day, 'X', -3.75, None, None],
        [3, 'South', None, day, 0, None, 0, None, None, None, 'NULL', -9],
        [4, 'West', 0.125, day, -2, 'end', -0.5, day, 'Z', 2.5, 'last', 0],
    ]),
])
