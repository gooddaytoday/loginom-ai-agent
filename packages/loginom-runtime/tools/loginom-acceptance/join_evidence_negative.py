"""Run adversarial mutations against a successful Join journal, without UI effects."""
import argparse,copy,json
from pathlib import Path
from join_configuration_evidence import verify_join_configuration

def audit_mutations(events,request):
    baseline=verify_join_configuration(events,request)
    if not baseline['passed']:raise ValueError('Baseline rejected: '+str(baseline))
    op=request['operation_id'];results={}
    def check(name,change):
        es=copy.deepcopy(events);r=copy.deepcopy(request);change(es,r)
        result=verify_join_configuration(es,r);results[name]=dict(passed=not result['passed'],failures=result['failures'])
    def checkpoint(es):return next(e['result'] for e in es if e.get('operation_id')==op and e.get('phase')=='node_checkpoint')
    def receipt(es,name):return next(e['receipt']['value'] for e in es if e.get('operation_id')==op and e.get('phase')=='node_phase_completed' and e['receipt']['phase']==name)
    check('request_wrong_mode',lambda es,r:r.update(mode='right'))
    check('request_missing_key',lambda es,r:r['parameters'].update(keys=[dict(left='missing',right='missing')]))
    check('request_wrong_case',lambda es,r:r['parameters'].update(case_sensitive=not r['parameters']['case_sensitive']))
    check('wrong_input_port',lambda es,r:receipt(es,'input_mapping')['ports'][1].update(port=0))
    check('foreign_input_owner',lambda es,r:receipt(es,'input_mapping')['ports'][1]['native_mapping']['node_context'].update(node_id='foreign'))
    check('incomplete_input',lambda es,r:receipt(es,'input_mapping')['ports'][1]['native_mapping'].update(inventory_complete=False))
    check('missing_output_source',lambda es,r:receipt(es,'output_mapping')['native_mapping']['source_fields'].pop())
    check('changed_output_alias',lambda es,r:receipt(es,'output_mapping')['native_mapping']['target_fields'][0].update(name='forged'))
    check('forged_projection',lambda es,r:checkpoint(es)['configuration']['readback']['keys'].clear())
    check('missing_finish',lambda es,r:receipt(es,'finish').update(settings_applied=False))
    check('missing_raw_observations',lambda es,r:es.__setitem__(slice(None),[e for e in es if not(e.get('operation_id')==op and e.get('phase')=='node_observation_completed')]))
    return dict(passed=all(v['passed'] for v in results.values()),baseline=baseline,checks=results)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('journal');p.add_argument('operation');p.add_argument('--output',required=True);a=p.parse_args()
    es=[json.loads(l) for l in Path(a.journal).read_text().splitlines()];r=next(e['request'] for e in es if e.get('phase')=='node_apply_prepared' and e['request']['operation_id']==a.operation)
    result=audit_mutations(es,r);Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(passed=result['passed'],checks=len(result['checks']))));raise SystemExit(0 if result['passed'] else 1)
