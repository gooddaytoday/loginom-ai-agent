"""Independent stdlib OOXML oracle for Excel C4: list, mask and parallel tables."""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).parent
data = root.parent / 'capabilities/fixtures'
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def rows(name):
    with zipfile.ZipFile(data / name) as z:
        sheets = [s.attrib['name'] for s in ET.fromstring(z.read('xl/workbook.xml')).findall('m:sheets/m:sheet', ns)]
        assert sheets == ['Data'], sheets
        strings = [''.join(s.itertext()) for s in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
        table = [[strings[int(c.find('m:v', ns).text)] if c.attrib.get('t') == 's' else int(c.find('m:v', ns).text)
                  for c in row.findall('m:c', ns)] for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//m:row', ns)]
    assert table[0] == ['Id', 'Amount'], table[0]
    return [dict(zip(table[0], r)) for r in table[1:]]


def expectation(ordered):
    # The explicit list keeps its file order; a mask enumerates natively and
    # parallel threads interleave, so both compare complete row multisets.
    return {
        'package_path': '{{PACKAGE_PATH}}',
        'nodes': [{'type': 'imports.excel'}],
        'outputs': [{'output_node_type': 'imports.excel', 'output_port': 0, 'ordered': ordered, 'column_order': 'exact',
                     'columns': [{'name': k, 'label': k, 'label_any': True, 'type': 'integer'} for k in ['Id', 'Amount']],
                     'rows': rows('sales-a.xlsx') + rows('sales-b.xlsx')}],
    }


cases = {'expected-list.json': expectation(True), 'expected-mask.json': expectation(False),
         'expected-parallel.json': expectation(False)}
if sys.argv[1:] == ['--write']:
    for file, value in cases.items():
        (root / file).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
for file, value in cases.items():
    assert json.loads((root / file).read_text(encoding='utf-8')) == value, file
assert [(r['Id'], r['Amount']) for r in cases['expected-list.json']['outputs'][0]['rows']] == [(1, 10), (2, 20), (3, 30)]
print('PASS C4 sales-a + sales-b: 3 rows once each; list ordered, mask/parallel multisets')
