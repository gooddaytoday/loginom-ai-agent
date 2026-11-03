"""Independent OpenPyXL reader; this file and expected.json never reach the model."""
from pathlib import Path
import datetime
import json
import openpyxl

root = Path(__file__).parent
wide = root.name == 'excel-import-wide'
book = openpyxl.load_workbook(root / 'data' / ('wide.xlsx' if wide else 'departments.xlsx'), data_only=True)
sheet = book['Wide' if wide else 'Продажи 2026']
if not wide:
    assert book.sheetnames == ['Описание', 'Продажи 2026', 'Archive']
rows = list(sheet.values)
names = list(rows.pop(0))
types = (['integer', 'string', 'real', 'datetime', 'integer', 'string', 'real', 'datetime',
          'string', 'real', 'string', 'real'] if wide else ['integer', 'string', 'real'])
assert len(names) == len(types)


def value(v, kind):
    if v is None:
        return None
    if kind == 'datetime':
        assert isinstance(v, datetime.datetime)
        return v.isoformat(timespec='milliseconds')
    if kind == 'integer':
        assert int(v) == v
        return int(v)
    if kind == 'real':
        return float(v)
    assert isinstance(v, str)
    return v


expected = {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': 'imports.excel'}, {'type': 'exports.text'}],
            'outputs': [{'output_node_type': 'imports.excel', 'output_port': 0,
                         'export_destination': 'wide-result.csv' if wide else 'sheet-result.csv',
                         'ordered': True, 'column_order': 'exact',
                         'columns': [{'name': n, 'label': n, 'label_any': True, 'type': t}
                                     for n, t in zip(names, types)],
                         'rows': [dict(zip(names, [value(v, t) for v, t in zip(row, types)]))
                                  for row in rows]}]}
(root / 'expected.json').write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n')
