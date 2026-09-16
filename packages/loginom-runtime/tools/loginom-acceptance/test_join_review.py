import hashlib,unittest
from pathlib import Path
from join_oracle import expected
from join_review_upload_probe import FIXTURES,descriptors
class JoinReviewFixtures(unittest.TestCase):
    def test_frozen_wide_sources_and_independent_expected_outputs(self):
        root=Path(__file__).parent/'fixtures/join-review'
        raw=[]
        for name,(sha,size) in FIXTURES.items():
            b=(root/name).read_bytes();raw.append(b)
            self.assertEqual((hashlib.sha256(b).hexdigest(),len(b)),(sha,size))
        columns,rows=expected(*raw,[('L40','R40')],'inner',True,True)
        self.assertEqual((len(columns),len(rows)),(80,1))
        self.assertEqual((rows[0][39],rows[0][79]),('match','match'))
        columns,rows=expected(*raw,[('L39','R39')],'left',True,False)
        self.assertEqual((len(columns),len(rows)),(79,1))
        self.assertNotIn('R39',[c['name'] for c in columns])
        self.assertEqual(rows[0][40:],[None]*39)
        self.assertEqual(rows[0][:40],['L'+str(i) for i in range(39)]+['match'])
    def test_separate_artifact_identity(self):
        ds=descriptors('20260912-010000-1234abcd','/test-1')
        self.assertEqual(len(ds),2)
        self.assertTrue(all(d['name'].startswith('Dock-join-review-') for d in ds))
        self.assertNotEqual(ds[0]['sha256'],ds[1]['sha256'])
    def test_only_exact_autosync_key_promotion_is_a_persisted_equivalent(self):
        from copy import deepcopy
        from join_node_acceptance import persisted_settings_equal
        mappings=[dict(port=i,autosync=True,fields=[dict(index=j,name=n,source_name=n,label=n,type='string') for j,n in enumerate(names)]) for i,names in enumerate([['L1','L2','L3'],['R1','R2','R3']])]
        a={'configuration':{'readback':dict(node={},receipt_ids=[],keys=[dict(left='L3',right='R3')],input_mappings=mappings,output_mapping={'autosync':False,'fields':[{'name':'Alias','excluded':True}]})}}
        b=deepcopy(a)
        for m in b['configuration']['readback']['input_mappings']:m['fields']=[dict(f,index=i) for i,f in enumerate([m['fields'][2],*m['fields'][:2]])]
        self.assertFalse(persisted_settings_equal(a,b))
        self.assertTrue(persisted_settings_equal(a,b,allow_key_promotion=True))
        for fault in ['different_order','alias','source','autosync','output','keys']:
            changed=deepcopy(b);rb=changed['configuration']['readback'];m=rb['input_mappings'][0]
            if fault=='different_order':m['fields'][1],m['fields'][2]=dict(m['fields'][2],index=1),dict(m['fields'][1],index=2)
            if fault=='alias':m['fields'][0]['label']='Other'
            if fault=='source':m['fields'][0]['source_name']='Other'
            if fault=='autosync':m['autosync']=False
            if fault=='output':rb['output_mapping']['fields'][0]['excluded']=False
            if fault=='keys':rb['keys'][0]['left']='L2'
            with self.subTest(fault=fault):self.assertFalse(persisted_settings_equal(a,changed,allow_key_promotion=True))
        a['configuration']['readback']['input_mappings'][0]['autosync']=False;b['configuration']['readback']['input_mappings'][0]['autosync']=False
        self.assertFalse(persisted_settings_equal(a,b,allow_key_promotion=True))

if __name__=='__main__':unittest.main()
