#!/usr/bin/env python3
"""Independent civil-date and parameter arithmetic; no Loginom evaluation."""
import json
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
source = json.loads((HERE.parent.parent / 'fixtures/modes.json').read_text(encoding='utf-8'))
year, month, day, hour, minute, second, millisecond = source['civil_date']
civil_date = datetime(year, month, day, hour, minute, second, millisecond * 1000)


def output(base):
    values = {'report_date': civil_date.isoformat(timespec='milliseconds'),
              'mixed': 7, 'total': base + 1}
    variables = []
    for expression in source['expressions']:
        if expression.get('intermediate', False):
            continue
        variable = {key: expression[key] for key in ('name', 'label', 'type')}
        variable['value'] = values[expression['name']]
        if variable['type'] == 'variant':
            variable['value_type'] = 'integer'
        variables.append(variable)
    return {'output_node_type': 'variables.calculator', 'output_port': 0,
            'port_kind': 'variables', 'ordered': True, 'variables': variables}


expected = {'status': 'proposal_pending_owner_approval',
            'initial': output(source['base']),
            'updated': output(source['updated_base'])}
text = json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
if __name__ == '__main__':
    assert [v['name'] for v in expected['initial']['variables']] == ['report_date', 'mixed', 'total']
    assert expected['initial']['variables'][-1]['value'] == 3
    assert expected['updated']['variables'][-1]['value'] == 5
    if '--check' in sys.argv:
        assert (HERE / 'expected.json').read_text(encoding='utf-8') == text, 'expected differs from oracle'
        print('modes oracle: PASS')
    else:
        (HERE / 'expected.json').write_text(text, encoding='utf-8')
