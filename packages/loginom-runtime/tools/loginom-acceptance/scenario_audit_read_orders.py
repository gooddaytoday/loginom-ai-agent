"""Operator-only consolidation of calculator reads that change expression order.

Never replayed to Hermes. Original operations remain in the returned provenance.
Analytical edits require separate review and are refused here.
"""
from copy import deepcopy


def consolidate_read_orders(plan):
    result = deepcopy(plan)
    types = {n['id']: n['type'] for n in plan['expected_graph']['nodes']}
    consolidated, seen, receipts = [], {}, []
    for operation in plan['model_operations_for_review']:
        node = operation['node_id']
        if node not in seen:
            current = deepcopy(operation)
            consolidated.append(current)
            seen[node] = current
            continue
        previous = seen[node]
        parameters = operation['parameters']
        outputs = [o for o in plan['outputs'] if o['node_id'] == node and o['port'] == 0]
        if not (types[node] == 'transform.calculator' and parameters.get('expressions') == []
                and set(parameters) <= {'expressions', 'order'}
                and previous['parameters'].get('expressions')
                and operation['mappings'] == previous['mappings'] == []
                and len(outputs) == 1):
            raise ValueError('Repeated analytical edits require separate operator review')
        order = parameters.get('order')
        if order is not None:
            # Calculator order addresses expressions, not inherited input fields.
            names = [e['name'] for e in previous['parameters']['expressions']]
            if not (isinstance(order, list) and all(isinstance(n,str) for n in order)
                    and len(order) == len(names) == len(set(names)) and set(order) == set(names)):
                raise ValueError('Read order must cover every retained expression once')
            definitions = {e['name']: e for e in previous['parameters']['expressions']}
            previous['parameters']['expressions'] = [definitions[name] for name in order]
            previous['parameters']['order'] = deepcopy(order)
        receipts.append(dict(original_operation=deepcopy(operation),
                             consolidated_into=previous['operation_id'],
                             formulas_unchanged=True))
    result['model_operations_for_review'] = consolidated
    result['calculator_read_order_provenance'] = receipts
    return result
