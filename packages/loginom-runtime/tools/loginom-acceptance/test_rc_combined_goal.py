import json
import unittest
from copy import deepcopy
from types import SimpleNamespace
import rc_combined_goal as rc
from rc_combined_acceptance import saved_graph_matches, reopened_graph_proof, expected_edges, package_cleanup_proof

class RcGoalTests(unittest.TestCase):
    def test_cleanup_requires_matching_saved_package_and_complete_logout(self):
        prepared={'sessionId':'owner','workspace':{'document_id':'doc'}}
        r={'session_id':'owner','profile_owned':True,'receipt':{'version':1,'status':'SUCCEEDED','session_id':'owner','document_id':'doc',
            'account':'test-2','package_path':'/test-2/result.lgp','save_operation_id':'save','package_closed':True,'logged_out':True,
            'unsaved_changes_discarded':False,'packages_before':1,'packages_after':0}}
        self.assertTrue(package_cleanup_proof([r],prepared,'/test-2/result.lgp','save')['passed'])
        for key,value in [('session_id','foreign'),('package_path','/other/result.lgp'),('logged_out',False),('unsaved_changes_discarded',True),('status','MISSING')]:
            changed=deepcopy(r);changed['receipt'][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):package_cleanup_proof([changed],prepared,'/test-2/result.lgp','save')
        with self.assertRaises(ValueError):package_cleanup_proof([],prepared,'/test-2/result.lgp','save')

    def test_unique_artifact_destinations_and_complete_prompt(self):
        run='20260914-120000-abcd1234'
        for goal,names in rc.GOALS.items():
            with self.subTest(goal=goal):
                artifacts=rc.descriptors(goal,run,'/test-2')
                self.assertEqual(len(artifacts),len(names))
                self.assertEqual(len({x['name'] for x in artifacts}),len(names))
                for name,a in zip(names,artifacts):
                    self.assertEqual(a['bytes'],len((rc.FIXTURES/name).read_bytes()))
                    self.assertEqual(a['upload'],{'directory':'/test-2','overwrite':'reject'})
                template=(rc.WORK/'goals'/f'{goal}.txt').read_text()
                prompt=rc.prompt(goal,template,'/test-2/packages/rc.lgp','/test-2',run)
                self.assertNotIn('__',prompt)
                for artifact in artifacts:self.assertIn(artifact['name'],prompt)

    def test_scope_is_explicit_and_cannot_change_account_or_model(self):
        args=SimpleNamespace(loginom_user='test-2',storage_directory='/test-2',loginom_url='http://logi-test-plan.bg.local/app/?testable=true',model_profile='chatgpt-sol',manifest_uri=rc.MANIFEST_URI,manifest_sha256=rc.MANIFEST_SHA)
        rc.validate(args)
        for key,value in [('loginom_user','test-4'),('storage_directory','/other'),('model_profile','chatgpt-luna'),('manifest_sha256','0'*64)]:
            with self.subTest(key=key),self.assertRaises(ValueError):rc.validate(SimpleNamespace(**{**vars(args),key:value}))

    def test_oracles_cover_fourteen_types_with_small_complete_tables(self):
        expected=json.loads((rc.FIXTURES/'expected.json').read_text())
        self.assertEqual([len(expected[k]) for k in ('cleaning','calendar','export')],[7,6,3])
        self.assertEqual(expected['cleaning']['Filled']['rows'][2],[3,'B',20])
        self.assertEqual(expected['cleaning']['Combined']['rows'],expected['cleaning']['Enriched']['rows']*2)
        self.assertEqual(sum(r[1] for r in expected['calendar']['Monthly']['rows']),420)
        self.assertEqual(len(expected['export']['Long']['rows']),6)
        self.assertEqual(len({t for spec in rc.SPECS.values() for t,_ in spec.values()}),14)
        for scenario in expected.values():
            for result in scenario.values():
                for port in result.get('ports',[result]):
                    self.assertLessEqual(len(port['rows']),10)
                    self.assertTrue(all(len(r)==len(port['columns']) for r in port['rows']))

    def test_reopen_rejects_wrong_guid_type_and_input_port(self):
        spec=rc.SPECS['cleaning']
        plan={'case':'cleaning','nodes':{n:dict(type=t,node=dict(node_id=n+'-guid')) for n,(t,_) in spec.items()}}
        graph={'complete':True,'foreign_links':[],
               'nodes':[dict(ref=dict(node_id=n+'-guid'),label=n,type=t) for n,(t,_) in spec.items()],
               'links':[dict(source=s+'-guid',output=o,target=t+'-guid',input=i) for s,o,t,i in expected_edges(spec)]}
        self.assertTrue(reopened_graph_proof(graph,plan)['passed'])
        for kind in ['guid','type','port','missing_link']:
            changed=deepcopy(graph)
            if kind=='guid':changed['nodes'][0]['ref']['node_id']='foreign'
            elif kind=='type':changed['nodes'][0]['type']='transform.sorting'
            elif kind=='port':changed['links'][-1]['input']=14
            else:changed['links'].pop()
            with self.subTest(kind=kind),self.assertRaises(ValueError):reopened_graph_proof(changed,plan)

    def test_saved_graph_keeps_two_union_input_edges(self):
        spec=rc.SPECS['cleaning']
        graph={'nodes':list(spec),'links':[f'{s}|Output_Data[{o}]|{t}|Input_Data[{i}]' for s,o,t,i in expected_edges(spec)]}
        saved_graph_matches(graph,spec)
        graph['links']=[x for x in graph['links'] if not x.endswith('Combined|Input_Data[1]')]
        with self.assertRaises(ValueError):saved_graph_matches(graph,spec)

if __name__=='__main__':unittest.main()
