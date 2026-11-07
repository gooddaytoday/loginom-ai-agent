#!/usr/bin/env python3
"""Independent ASCII/regex/Decimal proposal; never reads Loginom output."""
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

expected = {'status': 'proposal_pending_owner_approval',
            'match_modes': {'output_node_type': 'variables.replace', 'output_port': 0,
                            'port_kind': 'variables', 'ordered': True, 'variables': variables}}
typed_rules = json.loads((FIXTURES / 'modes-types.json').read_text(encoding='utf-8'))
typed = deepcopy(variables)
for variable in typed:
    name = variable['name']
    if name == 'TextNum' and variable['value'] == typed_rules[name]['from']:
        variable.update(type='variant', value=typed_rules[name]['to'], value_type='integer')
    elif name == 'mixed' and variable['value_type'] == typed_rules[name]['from']['type']:
        assert variable['value'] == typed_rules[name]['from']['value']
        variable.update(value=typed_rules[name]['to']['value'], value_type=typed_rules[name]['to']['type'])
    elif name == 'Other':
        variable['value'] = typed_rules[name]['value']
    elif name == 'report_date' and variable['value'] == typed_rules[name]['from']:
        variable['value'] = typed_rules[name]['to']
expected['types_probe'] = {**expected['match_modes'], 'variables': typed}
expected['types_probe_persistence'] = 'not_verified_native_open_error_active_variant'
text = json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
if __name__ == '__main__':
    assert [v['value'] for v in variables[3:6]] == ['blue', 'matched', 2.5]
    assert variables[-1]['value'] is None and variables[1]['type'] == 'variant'
    assert typed[0]['value'].endswith('58.123')
    assert typed[1]['value'] == 'seven' and typed[6]['type'] == 'variant' and typed[6]['value'] == 7
    if '--check' in sys.argv:
        assert (HERE / 'expected.json').read_text(encoding='utf-8') == text, 'expected differs from oracle'
        print('replacement modes oracle: PASS')
    else:
        (HERE / 'expected.json').write_text(text, encoding='utf-8')
