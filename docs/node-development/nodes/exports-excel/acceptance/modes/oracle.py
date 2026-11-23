"""Proposed complete XLS/XLSX value/style oracle, independent of Loginom."""
import argparse
import copy
import csv
import json
import math
from pathlib import Path
import tempfile

ROOT = Path(__file__).parent


def proposal():
    spec = json.loads((ROOT / 'expected.json').read_text(encoding='utf-8'))
    with (ROOT.parent.parent / 'fixtures/modes.csv').open(encoding='utf-8', newline='') as stream:
        rows = list(csv.reader(stream))
    assert rows.pop(0) == ['Code', 'Amount'], 'FIXTURE_COLUMNS'
    assert [[r[0], float(r[1])] for r in rows] == spec['input_rows'], 'FIXTURE_VALUES'
    return spec


def sheets_for(case):
    spec = proposal()
    result = {'Данные': [['Code', 'Amount'], *copy.deepcopy(spec['input_rows'])]}
    if case == 'append':
        result['Данные'].insert(1, ['OLD', 99.25])
    if case in ['append', 'replace-sheet']:
        result['Контроль'] = [['Key', 'Value'], ['сохранить', 321]]
    if case == 'seed':
        result = {'Данные': [['Code', 'Amount'], ['OLD', 99.25]], 'Контроль': [['Key', 'Value'], ['сохранить', 321]]}
    assert case in spec['cases'], 'UNKNOWN_CASE'
    return result


def read_book(path):
    if path.suffix.lower() == '.xlsx':
        import openpyxl
        assert path.read_bytes().startswith(b'PK\x03\x04'), 'NOT_XLSX'
        book = openpyxl.load_workbook(path, data_only=False)
        result = {}
        for sheet in book:
            assert sheet.sheet_state == 'visible' and not sheet.merged_cells.ranges, 'SHEET_STRUCTURE'
            rows, formats = [], []
            for row in sheet:
                assert all(c.data_type not in ['f', 'e'] for c in row), 'FORMULA_OR_ERROR'
                rows.append([c.value for c in row])
                formats.append([c.number_format for c in row])
            result[sheet.title] = (rows, formats)
        book.close()
        return result
    import xlrd
    assert path.suffix.lower() == '.xls' and path.read_bytes().startswith(bytes.fromhex('d0cf11e0a1b11ae1')), 'NOT_XLS_OLE'
    book = xlrd.open_workbook(path, formatting_info=True)
    result = {}
    for sheet in book.sheets():
        assert not sheet.visibility and not sheet.merged_cells, 'SHEET_STRUCTURE'
        rows, formats = [], []
        for i in range(sheet.nrows):
            row, fmt = [], []
            for j in range(sheet.ncols):
                c = sheet.cell(i, j)
                assert c.ctype in [xlrd.XL_CELL_TEXT, xlrd.XL_CELL_NUMBER], 'CELL_TYPE'
                row.append(c.value)
                fmt.append(book.format_map[book.xf_list[c.xf_index].format_key].format_str)
            rows.append(row)
            formats.append(fmt)
        result[sheet.name] = (rows, formats)
    book.release_resources()
    return result


def check(case, path):
    expected = sheets_for(case)
    actual = read_book(path)
    assert list(actual) == list(expected), 'SHEET_NAMES_ORDER'
    for name, rows in expected.items():
        values, formats = actual[name]
        if name == 'Контроль':
            seed = ROOT.parent.parent / 'fixtures' / ('existing' + path.suffix.lower())
            assert formats == read_book(seed)[name][1], 'UNREQUESTED_SHEET_STYLES'
        assert len(values) == len(rows), 'ROW_COUNT_' + name
        for i, row in enumerate(rows):
            assert len(values[i]) == len(row), 'COLUMN_COUNT'
            for j, value in enumerate(row):
                observed = values[i][j]
                if isinstance(value, (int, float)):
                    assert type(observed) in [int, float] and math.isfinite(observed), 'NUMERIC_TYPE'
                    assert math.isclose(observed, value, rel_tol=1e-12, abs_tol=1e-9), 'NUMERIC_VALUE'
                else:
                    assert type(observed) is str and observed == value, 'TEXT_VALUE'
                if case == 'numeric' and name == 'Данные' and i > 0 and j == 1:
                    assert formats[i][j] == '#,##0.00', 'NUMERIC_CELL_FORMAT'


def write_book(path, sheets, numeric=False):
    """Independent writers used only for seeds and reader qualification."""
    if path.suffix == '.xlsx':
        import openpyxl
        book = openpyxl.Workbook()
        book.remove(book.active)
        for name, rows in sheets.items():
            sheet = book.create_sheet(name)
            for row in rows:
                sheet.append(row)
            if numeric and name == 'Данные':
                for row in sheet.iter_rows(min_row=2, min_col=2, max_col=2):
                    row[0].number_format = '#,##0.00'
        book.save(path)
        book.close()
        return
    import xlwt
    book = xlwt.Workbook()
    style = xlwt.easyxf(num_format_str='#,##0.00')
    for name, rows in sheets.items():
        sheet = book.add_sheet(name)
        for i, row in enumerate(rows):
            for j, value in enumerate(row):
                sheet.write(i, j, value, style if numeric and name == 'Данные' and i > 0 and j == 1 else xlwt.Style.default_style)
    book.save(str(path))


def self_check():
    with tempfile.TemporaryDirectory() as temp:
        for ext in ['xls', 'xlsx']:
            path = Path(temp) / ('result.' + ext)
            for case in proposal()['cases']:
                sheets = sheets_for(case)
                write_book(path, sheets, case == 'numeric')
                check(case, path)
                damaged = copy.deepcopy(sheets)
                damaged['Данные'][1][1] += 0.01
                write_book(path, damaged, case == 'numeric')
                try:
                    check(case, path)
                except AssertionError:
                    continue
                raise AssertionError('ORACLE_ACCEPTED_MUTATION')
            for case, damage in [('numeric', 'format'), ('append', 'header'), ('replace-sheet', 'old'), ('append', 'sentinel')]:
                sheets = sheets_for(case)
                if damage == 'header':
                    sheets['Данные'].insert(2, ['Code', 'Amount'])
                if damage == 'old':
                    sheets['Данные'].append(['OLD', 99.25])
                if damage == 'sentinel':
                    sheets['Контроль'][1][1] = 0
                write_book(path, sheets)
                try:
                    check(case, path)
                except AssertionError:
                    continue
                raise AssertionError('ORACLE_ACCEPTED_' + damage)
    for ext in ['xls', 'xlsx']:
        check('seed', ROOT.parent.parent / 'fixtures' / ('existing.' + ext))
    print('PASS: XLS/XLSX readers, seeds, values, styles and negative checks')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--self-check', action='store_true')
    p.add_argument('--case', choices=['new', 'numeric', 'replace-workbook', 'append', 'replace-sheet', 'seed'])
    p.add_argument('--file', type=Path)
    a = p.parse_args()
    if a.self_check:
        self_check()
    else:
        if not a.case or not a.file:
            p.error('--case and --file required')
        check(a.case, a.file)
        print('PASS: complete workbook values and requested styles')
