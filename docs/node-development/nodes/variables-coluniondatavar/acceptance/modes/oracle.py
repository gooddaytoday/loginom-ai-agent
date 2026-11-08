"""Proposal only: ordered inputs and explicit mappings; Python stdlib, no Loginom."""
import argparse
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def expected():
    source = json.loads((HERE.parents[1] / 'fixtures/modes.json').read_text())

    def automatic(inputs):
        result, used = [], set()
        for items in inputs:
            for item in items:
                name = item['name']
                while name in used:
                    match = re.fullmatch(r'(.*?)(\d+)', name)
                    name = match[1] + str(int(match[2]) + 1) if match else name + '_1'
                used.add(name)
                result.append({**item, 'name': name})
        return result

    def manual(updated=False):
        result = []
        for mapping in source['manual']:
            item = next(v for v in source[['left', 'right'][mapping['input']]] if v['name'] == mapping['source'])
            value = source['update']['value'] if updated and mapping['input'] == source['update']['input'] and item['name'] == source['update']['name'] else item['value']
            assert item['type'] == 'integer' and type(value) is int
            result.append({k: mapping[k] for k in ('name', 'label', 'type')} | {
                'value': str(value) if mapping['type'] == 'string' else value})
        return result

    joined = automatic([source[k] for k in ('left', 'right', 'third')])
    return {'status': 'proposal_pending_owner_approval', 'port': 0, 'kind': 'variables',
            'manual': manual(), 'manual_updated': manual(True), 'three_inputs': joined,
            'control_connected': {'status': 'blocked_no_native_control_port_observed'},
            'third_removed': automatic([source['left'], source['right']]),
            'control_is_not_appended': [v['name'] for v in source['control']]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    result = expected()
    path = HERE / 'expected.json'
    if args.write:
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    else:
        assert json.loads(path.read_text()) == result
        assert result['manual'][1]['value'] == '7'
        assert result['manual_updated'][0]['value'] == 23
        assert len(result['three_inputs']) == 5 and len(result['third_removed']) == 4
        print('PASS: proposed manual, update, third/control input expectations')
