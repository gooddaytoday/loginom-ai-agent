"""Generate a bounded operator/type matrix from the independent golden oracle."""
import hashlib
import json
from pathlib import Path
from row_filter_oracle import ROOT, load_rows, partition


def cases():
    rows = load_rows()
    result = []
    fields = [('Id', 'integer', 6, [2, 7], [2, 6]),
              ('Amount', 'real', 1.23456, [-0.00001, 8.76543], [-2.34567, 8.76543]),
              ('When', 'datetime', '2024-01-02T12:30:01', ['2024-01-01T00:00:02', '2024-01-02T12:30:03'],
               ['2024-01-01T00:00:02', '2024-01-02T12:30:03']),
              ('Text', 'string', 'Beta', ['Alpha', 'preTail'], ['Alpha', 'A,b']),
              (None, 'integer', 6, [2, 7], [2, 6])]

    def add(name, groups):
        ports = partition(rows, groups)
        result.append(dict(name=name, parameters=dict(groups=groups),
            expected_counts=list(map(len, ports)), expected_ids=[[r['Id'] for r in port] for port in ports]))

    for name, kind, value, bounds, values in fields:
        base = dict(field=dict(kind='input_field', name=name) if name else dict(kind='row_number'), type=kind)
        for case_sensitive in ([True, False] if kind == 'string' else [None]):
            condition = {**base, **({'case_sensitive': case_sensitive} if case_sensitive is not None else {})}
            suffix = ('_case' if case_sensitive else '_nocase') if kind == 'string' else ''
            for index, operator in enumerate(['<', '<=', '>', '>=', '=', '<>']):
                add((name or 'row_number')+'_compare_'+str(index)+suffix, [[dict(condition, operator=operator, value=value)]])
            for operator in ['between', 'not_between']:
                add((name or 'row_number')+'_'+operator+suffix, [[dict(condition, operator=operator, lower=bounds[0], upper=bounds[1])]])
            for operator in ['in', 'not_in']:
                add((name or 'row_number')+'_'+operator+suffix, [[dict(condition, operator=operator, values=values)]])
        for operator in ['is_null', 'not_null']:
            add((name or 'row_number')+'_'+operator, [[dict(base, operator=operator)]])
    for operator in ['is_true', 'is_false', 'is_null', 'not_null']:
        add('Flag_'+operator, [[dict(field=dict(kind='input_field', name='Flag'), type='boolean', operator=operator)]])
    for operator, value in [('contains', 'a'), ('not_contains', 'a'), ('starts_with', 'a'), ('not_starts_with', 'a'), ('ends_with', 'Tail'), ('not_ends_with', 'Tail')]:
        for case_sensitive in [True, False]:
            add('Text_'+operator+('_case' if case_sensitive else '_nocase'), [[dict(field=dict(kind='input_field', name='Text'),
                type='string', operator=operator, value=value, case_sensitive=case_sensitive)]])
    def id_condition(operator, value):
        return dict(field=dict(kind='input_field', name='Id'), type='integer', operator=operator, value=value)
    # Id=9 must survive the first OR group despite failing the final <=7.
    # A left-associative flat evaluation would incorrectly discard that row.
    add('precedence_or_then_and', [[id_condition('=', 9)], [id_condition('>=', 6), id_condition('<=', 7)]])
    add('all_records', [[id_condition('>=', 1)]])
    add('no_records', [[id_condition('<', 0)]])
    add('empty_string', [[dict(field=dict(kind='input_field', name='Text'), type='string', operator='=', value='', case_sensitive=True)]])
    return dict(fixture_sha256=hashlib.sha256((ROOT/'golden.csv').read_bytes()).hexdigest(), cases=result)


if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--output', required=True)
    args=parser.parse_args();result=cases()
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(dict(cases=len(result['cases']), fixture_sha256=result['fixture_sha256'])))
