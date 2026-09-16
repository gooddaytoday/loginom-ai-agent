import hashlib, unittest
from copy import deepcopy
from pathlib import Path
from union_review_acceptance import expected, parameters, free_inputs, report, UNIONS
from union_review_upload_probe import FIXTURES, descriptors, prompt

class UnionReviewAcceptanceTest(unittest.TestCase):
    def test_fixture_bytes_and_names_are_frozen(self):
        for name,(sha,size) in FIXTURES.items():
            raw=(Path(__file__).parent/'fixtures/union-review'/name).read_bytes()
            self.assertEqual((hashlib.sha256(raw).hexdigest(),len(raw)),(sha,size))
        text=prompt('__MAIN_CSV__ __WIDE_CSV__ __PACKAGE_PATH__','/test-1/review.lgp','/test-1','20260912-010000-1234abcd')
        self.assertNotIn('__',text)
        for d in descriptors('20260912-010000-1234abcd','/test-1'):self.assertIn(d['name'],text)

    def test_oracle_accounts_for_every_field_and_duplicate(self):
        for label,shape in zip(UNIONS,[(2,3),(2,40),(8,3)]):
            cols,rows=expected(label);self.assertEqual((len(rows),len(cols)),shape);self.assertTrue(all(len(r)==len(cols) for r in rows))
        cols,rows=expected(UNIONS[1]);self.assertEqual(rows[1][:3],['v39','v01','v02']);self.assertEqual(rows[0].count(None),37)
        self.assertEqual(cols[3:],['F00']+[f'F{i:02}' for i in range(3,39)])
        self.assertEqual(expected(UNIONS[2])[1].count(['c','a','b']),7)
        self.assertEqual(len(parameters(UNIONS[1])['tables'][0]['fields']),40)
        self.assertEqual(len(parameters(UNIONS[2])['tables']),7)

    def test_free_port_evidence_rejects_missing_previews_extra_ports_and_rewiring(self):
        node=dict(ref=dict(node_id='union'),label='Свободный',inputs=[0,1])
        before=dict(complete=True,nodes=[node],links=[dict(source='main',output=0,target='union',input=0)],foreign_links=[])
        after=deepcopy(before);after['links']=[dict(source='main',output=0,target='union',input=i) for i in (0,1)]
        state=dict(completed=True,pending=None,baseline=before,final_graph=after,receipts=[dict(kind='connect',verified=True,receipt=dict(status='SUCCEEDED')) for _ in range(1)])
        request=dict(operation_id='op',target=dict(ref=dict(node_id='union')),inputs=[dict(source=dict(node_id='main'),output=0,input=1)])
        events=[dict(operation_id='op',phase='node_target_checkpoint',target_state=state)]+[dict(operation_id='op',phase=f'union_input_{i}_preflight_completed',proof=dict(verified=True,cleanup_complete=True,settings_changed=False,parameters_valid=True)) for i in (1,)]
        self.assertTrue(free_inputs(events,request)['passed'])
        for mutate in (lambda e:e.pop(),lambda e:e[0]['target_state']['final_graph']['nodes'][0]['inputs'].append(2),lambda e:e[0]['target_state']['baseline']['links'].append(dict(source='foreign',output=0,target='union',input=1)),lambda e:e[0]['target_state']['final_graph']['links'].pop(),lambda e:e[0]['target_state']['receipts'].append(dict(kind='connect',verified=True,receipt=dict(status='SUCCEEDED')))):
            changed=deepcopy(events);mutate(changed);self.assertFalse(free_inputs(changed,request)['passed'])
        self.assertFalse(report({})['passed'])

    def test_fixture_ui_binds_three_clicks_confirmation_and_only_one_removed_edge(self):
        from union_review_acceptance import fixture_ui, PREFIX
        seed={'operation_id':'seed'};request={'operation_id':'apply','target':{'ref':{'node_id':'union'}},'workflow_ref':{'prefix':'MF;TF-1'}}
        edge=dict(source='main',output=0,target='union',input=1)
        after=dict(nodes=[dict(ref=dict(node_id='union'),inputs=[0,1])],links=[],foreign_links=[])
        before=deepcopy(after);before['links']=[edge]
        events=[dict(phase='node_target_checkpoint',operation_id='seed',target_state=dict(final_graph=before)),dict(phase='node_checkpoint',operation_id='seed')]
        calls=[];replies=[]
        tids=['MF;TF-1;Graph;Главная|Output_Data-0|Свободный|Input_Data-1','MF;TF-1;ModelForm;btnRemoveSelected','msgbox;tlb;yes']
        for i,tid in enumerate(tids):
            op=f'ui{i}';args=dict(operation_id=op,observation_id=f'observe{i}',action=dict(verb='click',ref=f'ref{i}'))
            event=dict(operation_id=op,action_key='ui.act',action_revision='1',parameters=dict(action=args['action'],observation_id=args['observation_id'],recovery_operation_id=None),checkpoint=dict(target_tids=[tid]))
            out=dict(status='SUCCEEDED',cleanup_complete=True,output=dict(ui=dict(dialogs=[])))
            events.extend([dict(event,phase='prepared'),dict(event,phase='completed',outcome=out)])
            base=dict(session_id='s',tool_call_id=op,tool=PREFIX+'dock_ui_action')
            calls.append(dict(base,row=10*i+3,arguments=args));replies.append(dict(base,row=10*i+4,result=out))
        obs=dict(session_id='s',tool_call_id='obs',tool=PREFIX+'dock_workspace_observe')
        calls.append(dict(obs,row=21,arguments=dict(scope='dialogs')));replies.append(dict(obs,row=22,result=dict(output=dict(observation_id='observe2',ui=dict(dialogs=[dict(text='Удалить выделенную связь?')])))))
        events.extend([dict(phase='node_apply_prepared',operation_id='apply'),dict(phase='node_target_checkpoint',operation_id='apply',target_state=dict(baseline=after))])
        evidence=dict(events=events,calls=calls,tools=replies)
        self.assertTrue(fixture_ui(evidence,seed,request)['passed'])
        for change in (lambda e:e['tools'][-1]['result']['output']['ui']['dialogs'].clear(),lambda e:e['events'][2]['checkpoint']['target_tids'].append('foreign'),lambda e:e['events'][-1]['target_state']['baseline']['nodes'][0]['inputs'].append(2),lambda e:e['calls'][0]['arguments']['action'].update(verb='double_click')):
            changed=deepcopy(evidence);change(changed);self.assertFalse(fixture_ui(changed,seed,request)['passed'])

    def test_ui_reply_accepts_only_source_bound_compacted_items(self):
        from union_review_acceptance import ui_reply_matches
        item=dict(ref='r',tid='t',identity=dict(anchor_tid='t',path=[]),bounding_box=dict(x=1),signature=dict(tag='button',dialog_ref='d'),label='Delete')
        full=dict(status='SUCCEEDED',output=dict(origin='http://example/',ui=dict(elements=[item],dialogs=[],truncated=dict(elements=False))))
        public=deepcopy(full);out=public['output'];out['origin']='http://example';out['observation_id']='o';out['page']={}
        compact=out['ui']['elements'][0];compact.pop('identity');compact.pop('bounding_box');compact['signature']={'tag':'button'};out['ui']['truncated']['elements']=True
        self.assertTrue(ui_reply_matches(public,full))
        for change in (lambda x:x['output']['ui']['elements'][0].update(label='Foreign'),lambda x:x.update(status='FAILED'),lambda x:x['output'].update(origin='http://foreign')):
            bad=deepcopy(public);change(bad);self.assertFalse(ui_reply_matches(bad,full))

    def test_saved_long_input_allows_only_observed_selected_first_order(self):
        from union_review_acceptance import persisted_review_equal
        names=['F00','F01','F02','F03','F39'];fields=[dict(name=n,index=i,label=n,type='string',source_name=n) for i,n in enumerate(names)]
        table=[dict(source=n,main={'F01':'B','F02':'C','F39':'A'}.get(n)) for n in names]
        a=dict(configuration=dict(readback=dict(input_mappings=[{},dict(fields=fields)],tables=[dict(fields=table)],output_mapping=dict(fields=['A','B','C','F00','F03']))))
        b=deepcopy(a);rb=b['configuration']['readback'];order=[1,2,4,0,3]
        rb['input_mappings'][1]['fields']=[dict(fields[j],index=i) for i,j in enumerate(order)];rb['tables'][0]['fields']=[table[j] for j in order]
        self.assertTrue(persisted_review_equal(a,b,UNIONS[1]))
        for change in (lambda r:r['input_mappings'][1]['fields'][0].update(label='foreign'),lambda r:r['input_mappings'][1]['fields'].reverse(),lambda r:r['tables'][0]['fields'][0].update(main='A'),lambda r:r['output_mapping']['fields'].reverse()):
            bad=deepcopy(b);change(bad['configuration']['readback']);self.assertFalse(persisted_review_equal(a,bad,UNIONS[1]))
