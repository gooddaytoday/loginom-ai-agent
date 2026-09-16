"""Fault injection against recorded Union evidence, never the live application."""
import argparse,json
from pathlib import Path
from copy import deepcopy
from union_configuration_evidence import verify_union_configuration
from union_graph_evidence import verify_third_input

def check(events,request):
    baseline=verify_union_configuration(events,request)
    if not baseline['passed']:raise ValueError('A passing raw baseline is required: '+str(baseline))
    checks={}
    for fault in ('missing_checkpoint','foreign_node','changed_mode','omitted_source','wrong_destination','wrong_type','invented_prefix','missing_input_receipt','wrong_port'):
        es=deepcopy(events);r=deepcopy(request)
        if fault=='missing_checkpoint':es=[e for e in es if e.get('phase')!='node_checkpoint']
        elif fault=='changed_mode':r['mode']='distinct'
        elif fault=='omitted_source':r['parameters']['tables'][0]['fields'].pop()
        elif fault=='wrong_destination':r['parameters']['tables'][0]['fields'][0]['main']='nonexistent'
        elif fault=='invented_prefix':r['parameters']['prefixes']={'enabled':True,'name':'Foreign','label':'Foreign'}
        elif fault=='missing_input_receipt':es=[e for e in es if not(e.get('phase')=='node_phase_completed' and e.get('receipt',{}).get('phase')=='input_mapping')]
        else:
            result=next(e['result'] for e in es if e.get('phase')=='node_checkpoint')
            rb=result['configuration']['readback']
            if fault=='foreign_node':result['node']['node_id']='foreign'
            elif fault=='wrong_type':rb['output_mapping']['fields'][0]['type']='integer'
            elif fault=='wrong_port':rb['input_mappings'][1]['port']=0
        result=verify_union_configuration(es,r);checks[fault]={'passed':not result['passed'],'failures':result['failures']}
    if request['target']['kind']=='existing' and len(request['inputs'])==1 and request['inputs'][0]['input']==2:
        if not verify_third_input(events,request)['passed']:raise ValueError('Passing graph baseline required')
        for fault in ('duplicate_port_gesture','foreign_link_change','unrelated_node_change','extra_node','missing_connection'):
            es=deepcopy(events);state=[e['target_state'] for e in es if e.get('phase')=='node_target_checkpoint'][-1]
            if fault=='duplicate_port_gesture':es.append(deepcopy(next(e for e in es if e.get('phase')=='node_target_effect_prepared')))
            elif fault=='foreign_link_change':state['final_graph']['foreign_links'].append('foreign')
            elif fault=='extra_node':state['final_graph']['nodes'].append(dict(state['final_graph']['nodes'][0],ref={'node_id':'extra'}))
            elif fault=='missing_connection':state['final_graph']['links'].pop()
            else:state['final_graph']['nodes'][0]['label']='unrelated'
            r=verify_third_input(es,request);checks[fault]={'passed':not r['passed'],'failures':r['failures']}
    return {'passed':all(x['passed'] for x in checks.values()),'checks':checks}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path);p.add_argument('operation');a=p.parse_args()
    events=[json.loads(l) for l in (a.directory/'execution-events.jsonl').read_text().splitlines()]
    events=[e for e in events if e.get('operation_id')==a.operation]
    request=next(e['request'] for e in events if e.get('phase')=='node_apply_prepared')
    report=check(events,request);(a.directory/'union-negative-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));raise SystemExit(0 if report['passed'] else 1)
