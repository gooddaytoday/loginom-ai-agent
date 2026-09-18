"""Task 02 audit of complete, independently reopened UI tables (never a prompt)."""
import argparse
import hashlib
import json
from decimal import Decimal
from pathlib import Path

from corpus_oracles import read_rows, sales_2024, compare_revenue_table


def require(condition, message):
    if not condition:
        raise ValueError(message)


def typed_rows(table):
    require(table.get('verified') is True and table.get('complete') is True, 'Incomplete UI table')
    require(len(table['rows']) == table['row_count'], 'Sample is not the full table')
    fields = table['schema']
    require(len({f['name'] for f in fields}) == len(fields), 'Duplicate field')
    result = []
    for row in table['rows']:
        require(len(row) == len(fields), 'Incomplete row')
        values = {}
        for field, cell in zip(fields, row):
            require(cell['type'] == field['type'] and cell['is_null'] is False, 'Unexpected type/null')
            kind = field['type']
            if kind in ('integer', 'real'):
                require(cell['precision'] == ('exact_integer' if kind == 'integer' else '17_significant_digits'), 'Numeric precision not verified')
                value = Decimal(cell['decimal'] if 'decimal' in cell else str(cell['value']))
                require(value.is_finite(), 'Non-finite number')
            elif kind == 'datetime':
                require(cell['precision'] == 'millisecond', 'Date precision not verified')
                value = cell['value']
            elif kind == 'boolean':
                require(cell['precision'] == 'exact_boolean' and isinstance(cell['value'], bool), 'Boolean precision not verified')
                value = cell['value']
            else:
                require(kind == 'string' and cell['precision'] == 'display_text', 'Unsupported audit cell')
                value = cell['value']
            values[field['name']] = value
        result.append(values)
    return result


def compare_source(table, reference):
    rows = typed_rows(table)
    require(len(rows) == len(reference), 'Source/filtered row count differs')
    actual = {row['transaction_id']: row for row in rows}
    require(len(actual) == len(rows), 'Repeated transaction')
    for row in reference:
        found = actual.get(Decimal(row['transaction_id']))
        require(found is not None and found.keys() == row.keys(), 'Missing transaction/field')
        for key, expected in row.items():
            if key in ('transaction_id', 'quantity', 'unit_price', 'total'):
                require(abs(found[key] - Decimal(expected)) <= Decimal('0.0000001'), 'Transaction number differs: ' + key)
            elif key == 'date':
                require(found[key] == expected + 'T00:00:00.000', 'Transaction date differs')
            else:
                require(found[key] == expected, 'Transaction text differs: ' + key)
    return {'rows_checked': len(rows), 'all_columns_checked': True}


def aggregate_fields(parameters, keys):
    require([k['name'] for k in parameters['group_by']] == keys, 'Reviewed grouping keys differ')
    measures = parameters['measures']
    sums = [m for m in measures if m['field'] == {'kind':'input_field','name':'total'} and m['function'] == 'sum']
    counts = [m for m in measures if m['field'] == {'kind':'input_field','name':'transaction_id'} and m['function'] == 'count']
    require(len(sums) == 1 and len(counts) <= 1 and len(measures) == len(sums)+len(counts)
            and len({m['name'] for m in measures}) == len(measures), 'Unreviewed sales measures')
    return sums[0]['name'], counts[0]['name'] if counts else None


def compare_transaction_counts(rows, reference, keys, field):
    from collections import Counter
    expected = Counter(tuple(r[k] for k in keys) for r in reference if r['date'][:4] == '2024')
    require(len(rows) == len(expected) and len({tuple(r[k] for k in keys) for r in rows}) == len(rows), 'Count groups differ')
    for row in rows:
        require(tuple(row[k] for k in keys) in expected and row[field] == expected[tuple(row[k] for k in keys)], 'Transaction count differs')


def audit(dataset, index, request, plan=None):
    require(request['run_id'] == index['run_id'] and request['provider'] == 'xiaomi' and request['model'] == 'mimo-v2.5' and request['reasoning_effort'] == 'medium', 'Run identity/profile differs')
    require(hashlib.sha256(dataset.read_bytes()).hexdigest() == request['task']['dataset_sha256'], 'Original input hash differs')
    require(index['session']['clientRevision'] == request['runtime_source_pin']['client_revision'], 'Runtime revision differs')
    require(index['task'] == 2 and index['model_started'] is False and index['settings_reapplied'] is False, 'Independent task 02 reader required')
    require(index['package_saved'] is False and index['prepare']['package_ref']['path'] == request['package'], 'Unmodified original saved package required')
    require(index['package_cleanup']['status'] == 'SUCCEEDED', 'Reopen cleanup incomplete')
    require(index['prepare']['status'] == 'READY', 'Reopen not verified')
    def topology(graph):
        require(graph['complete'] is True and not graph['foreign_links'], 'Graph inventory incomplete')
        return (sorted((n['ref']['node_id'], n['type'], n['label']) for n in graph['nodes']),
                sorted((e['source'], e['output'], e['target'], e['input']) for e in graph['links']))
    require(topology(index['graph_before']) == topology(index['graph_after']), 'Audit changed graph topology')
    results = index['results']
    if plan is not None:
        require(plan['operator_reviewed'] is True and plan['task'] == 2 and plan['run_id'] == request['run_id'], 'Reviewed sales plan required')
        require(plan['runtime_revision'] == request['runtime_source_pin']['client_revision'] and plan['package_path'] == request['package'], 'Reviewed runtime/package differs')
        expected_graph = plan['expected_graph']
        require(topology(index['graph_before']) == (
            sorted((n['id'],n['type'],n['label']) for n in expected_graph['nodes']),
            sorted((e['source'],e['output'],e['target'],e['input']) for e in expected_graph['links'])), 'Saved graph differs from reviewed model graph')
        operations = {o['node_id']: o for o in plan['model_operations_for_review']}
        require(len(operations) == len(plan['model_operations_for_review']), 'Repeated edits require separate review')
        require(set(results) == {o['name'] for o in plan['outputs']}, 'Reviewed output scope differs')
    else:
        require(len(results) == 9, 'Legacy audit requires all nine analytical ports')
    types = {n['ref']['node_id']: n['type'] for n in index['graph_before']['nodes']}
    reference = read_rows(dataset)
    oracle = sales_2024(dataset)
    checked = {}
    kinds = set()
    for label, result in results.items():
        node = result['node']['node_id']
        table = result['table']
        require(table['node'] == result['node'] and result['execution']['verified'] is True
                and result['execution']['owner_verified'] is True, 'Output binding differs')
        kind = types[node]
        config = result['savedConfiguration']
        if kind == 'imports.text':
            role = 'import'
            source = config['source']['fields']
            require(source['encoding']['value'] == 'UTF-8 (65001)' and source['rows_to_skip']['value'] == '0' and source['first_line_as_title']['value'] is True, 'Import source settings differ')
            wanted = dict(delimiter='Запятая', decimal_separator='Точка (.)', null_marker='Пустая строка', text_qualifier='Двойная кавычка (")')
            require(all(config['format']['fields'][key]['value'] == value for key, value in wanted.items()), 'CSV format differs')
            require(config['columns']['definition_complete'] is True and all(f['used'] for f in config['columns']['fields']), 'Import definitions incomplete')
            if plan is not None:
                from audit_budget_settings import verify_import_columns
                verify_import_columns(config['columns'], operations[node]['parameters']['settings']['columns'])
            checked[label] = compare_source(table, reference)
        elif kind == 'transform.filter_data':
            port = table['port']
            require(port in (0, 1), 'Unexpected filter port')
            role = 'filter-' + str(port)
            rows = config['rows']
            require(config['verified'] is True and len(rows) == 2 and all(r['kind'] == 'condition' and r['field'] == {'kind': 'input_field', 'name': 'date'} for r in rows), 'Year filter differs')
            require([(r['operator_code'], r['value']) for r in rows] in (
                [(3, '2024-01-01T00:00:00.000'), (1, '2024-12-31T23:59:59.000')],
                [(3, '2024-01-01T00:00:00.000'), (0, '2025-01-01T00:00:00.000')]), 'Year filter boundaries differ')
            checked[label] = compare_source(table, [r for r in reference if (r['date'][:4] == '2024') == (port == 0)])
        else:
            require(kind in ('transform.group_data', 'transform.sorting'), 'Unexpected analytics node')
            fields = [f['name'] for f in table['schema']]
            keys = [f for f in fields if f in ('category', 'region')]
            amounts = [f for f in fields if f not in keys]
            canonical_keys = [k for k in ('category','region') if k in keys]
            group = {('category',): 'categories', ('region',): 'regions', ('category', 'region'): 'category_regions'}.get(tuple(canonical_keys))
            count_field = None
            if plan is not None:
                group_node = node
                if kind == 'transform.sorting':
                    links = [e for e in index['graph_before']['links'] if e['target'] == node]
                    require(len(links) == 1 and links[0]['input'] == links[0]['output'] == 0
                            and types[links[0]['source']] == 'transform.group_data', 'Reviewed sort must directly consume grouping')
                    group_node = links[0]['source']
                amount, count_field = aggregate_fields(operations[group_node]['parameters'], keys)
                require(set(amounts) == {amount, *([count_field] if count_field else [])}, 'Unexpected aggregate fields')
                schema = {f['name']:f for f in table['schema']}
                require(all(schema[m['name']]['label'] == m.get('label',m['name'])
                            for m in operations[group_node]['parameters']['measures']), 'Aggregate output labels differ')
            else:
                require(len(amounts) == 1, 'Unexpected aggregate schema')
                amount = amounts[0]
            require(group, 'Unexpected aggregate keys')
            role = kind + '/' + group
            require(config['verified'] is True and config['inventory_complete'] is True, 'Unverified settings')
            if kind == 'transform.group_data':
                require([f['name'] for f in config['keys']] == keys
                        and {f['name']:f['functions'] for f in config['measures']} == ({'total':1,'transaction_id':2} if count_field else {'total':1})
                        and len(config['measures']) == (2 if count_field else 1), 'Grouping settings differ')
            else:
                require(len(config['keys']) == 1 and config['keys'][0]['name'] == amount and config['keys'][0]['direction'] == 'DESC', 'Ranking settings differ')
            typed = typed_rows(table)
            values = [dict(keys=[r[key] for key in canonical_keys], revenue=str(r[amount])) for r in typed]
            checked[label] = compare_revenue_table(values, oracle['tables'][group], ranked=kind == 'transform.sorting')
            if count_field:
                compare_transaction_counts(typed, reference, keys, count_field)
                checked[label]['transaction_counts_checked'] = True
        require(role not in kinds, 'Repeated audit role')
        kinds.add(role)
    required = {'import','filter-0', *('transform.group_data/'+g for g in ('categories','regions','category_regions')),
                *('transform.sorting/'+g for g in ('categories','regions'))}
    require(required <= kinds and (plan is not None or len(kinds) == 9), 'Incomplete audit roles')
    return {'status': 'PASS', 'task': 2, 'run_id': index['run_id'], 'dataset_sha256': hashlib.sha256(dataset.read_bytes()).hexdigest(), 'source_rows': oracle['source_rows'], 'period_rows': oracle['period_rows'], 'revenue': oracle['revenue'], 'ports': checked, 'limitations': ['This is one diagnostic run, not the required final repeated corpus series.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--index', type=Path, required=True)
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--plan', type=Path, help='Reviewed original operations for optional transaction counts and variable output scope')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.dataset, json.loads(args.index.read_text()), json.loads(args.request.read_text()),
                   json.loads(args.plan.read_text()) if args.plan else None)
    with args.out.open('x') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False))
