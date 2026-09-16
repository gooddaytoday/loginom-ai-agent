import hashlib,unittest
from copy import deepcopy
from pathlib import Path
from union_upload_probe import FIXTURES,descriptors,prompt
from union_node_acceptance import table_declaration,report
from node_apply_reopen_binding import union_unchanged_parameters
class UnionAcceptanceTest(unittest.TestCase):
    def test_frozen_three_distinct_artifacts(self):
        ds=descriptors('20260912-010000-1234abcd','/test-1')
        self.assertEqual(len({d['name'] for d in ds}),3)
        for name,(sha,size) in FIXTURES.items():
            raw=(Path(__file__).parent/'fixtures/union'/name).read_bytes()
            self.assertEqual((hashlib.sha256(raw).hexdigest(),len(raw)),(sha,size))
        rendered=prompt('__MAIN_CSV__ __SECOND_CSV__ __THIRD_CSV__ __PACKAGE_PATH__','/test-1/p.lgp','/test-1','20260912-010000-1234abcd')
        self.assertNotIn('__',rendered)
        for d in ds:self.assertIn(d['name'],rendered)
    def test_reopen_mapping_order_is_semantic_but_parameters_are_complete(self):
        p=dict(prefixes=dict(enabled=False,name='Union',label='Объединение'),tables=[dict(port=1,fields=[dict(source='Key',main='Code'),dict(source='Value',main='Amount'),dict(source='Memo',main='Note')])])
        r=dict(mode='append_all',parameters=p)
        self.assertTrue(table_declaration(r,2))
        q=deepcopy(p);q['tables'][0]['fields'].reverse();self.assertTrue(union_unchanged_parameters(p,q))
        for mutate in (lambda q:q['tables'][0]['fields'].pop(),lambda q:q['tables'][0]['fields'][0].update(main='Other'),lambda q:q['prefixes'].update(enabled=True),lambda q:q['tables'][0].update(port=2)):
            q=deepcopy(p);mutate(q);self.assertFalse(union_unchanged_parameters(p,q));self.assertFalse(table_declaration(dict(r,parameters=q),2))
        self.assertFalse(union_unchanged_parameters(p,{}))
        self.assertFalse(table_declaration(dict(r,mode='distinct'),2))
    def test_empty_or_failed_audit_cannot_pass(self):
        self.assertFalse(report({})['passed']);self.assertFalse(report({'missing':{'passed':False}})['passed'])
        self.assertFalse(report({'ok':{'passed':True}})['subplan_complete'])
if __name__=='__main__':unittest.main()

class ReplayTargetTest(unittest.TestCase):
    def test_replay_address_cannot_persist_url_credentials(self):
        from run import validate_loginom_url
        self.assertEqual(validate_loginom_url('http://target.example/app?testable=true'),'http://target.example/app?testable=true')
        for url in ['file:///tmp/app','http://user:secret@target.example/app','https://target.example/app?%74oken=secret','https://target.example/app#secret','']:
            with self.assertRaises(ValueError):validate_loginom_url(url)

class ExistingUnionGraphTest(unittest.TestCase):
    def test_restatement_requires_unchanged_graph_and_no_effects(self):
        from union_graph_evidence import verify_unchanged_inputs
        link=dict(source='source',output=0,target='union',input=0)
        graph=dict(complete=True,nodes=[dict(ref=dict(node_id='union'),inputs=[0,1])],links=[link],foreign_links=[])
        state=dict(completed=True,pending=None,targetId='union',baseline=graph,final_graph=deepcopy(graph),receipts=[])
        request=dict(operation_id='op',target=dict(ref=dict(node_id='union')),inputs=[dict(source=dict(node_id='source'),output=0,input=0)])
        events=[dict(operation_id='op',phase='node_target_checkpoint',target_state=state)]
        self.assertTrue(verify_unchanged_inputs(events,request)['passed'])
        self.assertTrue(verify_unchanged_inputs(events,dict(request,inputs=[]))['passed'])
        for mutate in (lambda e:e[0]['target_state']['final_graph']['links'].clear(),
                       lambda e:e[0]['target_state']['receipts'].append({'unexpected':True}),
                       lambda e:e.append(dict(operation_id='op',phase='node_target_effect_prepared')),
                       lambda e:e[0]['target_state']['final_graph'].update(complete=False)):
            changed=deepcopy(events);mutate(changed);self.assertFalse(verify_unchanged_inputs(changed,request)['passed'])
        wrong=deepcopy(request);wrong['inputs'][0]['source']['node_id']='foreign'
        self.assertFalse(verify_unchanged_inputs(events,wrong)['passed'])
