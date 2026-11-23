"""Independent stdlib OOXML oracle for C7: expectations are derived from the workbooks."""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).parent
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def rows(name):
    with zipfile.ZipFile(root / 'data' / name) as z:
        sheets = [s.attrib['name'] for s in ET.fromstring(z.read('xl/workbook.xml')).findall('m:sheets/m:sheet', ns)]
        assert sheets == ['Data'], sheets
        strings = [''.join(s.itertext()) for s in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
        table = []
        for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//m:row', ns):
            cells = [strings[int(c.find('m:v', ns).text)] if c.attrib.get('t') == 's' else int(c.find('m:v', ns).text)
                     for c in row.findall('m:c', ns)]
            table.append(cells)
    assert table[0] == ['Id', 'Amount'], table[0]
    return [dict(zip(table[0], r)) for r in table[1:]]


def expectation(name, value):
    return {
        'package_path': '{{PACKAGE_PATH}}',
        'nodes': [{'type': 'imports.excel'}, {'type': 'variables.user'}],
        'outputs': [{'output_node_type': 'imports.excel', 'output_port': 0, 'ordered': True, 'column_order': 'exact',
                     'columns': [{'name': k, 'label': k, 'label_any': True, 'type': 'integer'} for k in ['Id', 'Amount']],
                     'rows': rows(name)}],
        'variable_inventory': {
            'outputs': [{'node': {'type': 'variables.user'}, 'port': 4, 'variables': [
                {'name': 'ExcelPath', 'type': 'string', 'value': value},
                {'name': 'Sentinel', 'type': 'string', 'value': 'keep'}]}],
            'links': [{'source': {'type': 'variables.user'}, 'output': 4, 'target': {'type': 'imports.excel'},
                       'input': 0, 'kind': 'variables'}]},
    }


cases = {'expected-initial.json': expectation('sales-a.xlsx', '{{SOURCE_A}}'),
         'expected.json': expectation('sales-b.xlsx', '{{SOURCE_B}}')}
if sys.argv[1:] == ['--write']:
    for file, value in cases.items():
        (root / file).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
for file, value in cases.items():
    assert json.loads((root / file).read_text(encoding='utf-8')) == value, file
assert [r['Id'] for r in cases['expected-initial.json']['outputs'][0]['rows']] == [1, 2]
assert [r['Id'] for r in cases['expected.json']['outputs'][0]['rows']] == [3]
print('PASS C7 sales-a 2 rows -> sales-b 1 row; ExcelPath bound, Sentinel kept')
