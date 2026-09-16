"""Independent comparison of observed cells; never a full execution verdict."""
from collections import Counter
from decimal import Decimal, InvalidOperation
import copy
import re
import rename_effect


class Unverifiable(ValueError):
    pass


def number(text, kind, format):
    """Parse display text exactly, without locale guesses or float tolerances."""
    if not isinstance(text,str) or len(text)>128 or not isinstance(format,dict):
        raise Unverifiable('numeric_format_required')
    if set(format)!={'decimal_separator','grouping_separator'}:
        raise Unverifiable('invalid_numeric_format')
    decimal,group=format['decimal_separator'],format['grouping_separator']
    if decimal not in ('.',',') or group not in (None,'.',',',' ','\u00a0','\u202f') or group==decimal:
        raise Unverifiable('invalid_numeric_format')
    digits=r'[0-9]+'
    if group is not None:
        digits=r'(?:[0-9]+|[0-9]{1,3}(?:'+re.escape(group)+r'[0-9]{3})+)'
    fraction='' if kind=='integer' else '(?:'+re.escape(decimal)+r'[0-9]+)?'
    exponent='' if kind=='integer' else r'(?:[eE][+-]?[0-9]{1,3})?'
    if not re.fullmatch(r'[+-]?'+digits+fraction+exponent,text):
        raise Unverifiable('invalid_numeric_display')
    canonical=text.replace(group,'') if group else text
    canonical=canonical.replace(decimal,'.')
    try:
        value=Decimal(canonical)
    except InvalidOperation as error:
        raise Unverifiable('invalid_numeric_display') from error
    if not value.is_finite() or abs(value.as_tuple().exponent)>400:
        raise Unverifiable('numeric_display_out_of_range')
    return value


def target_table(expected, stage):
    if stage not in ('import','calculator','group'):
        raise Unverifiable('unknown_stage')
    schema=copy.deepcopy(expected['group']['schema'] if stage=='group' else expected['schema'])
    if stage=='calculator':schema.append({'name':expected['calculator']['output_field'],'type':expected['calculator']['type']})
    rows=expected[stage]['rows']
    if not isinstance(rows,list) or type(expected[stage]['row_count']) is not int or len(rows)!=expected[stage]['row_count'] or len(rows)>100 or not 1<=len(schema)<=32:
        raise Unverifiable('invalid_expected_shape')
    if any(c.get('type') not in ('integer','real','string') for c in schema):raise Unverifiable('unsupported_expected_type')
    names=[c['name'] for c in schema]
    # Current fixture uses literal keys. Do not silently reverse the lossy E2E
    # Format transform (spaces/commas) or confuse display labels with names.
    if len(set(names))!=len(names) or any(not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',n) for n in names):
        raise Unverifiable('ambiguous_expected_column_keys')
    values=[]
    for row in rows:
        if set(row)!=set(names):raise Unverifiable('invalid_expected_row')
        result=[]
        for col in schema:
            value=row[col['name']];kind=col['type']
            if value is not None:
                if kind=='string' and not isinstance(value,str):raise Unverifiable('invalid_expected_type')
                if kind in ('integer','real'):
                    if isinstance(value,bool) or not isinstance(value,(int,float,Decimal)):
                        raise Unverifiable('invalid_expected_type')
                    if kind=='integer' and type(value) is not int:raise Unverifiable('invalid_expected_type')
                    value=Decimal(str(value))
                    if not value.is_finite():raise Unverifiable('invalid_expected_number')
                elif kind!='string':raise Unverifiable('unsupported_expected_type')
            result.append(value)
        values.append(tuple(result))
    return schema,values


def compare(snapshot, view_key, expected, stage, numeric_format=None):
    """Compare one rendered view. Format is caller-supplied, not attested here.

    The caller must independently prove format settings, full row coverage,
    execution identity and node/package ownership before any domain admission.
    """
    result={'stage':stage,'view_key':view_key,'rendered_rows_match':False,
            'complete_result_verified':False,'numeric_format_attested':False}
    try:
        prefix=snapshot.get('workflow_ref',{}).get('prefix')
        if snapshot.get('authenticated') is not True or not isinstance(prefix,str) or not re.fullmatch(r'MF;TF(?:-\d+)?',prefix) or not isinstance(view_key,str) or not view_key.startswith(prefix+';'):
            raise Unverifiable('view_context_mismatch')
        schema,wanted=target_table(expected,stage)
        records=snapshot.get('ui',{}).get('table_cells',[])
        if not isinstance(records,list) or len(records)>256:raise Unverifiable('observation_limit')
        columns={};cells={}
        for record in records:
            if not isinstance(record,dict):raise Unverifiable('invalid_record')
            c=record.get('data_column')
            if isinstance(c,dict) and c.get('view_key')==view_key:
                key=c.get('column_key')
                if not isinstance(key,str) or key in columns:raise Unverifiable('duplicate_or_invalid_column')
                if c.get('type_status')!='observed':raise Unverifiable('column_type_unobserved')
                columns[key]=c.get('declared_type')
            c=record.get('data_cell')
            if isinstance(c,dict) and c.get('view_key')==view_key:
                key,row=c.get('column_key'),c.get('row_index')
                if not isinstance(key,str) or type(row) is not int or not 0<=row<100:
                    raise Unverifiable('invalid_cell_identity')
                if (row,key) in cells:raise Unverifiable('duplicate_cell_identity')
                if c.get('header_observed') is not True or c.get('text_complete') is not True or c.get('redacted') is not False:
                    raise Unverifiable('cell_text_unverifiable')
                if type(c.get('null_marker_present')) is not bool or not isinstance(c.get('display_text'),str) or len(c['display_text'])>2048:
                    raise Unverifiable('invalid_cell_value')
                cells[row,key]=c
        if columns!={c['name']:c['type'] for c in schema}:raise Unverifiable('schema_mismatch')
        required={(i,c['name']) for i in range(len(wanted)) for c in schema}
        if set(cells)!=required:raise Unverifiable('rendered_shape_mismatch')
        actual=[]
        for i in range(len(wanted)):
            row=[]
            for col in schema:
                cell=cells[i,col['name']];text=cell['display_text']
                if cell['null_marker_present']:value=None
                elif col['type']=='string':value=text
                else:value=number(text,col['type'],numeric_format)
                row.append(value)
            actual.append(tuple(row))
        # Multiset comparison ignores row order but retains duplicate counts.
        result['rendered_rows_match']=Counter(actual)==Counter(wanted)
        result['reason']='rendered_values_match' if result['rendered_rows_match'] else 'rendered_values_differ'
        result['rendered_row_count']=len(actual)
    except (Unverifiable,KeyError,TypeError,ValueError,AttributeError) as error:
        result['reason']=str(error) if isinstance(error,Unverifiable) else 'malformed_observation_or_fixture'
    return result


def diagnose(evidence, expected, prefix):
    """Use only raw observation receipts bound to actual delivered replies.

    No formatter configuration is yet independently attested. Thus numeric
    observations report numeric_format_required rather than guessing a locale.
    """
    found=[];seen=set()
    for tool in evidence['tools']:
        if tool['tool']!=prefix+'dock_workspace_observe':continue
        reply=tool.get('result',{})
        if not isinstance(reply,dict) or reply.get('status')!='SUCCEEDED':continue
        calls=[c for c in evidence.get('calls',[]) if c.get('session_id')==tool.get('session_id')
               and c.get('tool_call_id')==tool.get('tool_call_id') and c.get('tool')==tool['tool']
               and type(c.get('row')) is int and type(tool.get('row')) is int and c['row']<tool['row']]
        twins=[t for t in evidence['tools'] if (t.get('session_id'),t.get('tool_call_id'))
               ==(tool.get('session_id'),tool.get('tool_call_id'))]
        if len(calls)!=1 or len(twins)!=1:continue
        op=reply.get('operation_id')
        if not op or op in seen:continue
        records=[e for e in evidence['events'] if e.get('phase')=='observation_completed' and e.get('operation_id')==op]
        if len(records)!=1:continue
        raw=records[0].get('outcome',{})
        delivered=copy.deepcopy(reply);delivered.get('output',{}).pop('operation',None)
        if not rename_effect.journal_equal(raw,delivered):continue
        seen.add(op);snapshot=raw.get('output',{})
        views={c.get('data_column',{}).get('view_key') for c in snapshot.get('ui',{}).get('table_cells',[]) if isinstance(c,dict)}-{None}
        for view in sorted(v for v in views if isinstance(v,str)):
            for stage in ('import','calculator','group'):
                if len(found)>=60:return {'observations':found,'truncated':True}
                found.append({'observation_operation_id':op,**compare(snapshot,view,expected,stage)})
    return {'observations':found,'truncated':False}
