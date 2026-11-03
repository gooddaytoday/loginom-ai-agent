"""Proposed independent OOXML oracle; Python stdlib, no Loginom imports."""
import argparse
import csv
import datetime as dt
import json
import math
from pathlib import Path, PurePosixPath
import re
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).parent
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_fixture(expected):
    with (ROOT.parent / 'fixtures/cells.csv').open(newline='', encoding='utf-8') as stream:
        source = list(csv.reader(stream))
    require(source.pop(0) == [c['name'] for c in expected['columns']], 'FIXTURE_HEADER')
    rows = []
    for row in source:
        require(len(row) == 5, 'FIXTURE_WIDTH')
        rows.append([None if v == 'NULL' else int(v) if i == 0 else float(v)
                     if i == 2 else {'true': True, 'false': False}[v] if i == 4 else v
                     for i, v in enumerate(row)])
    require(rows == expected['rows'] and len(rows) == expected['row_count'], 'FIXTURE_VALUES')
    require(sum(r[2] or 0 for r in rows) == 1242.06789, 'FIXTURE_AMOUNT_SUM')
    require(sum(v is None for r in rows for v in r) == 4, 'FIXTURE_NULL_COUNT')
    with (ROOT.parent / 'fixtures/empty.csv').open(newline='', encoding='utf-8') as stream:
        require(list(csv.reader(stream)) == [[c['name'] for c in expected['columns']]], 'EMPTY_FIXTURE')


def read_xlsx(path):
    require(path.read_bytes()[:4] == b'PK\x03\x04', 'NOT_XLSX_ZIP')
    with zipfile.ZipFile(path) as book:
        require(book.testzip() is None, 'ZIP_CRC')
        require(sum(i.file_size for i in book.infolist()) <= 2_000_000, 'SMALL_WORKBOOK_ONLY')
        workbook = ET.fromstring(book.read('xl/workbook.xml'))
        sheets = workbook.findall('s:sheets/s:sheet', NS)
        require(len(sheets) == 1, 'EXACTLY_ONE_SHEET')
        require(sheets[0].get('state', 'visible') == 'visible', 'HIDDEN_SHEET')
        relations = ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))
        matches = [r for r in relations if r.get('Id') == sheets[0].get(REL)]
        require(len(matches) == 1 and matches[0].get('TargetMode') != 'External', 'SHEET_RELATION')
        target = matches[0].get('Target', '')
        require(target and '..' not in PurePosixPath(target).parts, 'SHEET_PATH')
        sheet_path = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        sheet = ET.fromstring(book.read(sheet_path))
        require(not sheet.findall('.//s:mergeCell', NS), 'MERGED_CELLS')
        shared = []
        if 'xl/sharedStrings.xml' in book.namelist():
            shared = [''.join(t.text or '' for t in item.findall('.//s:t', NS))
                      for item in ET.fromstring(book.read('xl/sharedStrings.xml'))]
        styles, date_styles = [], set()
        if 'xl/styles.xml' in book.namelist():
            styles = ET.fromstring(book.read('xl/styles.xml'))
            formats = {int(n.get('numFmtId')): n.get('formatCode', '')
                       for n in styles.findall('s:numFmts/s:numFmt', NS)}
            for i, style in enumerate(styles.findall('s:cellXfs/s:xf', NS)):
                code = int(style.get('numFmtId', '0'))
                fmt = re.sub(r'"[^"]*"|\\.|\[[^]]*\]', '', formats.get(code, ''))
                if code in set(range(14, 23)) | set(range(27, 37)) | set(range(45, 48)) | set(range(50, 59)) or re.search('[ymdhs]', fmt, re.I):
                    date_styles.add(i)
        properties = workbook.find('s:workbookPr', NS)
        epoch = dt.datetime(1904, 1, 1) if properties is not None and properties.get('date1904') in ['1', 'true'] else dt.datetime(1899, 12, 30)
        cells = {}
        for cell in sheet.findall('s:sheetData/s:row/s:c', NS):
            address = cell.get('r')
            require(address and re.fullmatch('[A-Z]+[1-9][0-9]*', address) and address not in cells, 'CELL_ADDRESS')
            require(cell.find('s:f', NS) is None, 'FORMULA_' + address)
            kind = cell.get('t', 'n')
            value = cell.find('s:v', NS)
            text = value.text if value is not None else None
            if kind == 'inlineStr':
                inline = cell.find('s:is', NS)
                actual = ''.join(t.text or '' for t in inline.findall('.//s:t', NS)) if inline is not None else ''
            elif kind == 's':
                require(text is not None and 0 <= int(text) < len(shared), 'SHARED_STRING')
                actual = shared[int(text)]
            elif text is None:
                require(kind in ['n', 'str'], 'UNSUPPORTED_BLANK_TYPE')
                actual = '' if kind == 'str' else None
            elif kind == 'b':
                require(text in ['0', '1'], 'BOOLEAN_ENCODING')
                actual = text == '1'
            elif kind == 'd':
                actual = dt.datetime.fromisoformat(text)
            elif kind == 'n':
                number = float(text)
                require(math.isfinite(number), 'NONFINITE_NUMBER')
                actual = epoch + dt.timedelta(days=number) if int(cell.get('s', '0')) in date_styles else number
            elif kind == 'str':
                actual = text
            else:
                raise ValueError('UNSUPPORTED_CELL_TYPE_' + kind)
            cells[address] = actual
        return sheets[0].get('name'), cells


def verify(path, expected):
    require(path.name == expected['filename'], 'FILENAME')
    name, cells = read_xlsx(path)
    require(name == expected['sheet_name'], 'SHEET_NAME')
    columns = expected['columns']
    require(len(columns) <= 26 and expected['ordered'] is True and expected['output_port'] is None, 'PROPOSAL_SHAPE')
    header = expected['header']
    rows = ([] if header == 'none' else [[c['name'] if header == 'names' else c['label'] for c in columns]]) + expected['rows']
    require(len(expected['rows']) == expected['row_count'], 'EXPECTED_ROW_COUNT')
    addresses = {chr(65 + j) + str(i + 1) for i in range(len(rows)) for j in range(len(columns))}
    require(not (set(cells) - addresses), 'EXTRA_CELLS')
    for i, row in enumerate(rows):
        for j, wanted in enumerate(row):
            address = chr(65 + j) + str(i + 1)
            got = cells.get(address)
            kind = 'string' if header != 'none' and i == 0 else columns[j]['type']
            if wanted is None:
                valid = got is None
            elif kind == 'boolean':
                valid = type(got) is bool and got == wanted
            elif kind == 'string':
                valid = type(got) is str and got == wanted
            elif kind == 'datetime':
                valid = isinstance(got, dt.datetime) and got.tzinfo is None and abs((got - dt.datetime.fromisoformat(wanted)).total_seconds() * 1000) <= columns[j]['tolerance']['abs_ms']
            else:
                tolerance = columns[j].get('tolerance', {})
                valid = type(got) in [int, float] and math.isfinite(got) and abs(got - wanted) <= max(tolerance.get('abs', 0), tolerance.get('rel', 0) * abs(wanted))
                if kind == 'integer':
                    valid = valid and got == int(got)
            require(valid, 'CELL_VALUE_OR_TYPE_' + address)
    return {'status': 'PASS', 'scope': 'downloaded_xlsx_only', 'data_rows': expected['row_count'], 'columns': len(columns), 'cells': len(rows) * len(columns)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected', type=Path, default=ROOT / 'expected.json')
    parser.add_argument('--xlsx', type=Path)
    args = parser.parse_args()
    expected = json.loads(args.expected.read_text(encoding='utf-8'))
    check_fixture(json.loads((ROOT / 'expected.json').read_text(encoding='utf-8')))
    print(json.dumps(verify(args.xlsx, expected) if args.xlsx else {'status': 'CHECKED', 'scope': 'fixtures_only', 'data_rows': 5, 'data_cells': 25, 'nulls': 4}, ensure_ascii=False))


if __name__ == '__main__':
    main()
