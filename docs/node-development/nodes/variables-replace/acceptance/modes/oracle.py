#!/usr/bin/env python3
"""Independent ASCII/regex/Decimal match oracle; never reads Loginom output."""
import json
import re
import sys
from copy import deepcopy
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent.parent / 'fixtures'
source = json.loads((FIXTURES / 'modes-source.json').read_text(encoding='utf-8'))
rules = json.loads((FIXTURES / 'modes-match.json').read_text(encoding='utf-8'))
variables = deepcopy(source)
for variable in variables:
    rule = rules.get(variable['name'])
    if not rule:
        continue
    value = variable['value']
    if rule.get('other') == 'null':
        variable['value'] = None
    elif rule['match'] == 'regex':
        variable['value'] = re.sub(rule['pattern'], rule['replacement'], value)
    elif variable['type'] == 'real':
        if abs(Decimal(str(value)) - Decimal(str(rule['from']))) <= Decimal(str(rule['precision'])):
            variable['value'] = rule['to']
    elif value.casefold() == rule['from'].casefold():
        variable['value'] = rule['to']

expected = {'status': 'approved_match_slice',
            'match_modes': {'output_node_type': 'variables.replace', 'output_port': 0,
                            'port_kind': 'variables', 'ordered': True, 'variables': variables}}
run = {'package_path': '{{PACKAGE_PATH}}', 'nodes': [{'type': 'variables.user'}, {'type': 'variables.replace'}], 'outputs': [], 'variable_inventory': {'outputs': [{'node': {'type': 'variables.replace'}, 'port': 0, 'ordered': True, 'variables': deepcopy(variables)}]}}
for variable in run['variable_inventory']['outputs'][0]['variables']:
    if variable['type'] == 'datetime':
        variable['value'] += '.000'  # W1 civil precision representation of whole seconds.
text = json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
if __name__ == '__main__':
    assert [v['value'] for v in variables[3:6]] == ['blue', 'matched', 2.5]
    assert variables[-1]['value'] is None and variables[1]['type'] == 'integer'
    assert variables[:3] == source[:3] and variables[0]['value'].endswith('58')
    if '--check' in sys.argv:
        assert (HERE / 'expected.json').read_text(encoding='utf-8') == text, 'expected differs from oracle'
        assert json.loads((HERE / 'expected-run.json').read_text(encoding='utf-8')) == run, 'run expected differs from oracle'
        print('replacement modes oracle: PASS')
    else:
        (HERE / 'expected.json').write_text(text, encoding='utf-8')

        (HERE / 'expected-run.json').write_text(json.dumps(run, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
