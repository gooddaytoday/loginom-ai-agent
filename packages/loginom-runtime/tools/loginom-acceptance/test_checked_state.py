import copy
import unittest

from checked_state import prove, audit_goal, menu_proof, root_proof, TARGET_SUFFIX


class CheckedStateProofTest(unittest.TestCase):
    def test_root_discovery_detail_chain_and_wrong_root(self):
        data={'calls':[],'tools':[]};actions=[]
        for i in range(3):
            base=i*10
            discovery={'observation_kind':'roots','observation_id':f'd{i}','scan':{'detail_elements':0},
                       'ui':{'elements':[{'ref':'ui-region','kind':'region','identity':{'id':1},'allowed_actions':[]}]}}
            detail={'observation_id':f'o{i}','observation_root':{'ref':'ui-region','identity':{'id':1},
                    'global_scan':False,'global_guards':'fixed_native_queries'},
                    'ui':{'truncated':{'nodes':True},'elements':[{'ref':'ui-check'}]}}
            call={'row':base+3,'session_id':'s','tool_call_id':f'read{i}','tool':'dock_workspace_observe',
                  'arguments':{'root_ref':'ui-region','observation_id':f'd{i}'}}
            action={'row':base+5,'tool':'dock_ui_action','arguments':{'observation_id':f'o{i}','action':{'ref':'ui-check'}}}
            data['calls'].extend([call,action]);actions.append(action)
            data['tools'].extend([{'row':base+2,'session_id':'s','tool':'dock_workspace_observe','result':{'status':'SUCCEEDED','output':discovery}},
                                  {**call,'row':base+4,'result':{'status':'SUCCEEDED','output':detail}}])
        self.assertTrue(root_proof(data,'',actions,{'dock_ui_action'}))
        for mutate in (
            lambda d:d['calls'][0]['arguments'].update(root_ref='ui-other'),
            lambda d:d['tools'][0]['result']['output']['ui']['elements'][0].update(allowed_actions=['click']),
            lambda d:d['tools'][1]['result']['output']['observation_root'].update(global_scan=True),
        ):
            changed=copy.deepcopy(data);mutate(changed)
            self.assertFalse(root_proof(changed,'',actions,{'dock_ui_action'}))

    def fixture(self, noop=False):
        target = {'ref': 'r1', 'tid': 'Wizard;Checkbox;DisplayEl', 'identity': {'id': 1},
                  'label': 'Parallel processing', 'allowed_actions': ['set_checked'],
                  'check_state': {'kind': 'checkbox', 'checked': noop, 'indeterminate': False}}
        call = {'session_id': 's1', 'tool_call_id': 'c1', 'tool': 'dock_ui_action', 'row': 2,
                'arguments': {'action': {'verb': 'set_checked', 'ref': 'r1', 'checked': True}}}
        after = copy.deepcopy(target)
        after['check_state']['checked'] = True
        trace = [{'event': 'ui_preconditions_verified', 'verb': 'set_checked', 'refs': ['r1']},
                 {'event': 'ui_state_verified', 'verb': 'set_checked', 'ref': 'r1', 'checked': True}]
        trace.append({'event': 'ui_state_already_satisfied' if noop else 'ui_gesture_applied',
                      'verb': 'set_checked', 'checked': True})
        result = {'status': 'SUCCEEDED', 'operation_id': 'op1', 'cleanup_complete': True,
                  'effect_possible': not noop, 'trace': trace,
                  'output': {'gesture_applied': not noop, 'ui': {'elements': [after]}}}
        evidence = {'tools': [{**call, 'row': 3, 'result': result}],
                    'events': [{'phase': 'completed', 'operation_id': 'op1',
                                'outcome': copy.deepcopy(result)}]}
        return call, target, evidence

    def test_transition_and_noop(self):
        for noop in (False, True):
            self.assertEqual(prove(*self.fixture(noop))['noop'], noop)

    def roundtrip(self):
        evidence = {'calls': [], 'tools': [], 'events': []}
        for i, noop in enumerate((False, True, False)):
            call, target, part = self.fixture(noop)
            call.update(row=i*4+2, tool_call_id=f'c{i}')
            call['arguments']['observation_id'] = f'o{i}'
            target['tid'] = 'MF;TF;' + TARGET_SUFFIX
            reply = part['tools'][0]
            reply.update(row=i*4+3, tool_call_id=f'c{i}')
            result = reply['result']
            result['operation_id'] = f'op{i}'
            result['output']['ui']['elements'][0]['tid'] = target['tid']
            if i == 2:
                target['check_state']['checked'] = True
                call['arguments']['action']['checked'] = False
                result['output']['ui']['elements'][0]['check_state']['checked'] = False
                for event in result['trace']:
                    if 'checked' in event: event['checked'] = False
            target['check_state']['source'] = 'loginom_ext'
            result['output']['ui']['elements'][0]['check_state']['source'] = 'loginom_ext'
            evidence['calls'].append(call)
            evidence['tools'].extend([{'row':i*4+1, 'result':{'output':{
                'observation_id':f'o{i}', 'ui':{'elements':[target]}}}}, reply])
            evidence['events'].append({'phase':'completed', 'operation_id':f'op{i}', 'outcome':copy.deepcopy(result)})
        return evidence

    def test_goal_roundtrip_and_stale_or_unrelated_target(self):
        data = self.roundtrip()
        self.assertTrue(audit_goal(data, [], '', {'dock_ui_action'})['all_assertions_passed'])
        for mutate in (
            lambda d: d['calls'][1]['arguments'].update(observation_id='o0'),
            lambda d: d['tools'][2]['result']['output']['ui']['elements'][0].update(tid='unrelated'),
            lambda d: d['calls'].append({'tool':'dock_ui_action', 'row':99, 'arguments':{'action':{'verb':'click'}}}),
        ):
            data = self.roundtrip()
            mutate(data)
            self.assertFalse(audit_goal(data, [], '', {'dock_ui_action'})['all_assertions_passed'])

    def test_menu_chain_requires_delivered_item_and_immutable_wizard_receipt(self):
        data = {'calls': [], 'tools': [], 'events': []}
        targets = [
            {'ref':'ui-node','tid':'MF;TF-1;Graph;Текстовый_файл','allowed_actions':['right_click']},
            {'ref':'ui-menu','tid':'mn;mniSetupNode','allowed_actions':['click']},
            {'ref':'ui-check','tid':'MF;TF;' + TARGET_SUFFIX},
        ]
        for i, verb in enumerate(('right_click', 'click')):
            call = {'tool':'dock_ui_action','row':i*4+2,'session_id':'s','tool_call_id':f'c{i}',
                    'arguments':{'observation_id':f'o{i}','action':{'verb':verb,'ref':targets[i]['ref']}}}
            raw = {'status':'SUCCEEDED','operation_id':f'op{i}','effect_possible':True,'cleanup_complete':True,
                   'trace':[{'event':'ui_preconditions_verified','verb':verb,'refs':[targets[i]['ref']]},
                            {'event':'ui_gesture_applied','verb':verb}],
                   'output':{'ui':{'elements':[targets[i+1]]}}}
            data['calls'].append(call)
            data['tools'].extend([
                {'row':i*4+1,'result':{'output':{'observation_id':f'o{i}','ui':{'elements':[targets[i]]}}}},
                {**call,'row':i*4+3,'result':copy.deepcopy(raw)}])
            data['events'].append({'phase':'completed','operation_id':f'op{i}','outcome':raw})
        self.assertTrue(menu_proof(data, '', {'dock_ui_action'}, 10))
        delayed = copy.deepcopy(data)
        for r in (delayed['tools'][3]['result'], delayed['events'][1]['outcome']):
            r['output']['ui']['elements']=[]
        delayed['calls'].append({'tool':'dock_workspace_observe','row':8,'session_id':'s','tool_call_id':'read'})
        delayed['tools'].append({'tool':'dock_workspace_observe','row':9,'session_id':'s','tool_call_id':'read',
                                'result':{'status':'SUCCEEDED','output':{'ui':{'elements':[targets[2]]}}}})
        self.assertTrue(menu_proof(delayed, '', {'dock_ui_action'}, 10))
        delayed['calls'][-1]['row']=6
        self.assertFalse(menu_proof(delayed, '', {'dock_ui_action'}, 10))
        # A pre-browser rejection does not mutate the observed menu. It is
        # excluded only by the shared strict receipt + absent-journal proof.
        from audit import rejected_before_browser
        rejected = copy.deepcopy(data)
        rejected['calls'].insert(1, {'tool':'dock_ui_action','row':4,'session_id':'s','tool_call_id':'bad',
                                    'arguments':{'operation_id':'bad-op'}})
        rejected['tools'].append({'tool':'dock_ui_action','row':4.5,'session_id':'s','tool_call_id':'bad',
            'result':{'request_rejected':True,'effect_possible':False,'status':'FAILED','phase':'request_rejected',
                      'action_key':'request.validate','operation_id':None,'trace':[],
                      'error':{'code':'REQUEST_REJECTED'},'output':{'operation':{
                          'state':'idle','cleanup_confirmed':True,'effect_state':'none'}}}})
        self.assertTrue(menu_proof(rejected, '', {'dock_ui_action'}, 10, rejected_before_browser))
        rejected['tools'][-1]['result']['effect_possible'] = True
        self.assertFalse(menu_proof(rejected, '', {'dock_ui_action'}, 10, rejected_before_browser))
        repeated = copy.deepcopy(data)
        for item in repeated['calls'] + repeated['tools']: item['row'] += 4
        first_call = copy.deepcopy(data['calls'][0]); first_call.update(tool_call_id='earlier')
        first_observe = copy.deepcopy(data['tools'][0])
        first_reply = copy.deepcopy(data['tools'][1]); first_reply.update(tool_call_id='earlier')
        first_reply['result']['operation_id']='earlier-op'
        repeated['calls'].insert(0, first_call)
        repeated['tools'][:0]=[first_observe,first_reply]
        repeated['events'].append({'phase':'completed','operation_id':'earlier-op','outcome':copy.deepcopy(first_reply['result'])})
        self.assertTrue(menu_proof(repeated, '', {'dock_ui_action'}, 14))
        for mutate in (
            lambda d:d['calls'][1]['arguments'].update(observation_id='old'),
            lambda d:d['events'][1]['outcome']['output']['ui']['elements'].clear(),
            lambda d:d['tools'][3]['result'].update(status='AMBIGUOUS'),
            lambda d:d['calls'].append({'tool':'dock_ui_action','row':9,'arguments':{}}),
        ):
            changed = copy.deepcopy(data); mutate(changed)
            self.assertFalse(menu_proof(changed, '', {'dock_ui_action'}, 10))

    def test_tampered_evidence(self):
        for mutate in (
            lambda c, t, e: e['events'].clear(),
            lambda c, t, e: e['tools'][0]['result']['output']['ui']['elements'][0]['check_state'].update(checked=False),
            lambda c, t, e: e['tools'][0].update(session_id='other'),
            lambda c, t, e: c['arguments']['action'].update(checked=1),
            lambda c, t, e: t.update(identity={'id': 2}),
            lambda c, t, e: t['check_state'].update(checked=True),
        ):
            args = self.fixture()
            mutate(*args)
            self.assertIsNone(prove(*args))

    def test_forged_noop_and_wrong_readback_fail_even_with_matching_journal(self):
        for field, value in (('effect_possible', True), ('cleanup_complete', False)):
            call, target, evidence = self.fixture(True)
            evidence['tools'][0]['result'][field] = value
            evidence['events'][0]['outcome'][field] = value
            self.assertIsNone(prove(call, target, evidence))
        call, target, evidence = self.fixture()
        for result in (evidence['tools'][0]['result'], evidence['events'][0]['outcome']):
            result['output']['ui']['elements'][0]['check_state']['checked'] = False
        self.assertIsNone(prove(call, target, evidence))


if __name__ == '__main__':
    unittest.main()
