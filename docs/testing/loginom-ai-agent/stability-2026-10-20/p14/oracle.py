#!/usr/bin/env python3
"""Independent calculation from delivered input only; no generator/expected/network."""
import csv
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(name):
    with (ROOT / 'data' / name).open(encoding='utf-8', newline='') as stream:
        return list(csv.DictReader(stream))


from zipfile import ZipFile
from xml.etree import ElementTree as ET
from posixpath import dirname, join, normpath

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'p': 'http://schemas.openxmlformats.org/package/2006/relationships'}
# Resolve the workbook and first-sheet relationships rather than assuming sheet1.
with ZipFile(ROOT / 'data/exhibits.xlsx') as book:
    relationships = ET.fromstring(book.read('_rels/.rels'))
    workbook_path = next(r.get('Target').lstrip('/') for r in relationships
                         if r.get('Type').endswith('/officeDocument'))
    workbook = ET.fromstring(book.read(workbook_path))
    first = workbook.find('s:sheets/s:sheet', NS)
    rid = first.get('{' + NS['r'] + '}id')
    relpath = join(dirname(workbook_path), '_rels', Path(workbook_path).name + '.rels')
    target = next(r.get('Target') for r in ET.fromstring(book.read(relpath)) if r.get('Id') == rid)
    sheet_path = target.lstrip('/') if target.startswith('/') else normpath(join(dirname(workbook_path), target))
    records = []
    for row in ET.fromstring(book.read(sheet_path)).findall('s:sheetData/s:row', NS):
        values = {}
        for cell in row.findall('s:c', NS):
            column = ''.join(ch for ch in cell.get('r') if ch.isalpha())
            values[column] = (''.join(cell.find('s:is', NS).itertext()) if cell.get('t') == 'inlineStr'
                              else cell.find('s:v', NS).text)
        assert set(values) == {'A', 'B', 'C'}
        records.append([values[c] for c in 'ABC'])
headers, *records = records
assert headers == ['Id', 'Gallery', 'Weight']
rows = [dict(Id=int(r[0]), Gallery=r[1], Weight=float(Fraction(r[2]))) for r in records]
assert len(rows) == 15 and len({r['Id'] for r in rows}) == len(rows)

columns = [('Id', 'integer'), ('Gallery', 'string'), ('Weight', 'real')]
expected = {
    'package_path': sys.argv[1] if len(sys.argv) > 1 else '/stability-2026-10-20/p14.lgp',
    'nodes': [{'type': kind} for kind in ['imports.excel', 'exports.text']],
    'outputs': [{
        'output_node_type': 'export_input',
        'export_destination': '/stability-2026-10-20/exhibit-weights.csv',
        'ordered': False,
        'column_order': 'any',
        'columns': [{'name': name, 'type': kind, 'label_any': True,
                     **({'tolerance': {'abs': 1e-8, 'rel': 1e-10}} if kind == 'real' else {})}
                    for name, kind in columns],
        'rows': rows,
    }],
}
sys.stdout.buffer.write((json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8'))
