import copy
import unittest
import import_roundtrip_evidence as ir
from test_import_settings_evidence import EXPECTED, snapshot, source_snapshot, mapping_snapshot
import test_import_settings_evidence as import_settings_tests

PATH = '/test/source.csv'


def fixture(selection=True):
    source = source_snapshot(); form = snapshot(); mapping = mapping_snapshot()
    done = copy.deepcopy(mapping); done['wizard']['stage'] = 'done'
    owner = source['wizard']['owner_context']; node = owner['node']['tid'].split('>')[-1]
    done['wizard']['completion']={'fields':{'label':{'value':owner['node']['label']}}}
    graph = copy.deepcopy(source); graph['wizard'] = {'status': 'absent'}
    graph['navigation_context'] = {'status': 'observed', 'path': [{k:p[k] for k in ('tid','label')} for p in owner['path'][:-2]]}
    graph['graph_identity']={'status':'observed','container_ref':'diagram','container_tid':'MF;TF-1;ModelForm;cmpDiagram','native_prefix':'MF;TF-1;Graph;'}
    body = {'ref':'body', 'scope':'graph', 'tid':'MF;TF-1;Graph;'+node, 'graph_node':{'node_label':node,'part':'body'}, 'allowed_actions':['click']}
    settings = {'ref':'settings', 'scope':'graph', 'tid':'MF;TF-1;Graph;'+node+';Setting', 'graph_node':{'node_label':node,'part':'settings'}, 'allowed_actions':['open_wizard']}
    label={'ref':'label','scope':'graph','tid':'MF;TF-1;Graph;'+node+';Label;Label','label':owner['node']['label'],
           'graph_node':{'node_label':node,'part':'label','label_text':owner['node']['label']}}
    graph['ui']['elements'] = [body,label] if selection else [body, settings,label]
    selected = copy.deepcopy(graph); selected['ui']['elements'] = [body, settings,label]
    reopened = source_snapshot()
    for field in reopened['wizard']['import_source']['fields'].values():
        if 'input_ref' in field: field['input_ref'] += '-new'
    for state in (source, form, mapping, reopened):
        state['ui']['elements'] = [{'ref':'next', 'allowed_actions':['wizard_step']}]
    done['ui']['elements'] = [{'ref':'finish', 'allowed_actions':['finish_wizard']}]
    evidence = {'calls':[], 'tools':[], 'events':[]}
    def emit(state, verb=None, ref=None):
        n = len(evidence['calls']); tool = 'dock_ui_action' if verb else 'dock_workspace_observe'
        call = {'session_id':'s', 'tool_call_id':str(n), 'tool':tool, 'row':n*2+1, 'arguments':{}}
        if verb: call['arguments'] = {'observation_id':'obs'+str(n-1), 'action':{'verb':verb,'ref':ref}}
        if verb == 'wizard_step': call['arguments']['action']['expected_stage'] = state['wizard']['stage']
        outcome = {'status':'SUCCEEDED', 'operation_id':'op'+str(n), 'cleanup_complete':True,
                   'output':copy.deepcopy(state)}
        outcome['output']['observation_id'] = 'obs'+str(n)
        if verb: outcome['trace'] = [{'event':'ui_preconditions_verified','refs':[ref],'verb':verb},
                                     {'event':'ui_gesture_applied','verb':verb}]
        if verb == 'wizard_step':
            outcome['trace'].append({'event':'wizard_step_verified',
                                     'from_stage':evidence['tools'][-1]['result']['output']['wizard']['stage'],
                                     'to_stage':state['wizard']['stage'], 'root_ref':state['wizard']['root_ref'],
                                     'settings_applied':False})
        if verb == 'finish_wizard':
            outcome['trace'].append({'event':'wizard_finish_graph_verified', 'previous_owner':copy.deepcopy(owner['node']),
                                     'label':owner['node']['label'],
                                     'node':body['graph_node'], 'node_ref':'body', 'reopen_required':True,
                                     'settings_readback_verified':False, 'package_saved':False})
        if verb == 'open_wizard':
            outcome['trace'].append({'event':'wizard_open_verified','node':settings['graph_node'],
                                     'workflow_path':graph['navigation_context']['path'],
                                     'wizard_root_ref':state['wizard']['root_ref'],
                                     'owner_node':copy.deepcopy(state['wizard']['owner_context']['node']), 'settings_applied':False})
        evidence['calls'].append(call); evidence['tools'].append({**call,'row':n*2+2,'result':outcome})
        evidence['events'].append({'phase':'completed' if verb else 'observation_completed',
                                   'operation_id':outcome['operation_id'],'outcome':copy.deepcopy(outcome)})
    emit(source); emit(form,'wizard_step','next'); emit(mapping,'wizard_step','next')
    emit(done,'wizard_step','next'); emit(graph,'finish_wizard','finish')
    if selection: emit(selected,'click','body')
    emit(reopened,'open_wizard','settings'); emit(form,'wizard_step','next'); emit(mapping,'wizard_step','next')
    return evidence


class ImportRoundtripTests(unittest.TestCase):
    def diagnose(self, evidence):
        return ir.diagnose(evidence, EXPECTED, '', expected_source_path=PATH)['roundtrips']

    def automatic_label_fixture(self):
        data=fixture();old=data['tools'][0]['result']['output']['wizard']['owner_context']['node']
        key=old['tid'].split('>')[-1];label='source.csv'
        def renamed(value):
            if isinstance(value,dict):return {k:renamed(v) for k,v in value.items()}
            if isinstance(value,list):return [renamed(v) for v in value]
            if isinstance(value,str):
                if value in (key,old['label']):return label
                return value.replace('>'+key+'>', '>'+label+'>').replace(';Graph;'+key,';Graph;'+label) if not value.endswith('>'+key) else value[:-len(key)]+label
            return value
        for index in range(4,len(data['tools'])):
            result=data['tools'][index]['result']
            result=renamed(result)
            if index==4:result['trace'][-1]['previous_owner']=copy.deepcopy(old)
            data['tools'][index]['result']=result;data['events'][index]['outcome']=copy.deepcopy(result)
        result=data['tools'][3]['result'];wizard=result['output']['wizard']
        wizard['root_tid']='MF;TF-1;Wizard'
        wizard['completion']={'ready':True,'fields':{
            'label':{'status':'observed','truncated':False,'value':label},
            'label_mode':{'status':'observed','truncated':False,'value':'Автоматическая метка'}}}
        wizard_finish={'root_ref':wizard['root_ref'],'owner':copy.deepcopy(wizard['owner_context']),
                       'completion':copy.deepcopy(wizard['completion'])}
        result['output']['ui']['elements'][0].update(tid=wizard['root_tid']+';btnDone',enabled=True,visible=True,wizard_finish=wizard_finish)
        data['events'][3]['outcome']=copy.deepcopy(result)
        return data

    def test_observed_automatic_label_bridges_finish_and_reopen(self):
        self.assertEqual(len(self.diagnose(self.automatic_label_fixture())),1)

    def test_automatic_label_bridge_rejects_tampering_and_substitution(self):
        for mode in ('unknown_mode','not_ready','truncated','unissued','previous_owner','trace_label',
                     'duplicate_trace','foreign_body','reopened_owner','foreign_document','unbound'):
            with self.subTest(mode=mode):
                data=self.automatic_label_fixture()
                if mode in ('unknown_mode','not_ready','truncated','unissued'):
                    r=data['tools'][3]['result'];w=r['output']['wizard']
                    if mode=='unknown_mode':w['completion']['fields']['label_mode']['value']='unknown'
                    if mode=='not_ready':w['completion']['ready']=False
                    if mode=='truncated':w['completion']['fields']['label']['truncated']=True
                    if mode=='unissued':r['output']['ui']['elements'][0]['wizard_finish']['root_ref']='foreign'
                    data['events'][3]['outcome']=copy.deepcopy(r)
                elif mode in ('reopened_owner','foreign_document'):
                    r=data['tools'][6]['result']
                    if mode=='reopened_owner':r['output']['wizard']['owner_context']['node']['tid']='foreign'
                    else:r['output']['dom_epoch']['document']='foreign'
                    data['events'][6]['outcome']=copy.deepcopy(r)
                else:
                    r=data['tools'][4]['result'];t=r['trace'][-1]
                    if mode=='previous_owner':t['previous_owner']['tid']='foreign'
                    if mode=='trace_label':t['label']='foreign.csv'
                    if mode=='duplicate_trace':r['trace'].append(copy.deepcopy(t))
                    if mode=='foreign_body':r['output']['ui']['elements'][0]['graph_node']['node_label']='foreign'
                    if mode!='unbound':data['events'][4]['outcome']=copy.deepcopy(r)
                    else:data['events'][4]['outcome']['trace'][-1]['label']='foreign'
                self.assertEqual(self.diagnose(data),[])

    def test_complete_rendered_sequence_with_optional_selection(self):
        for selection in (False, True):
            proofs = self.diagnose(fixture(selection))
            self.assertEqual(len(proofs), 1)
            self.assertTrue(proofs[0]['rendered_import_settings_roundtrip_match'])
            self.assertFalse(proofs[0]['complete']); self.assertFalse(proofs[0]['package_persistence_verified'])

    def test_configured_schema_requires_both_format_stages(self):
        for mode in ('both','before_only','after_only','bad_count','partial'):
            with self.subTest(mode=mode):
                data=fixture()
                configured=import_settings_tests.ImportSettingsEvidenceTests().configured_snapshot()['wizard']['import_columns']
                for index in (1,7):
                    if mode=='before_only' and index==7:continue
                    if mode=='after_only' and index==1:continue
                    for outcome in (data['tools'][index]['result'],data['events'][index]['outcome']):
                        outcome['output']['wizard']['import_columns']=copy.deepcopy(configured)
                        coverage=outcome['output']['wizard']['import_columns']['definition_coverage']
                        if mode=='bad_count' and index==7:coverage['count']=4
                        if mode=='partial' and index==7:coverage['status']='partial'
                proofs=self.diagnose(data)
                self.assertEqual(len(proofs),1)
                self.assertTrue(proofs[0]['rendered_import_settings_roundtrip_match'])
                self.assertEqual(proofs[0]['configured_schema_roundtrip_match'],mode=='both')
                self.assertFalse(proofs[0]['complete'])

    def test_configured_mapping_requires_both_bounds_and_same_auto_sync(self):
        for mode in ('both','before_only','after_only','count','partial','auto_changed'):
            with self.subTest(mode=mode):
                data=fixture()
                configured=import_settings_tests.ImportSettingsEvidenceTests().configured_mapping_snapshot()['wizard']['output_columns']
                for index in (2,8):
                    if mode=='before_only' and index==8:continue
                    if mode=='after_only' and index==2:continue
                    for outcome in (data['tools'][index]['result'],data['events'][index]['outcome']):
                        outcome['output']['wizard']['output_columns']=copy.deepcopy(configured)
                        mapping=outcome['output']['wizard']['output_columns']
                        if mode=='count' and index==8:mapping['definition_coverage']['count']=4
                        if mode=='partial' and index==8:mapping['definition_coverage']['status']='partial'
                        if mode=='auto_changed' and index==8:mapping['auto_sync']['value']=True
                proofs=self.diagnose(data)
                self.assertEqual(len(proofs),1)
                self.assertTrue(proofs[0]['rendered_import_settings_roundtrip_match'])
                self.assertEqual(proofs[0]['configured_mapping_roundtrip_match'],mode=='both')
                self.assertFalse(proofs[0]['complete'])

    def test_missing_duplicate_and_unbound_fail(self):
        for mode in ('missing_call', 'missing_reply', 'missing_event', 'duplicate_call', 'duplicate_reply',
                     'duplicate_event', 'changed_journal', 'unissued', 'missing_trace', 'duplicate_trace'):
            with self.subTest(mode=mode):
                data = fixture()
                if mode == 'missing_call': data['calls'].pop(2)
                if mode == 'missing_reply': data['tools'].pop(2)
                if mode == 'missing_event': data['events'].pop(2)
                if mode == 'duplicate_call': data['calls'].append(copy.deepcopy(data['calls'][2]))
                if mode == 'duplicate_reply': data['tools'].append(copy.deepcopy(data['tools'][2]))
                if mode == 'duplicate_event': data['events'].append(copy.deepcopy(data['events'][2]))
                if mode == 'changed_journal': data['events'][2]['outcome']['status'] = 'FAILED'
                if mode == 'unissued': data['calls'][4]['arguments']['observation_id'] = 'foreign'
                if mode in ('missing_trace', 'duplicate_trace'):
                    for outcome in (data['tools'][4]['result'], data['events'][4]['outcome']):
                        if mode == 'missing_trace': outcome['trace'] = []
                        else: outcome['trace'] *= 2
                self.assertEqual(self.diagnose(data), [])

    def test_wrong_context_stale_instance_and_generic_navigation_fail(self):
        for mode in ('stale', 'foreign_owner', 'package', 'document', 'graph_path', 'wrong_body',
                     'wrong_open', 'generic_next', 'missing_source', 'bad_mapping'):
            with self.subTest(mode=mode):
                data = fixture()
                index = 6
                if mode in ('graph_path', 'wrong_body'): index = 4
                if mode == 'generic_next': index = 1
                for outcome in (data['tools'][index]['result'], data['events'][index]['outcome']):
                    state = outcome['output']
                    if mode == 'stale': state['wizard']['import_source']['fields']['source_path']['input_ref'] = 'source_path'
                    if mode == 'foreign_owner': state['wizard']['owner_context']['node']['label'] = 'Other'
                    if mode == 'package': state['package_identity'] = {'name':'Other'}
                    if mode == 'document': state['dom_epoch']['document'] = 'Other'
                    if mode == 'graph_path': state['navigation_context']['path'] = []
                    if mode == 'wrong_body': state['ui']['elements'][0]['graph_node']['node_label'] = 'Other'
                    if mode == 'missing_source': state['wizard'].pop('import_source')
                    if mode == 'bad_mapping': state['wizard']['stage'] = 'output_mapping'
                    if mode == 'generic_next':
                        for t in outcome['trace']: t['verb'] = 'click'
                if mode == 'generic_next': data['calls'][1]['arguments']['action']['verb'] = 'click'
                if mode == 'wrong_open': data['calls'][6]['arguments']['action']['ref'] = 'body'
                self.assertEqual(self.diagnose(data), [])

    def test_unaccounted_mutations_including_overlap_and_foreign_session_fail(self):
        for row, session in ((8, 's'), (9, 's'), (10, 'other'), (17, 'other')):
            data = fixture(); data['calls'].append({'row':row,'session_id':session,'tool_call_id':'extra','tool':'dock_action_run'})
            self.assertEqual(self.diagnose(data), [])

    def test_missing_path_and_detached_snapshots_do_not_prove_roundtrip(self):
        self.assertEqual(ir.diagnose(fixture(), EXPECTED, '')['roundtrips'], [])
        self.assertEqual(self.diagnose({'calls':[],'tools':[],'events':[]}), [])

    def test_typed_transition_proof_required(self):
        for index in (1, 4, 6):
            for mode in ('missing', 'duplicate', 'wrong'):
                data = fixture()
                for outcome in (data['tools'][index]['result'], data['events'][index]['outcome']):
                    if mode == 'missing': outcome['trace'].pop()
                    elif mode == 'duplicate': outcome['trace'].append(copy.deepcopy(outcome['trace'][-1]))
                    elif index == 1: outcome['trace'][-1]['root_ref'] = 'wrong'
                    elif index == 4: outcome['trace'][-1]['node_ref'] = 'wrong'
                    else: outcome['trace'][-1]['workflow_path'] = []
                self.assertEqual(self.diagnose(data), [], (index, mode))

    def test_observed_graph_key_is_separate_from_display_label(self):
        data=fixture()
        def replace(value):
            if isinstance(value,dict):
                for key,item in value.items():
                    if key in ('label','label_text','value') and item=='Import':value[key]='Text, import diagnostic'
                    elif key=='tid' and isinstance(item,str):value[key]=item.replace('>n','>Text_import_diagnostic').replace(';Graph;n',';Graph;Text_import_diagnostic')
                    elif key=='node_label' and item=='n':value[key]='Text_import_diagnostic'
                    else:replace(item)
            elif isinstance(value,list):
                for item in value:replace(item)
        replace(data)
        self.assertEqual(len(self.diagnose(data)),1)
        for mode in ('wrong_key','collision','changed_owner'):
            changed=copy.deepcopy(data)
            for outcome in (changed['tools'][4]['result'],changed['events'][4]['outcome']):
                if mode=='wrong_key':outcome['output']['ui']['elements'][0]['graph_node']['node_label']='Text, import diagnostic'
                if mode=='collision':outcome['output']['ui']['elements'].append(copy.deepcopy(outcome['output']['ui']['elements'][0]))
            if mode=='changed_owner':
                for outcome in (changed['tools'][6]['result'],changed['events'][6]['outcome']):
                    owner=outcome['output']['wizard']['owner_context'];owner['node']['label']='Text import diagnostic';owner['path'][-2]['label']='Text import diagnostic'
            self.assertEqual(self.diagnose(changed),[],mode)

    def rejected_rebind_fixture(self):
        data=fixture()
        # Reserve rows after finish for a failed gesture and fresh graph read.
        for item in data['calls']+data['tools']:
            if item['row']>=11:item['row']+=4
        call={'session_id':'s','tool_call_id':'stale','tool':'dock_ui_action','row':11,
              'arguments':{'operation_id':'stale-op','observation_id':'obs4','action':{'verb':'click','ref':'body'}}}
        result={'status':'NOT_APPLIED','action_key':'ui.act','operation_id':'stale-op','phase':'preconditions',
                'effect_possible':False,'cleanup_complete':True,'error':{'code':'UI_EPOCH_CHANGED'},
                'trace':[{'event':'ui_action_failed','code':'UI_EPOCH_CHANGED'}]}
        data['calls'].append(call);data['tools'].append({**call,'row':12,'result':result})
        data['events'].append({'phase':'completed','operation_id':'stale-op','outcome':copy.deepcopy(result)})
        graph=copy.deepcopy(data['tools'][4]['result']['output']);graph['observation_id']='fresh-graph'
        graph['ui']['elements'][0]['ref']='fresh-body'
        observe={'session_id':'s','tool_call_id':'fresh','tool':'dock_workspace_observe','row':13,'arguments':{}}
        raw={'status':'SUCCEEDED','operation_id':'fresh-op','output':graph}
        data['calls'].append(observe);data['tools'].append({**observe,'row':14,'result':raw})
        data['events'].append({'phase':'observation_completed','operation_id':'fresh-op','outcome':copy.deepcopy(raw)})
        data['calls'][5]['arguments'].update(observation_id='fresh-graph',action={'verb':'click','ref':'fresh-body'})
        for outcome in (data['tools'][5]['result'],data['events'][5]['outcome']):
            outcome['trace'][0]['refs']=['fresh-body']
        return data

    def test_proven_no_effect_click_then_fresh_same_node_rebind(self):
        data=self.rejected_rebind_fixture()
        proof=self.diagnose(data)
        self.assertEqual(len(proof),1)
        self.assertEqual(proof[0]['pre_effect_rejections'],['stale'])
        for mode in ('effect','pending','duplicate','foreign','unbound','wrong_body','second_actual','unknown_error'):
            changed=copy.deepcopy(data)
            failed=next(t for t in changed['tools'] if t['tool_call_id']=='stale')
            if mode=='effect':failed['result']['effect_possible']=True
            if mode=='pending':failed['result']['status']='AMBIGUOUS'
            if mode=='unknown_error':
                failed['result']['error']['code']='UNKNOWN'
                next(e for e in changed['events'] if e['operation_id']=='stale-op')['outcome']=copy.deepcopy(failed['result'])
            if mode=='duplicate':changed['tools'].append(copy.deepcopy(failed))
            if mode=='foreign':failed['session_id']='other'
            if mode=='unbound':changed['events']=[e for e in changed['events'] if e['operation_id']!='stale-op']
            if mode=='wrong_body':
                next(t for t in changed['tools'] if t['tool_call_id']=='fresh')['result']['output']['ui']['elements'][0]['graph_node']['node_label']='other'
            if mode=='second_actual':
                failed['result'].update(status='SUCCEEDED',phase='completed',effect_possible=True)
                failed['result']['trace']=[{'event':'ui_preconditions_verified','refs':['body'],'verb':'click'}, {'event':'ui_gesture_applied','verb':'click'}]
                failed['result']['output']=copy.deepcopy(changed['tools'][4]['result']['output'])
                next(e for e in changed['events'] if e['operation_id']=='stale-op')['outcome']=copy.deepcopy(failed['result'])
            self.assertEqual(self.diagnose(changed),[],mode)

    def test_idle_validation_refusal_of_used_no_effect_id(self):
        data=self.rejected_rebind_fixture()
        for item in data['calls']+data['tools']:
            if item['row']>=15:item['row']+=2
        call={'session_id':'s','tool_call_id':'refused','tool':'dock_ui_action','row':15,
              'arguments':{'operation_id':'stale-op','observation_id':'fresh-graph',
                           'action':{'verb':'click','ref':'fresh-body'}}}
        result={'status':'FAILED','action_key':'request.validate','operation_id':None,'phase':'request_rejected',
                'request_rejected':True,'effect_possible':False,'trace':[], 'error':{'code':'REQUEST_REJECTED'},
                'output':{'operation':{'state':'idle','operation_id':None,'cleanup_confirmed':True,'effect_state':'none'}}}
        data['calls'].append(call);data['tools'].append({**call,'row':16,'result':result})
        proof=self.diagnose(data)
        self.assertEqual(len(proof),1)
        self.assertEqual(proof[0]['pre_effect_rejections'],['stale','refused'])
        for mode in ('duplicate','pending','effect','foreign','unknown'):
            changed=copy.deepcopy(data);reply=next(t for t in changed['tools'] if t['tool_call_id']=='refused')
            if mode=='duplicate':changed['tools'].append(copy.deepcopy(reply))
            if mode=='pending':reply['result']['output']['operation']['state']='pending'
            if mode=='effect':reply['result']['effect_possible']=True
            if mode=='foreign':reply['session_id']='other'
            if mode=='unknown':reply['result']['error']['code']='OTHER'
            self.assertEqual(self.diagnose(changed),[],mode)

    def test_graph_relocated_namespace_requires_active_container_binding(self):
        data=fixture()
        def relocate(value):
            if isinstance(value,dict):
                for key,item in value.items():
                    if isinstance(item,str) and ';Graph;' not in item:value[key]=item.replace('MF;TF-1','MF;TF-4')
                    else:relocate(item)
            elif isinstance(value,list):
                for item in value:relocate(item)
        relocate(data)
        self.assertEqual(len(self.diagnose(data)),1)
        for mode in ('foreign_container','missing','ambiguous','foreign_body','foreign_settings',
                     'changed_container','contradictory_label','duplicate_label','cosmetic_label_spaces','unauthenticated'):
            with self.subTest(mode=mode):
                changed=copy.deepcopy(data);index=5 if mode in ('foreign_settings','changed_container') else 4
                for outcome in (changed['tools'][index]['result'],changed['events'][index]['outcome']):
                    state=outcome['output'];identity=state['graph_identity'];elements=state['ui']['elements']
                    if mode=='foreign_container':identity['container_tid']='MF;TF-1;ModelForm;cmpDiagram'
                    if mode=='missing':state.pop('graph_identity')
                    if mode=='ambiguous':identity['status']='ambiguous'
                    if mode=='foreign_body':elements[0]['tid']='MF;TF-2;Graph;n'
                    if mode=='foreign_settings':next(e for e in elements if e.get('graph_node',{}).get('part')=='settings')['tid']='MF;TF-2;Graph;n;Setting'
                    if mode=='changed_container':identity['container_ref']='foreign-container'
                    if mode=='unauthenticated':state['authenticated']=False
                    label=next(e for e in elements if e.get('graph_node',{}).get('part')=='label')
                    if mode=='contradictory_label':label['graph_node']['label_text']='Other'
                    if mode=='duplicate_label':elements.append(copy.deepcopy(label))
                    if mode=='cosmetic_label_spaces':label['label']='Im port'
                proofs=self.diagnose(changed)
                self.assertEqual(bool(proofs),mode=='cosmetic_label_spaces')

    def test_graph_scope_must_agree_with_native_binding(self):
        for part,index in (('body',4),('label',4),('settings',5)):
            for scope in ('inactive_workflow','workflow',None):
                data=fixture()
                for outcome in (data['tools'][index]['result'],data['events'][index]['outcome']):
                    element=next(e for e in outcome['output']['ui']['elements'] if e.get('graph_node',{}).get('part')==part)
                    element['scope']=scope
                self.assertEqual(self.diagnose(data),[],(part,scope))

    def test_graph_helper_rejects_missing_or_malformed_workflow(self):
        data=fixture();owner=ir._semantic_owner(data['tools'][0]['result']['output'])
        for workflow in (None,[],{}, {'prefix':None},{'prefix':42}):
            state=copy.deepcopy(data['tools'][4]['result']['output']);state['workflow_ref']=workflow
            self.assertFalse(ir._graph(state,owner))
        state=copy.deepcopy(data['tools'][4]['result']['output']);state.pop('workflow_ref')
        self.assertFalse(ir._graph(state,owner));self.assertFalse(ir._graph(None,owner))

    def wizard_refusal_fixture(self, finish=False):
        data=fixture();index=4 if finish else 3;prior=index-1
        verb='finish_wizard' if finish else 'wizard_step';ref='finish' if finish else 'next'
        for outcome in (data['tools'][prior]['result'],data['events'][prior]['outcome']):
            wizard=outcome['output']['wizard'];wizard['root_tid']='MF;TF-1;WizrdMCF'
            element=outcome['output']['ui']['elements'][0]
            element.update(enabled=True,visible=True,tid=wizard['root_tid']+(';btnDone' if finish else ';btnNext'))
            if finish:
                wizard['completion']['ready']=True
                element['wizard_finish']={'root_ref':wizard['root_ref'],'owner':copy.deepcopy(wizard['owner_context']),
                                          'completion':copy.deepcopy(wizard['completion'])}
            else:element['wizard_step']={'direction':'next','root_ref':wizard['root_ref'],'stage':wizard['stage']}
        row=data['calls'][index]['row']
        for record in data['calls']+data['tools']:
            if record['row']>=row:record['row']+=2
        call={'session_id':'s','tool_call_id':'wizard-refusal','tool':'dock_ui_action','row':row,
              'arguments':{'operation_id':'wizard-refusal-op','observation_id':'obs'+str(prior),
                           'action':{'verb':verb,'ref':ref,'expected_stage':'done'}}}
        if finish:
            result={'status':'FAILED','action_key':'request.validate','operation_id':None,'phase':'request_rejected',
                    'request_rejected':True,'effect_possible':False,'trace':[],'error':{'code':'REQUEST_REJECTED'},
                    'output':{'operation':{'state':'idle','operation_id':None,'cleanup_confirmed':True,'effect_state':'none'}}}
            # The corrected dispatch reuses the ID, exactly as in the live receipt.
            call['arguments']['operation_id']=data['tools'][index]['result']['operation_id']
            data['calls'][index]['arguments']['operation_id']=call['arguments']['operation_id']
        else:
            result={'status':'NOT_APPLIED','action_key':'ui.act','operation_id':'wizard-refusal-op','phase':'preconditions',
                    'effect_possible':False,'cleanup_complete':True,'error':{'code':'UI_EPOCH_CHANGED'},
                    'trace':[{'event':'ui_action_failed','code':'UI_EPOCH_CHANGED'}],
                    'output':copy.deepcopy(data['tools'][prior]['result']['output'])}
            data['events'].append({'phase':'completed','operation_id':'wizard-refusal-op','outcome':copy.deepcopy(result)})
        data['calls'].append(call);data['tools'].append({**call,'row':row+1,'result':result})
        if finish:
            for record in data['calls']+data['tools']:
                if record['row']>=row+2:record['row']+=2
            read={'session_id':'s','tool_call_id':'fresh-done','tool':'dock_workspace_observe','row':row+2,'arguments':{}}
            state=copy.deepcopy(data['tools'][prior]['result']['output']);state['observation_id']='fresh-done'
            raw={'status':'SUCCEEDED','operation_id':'fresh-done-op','output':state}
            data['calls'].append(read);data['tools'].append({**read,'row':row+3,'result':raw})
            data['events'].append({'phase':'observation_completed','operation_id':'fresh-done-op','outcome':copy.deepcopy(raw)})
            data['calls'][index]['arguments']['observation_id']='fresh-done'
        return data

    def test_next_and_finish_proven_pre_effect_refusals_preserve_roundtrip(self):
        for finish in (False,True):
            with self.subTest(finish=finish):
                proofs=self.diagnose(self.wizard_refusal_fixture(finish))
                self.assertEqual(len(proofs),1)
                self.assertEqual(proofs[0]['pre_effect_rejections'],['wizard-refusal'])

    def test_no_effect_reply_can_issue_fresh_ref_without_becoming_transition(self):
        for mode in ('valid','unbound','effect','duplicate','foreign'):
            with self.subTest(mode=mode):
                data=self.wizard_refusal_fixture()
                reply=next(t for t in data['tools'] if t['tool_call_id']=='wizard-refusal')
                event=next(e for e in data['events'] if e.get('operation_id')=='wizard-refusal-op')
                reply['result']['output']['observation_id']='fresh-refusal-page'
                event['outcome']['output']['observation_id']='fresh-refusal-page'
                data['calls'][3]['arguments']['observation_id']='fresh-refusal-page'
                if mode=='unbound':reply['result']['output']['wizard']['root_ref']='foreign-root'
                if mode=='effect':reply['result']['effect_possible']=True
                if mode=='duplicate':data['events'].append(copy.deepcopy(event))
                if mode=='foreign':reply['session_id']='foreign'
                proofs=self.diagnose(data)
                self.assertEqual(len(proofs),int(mode=='valid'))
                if proofs:self.assertNotIn('wizard-refusal-op',proofs[0]['operations'])

    def test_epoch_refusal_accepts_only_origin_root_slash_projection(self):
        data=self.wizard_refusal_fixture()
        reply=next(t for t in data['tools'] if t['tool_call_id']=='wizard-refusal')
        raw=next(e['outcome'] for e in data['events'] if e.get('operation_id')=='wizard-refusal-op')
        original=reply['result']['output']['origin'].rstrip('/')
        for result in (reply['result'],raw):result['output']['origin']=original+'/'
        self.assertEqual(len(self.diagnose(data)),1)
        for changed in (original+'/other',original+'//',original+'?x=1',original+'#x',
                        original.replace('://','://other.'),original.replace('http:','https:'),
                        original.replace('://','://user@'),None):
            with self.subTest(origin=changed):
                altered=copy.deepcopy(data)
                next(t for t in altered['tools'] if t['tool_call_id']=='wizard-refusal')['result']['output']['origin']=changed
                next(e for e in altered['events'] if e.get('operation_id')=='wizard-refusal-op')['outcome']['output']['origin']=changed
                self.assertEqual(self.diagnose(altered),[])

    def test_wizard_refusal_requires_exact_issued_control_context_and_no_effect(self):
        modes=('effect','pending','duplicate_reply','duplicate_call','duplicate_event','foreign_session','overlap',
               'unissued','wrong_ref','wrong_verb','wrong_next','extra_field','wrong_tid','disabled','wrong_root',
               'wrong_stage','wrong_owner','wrong_origin','wrong_build','wrong_document','unbound')
        for finish in (False,True):
            for mode in modes:
                with self.subTest(finish=finish,mode=mode):
                    data=self.wizard_refusal_fixture(finish);prior=3 if finish else 2
                    call=next(c for c in data['calls'] if c['tool_call_id']=='wizard-refusal')
                    reply=next(t for t in data['tools'] if t['tool_call_id']=='wizard-refusal')
                    if mode=='effect':reply['result']['effect_possible']=True
                    if mode=='pending':reply['result']['status']='AMBIGUOUS'
                    if mode=='duplicate_reply':data['tools'].append(copy.deepcopy(reply))
                    if mode=='duplicate_call':data['calls'].append(copy.deepcopy(call))
                    if mode=='duplicate_event':data['events'].append(copy.deepcopy(data['events'][4 if finish else -1]))
                    if mode=='foreign_session':call['session_id']=reply['session_id']='other'
                    if mode=='overlap':reply['row']=data['calls'][4 if finish else 3]['row']
                    if mode=='unissued':call['arguments']['observation_id']='other'
                    if mode=='wrong_ref':call['arguments']['action']['ref']='other'
                    if mode=='wrong_verb':call['arguments']['action']['verb']='click'
                    if mode=='wrong_next':call['arguments']['action']['expected_stage']='text_import_file'
                    if mode=='extra_field':call['arguments']['action']['text']='unexpected'
                    if mode=='unbound':data['events'].pop(4 if finish else -1)
                    for outcome in (data['tools'][prior]['result'],data['events'][prior]['outcome']):
                        state=outcome['output'];element=state['ui']['elements'][0];wizard=state['wizard']
                        if mode=='wrong_tid':element['tid']='MF;TF-1;WizrdMCF;btnBack'
                        if mode=='disabled':element['enabled']=False
                        if mode=='wrong_root':element['wizard_finish' if finish else 'wizard_step']['root_ref']='other'
                        if mode=='wrong_stage':wizard['stage']='calculator'
                        if mode=='wrong_owner':wizard['owner_context']['node']['label']='other'
                        if mode=='wrong_origin':state['origin']='https://other.invalid/'
                        if mode=='wrong_build':state['loginom_build']='other'
                        if mode=='wrong_document':state['dom_epoch']['document']='other'
                    self.assertEqual(self.diagnose(data),[])

    def test_finish_refusal_requires_fresh_read_and_single_bound_dispatch(self):
        for mode in ('old_observation','foreign_event','unknown_phase','duplicate_prepared','different_parameters',
                     'missing_fresh','changed_completion','unknown_mutation'):
            with self.subTest(mode=mode):
                data=self.wizard_refusal_fixture(True);op=data['tools'][4]['result']['operation_id']
                if mode=='old_observation':data['calls'][4]['arguments']['observation_id']='obs3'
                if mode=='missing_fresh':data['events']=[e for e in data['events'] if e['operation_id']!='fresh-done-op']
                if mode in ('foreign_event','unknown_phase','duplicate_prepared','different_parameters'):
                    event={'phase':'prepared','operation_id':op}
                    if mode=='foreign_event':event['session_id']='other'
                    if mode=='unknown_phase':event['phase']='other'
                    if mode=='different_parameters':event['parameters']={}
                    data['events'].append(event)
                    if mode=='duplicate_prepared':data['events'].append(copy.deepcopy(event))
                if mode=='changed_completion':
                    for outcome in (next(t for t in data['tools'] if t['tool_call_id']=='fresh-done')['result'],
                                    next(e for e in data['events'] if e['operation_id']=='fresh-done-op')['outcome']):
                        outcome['output']['wizard']['completion']['fields']['label']['value']='different'
                if mode=='unknown_mutation':
                    data['calls'].append({'row':11,'session_id':'s','tool_call_id':'unknown','tool':'dock_action_run','arguments':{}})
                self.assertEqual(self.diagnose(data),[])

    def test_wizard_refusal_cannot_reuse_older_issued_observation_or_changed_result(self):
        for mode in ('old_issued','changed_result','unknown_error'):
            data=self.wizard_refusal_fixture()
            failed=next(t for t in data['tools'] if t['tool_call_id']=='wizard-refusal')
            if mode=='old_issued':
                row=next(c for c in data['calls'] if c['tool_call_id']=='wizard-refusal')['row']
                for record in data['calls']+data['tools']:
                    if record['row']>=row:record['row']+=2
                read={'row':row,'session_id':'s','tool_call_id':'newer','tool':'dock_workspace_observe','arguments':{}}
                raw=copy.deepcopy(data['tools'][2]['result']);raw['operation_id']='newer-op';raw['output']['observation_id']='newer'
                data['calls'].append(read);data['tools'].append({**read,'row':row+1,'result':raw})
                data['events'].append({'phase':'observation_completed','operation_id':'newer-op','outcome':copy.deepcopy(raw)})
            else:
                if mode=='changed_result':failed['result']['output']['wizard']['root_ref']='other'
                else:failed['result']['error']['code']='UNKNOWN'
                next(e for e in data['events'] if e['operation_id']=='wizard-refusal-op')['outcome']=copy.deepcopy(failed['result'])
            self.assertEqual(self.diagnose(data),[],mode)
