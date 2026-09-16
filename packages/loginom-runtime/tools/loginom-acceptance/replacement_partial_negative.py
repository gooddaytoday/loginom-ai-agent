"""Evidence corruption checks for the bounded N11-R1 refusal audit."""
from copy import deepcopy
from replacement_partial_evidence import verify_partial_refusal


def verify_negative_cases(events, before_request, request, after_request, expected):
    keys = {r['operation_id'] for r in (before_request, request, after_request)}
    source = [e for e in events if e.get('operation_id') in keys]
    op = request['operation_id']
    def receipt(rows):
        return next(e['receipt'] for e in rows if e.get('operation_id') == op and e.get('phase') == 'node_phase_refused')
    def result(rows):
        return next(e['outcome']['output'] for e in rows if e.get('operation_id') == op and e.get('phase') == 'completed')
    def changed_rule(rows):
        receipt(rows)['proof']['saved_rules'][0]['pairs'][0]['to']['value'] = 'CORRUPTED'
    def foreign_session(rows):
        next(e for e in rows if e.get('operation_id') == op)['session_id'] = 'foreign'
    def remove_close_observation(rows):
        index = next(i for i in range(len(rows)-1, -1, -1) if rows[i].get('operation_id') == op and rows[i].get('phase') == 'node_observation_completed')
        rows.pop(index)
    mutations = {
        'unclean_result': lambda rows: result(rows).update(cleanup_complete=False),
        'foreign_close': lambda rows: receipt(rows)['proof']['closed']['node_context'].update(node_id='foreign'),
        'not_discarded': lambda rows: receipt(rows)['proof']['closed'].update(draft_discarded=False),
        'changed_saved_rule': changed_rule,
        'foreign_session': foreign_session,
        'missing_raw_close': remove_close_observation,
    }
    results = {}
    for name, change in mutations.items():
        rows = deepcopy(source); change(rows)
        results[name] = not verify_partial_refusal(rows, before_request, request, after_request, expected)['passed']
    return dict(passed=all(results.values()), checks=results, count=len(results))
