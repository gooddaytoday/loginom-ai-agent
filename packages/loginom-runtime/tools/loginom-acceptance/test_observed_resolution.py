"""Independent decision receipts: abandoning a step is not domain success."""
import copy
import unittest
import audit
from test_rename import fixture as rename_fixture


def fixture():
    request,data,prompt=rename_fixture()
    # Make room for the actual observation before an explicit abandon decision.
    for t in data['calls']+data['tools']:
        if t['row']>=7:t['row']+=2
    observe={'session_id':'hermes-fixture','tool_call_id':'observe','tool':audit.PREFIX+'dock_workspace_observe'}
    data['calls'].append({**observe,'row':7,'arguments':{}})
    data['tools'].append({**observe,'row':8,'result':{'status':'SUCCEEDED','output':{'observation_id':'observation'}}})
    call=data['calls'][2]; reply=data['tools'][2]
    call['tool']=reply['tool']=audit.PREFIX+'dock_operation_recover'
    call['arguments']={'operation_id':'source-op','recovery_operation_id':'decision','observation_id':'observation','strategy':'abandon_operation'}
    original=copy.deepcopy(data['tools'][1]['result'])
    original.update(resolution='abandoned_after_observation',goal_verified=False,recovery_operation_id='decision',observation_id='observation')
    reply['result']={'status':'SUCCEEDED','action_key':'operation.recover','operation_id':'source-op','recovery_operation_id':'decision',
                     'output':{'resolution':'abandoned_after_observation','goal_verified':False,'original_outcome':original}}
    data['events'][2].update(phase='operation_abandoned',outcome=copy.deepcopy(original))
    # A later journaled UI result confirms the single existing source is renamed.
    for t in data['calls']+data['tools']:
        if t['row']>=11:t['row']+=2
    ui={'session_id':'hermes-fixture','tool_call_id':'rename-done','tool':audit.PREFIX+'dock_ui_action'}
    result={'status':'SUCCEEDED','action_key':'ui.act','operation_id':'rename-final','output':{'nodes':[{'node_ref':{'node_label':'Источник'}}]}}
    data['calls'].append({**ui,'row':11,'arguments':{}})
    data['tools'].append({**ui,'row':12,'result':result})
    data['events'].append({**data['events'][0],'operation_id':'rename-final','phase':'completed','outcome':copy.deepcopy(result)})
    data['calls'][1]['arguments']['parameters']['expected_label']='Источник'
    return request,data,prompt


class ObservedResolutionTest(unittest.TestCase):
    def test_abandon_is_bound_but_label_only_snapshot_is_not_rename_proof(self):
        request,data,prompt=fixture()
        pairs={(c['session_id'],c['tool_call_id']):c for c in data['calls']}
        self.assertTrue(audit.observed_resolution(data['tools'][2],pairs,data['tools'],data['events']))
        self.assertFalse(audit.audit(request,data,prompt)['all_assertions_passed'])

    def test_no_unbound_or_unobserved_decision_can_clear_pending(self):
        for mutate in [lambda d:d['tools'][2]['result']['output']['original_outcome'].update(cleanup_complete=False),
                       lambda d:d['calls'][2]['arguments'].update(observation_id='other'),
                       lambda d:d['events'].pop(2),
                       lambda d:d['tools'][2]['result']['output'].update(goal_verified=True),
                       lambda d:d['tools'][-1]['result']['output'].update(nodes=[]),
                       lambda d:d['calls'][2]['arguments'].update(strategy='accept_observed_state')]:
            request,data,prompt=fixture();mutate(data)
            self.assertFalse(audit.audit(request,data,prompt)['all_assertions_passed'])

if __name__=='__main__':unittest.main()
