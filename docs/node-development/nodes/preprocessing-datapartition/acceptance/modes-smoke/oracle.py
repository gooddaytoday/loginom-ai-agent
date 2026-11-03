"""Exact all-source smoke oracle, independent of the Loginom random generator."""
import csv, json, pathlib
root = pathlib.Path(__file__).parent
rows = list(csv.DictReader((root / 'data/modes.csv').open()))
expected = json.loads((root / 'expected.json').read_text())
for output in expected['outputs']:
    source = [{'RowID': int(r['RowID']), 'Class': r['Class'], 'Value': int(r['Value'])} for r in rows]
    if output['output_node_type'] == 'preprocessing.data_partition':
        source = [] if output['output_port'] == 2 else [dict(IsTestSet=False, **r) for r in source] if output['output_port'] == 0 else source
    assert output['rows'] == source
print(json.dumps(expected, ensure_ascii=False))
