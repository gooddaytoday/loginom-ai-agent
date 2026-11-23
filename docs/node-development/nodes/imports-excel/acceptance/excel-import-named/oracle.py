"""Independent stdlib OOXML audit of the approved C3 source and expectations."""
import json
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET

root = Path(__file__).parent
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(root / 'data/named.xlsx') as z:
    book = ET.fromstring(z.read('xl/workbook.xml'))
    names = {n.attrib['name']: n.text for n in book.findall('m:definedNames/m:definedName', ns)}
    assert names['SalesRange'] == 'Data!$B$1:$C$3'
    strings = [''.join(s.itertext()) for s in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    def cells(path):
        out = {}
        for c in ET.fromstring(z.read(path)).findall('.//m:c', ns):
            v = c.find('m:v', ns)
            if v is not None:
                out[c.attrib['r']] = strings[int(v.text)] if c.attrib.get('t') == 's' else int(v.text)
        return out
    data, other = cells('xl/worksheets/sheet1.xml'), cells('xl/worksheets/sheet2.xml')
assert [data['B1'], data['C1']] == ['Id', 'Amount']
assert data['A1'] == 'Ignore' and other['A2'] == 99
for filename, stop in [('expected-initial.json', 3), ('expected.json', 4)]:
    e = json.loads((root / filename).read_text())
    out = e['outputs'][0]
    assert out['columns'] == [{'name': k, 'label': k, 'label_any': True, 'type': 'integer'} for k in ['Id', 'Amount']]
    assert out['rows'] == [{'Id': data['B'+str(i)], 'Amount': data['C'+str(i)]} for i in range(2, stop+1)]
    assert out['ordered'] is True and out['column_order'] == 'exact'
print('PASS C3 SalesRange B1:C3; fixed 2 rows, extended 3; Ignore and Other!99 excluded')
