"""Independent OpenPyXL oracle; only task.md and the XLSX reach the model."""
from pathlib import Path
import json
import openpyxl

root = Path(__file__).parent
headers = root.name == 'excel-import-headers'
file = 'headers11' if headers else 'wide16'
count = 11 if headers else 1
book = openpyxl.load_workbook(root / 'data' / (file + '.xlsx'), data_only=True)
values = list(book['Data'].values)
names = ['_'.join(str(row[i]) for row in values[:count] if row[i] is not None)
         for i in range(len(values[0]))]
rows = values[count:]
assert len(names) == (2 if headers else 16) and len(rows) == 2
assert all(type(v) is int for row in rows for v in row)
expected = {'package_path': '{{PACKAGE_PATH}}',
            'nodes': [{'type': 'imports.excel'}, {'type': 'exports.text'}],
            'outputs': [{'output_node_type': 'imports.excel', 'output_port': 0,
                         'export_destination': file + '.csv', 'ordered': True,
                         'column_order': 'exact',
                         'columns': [{'name': n, 'label': n, 'label_any': True, 'type': 'integer'} for n in names],
                         'rows': [dict(zip(names, row)) for row in rows]}]}
assert json.loads((root / 'expected.json').read_text()) == expected
print('PASS independent source cells, types and field order: ' + file)
