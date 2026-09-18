"""Compare complete reopened tables against separately reviewed audit expectations.

This is an operator-only auditor. Expected rows are never sent to Hermes.
Saved node settings and business recommendations require separate review.
"""
from collections import Counter
from decimal import Decimal
import hashlib

from audit_sales_scenario import require, typed_rows


def compare_table(table, expected):
    rows = typed_rows(table)
    fields = expected['fields']
    require({f['name']: f['type'] for f in table['schema']} == fields, 'Audit field names/types differ')
    return compare_rows(rows, expected)


def compare_rows(rows, expected):
    """Compare independently read rows without implying a UI verification."""
    fields = expected['fields']
    require(len(rows) == len(expected['rows']), 'Complete row count differs')
    keys = expected['keys']
    require((keys or len(rows) <= 1) and len(set(keys)) == len(keys) and all(k in fields for k in keys), 'Unique audit keys required')

    def normalize(row):
        require(row.keys() == fields.keys(), 'Expected/actual fields differ')
        return {name: Decimal(str(value)) if fields[name] in ('integer', 'real') else value
                for name, value in row.items()}

    actual = [normalize(r) for r in rows]
    wanted = [normalize(r) for r in expected['rows']]
    key = lambda r: tuple(r[k] for k in keys)
    require(all(n == 1 for n in Counter(map(key, wanted)).values()), 'Expected audit key repeated')
    require(Counter(map(key, actual)) == Counter(map(key, wanted)), 'Missing, extra or duplicate rows')
    found = {key(r): r for r in actual}
    largest = Decimal(0)
    for row in wanted:
        for name, value in row.items():
            observed = found[key(row)][name]
            if fields[name] in ('integer', 'real'):
                require(value.is_finite() and observed.is_finite(), 'Non-finite audit value')
                delta = abs(observed - value)
                require(delta <= (Decimal(0) if fields[name] == 'integer' else Decimal('0.0000001')), 'Audit value differs: ' + name)
                largest = max(largest, delta)
            else:
                require(observed == value and type(observed) is type(value), 'Audit text/date/boolean differs: ' + name)
    sorting = expected.get('sorting', [])
    for field in sorting:
        require(field['name'] in fields and field['direction'] in ('ASC', 'DESC'), 'Invalid expected ranking')
    for left, right in zip(actual, actual[1:]):
        for field in sorting:
            name = field['name']
            if left[name] == right[name]:
                continue
            require(left[name] < right[name] if field['direction'] == 'ASC' else left[name] > right[name], 'Result ranking differs')
            break
    return dict(rows_checked=len(actual), all_columns_checked=True, ranking_checked=bool(sorting),
                maximum_absolute_difference=str(largest))


def audit_tables(dataset, request, index, expected):
    require(index.get('read_only_diagnostic') is not True, 'Diagnostic-only readback is not acceptance evidence')
    require(expected.get('operator_reviewed') is True, 'Reviewed independent expectations required')
    require(expected['run_id'] == index['run_id'] == request['run_id'], 'Run identity differs')
    require(expected['task'] == index['task'] == request['task']['number'], 'Task identity differs')
    require(request['provider'] == 'xiaomi' and request['model'] == 'mimo-v2.5' and request['reasoning_effort'] == 'medium', 'Model profile differs')
    require(hashlib.sha256(dataset.read_bytes()).hexdigest() == request['task']['dataset_sha256'] == expected['dataset_sha256'], 'Input hash differs')
    require(index['session']['clientRevision'] == request['runtime_source_pin']['client_revision'], 'Runtime pin differs')
    require(index['model_started'] is False and index['settings_reapplied'] is False and index['package_saved'] is False, 'Independent unmodified reader required')
    require(index['prepare']['status'] == 'READY' and index['prepare']['package_ref']['path'] == request['package'], 'Saved package differs')
    require(index['package_cleanup']['status'] == 'SUCCEEDED', 'Audit cleanup incomplete')

    def topology(graph):
        require(graph['complete'] is True and not graph['foreign_links'], 'Incomplete graph')
        return (sorted((n['ref']['node_id'], n['type'], n['label']) for n in graph['nodes']),
                sorted((e['source'], e['output'], e['target'], e['input']) for e in graph['links']))

    require(topology(index['graph_before']) == topology(index['graph_after']), 'Audit changed topology')
    tabular = {name: r for name, r in index['results'].items() if r['table'] is not None}
    require(tabular.keys() == expected['tables'].keys(), 'All reopened tables must be checked')
    checked = {}
    for name, result in tabular.items():
        table = result['table']
        require(table['node'] == result['node'] and result['execution']['verified'] is True
                and result['execution']['owner_verified'] is True, 'Output node/execution binding differs')
        require(table['port'] == expected['tables'][name]['port'], 'Output port differs')
        checked[name] = compare_table(table, expected['tables'][name])
    omitted = {}
    for name, result in index['results'].items():
        if result.get('read_scope') != 'intermediate_settings_only':
            continue
        require(result['table'] is None and result['execution']['verified'] is True
                and result['execution']['owner_verified'] is True, 'Omitted intermediate must still execute')
        covered = result.get('covered_by', [])
        require(covered and all(target in checked for target in covered)
                and result.get('read_omission_reason'), 'Omitted intermediate lacks checked final tables')
        omitted[name] = dict(reason=result['read_omission_reason'], covered_by=covered,
                             full_table_read=False, execution_verified=True)
    return dict(status='PASS', scope='all_reopened_numerical_tables', task=expected['task'], run_id=request['run_id'],
                tables=checked, omitted_intermediate_tables=omitted,
                remaining_reviews=['Saved configuration, exported files and full business requirements.'])
