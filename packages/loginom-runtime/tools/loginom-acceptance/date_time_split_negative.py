"""Negative checks derived only from a successful live Done -> Execute pair."""
import argparse
import copy
import json
from pathlib import Path
from date_time_goal_evidence import done_checks, split_retention
from date_time_persistence import events_at, operation


def verify(events, done_id, execute_id, label):
    configured, _ = operation(events, done_id)
    executed, _ = operation(events, execute_id)
    baseline = dict(done=done_checks(events, configured, label), retention=split_retention(events, configured, executed))
    if not all(v['passed'] for v in baseline.values()):
        return dict(passed=False, failures=['successful_live_split_required'], baseline=baseline)
    cases = []
    for case in ('done_not_successful','done_unresolved_cleanup','done_started_execution','foreign_guid',
                 'changed_matrix','changed_mapping','execute_repairs_mapping','execute_repairs_parameters','missing_done_checkpoint'):
        rows=copy.deepcopy(events)
        before=next(e['result'] for e in rows if e.get('phase')=='node_checkpoint' and e.get('operation_id')==done_id)
        after=next(e['result'] for e in rows if e.get('phase')=='node_checkpoint' and e.get('operation_id')==execute_id)
        new=copy.deepcopy(executed)
        if case=='done_not_successful': before['status']='AMBIGUOUS'
        elif case=='done_unresolved_cleanup': before['cleanup_complete']=False
        elif case=='done_started_execution': before['execution']=dict(status='completed',execution_id='unexpected')
        elif case=='foreign_guid': after['node']['node_id']='foreign'
        elif case=='changed_matrix':
            matrix=after['configuration']['readback']['fields'][0]['matrix'];matrix[0]['first']=not matrix[0]['first']
        elif case=='changed_mapping': after['configuration']['readback']['output_mapping']['fields'][0]['label']='changed'
        elif case=='execute_repairs_mapping': new['mappings']=[dict(direction='output',port=0,autosync=True)]
        elif case=='execute_repairs_parameters': new['parameters']={'fields':[]}
        elif case=='missing_done_checkpoint': rows=[e for e in rows if not(e.get('phase')=='node_checkpoint' and e.get('operation_id')==done_id)]
        try:
            checks=dict(done=done_checks(rows,configured,label),retention=split_retention(rows,configured,new))
            rejected=not all(v['passed'] for v in checks.values())
        except (KeyError,ValueError,TypeError,IndexError) as error:
            checks=dict(error=str(error));rejected=True
        cases.append(dict(case=case,rejected=rejected,checks=checks))
    return dict(passed=all(c['rejected'] for c in cases),cases=cases,scope='live_split_evidence_negative_checks')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('session',type=Path);p.add_argument('done');p.add_argument('execute');p.add_argument('label')
    a=p.parse_args();result=verify(events_at(a.session),a.done,a.execute,a.label)
    (a.session/(a.done+'-split-negative.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2));raise SystemExit(0 if result['passed'] else 1)
