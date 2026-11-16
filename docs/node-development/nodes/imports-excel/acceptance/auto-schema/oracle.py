"""Register unchanged C8 cases; no Loginom output or runtime dependency."""
import copy
import hashlib
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).parent
capabilities = root.parent / 'capabilities'
cases = json.loads((capabilities / 'expected.json').read_text())['cases']
manifest = json.loads((capabilities / 'fixtures/manifest.json').read_text())['files']
for entry in manifest:
    if entry['file'] in ['schema-ab.xlsx', 'schema-abd.xlsx', 'schema-bc.xlsx', 'types-a.xlsx', 'types-b.xlsx']:
        data = (capabilities / 'fixtures' / entry['file']).read_bytes()
        assert len(data) == entry['bytes'] and hashlib.sha256(data).hexdigest() == entry['sha256'], entry['file']
specs = {'none': ('auto-none-bc', 'Нет', 'schema-ab.xlsx', 'schema-bc.xlsx'),
         'new': ('auto-new-abd', 'Только новые', 'schema-ab.xlsx', 'schema-abd.xlsx'),
         'columns': ('auto-all-bc', 'Все', 'schema-ab.xlsx', 'schema-bc.xlsx'),
         'types': ('auto-type-b', 'Все', 'types-a.xlsx', 'types-b.xlsx')}
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def initial_ab():
    with zipfile.ZipFile(capabilities / 'fixtures/schema-ab.xlsx') as archive:
        strings = [''.join(s.itertext()) for s in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', ns)]
        rows = [[strings[int(c.find('m:v', ns).text)] if c.get('t') == 's' else int(c.find('m:v', ns).text)
                 for c in r.findall('m:c', ns)] for r in ET.fromstring(archive.read('xl/worksheets/sheet1.xml')).findall('.//m:row', ns)]
    return dict(output_node_type='imports.excel', output_port=0, ordered=True, column_order='exact',
                columns=[dict(name=n, label=n, label_any=True, type='integer') for n in rows[0]],
                rows=[dict(zip(rows[0], row)) for row in rows[1:]])


for kind, (case, mode, initial, file) in specs.items():
    expected = copy.deepcopy(cases[case])
    first = copy.deepcopy(cases['auto-type-a']['outputs'][0]) if kind == 'types' else initial_ab()
    first.pop('export_destination', None)
    expected['excel_auto'] = dict(mode=mode, initial=initial, file=file, initial_output=first)
    path = root / ('expected-' + kind + '.json')
    if sys.argv[1:] == ['--write']:
        path.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    assert json.loads(path.read_text()) == expected, path
print('PASS C8: four unchanged capability cases and original initial workbook values')
