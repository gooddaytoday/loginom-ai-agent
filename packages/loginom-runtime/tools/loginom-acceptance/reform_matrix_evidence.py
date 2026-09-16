"""Compare a complete native Table result with the frozen scalar matrix.

This does not run conversions or infer missing cells. The caller must separately
verify execution, source identity, readback and package persistence.
"""
import json
from pathlib import Path

GOLDEN = Path(__file__).parent / 'fixtures/field-parameters/scalar-matrix.json'


def verify_matrix_data(data, *, part='output', golden=None):
    expected = (golden if golden is not None else json.loads(GOLDEN.read_text()))[part]
    failures = []
    try:
        schema = [{k:f[k] for k in ('name','label','type','data_kind')} for f in data['schema']]
        if schema != expected['schema']:
            failures.append('matrix_schema')
        if (data.get('sample_complete') is not True or data.get('row_count') != expected['row_count']
                or len(data.get('sample',[])) != expected['row_count'] or data.get('filter_enabled') is not False):
            failures.append('matrix_complete_unfiltered_rows')
        if data.get('precision',{}).get('numbers_verified') is not True:
            failures.append('matrix_exact_numbers')
        actual = []
        for row in data['sample']:
            cells = []
            for c in row:
                if type(c.get('is_null')) is not bool:
                    raise ValueError('matrix_null_marker')
                if c['is_null'] and c.get('value') is not None:
                    raise ValueError('matrix_null_value')
                value = c.get('value')
                if not c['is_null']:
                    kind = c['type']
                    if kind == 'integer' and (not isinstance(value,str) or c.get('precision') != 'exact_integer'):
                        raise ValueError('matrix_integer_precision')
                    if kind == 'real' and (type(value) not in (int,float) or c.get('precision') != '17_significant_digits'):
                        raise ValueError('matrix_real_precision')
                    if kind == 'boolean' and type(value) is not bool:
                        raise ValueError('matrix_boolean_type')
                    if kind=='datetime' and (c.get('precision')!='millisecond' or c.get('timezone')!='unspecified'):
                        raise ValueError('matrix_datetime_precision')
                    if kind in ('string','datetime') and not isinstance(value,str):
                        raise ValueError('matrix_text_type')
                cells.append(dict(type=c['type'],is_null=c['is_null'],value=value))
            actual.append(cells)
        # The checks above keep booleans distinct from numbers. Binary64 values
        # are compared only after confirming the seventeen-digit reading mode.
        if len(actual) != len(expected['rows']) or any(len(a)!=len(b) for a,b in zip(actual,expected['rows'])):
            failures.append('matrix_cell_count')
        else:
            for r,(a,b) in enumerate(zip(actual,expected['rows'])):
                for col,(observed,wanted) in enumerate(zip(a,b)):
                    if observed != wanted or type(observed['value']) is bool and type(wanted['value']) is not bool:
                        failures.append(f'matrix_value_{r}_{col}')
    except (KeyError,TypeError,ValueError,IndexError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'matrix_malformed_data')
    return dict(passed=not failures,failures=failures,scope='complete_frozen_scalar_matrix_'+part)
