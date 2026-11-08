"""Proposal for type patch and civil date; blocked requests stay explicit, no Loginom."""
import argparse
import json
from datetime import date, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent


def expected():
    source = json.loads((HERE.parents[1] / 'fixtures/modes.json').read_text())
    patch = source['patch']
    midnight = datetime.combine(date.fromisoformat(source['date_only']), datetime.min.time())
    return {'status': 'proposal_pending_owner_approval',
            'type_patch': [{**v, **patch} if v['name'] == patch['name'] else v for v in source['initial']],
            'identity': 'same builtin, same variable IDs/order/labels and untouched values',
            'date_only': {'type': 'datetime', 'value': midnight.isoformat(timespec='milliseconds'),
                          'timezone': 'unspecified', 'precision': 'civil_millisecond'},
            'milliseconds': {'requested': source['milliseconds'], 'outcome': 'refuse_before_mutation_until_exact_writer'},
            'timezone': {'requested': source['timezone'], 'outcome': 'refuse_before_mutation_until_timezone_policy'},
            'create_builtin': {'outcome': 'blocked_no_separate_palette_component'},
            'non_user_port': {'port': source['non_user_port'], 'outcome': 'blocked_no_value_editor'}}


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
        assert result['type_patch'][0]['value'] == 7.5 and result['type_patch'][1]['value'] == ''
        assert result['date_only']['value'] == '2026-01-02T00:00:00.000'
        print('PASS: proposed type/date values and explicit blocked/refusal boundaries')
