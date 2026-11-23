#!/usr/bin/env python3
"""Independent page-parameter arithmetic; never imports Loginom or its runtime."""
import json
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
source = json.loads((HERE.parent / 'fixtures/inputs.json').read_text())
expressions = json.loads((HERE.parent / 'fixtures/expressions.json').read_text())['expressions']


def output(limit):
    values = {**source, 'limit': limit, 'remaining': limit - source['skip'],
              'ratio': float(Fraction(source['ratio_numerator'], source['ratio_denominator']))}
    variables = []
    for field in expressions:
        item = {key: field[key] for key in ('name', 'label', 'type')}
        item['value'] = values[field['name']]
        if item['type'] == 'real':
            item['tolerance'] = {'abs': 1e-12, 'rel': 1e-12}
        variables.append(item)
    return {'output_node_type': 'variables.calculator', 'output_port': 0,
            'port_kind': 'variables', 'ordered': True, 'variables': variables}


expected = {'status': 'proposal_pending_criteria_and_W1',
            'initial': output(source['limit']), 'updated': output(source['updated_limit'])}
text = json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
if __name__ == '__main__':
    import sys
    if '--check' in sys.argv:
        assert (HERE / 'expected.json').read_text() == text, 'expected.json differs from independent oracle'
        print('oracle: PASS')
    else:
        (HERE / 'expected.json').write_text(text)
