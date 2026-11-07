"""Independent source oracle for the approved C2 Boolean fixture."""
from pathlib import Path
import json
import openpyxl

root = Path(__file__).parent
book = openpyxl.load_workbook(root / 'data/boolean.xlsx', data_only=True)
values = list(book['Data'].values)
assert values == [('Id', 'Active'), (1, False), (2, True), (3, None)]
assert type(values[1][1]) is bool and type(values[2][1]) is bool
expected = {
    'package_path': '{{PACKAGE_PATH}}',
    'nodes': [{'type': 'imports.excel'}, {'type': 'exports.text'}],
    'outputs': [{
        'output_node_type': 'imports.excel', 'output_port': 0,
        'export_destination': 'boolean.csv', 'ordered': True, 'column_order': 'exact',
        'columns': [{'name': name, 'label': name, 'label_any': True, 'type': kind}
                    for name, kind in [('Id', 'integer'), ('Active', 'boolean')]],
        'rows': [dict(zip(values[0], row)) for row in values[1:]],
    }],
}
assert json.loads((root / 'expected.json').read_text()) == expected
print('PASS independent Boolean source types, false/true/NULL, rows and order')
