import copy
import hashlib
import json
from pathlib import Path
import unittest
from import_done_evidence import verify_text_import_done, _verify_text_import
from node_procedure_evidence import digest


class ImportDoneEvidenceTests(unittest.TestCase):
    def setUp(self):
        fixture = json.loads((Path(__file__).resolve().parents[2] / 'client/test/fixtures/node-import-journal.json').read_text())
        self.expected = fixture['expected']
        self.body = (';'.join(c['name'] for c in self.expected['columns'])+'\n').encode()
        source = dict(artifact_id='artifact', upload_operation_id='upload', bytes=len(self.body), sha256=hashlib.sha256(self.body).hexdigest())
        self.request = dict(operation_id='done',document_id='prepared',workflow_ref={'workflow_id':'workflow'},target={'label':'Import'},finish='done',mappings=[],inputs=[],parameters={'source':source,'settings':self.expected})
        self.events = []; self.step = 0
        base = {k:fixture['events'][0][k] for k in ['session_id','runtime_revision','target']}
        states = [e['outcome']['output'] for e in fixture['events'] if e['phase']=='node_observation_completed']
        def state(stage):
            result=copy.deepcopy(next(s for s in states if s.get('wizard',{}).get('stage')==stage))
            result['prepared_node_context']=dict(verified=True,document_id='prepared',workflow_id='workflow',node_id='node',surface='wizard')
            return result
        source_state=state('text_import_file')
        # Use the final source values from the native fixture.
        source_state['wizard']['import_source']=copy.deepcopy([s for s in states if s.get('wizard',{}).get('stage')=='text_import_file'][-1]['wizard']['import_source'])
        formatted=copy.deepcopy([s for s in states if s.get('wizard',{}).get('stage')=='text_import_format'][-1])
        formatted['prepared_node_context']=copy.deepcopy(source_state['prepared_node_context'])
        formatted['wizard']['owner_context']=copy.deepcopy(source_state['wizard']['owner_context'])
        for i,c in enumerate(formatted['wizard']['import_columns']['fields']):c['index']=i
        formatted['wizard']['import_columns']['page']=dict(status='complete_definition_page',schema_id='schema',offset=0,limit=8,returned=len(self.expected['columns']),total_columns=len(self.expected['columns']),next_offset=None)
        mapping=state('output_mapping'); done=state('done'); graph=copy.deepcopy(source_state);graph['wizard']={'status':'absent'};graph['prepared_node_context']['surface']='graph'
        def event(phase, **extra):
            e=dict(base,operation_id='done',phase=phase,**extra);self.events.append(e);return e
        def observe(s):
            self.step+=1
            ready=dict(policy='semantic_condition_v2',required_samples=1,condition='test',satisfied=True,elapsed_ms=1,timeout_ms=15000)
            for phase in ['node_observation_sample','node_observation_completed']:
                event(phase,step=self.step,internal_operation_id=f'done:n{self.step}',internal_provenance='client_node_procedure_v1',readiness=ready,outcome={'status':'SUCCEEDED','output':copy.deepcopy(s)},**({'sample':0} if phase.endswith('sample') else {}))
        def gesture(s,verb):
            ref='ui-done-action';s['ui']['elements'].append({'ref':ref,'allowed_actions':[verb]});observe(s)
            self.step+=1;action={'verb':verb,'ref':ref};internal=f'done:n{self.step}'
            event('node_step_prepared',step=self.step,internal_operation_id=internal,internal_provenance='client_node_procedure_v1',action=action,observation_sha256=digest(s),signature=digest([internal,action,s]))
            event('node_step_completed',step=self.step,internal_operation_id=internal,internal_provenance='client_node_procedure_v1',outcome={'status':'SUCCEEDED','operation_id':internal,'action_key':'ui.act','cleanup_complete':True,'trace':[{'event':'wizard_finish_graph_verified'}] if verb=='finish_wizard' else []})
        def phase(name,body):
            event('node_phase_prepared',receipt={'phase':name,'receipt_id':'done:'+name});body();event('node_phase_completed',receipt={'phase':name,'receipt_id':'done:'+name,'status':'verified'})
        proof=dict(status='SUCCEEDED',verification_id='verify',bytes_verified=True,upload_completion_verified=True,destination=self.expected['source']['source_path'],bytes=source['bytes'],sha256=source['sha256'])
        out=dict(proof,artifact_id='artifact',upload_operation_id='upload')
        self.events.extend([dict(base,operation_id='verify',phase='verification_completed',outcome={'status':'SUCCEEDED','cleanup_complete':True,'output':out}),dict(base,operation_id='upload',phase='completed',outcome={'status':'SUCCEEDED','action_key':'artifact.upload','cleanup_complete':True,'output':dict(out,server_copy_verification=proof)})])
        self.events[0:0]=[dict(base,operation_id='verify',phase=name) for name in ['download_prepared','download_completed','download_verified']]
        phase('source',lambda:None)
        phase('target',lambda:event('node_target_checkpoint',target_state={'last_graph':{'nodes':[{'ref':{'node_id':'node'},'label':'Import','type':'imports.text','inputs':[],'outputs':[0]}]}}))
        phase('input_mapping',lambda:None)
        phase('open',lambda:(gesture(graph,'open_wizard'),observe(source_state)))
        phase('configure',lambda:(observe(source_state),observe(formatted)))
        phase('output_mapping',lambda:observe(mapping))
        phase('finish',lambda:(gesture(done,'finish_wizard'),observe(graph)))
        event('node_checkpoint',result={'execution':{'status':'not_requested'},'output':{'status':'not_refreshed'},'package_saved':False})

    def verify(self):
        return verify_text_import_done(self.events,self.request,self.body)

    def test_complete_done_evidence_has_no_execution_or_persistence_claim(self):
        result=self.verify();self.assertTrue(result['passed'],result)
        self.assertFalse(result['execution_verified']);self.assertFalse(result['package_persistence_verified'])

    def paged_mapping(self):
        for e in self.events:
            m=e.get('outcome',{}).get('output',{}).get('wizard',{}).get('output_columns')
            if m and m.get('fields'):
                for i,f in enumerate(m['fields']):f['index']=i
                m['definition_coverage']={'status':'partial'}
                m['page']=dict(status='complete_definition_page',schema_id='mapping',offset=0,limit=8,returned=len(m['fields']),total_columns=len(m['fields']),next_offset=None)

    def test_outer_phase_identity_cannot_differ_from_internal_steps(self):
        for key,value in [('runtime_revision','foreign'),('session_id','foreign'),('target',{'origin':'foreign'})]:
            events=copy.deepcopy(self.events)
            row=next(e for e in events if e.get('operation_id')=='done' and e.get('phase')=='node_phase_completed')
            row[key]=value
            result=verify_text_import_done(events,self.request,self.body)
            self.assertFalse(result['passed'])
            self.assertIn('node_phase_journal_identity',result['failures'])

    def test_paged_mapping_passes(self):
        self.paged_mapping();result=self.verify();self.assertTrue(result['passed'],result)

    def test_invalid_mapping_cursor_cannot_pass(self):
        self.paged_mapping()
        for e in self.events:
            m=e.get('outcome',{}).get('output',{}).get('wizard',{}).get('output_columns',{})
            if m.get('page'):m['page']['next_offset']=8
        self.assertIn('output_page_cursor',self.verify()['failures'])

    def test_changed_bytes_cannot_pass(self):
        self.body+=b'x';self.assertIn('original_source_bytes',self.verify()['failures'])

    def test_missing_verified_upload_cannot_pass(self):
        self.events=[e for e in self.events if e['operation_id']!='upload'];self.assertIn('verified_upload_receipt_missing',self.verify()['failures'])

    def test_incomplete_phase_cannot_pass(self):
        self.events=[e for e in self.events if not(e.get('phase')=='node_phase_completed' and e['receipt']['phase']=='finish')];self.assertIn('phase_order_or_incomplete',self.verify()['failures'])

    def test_foreign_node_binding_cannot_pass(self):
        for e in self.events:
            s=e.get('outcome',{}).get('output',{})
            if s.get('prepared_node_context'):s['prepared_node_context']['node_id']='other'
        self.assertIn('target_graph_identity',self.verify()['failures'])

    def test_done_summary_cannot_replace_actual_done(self):
        self.events=[e for e in self.events if e.get('action',{}).get('verb')!='finish_wizard'];self.assertFalse(self.verify()['passed'])

    def test_verified_seed_label_can_bind_an_unlabelled_existing_request(self):
        self.request['target'].pop('label')
        self.assertFalse(self.verify()['passed'])
        result = _verify_text_import(self.events, self.request, self.body, 'done', target_label_override='Import')
        self.assertTrue(result['passed'], result['failures'])
        wrong = _verify_text_import(self.events, self.request, self.body, 'done', target_label_override='Another node')
        self.assertIn('target_graph_identity', wrong['failures'])

    def test_download_of_another_file_cannot_pass(self):
        next(e for e in self.events if e['operation_id']=='verify' and e['phase']=='verification_completed')['outcome']['output']['artifact_id']='foreign'
        self.assertIn('download_verification_identity',self.verify()['failures'])


if __name__=='__main__': unittest.main()
