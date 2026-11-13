import json
from pathlib import Path

expected = {
    'nodes': [{'type': 'programming.javascript'}, {'type': 'exports.text'}],
    'outputs': [{
        'output_node_type': 'export_input',
        'export_destination': 'source.csv',
        'columns': [{'name': name, 'label_any': True, 'type': 'integer'} for name in ['N', 'Square']],
        'rows': [{'N': n, 'Square': n ** 2} for n in range(1, 4)],
        'ordered': True,
    }],
}
if __name__ == '__main__':
    assert json.loads(Path(__file__).with_name('expected.json').read_text()) == expected
    print(json.dumps(expected, ensure_ascii=False))
