import copy,json,unittest
from text_export_fresh_evidence import verify_preparation,sha,fresh_origin

class FreshPreparationTests(unittest.TestCase):
    def fixture(self):
        package='/test-2/packages/original.lgp';code='exact-native-prepare'
        binding={'session_id':'new-session','account':'test-2','storage_directory':'/test-2','package_path':package,'loginom_url':'http://logi-test-plan.bg.local/app/?testable=true','preparation_sequence':3}
        prep={'session_id':'new-session','package_ref':{'path':package,'persisted':True},'status':'READY','phase':'exact_workflow_ready','authenticated':True,'target_verified':True,'created_draft':False,'ownership_verified':False,'workflow_ref':{'navigation_path':[{'label':'original'}]}}
        geometry={'viewport':None,'window':{'width':2000,'outerWidth':2000,'availableWidth':2000,'platform':'MacIntel','userAgent':'Chrome/140','origin':'http://logi-test-plan.bg.local'}}
        requests={i:json.dumps({'code':s}).encode() for i,s in enumerate(['geometry','username.fill("test-2");LoginForm;Login;btnLogin',code],1)}
        responses={i:json.dumps({'content':[{'type':'text','text':'### Result\n'+json.dumps(v)}]}).encode() for i,v in enumerate([geometry,True,prep],1)}
        ledger=[{'sequence':i,'started_at':f'2026-09-14T00:00:0{i}Z','completed_at':f'2026-09-14T00:00:0{i}Z','request_sha256':sha(requests[i]),'response_sha256':sha(responses[i])} for i in requests]
        return dict(binding=binding,prep=prep,session={'sessionId':'new-session'},ledger=ledger,requests=requests,responses=responses,expected_code=code,package_path=package,model_sessions={'model-session'})
    def test_binds_real_receipt_without_rewriting_ownership(self):
        f=self.fixture();original=copy.deepcopy(f);self.assertTrue(verify_preparation(**f)['native_preparation_verified']);self.assertEqual(f,original)
    def test_rejects_foreign_session_package_order_and_receipts(self):
        mutations=[lambda f:f['session'].update(sessionId='model-session'),lambda f:f['binding'].update(account='foreign'),lambda f:f['binding'].update(package_path='/test-2/copy.lgp'),lambda f:f['ledger'].reverse(),lambda f:f['ledger'].append(copy.deepcopy(f['ledger'][-1])),lambda f:f['responses'].update({3:b'{}'}),lambda f:f['requests'].update({3:b'{}'}),lambda f:f.update(expected_code='different-prepare'),lambda f:f['prep'].update(created_draft=True),lambda f:f['prep'].update(ownership_verified=True),lambda f:f['prep']['workflow_ref']['navigation_path'].append({'label':'original (только чтение)'}),lambda f:f['ledger'][2].update(started_at='2026-09-13T00:00:00Z')]
        for i,mutate in enumerate(mutations):
            f=self.fixture();mutate(f)
            with self.subTest(case=i),self.assertRaises((AssertionError,KeyError)):verify_preparation(**f)

class FreshOriginTests(unittest.TestCase):
    def fixture(self):
        node={'document_id':'fresh-doc','workflow_id':'fresh-flow','node_id':'native-guid'};wf={'workflow_id':'fresh-flow','prefix':'MF;TF-1','tab_tid':'tab'}
        graph={'complete':True,'foreign_links':[],'document_id':'fresh-doc','workflow_ref':wf,'links':[],'nodes':[{'ref':node,'type':'exports.text','label':'Export','inputs':[0],'outputs':[],'other_ports':[]}]}
        meta={'session_id':'new','runtime_revision':'runtime','manifest_sha256':None,'target':{'origin':'http://logi-test-plan.bg.local','loginom_build':'7.4.2'},'operation_id':'op'}
        obs={'origin':'http://logi-test-plan.bg.local','authenticated':True,'loginom_build':'7.4.2','dom_epoch':{'document':'native-epoch'},'prepared_node_context':{'verified':True,**node},'workflow_ref':wf}
        events=[{**meta,'phase':'node_apply_prepared'},{**meta,'phase':'node_observation_completed','outcome':{'output':obs}},{**meta,'phase':'node_target_checkpoint','target_state':{'completed':True,'final_graph':graph}},{**meta,'phase':'completed'}]
        context={'session':{'sessionId':'new'},'runtime':'runtime','prep':{'document_id':'fresh-doc','workflow_ref':wf},'old_graph':copy.deepcopy(graph)}
        # No aliasing between expected context and observed receipts.
        return copy.deepcopy(events),copy.deepcopy(node),copy.deepcopy(context)
    def test_observed_origin_and_native_graph_are_required(self):
        events,node,context=self.fixture();self.assertEqual(fresh_origin(events,'op',node,'runtime','new',context=context),'http://logi-test-plan.bg.local')
    def test_rejects_foreign_native_context_and_graph(self):
        changes=[lambda e:e[1].update(session_id='other'),lambda e:e[1].update(runtime_revision='other'),lambda e:e[1]['outcome']['output'].update(origin='https://foreign.invalid'),lambda e:e[1]['outcome']['output']['prepared_node_context'].update(node_id='other'),lambda e:e[1]['outcome']['output']['workflow_ref'].update(tab_tid='other'),lambda e:e[1]['outcome']['output'].update(dom_epoch={}),lambda e:e[2]['target_state']['final_graph']['nodes'][0].update(label='other'),lambda e:e.append(e.pop(1)),lambda e:e.insert(3,copy.deepcopy(e[2]))]
        for i,change in enumerate(changes):
            events,node,context=self.fixture();change(events)
            with self.subTest(case=i),self.assertRaises((AssertionError,KeyError)):fresh_origin(events,'op',node,'runtime','new',context=context)

if __name__=='__main__':unittest.main()
