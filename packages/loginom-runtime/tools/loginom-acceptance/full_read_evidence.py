"""Declared read capacity and complete table envelope; raw values need their own auditor."""

def verify_full_read(events, request, expected_rows):
    try:
        def need(value, reason):
            if not value: raise ValueError(reason)
        need(type(expected_rows) is int and expected_rows >= 0, 'expected_count')
        read=request['read'];capacity=read['sample_rows']
        need(read['ports']==[0] and read['require_exact_numbers'] is True and type(capacity) is int
             and max(1,expected_rows)<=capacity<=10, 'read_capacity')
        matches=[e['result'] for e in events if e.get('operation_id')==request['operation_id'] and e.get('phase')=='node_checkpoint']
        need(len(matches)==1, 'unique_checkpoint');result=matches[0];out=result['output'];execution=result['execution']
        need(result['status']=='SUCCEEDED' and execution['status']=='completed' and bool(execution['execution_id']), 'completed_execution')
        need(out['status']=='complete' and out['verified'] is True and out['execution_id']==execution['execution_id'] and len(out['ports'])==1,'complete_output')
        port=out['ports'][0]
        need(port['port']==0 and port['fresh'] is True and port['execution_id']==execution['execution_id'], 'fresh_port')
        need(type(port['row_count']) is int and port['row_count']==expected_rows and port['sample_rows']==expected_rows
             and len(port['sample'])==expected_rows and port['sample_complete'] is True, 'complete_counts')
        need(not any(port.get(k) for k in ('truncated','schema_truncated','sample_truncated')) and port.get('filter_enabled') is False,'untruncated_unfiltered')
        need(bool(port['schema']) and all(len(row)==len(port['schema']) for row in port['sample']), 'complete_width')
        return dict(passed=True,rows=expected_rows,capacity=capacity,scope='read_capacity_and_envelope_only',values_verified=False,schema_verified=False)
    except (KeyError,TypeError,ValueError) as error:
        return dict(passed=False,failures=[str(error)])
