"""Small mutations of actual saved raw mappings; never launches a browser."""
import copy
from date_time_excluded_evidence import verify_excluded


def verify(events, request, expected):
    baseline=verify_excluded(events,request,expected)
    if not baseline['passed']:return dict(passed=False,baseline=baseline)
    op=request['operation_id']
    phase=next(e for e in events if e.get('operation_id')==op and e.get('phase')=='node_phase_completed'
               and e.get('receipt',{}).get('phase')=='output_mapping')
    native=phase['receipt']['value']['native_mapping']
    raw=next(e for e in events if e.get('operation_id')==op and e.get('phase')=='node_observation_completed'
             and e.get('outcome',{}).get('output',{}).get('node_mapping')==native)
    checkpoint=next(e for e in events if e.get('operation_id')==op and e.get('phase')=='node_checkpoint')
    compact=[raw,phase,checkpoint];cases=[]
    for case in ('source_name','source_label','source_record_id','excluded_flag','unexpected_target_label',
                 'readback_target_label','requested_source_label','requested_source_name'):
        rows=copy.deepcopy(compact);new=copy.deepcopy(request)
        for m in [rows[0]['outcome']['output']['node_mapping'],rows[1]['receipt']['value']['native_mapping']]:
            f=next(f for f in m['target_fields'] if f.get('excluded'));s=f.get('source') or f['exclusion_source']
            if case=='source_name':s['name']='Other'
            elif case=='source_label':s['label']='Other'
            elif case=='source_record_id':s['record_id']='foreign'
            elif case=='excluded_flag':f['excluded']=False
            elif case=='unexpected_target_label':f['label']='Other'
        if case=='readback_target_label':
            next(f for f in rows[2]['result']['configuration']['readback']['output_mapping']['fields'] if f.get('excluded'))['label']='Other'
        elif case in ('requested_source_label','requested_source_name'):
            f=next(f for m in new['mappings'] if m['direction']=='output' for f in m['fields'] if f.get('excluded'))
            f['label' if case=='requested_source_label' else 'name']='Other'
        result=verify_excluded(rows,new,expected)
        cases.append(dict(case=case,rejected=not result['passed'],failures=result['failures']))
    return dict(passed=all(c['rejected'] for c in cases),cases=cases,scope='offline_saved_raw_exclusion_reassessment_negatives')
