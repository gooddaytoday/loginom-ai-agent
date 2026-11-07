"""Small deterministic Excel sources; no Loginom dependency or expected output."""
from pathlib import Path
import datetime
import hashlib
import json
import zipfile

import xlsxwriter
import xlwt

root = Path(__file__).parent / 'fixtures'
root.mkdir(exist_ok=True)


def workbook(name, sheets, named=None):
    path = root / name
    book = xlsxwriter.Workbook(path)
    book.set_properties({'created': datetime.datetime(2026, 1, 1)})
    for title, rows in sheets.items():
        sheet = book.add_worksheet(title)
        for index, row in enumerate(rows):
            sheet.write_row(index, 0, row)
    if named:
        book.define_name('SalesRange', named)
    book.close()
    with zipfile.ZipFile(path) as source:
        entries = {name: source.read(name) for name in source.namelist()}
    if path.suffix == '.xlsm':
        # A valid macro-enabled OOXML workbook with no VBA project/macros.
        entries['[Content_Types].xml'] = entries['[Content_Types].xml'].replace(
            b'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
            b'application/vnd.ms-excel.sheet.macroEnabled.main+xml')
    with zipfile.ZipFile(path, 'w') as target:
        for name, content in sorted(entries.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            target.writestr(info, content)


workbook('wide16.xlsx', {'Data': [[f'C{i:02}' for i in range(1, 17)],
                                list(range(1, 17)), list(range(101, 117))]})
workbook('headers11.xlsx', {'Data': [['Id', 'Amount']] * 11 + [[1, 10], [2, 20]]})
workbook('boolean.xlsx', {'Data': [['Id', 'Active'], [1, False], [2, True], [3, None]]})
workbook('named.xlsx', {'Data': [['Ignore', 'Id', 'Amount'], ['outside', 1, 10],
                               ['outside', 2, 20], ['outside', 3, 30]],
                        'Other': [['Id', 'Amount'], [99, 990]]}, '=Data!$B$1:$C$3')
for name, rows in [('sales-a.xlsx', [['Id', 'Amount'], [1, 10], [2, 20]]),
                   ('sales-b.xlsx', [['Id', 'Amount'], [3, 30]]),
                   ('schema-ab.xlsx', [['A', 'B'], [1, 10]]),
                   ('schema-bc.xlsx', [['B', 'C'], [20, 2]]),
                   ('schema-abd.xlsx', [['A', 'B', 'D'], [1, 10, 'new']]),
                   ('types-a.xlsx', [['Id', 'Value'], [1, 10]]),
                   ('types-b.xlsx', [['Id', 'Value'], [2, 'text']]),
                   ('format.xlsm', [['Id', 'Amount'], [1, 10], [2, 20]])]:
    workbook(name, {'Data': rows})
book = xlwt.Workbook()
sheet = book.add_sheet('Data')
for r, row in enumerate([['Id', 'Amount'], [71, 710], [72, 720]]):
    for c, value in enumerate(row):
        sheet.write(r, c, value)
book.save(str(root / 'legacy.xls'))
files = []
for path in sorted(root.glob('*')):
    if path.suffix not in ('.xlsx', '.xlsm', '.xls'):
        continue
    data = path.read_bytes()
    files.append({'file': path.name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
(root / 'manifest.json').write_text(json.dumps({
    'writer': 'XlsxWriter 3.2.9; xlwt 1.3.0',
    'xlsm': 'macro-enabled content type; no vbaProject.bin, no macros',
    'server_mtime': 'not encoded in workbook; bind after upload, never use ZIP timestamps',
    'files': files}, ensure_ascii=False, indent=2) + '\n')
