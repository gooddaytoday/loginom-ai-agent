"""Independent expectations for Excel export with destination and sheet from variables.

Python stdlib only; no Loginom or runtime imports. The XLSX reader is the
approved stdlib reader of ../oracle.py (LAB-641), loaded by path.
"""
import argparse
import csv
import importlib.util
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
FIXTURE = ROOT.parents[1] / 'fixtures/modes.csv'
COLUMNS = [{'name': 'Code', 'label': 'Code', 'type': 'string'},
           {'name': 'Amount', 'label': 'Amount', 'type': 'real', 'tolerance': {'abs': 1e-9, 'rel': 1e-12}}]
BOOKS = [('initial', 'excel-var-a.xlsx', 'Январь'), ('final', 'excel-var-b.xlsx', 'Февраль')]


def base_reader():
    spec = importlib.util.spec_from_file_location('excel_base_oracle', ROOT.parent / 'oracle.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rows():
    with FIXTURE.open(encoding='utf-8', newline='') as stream:
        source = list(csv.reader(stream))
    if source.pop(0) != [c['name'] for c in COLUMNS]:
        raise ValueError('FIXTURE_HEADER')
    return [[code, float(amount)] for code, amount in source]


def expected():
    data = rows()
    books = [{'phase': phase, 'output_node_type': 'exports.excel', 'output_port': None,
              'ordered': True, 'format': 'xlsx', 'header': 'names',
              'export_destination': '{{EXCEL_' + phase.upper() + '_DESTINATION}}',
              'filename': filename, 'sheet_name': sheet, 'columns': COLUMNS,
              'row_count': len(data), 'rows': data} for phase, filename, sheet in BOOKS]
    return {'proposal': True, 'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': 'variables.calculator', 'label_any': True},
                      {'type': 'exports.excel', 'label_any': True}],
            'variables': [{'name': 'ExcelPath', 'type': 'string',
                           'initial': '{{EXCEL_INITIAL_DESTINATION}}', 'final': '{{EXCEL_FINAL_DESTINATION}}'},
                          {'name': 'SheetName', 'type': 'string', 'initial': 'Январь', 'final': 'Февраль'}],
            'binding_inventory': [
                {'node': {'type': 'exports.excel'}, 'parameter': '/excel_export/destination', 'mode': 'variable',
                 'variable': {'kind': 'control', 'input': 0, 'name': 'ExcelPath', 'type': 'string', 'is_null': False},
                 'source': {'type': 'variables.calculator', 'output': 0}},
                {'node': {'type': 'exports.excel'}, 'parameter': '/excel_export/sheet_name', 'mode': 'variable',
                 'variable': {'kind': 'control', 'input': 0, 'name': 'SheetName', 'type': 'string', 'is_null': False},
                 'source': {'type': 'variables.calculator', 'output': 0}}],
            'excel_books': books}


def book_bytes(sheet, header, data):
    """Minimal synthetic XLSX for oracle qualification only (not a Loginom file)."""
    def cell(ref, value):
        if isinstance(value, str):
            text = value.replace('&', '&amp;').replace('<', '&lt;')
            return f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>'
        return f'<c r="{ref}"><v>{value!r}</v></c>'
    body = ''.join(f'<row r="{i + 1}">' + ''.join(cell(chr(65 + j) + str(i + 1), v) for j, v in enumerate(r)) + '</row>'
                   for i, r in enumerate([header] + data))
    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    rel = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as book:
        book.writestr('xl/workbook.xml', f'<workbook {ns} {rel}><sheets><sheet name="{sheet}" sheetId="1" r:id="rId1"/></sheets></workbook>')
        book.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                      '<Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        book.writestr('xl/worksheets/sheet1.xml', f'<worksheet {ns}><sheetData>{body}</sheetData></worksheet>')
    return out.getvalue()


def verify(book, path):
    reader = base_reader()
    return reader.verify(Path(path), {**book, 'ordered': True})


def self_check(exp, tmp):
    header = [c['name'] for c in COLUMNS]
    for book in exp['excel_books']:
        good = tmp / book['filename']
        good.write_bytes(book_bytes(book['sheet_name'], header, book['rows']))
        verify(book, good)
        for name, sheet, data in [('wrong-sheet', 'Лист1', book['rows']),
                                  ('stale-value', book['sheet_name'], [book['rows'][0], ['Б', -2.0], book['rows'][2]])]:
            bad = tmp / name / book['filename']
            bad.parent.mkdir(exist_ok=True)
            bad.write_bytes(book_bytes(sheet, header, data))
            try:
                verify(book, bad)
            except ValueError:
                continue
            raise SystemExit('Oracle accepted a bad workbook: ' + name)
    return 'OK: two books, sheet names and values; negative cases rejected'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--verify', nargs=2, metavar=('PHASE', 'XLSX'), help='PHASE initial|final')
    args = parser.parse_args()
    exp = expected()
    text = json.dumps(exp, ensure_ascii=False, indent=2) + '\n'
    if args.write:
        (ROOT / 'expected.json').write_text(text, encoding='utf-8')
    elif args.check:
        if (ROOT / 'expected.json').read_text(encoding='utf-8') != text:
            raise SystemExit('Stale Excel variable expectations')
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            print(self_check(exp, Path(tmp)))
    elif args.verify:
        phase, path = args.verify
        book = next(b for b in exp['excel_books'] if b['phase'] == phase)
        print(json.dumps(verify(book, path), ensure_ascii=False))
    else:
        print(text, end='')
