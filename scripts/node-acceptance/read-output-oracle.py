"""Independent integer-row oracle; never copied into the model workspace."""
import csv
import json
from pathlib import Path

root = Path(__file__).parent / 'scenarios'
for kind in ['read-no-rerun', 'read-wait-running']:
    case = root / kind
    if kind == 'read-no-rerun':
        with (case / 'data/rows.csv').open() as source:
            rows = [{k: int(v) for k, v in row.items()} for row in csv.DictReader(source, delimiter=';')][:3]
    else:
        rows = [dict(RowID=i, Amount=2*i) for i in range(1, 4)]
    expected = json.loads((case / 'expected.json').read_text())
    assert expected['outputs'][0]['rows'] == rows, kind
print('read output oracles: PASS')
