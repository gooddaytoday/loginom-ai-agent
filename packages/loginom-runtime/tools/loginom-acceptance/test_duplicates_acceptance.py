import copy
import hashlib
import unittest
from pathlib import Path
from duplicates_upload_probe import FIXTURES,descriptors,prompt,validate_catalog
from duplicates_node_acceptance import report
from duplicates_graph_evidence import verify_duplicates_graph
from duplicates_close_evidence import verify_duplicates_close
from node_apply_reopen_binding import verify_reopen_binding


class DuplicatesAcceptanceTest(unittest.TestCase):
    def test_three_frozen_distinct_files_and_explicit_destinations(self):
        ds=descriptors('20260913-010000-1234abcd','/test-1')
        self.assertEqual(len({d['name'] for d in ds}),3)
        for name,(sha,size) in FIXTURES.items():
            raw=(Path(__file__).parent/'fixtures/duplicates'/name).read_bytes()
            self.assertEqual((hashlib.sha256(raw).hexdigest(),len(raw)),(sha,size))
        text=prompt('__MAIN_CSV__ __NULL_CSV__ __EMPTY_CSV__ __PACKAGE_PATH__','/test-1/p.lgp','/test-1','20260913-010000-1234abcd')
        for d in ds:self.assertIn(d['name'],text)
        self.assertNotIn('__',text)
        with self.assertRaises(ValueError):validate_catalog(None,None,'/test-1')
        with self.assertRaises(ValueError):descriptors('../other','/test-1')

    def test_no_completion_from_missing_evidence(self):
        self.assertFalse(report({})['passed'])
        self.assertFalse(report({'missing':dict(passed=False)})['passed'])
        self.assertFalse(report({'ok':dict(passed=True)})['subplan_complete'])
        self.assertFalse(verify_duplicates_close([],{}, {}, {})['passed'])

    def test_reopen_rejects_changed_complete_roles(self):
        from test_node_apply_reopen_binding import ReopenBindingTests
        f=ReopenBindingTests();f.setUp()
        f.seed['parameters']=dict(input_fields=['Key'],output_fields=['Value'])
        f.request['parameters']=copy.deepcopy(f.seed['parameters'])
        def run():
            f.evidence['events'][2]['request']=copy.deepcopy(f.request)
            f.evidence['calls'][1]['arguments']=copy.deepcopy(f.request)
            return verify_reopen_binding(f.evidence,f.seed,f.request,'save',f.path,duplicates=True)
        self.assertTrue(run()['passed'])
        f.request['parameters']['output_fields']=[]
        self.assertIn('reopen_unchanged_request',run()['failures'])

    def test_new_node_requires_exact_source_and_preserves_other_nodes(self):
        source=dict(ref=dict(node_id='source'),type='imports.text',label='Source',inputs=[],outputs=[0])
        target=dict(ref=dict(node_id='target'),type='research.duplicates',label='Mark',inputs=[0],outputs=[0])
        before=dict(complete=True,nodes=[source],links=[],foreign_links=[])
        edge=dict(source='source',output=0,target='target',input=0)
        after=dict(complete=True,nodes=[source,target],links=[edge],foreign_links=[])
        state=dict(completed=True,pending=None,targetId='target',baseline=before,final_graph=after,receipts=[dict(verified=True,receipt=dict(status='SUCCEEDED',cleanup_complete=True))])
        events=[dict(operation_id='op',phase='node_target_checkpoint',target_state=state)]
        request=dict(operation_id='op',target=dict(kind='new',label='Mark'),inputs=[dict(source=dict(node_id='source'),output=0,input=0)])
        self.assertTrue(verify_duplicates_graph(events,request)['passed'])
        for mutate in (lambda s:s['final_graph']['links'].clear(),lambda s:s['final_graph']['links'][0].update(source='foreign'),lambda s:s['final_graph']['nodes'].append(dict(target,ref=dict(node_id='extra'))),lambda s:s['receipts'][0]['receipt'].update(cleanup_complete=False)):
            changed=copy.deepcopy(events);mutate(changed[0]['target_state']);self.assertFalse(verify_duplicates_graph(changed,request)['passed'])


if __name__=='__main__':unittest.main()
