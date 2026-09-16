"""Full small-table sorting proof, preserving duplicate row multiplicity.

Expected order must come from an independently fixed oracle, not the node's
configuration or sampled output. Locale/variant comparison is never guessed.
"""
from datetime import datetime
from import_output_evidence import equal_number
from calculator_output_evidence import verify_calculator_output


def verify_row_multiset(columns, expected, sample):
    remaining = list(expected)
    def matches(row, observed):
        if len(row) != len(columns) or len(observed) != len(columns): return False
        for column, value, cell in zip(columns, row, observed):
            if cell.get('type') != column['type'] or cell.get('is_null') is not (value is None): return False
            if value is None: continue
            actual = cell.get('value')
            if column['type'] == 'real':
                if not equal_number(value, actual): return False
            elif column['type'] == 'integer':
                if str(value) != actual: return False
            elif column['type'] == 'datetime':
                if datetime.fromisoformat(value) != datetime.fromisoformat(actual): return False
            elif value != actual: return False
        return True
    for row in sample:
        match = next((i for i, candidate in enumerate(remaining) if matches(candidate, row)), None)
        if match is None: raise ValueError('sorting_input_multiset')
        remaining.pop(match)
    if remaining: raise ValueError('sorting_unconsumed_input_rows')


def verify_sorting_output(events, request, columns, input_rows, expected_rows):
    try:
        checkpoints = [r['result'] for r in events if r.get('operation_id') == request['operation_id'] and r.get('phase') == 'node_checkpoint']
        if len(checkpoints) != 1:
            raise ValueError('sorting_checkpoint')
        port = checkpoints[0]['output']['ports'][0]
        if port['row_count'] != len(input_rows) or port['sample_complete'] is not True:
            raise ValueError('sorting_full_small_output')
        if len(expected_rows) != len(input_rows):
            raise ValueError('sorting_oracle_row_count')
        # Consumes each source row exactly once, including duplicates and Null.
        verify_row_multiset(columns, input_rows, port['sample'])
        result = verify_calculator_output(events, request, columns, expected_rows)
        return {**result, 'scope': 'fresh_sorting_full_order_and_input_multiset'}
    except (KeyError, IndexError, TypeError, ValueError) as error:
        return dict(passed=False, failures=[str(error)], scope='sorting_output_rejected')
