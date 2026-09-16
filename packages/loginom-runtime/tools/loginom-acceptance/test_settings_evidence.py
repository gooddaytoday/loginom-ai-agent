import copy
import unittest
import settings_evidence as se

EXPECTED={'output_field':'Amount','operation':'Quantity * UnitPrice','type':'real'}


def fixture():
    path=[{'tid':'root','label':'Package'},{'tid':'root>w','label':'Workflow'},{'tid':'root>w>n','label':'Node'},{'tid':'root>w>n>s','label':'Settings'}]
    owner={'status':'observed','node':{'ref':'node','tid':'root>w>n','label':'Node'},'path':path}
    base={'origin':'http://test','loginom_build':'build','workflow_ref':{'prefix':'MF;TF-1'},'package_identity':{'name':'Package'},'active_tab_ref':'tab','dom_epoch':{'document':'doc'},
          'wizard':{'status':'observed','stage':'calculator','root_ref':'wizard1','owner_context':owner,'expression_selection':{'status':'observed','name':'Amount','label':'Amount','type_label':'Вещественный'}},
          'ui':{'dialogs':[],'masks':[],'elements':[{'calculator_editor':{'status':'observed','mode':'expression','selected_expression':{'ref':'expr','label':'Amount'},'document':{'status':'observed','full_text_verified':True,'text':EXPECTED['operation'],'document_ref':'editor1'}}}]}}
    finish=copy.deepcopy(base);finish['wizard']={'status':'absent'};finish['navigation_context']={'path':path[:-2]}
    finish['ui']['elements']=[{'label':'Node','graph_node':{'part':'label'}}]
    after=copy.deepcopy(base);after['wizard']['root_ref']='wizard2';after['ui']['elements'][0]['calculator_editor']['document']['document_ref']='editor2'
    return base,finish,copy.deepcopy(after),after


class SettingsEvidenceTests(unittest.TestCase):
    def test_native_roundtrip(self):
        proof=se.roundtrip(*fixture(),EXPECTED)
        self.assertTrue(proof['calculator_node_settings_verified'])
        self.assertFalse(proof['package_persistence_verified'])

    def test_reject_changed_or_incomplete_state(self):
        for mode in ['formula','type','name','label','same_editor','partial','package','tab','document','path','dialog','open','node','duplicate']:
            with self.subTest(mode=mode):
                a,f,o,b=fixture();editor=b['ui']['elements'][0]['calculator_editor']
                if mode=='formula':editor['document']['text']='42'
                if mode=='type':b['wizard']['expression_selection']['type_label']='Целый'
                if mode=='name':b['wizard']['expression_selection']['name']='Other'
                if mode=='label':b['wizard']['expression_selection']['label']='Other'
                if mode=='same_editor':editor['document']['document_ref']='editor1'
                if mode=='partial':editor['document']['full_text_verified']=False
                if mode=='package':b['package_identity']={'name':'Other'}
                if mode=='tab':b['active_tab_ref']='other'
                if mode=='document':b['dom_epoch']['document']='other'
                if mode=='path':f['navigation_context']['path']=[]
                if mode=='dialog':f['ui']['dialogs']=[{}]
                if mode=='open':f['wizard']['status']='observed'
                if mode=='node':f['ui']['elements']=[]
                if mode=='duplicate':f['ui']['elements']*=2
                self.assertFalse(se.roundtrip(a,f,o,b,EXPECTED)['calculator_node_settings_verified'])

    def test_reject_reopened_different_node_even_with_identical_expression(self):
        for label in ('OtherNode', 'Node'):
            with self.subTest(label=label):
                before,finish,opened,after=fixture()
                for snapshot in (opened,after):
                    owner=snapshot['wizard']['owner_context']
                    owner['node'].update(tid='root>w>other',label=label)
                    owner['path'][-2]={'tid':'root>w>other','label':label}
                    owner['path'][-1]={'tid':'root>w>other>s','label':'Settings'}
                finish['ui']['elements'][0]['label']=label
                proof=se.roundtrip(before,finish,opened,after,EXPECTED)
                self.assertFalse(proof['calculator_node_settings_verified'])
                self.assertEqual(proof['reason'],'node_owner_changed')
                self.assertFalse(proof['package_persistence_verified'])

    def test_reject_missing_or_inconsistent_breadcrumb_node_identity(self):
        for mode in ('missing_tid','wrong_tid','wrong_label'):
            with self.subTest(mode=mode):
                before,*_=fixture()
                node=before['wizard']['owner_context']['node']
                if mode=='missing_tid':del node['tid']
                if mode=='wrong_tid':node['tid']='root>w>other'
                if mode=='wrong_label':node['label']='OtherNode'
                self.assertIsNone(se.calculator_state(before,EXPECTED))

    def test_owner_refs_may_change_but_literal_expression_contract_does_not(self):
        before,finish,opened,after=fixture()
        for snapshot in (opened,after):
            snapshot['wizard']['owner_context']['node']['ref']='new-breadcrumb-ref'
        self.assertTrue(se.roundtrip(before,finish,opened,after,EXPECTED)['calculator_node_settings_verified'])
        after['ui']['elements'][0]['calculator_editor']['document']['text']='Quantity*UnitPrice'
        self.assertFalse(se.roundtrip(before,finish,opened,after,EXPECTED)['calculator_node_settings_verified'])

    def test_bound_receipts_require_unique_ordered_journal_match(self):
        result={'status':'SUCCEEDED','operation_id':'op','output':{'value':1}}
        call={'session_id':'s','tool_call_id':'c','tool':'dock_workspace_observe','row':1}
        reply={**call,'row':2,'result':result}
        evidence={'calls':[call],'tools':[reply],'events':[{'phase':'observation_completed','operation_id':'op','outcome':copy.deepcopy(result)}]}
        self.assertEqual(len(se.bound_receipts(evidence,'')),1)
        for mode in ['duplicate_reply','duplicate_event','changed','wrong_order','missing_event','wrong_session']:
            e=copy.deepcopy(evidence)
            if mode=='duplicate_reply':e['tools']*=2
            if mode=='duplicate_event':e['events']*=2
            if mode=='changed':e['tools'][0]['result']['output']['value']=2
            if mode=='wrong_order':e['calls'][0]['row']=3
            if mode=='missing_event':e['events']=[]
            if mode=='wrong_session':e['tools'][0]['session_id']='other'
            self.assertEqual(se.bound_receipts(e,''),[],mode)

    def test_correlates_real_receipt_sequence_and_rejects_intervening_edits(self):
        a,f,o,b=fixture()
        a['ui']['elements'].append({'ref':'next','allowed_actions':['wizard_step']})
        done=copy.deepcopy(a);done['wizard']['stage']='done';done['ui']['elements']=[{'ref':'done','allowed_actions':['finish_wizard']}]
        f['ui']['elements'].append({'ref':'body','graph_node':{'part':'body'},'allowed_actions':['click']})
        selected=copy.deepcopy(f);selected['ui']['elements'].append({'ref':'setting','allowed_actions':['open_wizard']})
        e={'calls':[],'tools':[],'events':[]}
        def emit(snapshot,verb=None,ref=None):
            n=len(e['calls']);tool='dock_ui_action' if verb else 'dock_workspace_observe'
            call={'session_id':'s','tool_call_id':str(n),'tool':tool,'row':n*2+1,'arguments':{}}
            if verb:call['arguments']={'observation_id':'obs'+str(n-1),'action':{'verb':verb,'ref':ref}}
            out={'status':'SUCCEEDED','operation_id':'op'+str(n),'output':copy.deepcopy(snapshot),'cleanup_complete':True}
            out['output']['observation_id']='obs'+str(n)
            if verb:out['trace']=[{'event':'ui_preconditions_verified','refs':[ref],'verb':verb},{'event':'ui_gesture_applied','verb':verb}]
            e['calls'].append(call);e['tools'].append({**call,'row':n*2+2,'result':out})
            e['events'].append({'phase':'completed' if verb else 'observation_completed','operation_id':out['operation_id'],'outcome':copy.deepcopy(out)})
        emit(a);emit(done,'wizard_step','next');emit(f,'finish_wizard','done');emit(selected,'click','body');emit(o,'open_wizard','setting');emit(b)
        proof=se.diagnose(e,EXPECTED,'')['roundtrips']
        self.assertEqual(len(proof),1)
        self.assertTrue(proof[0]['calculator_node_settings_verified'])
        for mode in ['unissued','missing_gesture','foreign_mutation','during_finish','changed_journal']:
            bad=copy.deepcopy(e)
            if mode=='unissued':bad['calls'][2]['arguments']['observation_id']='unknown'
            if mode=='missing_gesture':
                bad['tools'][2]['result']['trace']=[];bad['events'][2]['outcome']['trace']=[]
            if mode=='foreign_mutation':bad['calls'].append({'tool':'dock_action_run','row':10,'session_id':'s','tool_call_id':'extra'})
            if mode=='during_finish':bad['calls'].append({'tool':'dock_action_run','row':6,'session_id':'s','tool_call_id':'extra'})
            if mode=='changed_journal':bad['events'][4]['outcome']['status']='AMBIGUOUS'
            self.assertEqual(se.diagnose(bad,EXPECTED,'')['roundtrips'],[],mode)

    def test_unbound_snapshots_do_not_become_proof(self):
        self.assertEqual(se.diagnose({'tools':[],'calls':[],'events':[{'outcome':s} for s in fixture()]},EXPECTED,'')['roundtrips'],[])
        self.assertIsNone(se.calculator_state({'wizard':None},EXPECTED))


if __name__=='__main__':unittest.main()
