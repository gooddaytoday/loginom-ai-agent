import csv
import json
from pathlib import Path

case = Path(__file__).resolve().parent
expected = json.loads((case / 'expected.json').read_text())
for output in expected['outputs']:
    declaration = case / 'intervention.json'
    intervention = json.loads(declaration.read_text()) if declaration.is_file() else {}
    threshold = intervention.get('edit', {}).get('value', 100)
    seed = 'bh-x06-t1' if case.name.startswith('bh-x06') else 'bh-x00-t1'
    with (case.parent / seed / 'data/sales.csv').open(newline='') as file:
        values = [int(row['Revenue']) for row in csv.DictReader(file)]
    output['rows'] = [{'Revenue': value} for value in values if value > threshold]
print(json.dumps(expected, ensure_ascii=False))
