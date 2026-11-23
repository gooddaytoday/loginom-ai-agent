"""Independent proposal, OpenPyXL/xlrd. Never send this or expected.json to the model.

--check compares the committed proposal byte-for-byte; it is not a Loginom run.
Server-dependent provenance is a separate, explicitly unbound proposal.
"""
from pathlib import Path
import argparse
import hashlib
import json

import openpyxl
import xlrd

root = Path(__file__).parent
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
manifest = json.loads((root / 'fixtures/manifest.json').read_text())
for entry in manifest['files']:
    data = (root / 'fixtures' / entry['file']).read_bytes()
    assert len(data) == entry['bytes']
    assert hashlib.sha256(data).hexdigest() == entry['sha256']


def read(file, header=1, region=None):
    book = openpyxl.load_workbook(root / 'fixtures' / file, data_only=True)
    sheet = book['Data']
    rows = [list(row) for row in (sheet.values if region is None else
                                 sheet.iter_rows(min_row=region[0], max_row=region[1],
                                                 min_col=region[2], max_col=region[3], values_only=True))]
    return rows[0], rows[header:]


def output(names, rows, types, destination):
    assert all(len(row) == len(names) for row in rows)
    assert len(types) == len(names)
    for row in rows:
        for value, kind in zip(row, types):
            if value is None:
                continue
            assert {'integer': type(value) is int, 'boolean': type(value) is bool,
                    'string': type(value) is str, 'datetime': type(value) is str}[kind], (value, kind)
    return {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': 'imports.excel'}, {'type': 'exports.text'}],
            'outputs': [{'output_node_type': 'imports.excel', 'output_port': 0,
                         'export_destination': destination, 'ordered': True,
                         'column_order': 'exact',
                         'columns': [{'name': name, 'label': name, 'label_any': True, 'type': kind}
                                     for name, kind in zip(names, types)],
                         'rows': [dict(zip(names, row)) for row in rows]}]}


cases = {}
for case, file, header in [('wide16', 'wide16.xlsx', 1), ('headers11', 'headers11.xlsx', 11),
                           ('boolean', 'boolean.xlsx', 1), ('xlsm', 'format.xlsm', 1)]:
    names, rows = read(file, header)
    if case == 'headers11':
        # Native multi-header naming joins nonempty header tokens by '_'.
        names = ['_'.join([name] * header) for name in names]
    kinds = ['integer'] * len(names) if case != 'boolean' else ['integer', 'boolean']
    cases[case] = output(names, rows, kinds, case + '.csv')
book = openpyxl.load_workbook(root / 'fixtures/named.xlsx', data_only=True)
assert list(book.defined_names['SalesRange'].destinations) == [('Data', '$B$1:$C$3')]
for case, end in [('named-fixed', 3), ('named-extend', 4)]:
    names, rows = read('named.xlsx', region=(1, end, 2, 3))
    cases[case] = output(names, rows, ['integer', 'integer'], case + '.csv')
names, a = read('sales-a.xlsx')
other, b = read('sales-b.xlsx')
assert names == other
cases['multi-list'] = output(names, a + b, ['integer', 'integer'], 'multi.csv')
cases['multi-mask'] = output(names, a + b, ['integer', 'integer'], 'mask.csv')
cases['multi-parallel'] = output(names, a + b, ['integer', 'integer'], 'parallel.csv')
cases['multi-parallel']['outputs'][0]['ordered'] = False
for mode in ['name', 'relative', 'absolute']:
    for mtime in [False, True]:
        case = 'file-info-' + mode + ('-mtime' if mtime else '')
        files = ['sales-a.xlsx'] * len(a) + ['sales-b.xlsx'] * len(b)
        values = [file if mode == 'name' else '{{' + mode.upper() + '_PATH_' + file + '}}' for file in files]
        rows = [row + [value] + (['{{SERVER_MTIME_' + file + '}}'] if mtime else [])
                for row, file, value in zip(a + b, files, values)]
        cases[case] = output(names + ['FileName'] + (['FileTime'] if mtime else []), rows,
                             ['integer', 'integer', 'string'] + (['datetime'] if mtime else []), case + '.csv')
        cases[case]['outputs'][0]['columns'][2]['label'] = 'Имя файла'
        if mtime:
            cases[case]['outputs'][0]['columns'][3]['label'] = 'Время модификации'
for case, rows in [('variable-a', a), ('variable-b', b)]:
    cases[case] = output(names, rows, ['integer', 'integer'], case + '.csv')
sheet = xlrd.open_workbook(root / 'fixtures/legacy.xls').sheet_by_name('Data')
xls_rows = [[int(sheet.cell_value(r, c)) for c in range(2)] for r in range(1, sheet.nrows)]
cases['xls-if-supported'] = output(sheet.row_values(0), xls_rows, ['integer', 'integer'], 'xls.csv')
# These specify user-intended policies before implementation. They do not infer
# accepted runtime behavior from an observed Loginom table.
cases['auto-all-bc'] = output(['B', 'C'], [[20, 2]], ['integer', 'integer'], 'all.csv')
cases['auto-new-bc'] = output(['A', 'B'], [[20, 2]], ['integer'] * 2, 'new-position.csv')
cases['auto-none-bc'] = output(['A', 'B'], [[20, 2]], ['integer'] * 2, 'none.csv')
names_abd, rows_abd = read('schema-abd.xlsx')
cases['auto-new-abd'] = output(names_abd, rows_abd, ['integer', 'integer', 'string'], 'new.csv')
cases['auto-new-bc-to-ab'] = output(['B', 'C'], [[1, 10]], ['integer'] * 2, 'new-reverse.csv')
cases['auto-new-bc-to-abd'] = output(['B', 'C', 'D'], rows_abd, ['integer', 'integer', 'string'], 'new-append.csv')
cases['auto-none-saved-bc'] = output(['B', 'C'], [[20, 2]], ['integer'] * 2, 'none-saved.csv')
cases['auto-type-a'] = output(['Id', 'Value'], [[1, 10]], ['integer', 'integer'], 'type-before.csv')
cases['auto-type-b'] = output(['Id', 'Value'], [[2, 'text']], ['integer', 'string'], 'type.csv')
cases['http-if-available'] = output(names, a, ['integer', 'integer'], 'http.csv')
expected = {'status': 'proposal_requires_owner_approval', 'cases': cases,
            'unbound': {
                'file_info': 'Bind path/mtime placeholders to independent server source receipts before execution; never use actual output, local or ZIP mtime.',
                'http_basic': 'Own reachable HTTP source and secret handle required; no endpoint/credential supplied.',
                'xls': 'Positive table conditional on native Linux support; actual refusal documented separately.'}}
text = json.dumps(expected, ensure_ascii=False, indent=2) + '\n'
path = root / 'expected.json'
if args.check:
    assert path.read_text() == text, 'expected.json differs from independent proposal'
    print(f'PASS: {len(manifest["files"])} source hashes, {len(cases)} independent proposed tables')
else:
    path.write_text(text)
