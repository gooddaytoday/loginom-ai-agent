"""Operator-only independent rows for the reviewed task 47 arithmetic subset.

Unknown formulas, modes or mappings require explicit auditor extension; there
is no execution of model code. Business completeness remains a separate review.
"""
import argparse
from collections import defaultdict
from decimal import Decimal
from functools import cmp_to_key
import hashlib
import json
from pathlib import Path

from audit_sales_scenario import require
from corpus_oracles import read_rows
from audit_scalar_expression import parse_expression, evaluate_expression


def apply_numeric_expressions(rows, parameters):
    """Independent restricted arithmetic, including a constant grouping key.

    Uses the existing audit parser; never executes model-supplied code.
    """
    expressions = parameters['expressions']
    order = parameters.get('order', [e['name'] for e in expressions])
    require(len(order) == len(expressions) and len(set(order)) == len(order)
            and set(order) == {e['name'] for e in expressions}, 'Complete unique budget expression order required')
    for name in order:
        e = next(e for e in expressions if e['name'] == name)
        require(e['target']['kind'] == 'new' and e['replace'] is False and e['type'] in ('integer','real'), 'Unsupported budget expression update')
        tree = parse_expression(e['formula'])
        for row in rows:
            require(name not in row, 'Budget expression overwrites input')
            value = evaluate_expression(tree, row)
            require(isinstance(value, Decimal) and value.is_finite(), 'Budget expression must be numeric')
            if e['type'] == 'integer':
                require(value == value.to_integral_value(), 'Fractional budget integer')
            row[name] = value


def aggregate(rows, parameters):
    keys = [f['name'] for f in parameters['group_by']]
    groups = defaultdict(list)
    for row in rows:
        groups[tuple(row[k] for k in keys)].append(row)
    result = []
    for key, members in groups.items():
        output = dict(zip(keys, key))
        for measure in parameters['measures']:
            name, source, function = measure['name'], measure['field']['name'], measure['function']
            require(name not in output, 'Repeated expected aggregate field')
            values = [r[source] for r in members]
            require(all(isinstance(v, Decimal) for v in values), 'Unsupported nonnumeric aggregate')
            require(function in ('sum', 'avg', 'count', 'min', 'max'), 'Unreviewed aggregate function')
            output[name] = {'sum': lambda: sum(values, Decimal(0)), 'avg': lambda: sum(values, Decimal(0))/len(values),
                            'count': lambda: Decimal(len(values)), 'min': lambda: min(values), 'max': lambda: max(values)}[function]()
        result.append(output)
    return result, keys


def build_budget_expectations(dataset, plan):
    require(plan['task'] == 47 and plan['operator_reviewed'] is True, 'Reviewed task 47 plan required')
    source = read_rows(dataset)
    require(len(source) == 120 and {r['quarter'] for r in source} == {'Q1','Q2','Q3','Q4'}, 'Budget dataset shape differs')
    for row in source:
        require(row['is_over_budget'] in ('0','1'), 'Unknown over-budget boolean')
        require(Decimal(row['variance']) == Decimal(row['actual'])-Decimal(row['budgeted']), 'Provided variance is inconsistent')
        require((row['is_over_budget'] == '1') == (Decimal(row['variance']) > 0), 'Provided over-budget flag is inconsistent')
    nodes = {n['id']: n for n in plan['expected_graph']['nodes']}
    materialized, identities, tables = {}, {}, {}
    for operation in plan['model_operations_for_review']:
        node = operation['node_id']
        kind, p = nodes[node]['type'], operation['parameters']
        require(not operation['mappings'] or kind == 'imports.text' and operation['mappings'] == [dict(direction='output', port=0, autosync=True)],
                'Output/input mappings need separate budget audit review')
        if kind == 'exports.text':
            continue
        if kind == 'imports.text':
            columns = p['settings']['columns']
            require({c['source_name'] for c in columns} == set(source[0]) and len(columns) == 9 and all(c.get('used', True) for c in columns), 'All nine source fields required')
            expected_types = dict(budget_id='integer', category='string', quarter='string', budgeted='real', actual='real', department='string', variance='real', variance_pct='real', is_over_budget='boolean')
            require(all(c['type'] in ('boolean', 'integer') if c['source_name'] == 'is_over_budget'
                        else c['type'] == expected_types[c['source_name']] for c in columns), 'Budget source type differs')
            def value(row, field):
                item = row[field['source_name']]
                return Decimal(item) if field['type'] in ('integer','real') else item == '1' if field['type'] == 'boolean' else item
            rows = [{c['name']: value(row,c) for c in columns} for row in source]
            keys = [c['name'] for c in columns if c['source_name'] == 'budget_id']
        else:
            links = [e for e in plan['expected_graph']['links'] if e['target'] == node]
            require(len(links) == 1 and links[0]['input'] == 0 and links[0]['output'] == 0, 'Single primary table input required')
            parent = links[0]['source']
            rows = [dict(r) for r in materialized[parent]]
            keys = identities[parent]
            if kind == 'transform.calculator':
                apply_numeric_expressions(rows, p)
            elif kind == 'transform.group_data':
                rows, keys = aggregate(rows, p)
            else:
                require(kind == 'transform.sorting', 'Budget numerical auditor does not support '+kind)
                def compare(a, b):
                    for item in p['keys']:
                        field = item['field']['name']
                        require(item['direction'] in ('ASC','DESC'), 'Unknown sorting direction')
                        order = (a[field] > b[field]) - (a[field] < b[field])
                        if order:
                            return order if item['direction'] == 'ASC' else -order
                    return 0
                rows.sort(key=cmp_to_key(compare))
        materialized[node], identities[node] = rows, keys
        for output in [o for o in plan['outputs'] if o['node_id'] == node]:
            require(output['port'] == 0 and not output.get('configuration_only'), 'Budget output differs')
            fields = {f['name']: f['type'] for f in output['schema']}
            require(all(r.keys() == fields.keys() for r in rows), 'Expected computed fields differ from output schema')
            tables[output['name']] = dict(fields=fields, keys=keys, port=0,
                rows=[{k: str(v) if isinstance(v,Decimal) else v for k,v in r.items()} for r in rows],
                sorting=[dict(name=k['field']['name'],direction=k['direction']) for k in p['keys']] if kind == 'transform.sorting' else [])
    require(tables, 'No budget tables')
    return dict(operator_reviewed=False, task=47, run_id=plan['run_id'], dataset_sha256=hashlib.sha256(dataset.read_bytes()).hexdigest(), tables=tables,
                review_required=['Verify all saved configuration against reviewed operations.',
                                 'Check original business requirements and recommendations independently; numerical equality alone is insufficient.'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = build_budget_expectations(args.dataset, json.loads(args.plan.read_text()))
    with args.out.open('x') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
