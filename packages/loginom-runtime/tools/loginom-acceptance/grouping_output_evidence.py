"""Unordered grouping output audit with independent, fully consumed oracle rows."""
from calculator_output_evidence import verify_calculator_output
from import_output_evidence import equal_number


def align_expected_rows(columns, expected, sample):
    if len(expected) != len(sample): raise ValueError('grouping_row_count')
    remaining = list(expected); ordered = []
    def matches(row, observed):
        if len(row) != len(columns) or len(observed) != len(columns): return False
        for column, value, cell in zip(columns, row, observed):
            if cell.get('type') != column['type'] or cell.get('is_null') is not (value is None): return False
            if value is None: continue
            actual = cell.get('value')
            if column['type']=='real':
                if not equal_number(value, actual): return False
            elif column['type']=='integer':
                if str(value) != actual: return False
            elif value != actual: return False
        return True
    for row in sample:
        match = next((i for i, candidate in enumerate(remaining) if matches(candidate,row)), None)
        if match is None: raise ValueError('grouping_aggregate_row')
        ordered.append(remaining.pop(match))
    if remaining: raise ValueError('grouping_unconsumed_rows')
    return ordered


def verify_grouping_output(events,request,columns,expected):
    try:
        checkpoints=[r['result'] for r in events if r.get('operation_id')==request['operation_id'] and r.get('phase')=='node_checkpoint']
        if len(checkpoints)!=1: raise ValueError('grouping_checkpoint')
        port=checkpoints[0]['output']['ports'][0]
        if port['row_count']!=len(expected) or port['sample_complete'] is not True: raise ValueError('grouping_full_small_output')
        ordered=align_expected_rows(columns,expected,port['sample'])
        # The common independent auditor ties these same typed values to the raw
        # native table pages, display formats, execution and return receipts.
        result=verify_calculator_output(events,request,columns,ordered)
        return {**result,'scope':'fresh_grouping_multiset_against_independent_expected'}
    except (KeyError,IndexError,TypeError,ValueError) as error:
        return dict(passed=False,failures=[str(error)],scope='grouping_output_rejected')
