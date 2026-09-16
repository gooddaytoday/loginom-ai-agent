import copy,json,unittest
from pathlib import Path
from text_export_reopen_owner import verify_reopened_owner

class ReopenedOwnerTests(unittest.TestCase):
    def fixture(self):return json.loads((Path(__file__).parent/'fixtures/text-export/reopen-owner.json').read_text())
    def verify(self,f):return verify_reopened_owner(f['events'],f['preparation_index'],f['operation'],f['node'])
    def test_original_native_receipt_chain_preserves_flag(self):
        f=self.fixture();old=copy.deepcopy(f);self.assertTrue(self.verify(f)['verified']);self.assertEqual(f,old)
        self.assertFalse(f['events'][4]['state']['ownership_verified'])
    def test_rejects_unknown_changed_or_incomplete_ownership_chain(self):
        def trace(es,name):return next(t for t in es[3]['outcome']['trace'] if t['event']==name)
        changes=[
            ('unowned-draft',lambda e:e[0]['state'].update(ownership_verified=False)),
            ('foreign-draft',lambda e:e[0].update(session_id='foreign')),
            ('unknown-draft',lambda e:e[0].update(event='ignored')),
            ('wrong-saved-path',lambda e:e[2]['checkpoint'].update(path='/test-2/foreign.lgp')),
            ('wrong-opened-path',lambda e:trace(e,'reopened_package_observed').update(actual_path='/test-2/foreign.lgp')),
            ('wrong-GUID',lambda e:e[5]['target_state']['final_graph']['nodes'][0]['ref'].update(node_id='foreign')),
            ('wrong-graph',lambda e:e[5]['target_state']['final_graph']['links'].pop()),
            ('trace-graph',lambda e:trace(e,'reopened_package_observed')['graph']['nodes'].pop()),
            ('missing-save',lambda e:e[3].update(action_key='other')),
            ('missing-close',lambda e:trace(e,'saved_package_closed').update(event='ignored')),
            ('reordered-close',lambda e:trace(e,'saved_package_closed').update(at_ms=99999)),
            ('repeated-close',lambda e:e[3]['outcome']['trace'].append(copy.deepcopy(trace(e,'saved_package_closed')))),
            ('foreign-save',lambda e:e[3].update(runtime_revision='foreign')),
            ('foreign-catalog',lambda e:e[3].update(manifest_sha256='0'*64)),
            ('new-draft-substitute',lambda e:e[4]['state'].update(created_draft=True)),
            ('read-only',lambda e:e[4]['state']['workflow_ref']['navigation_path'].append({'label':'original (только чтение)'})),
            ('unverified-graph',lambda e:e[5]['target_state']['final_graph'].update(complete=False)),
            ('foreign-tab',lambda e:e[5]['target_state']['final_graph']['workflow_ref'].update(tab_tid='foreign')),
        ]
        for label,mutate in changes:
            f=self.fixture();mutate(f['events'])
            with self.subTest(case=label),self.assertRaises((AssertionError,KeyError)):self.verify(f)
        for label,index in [('duplicate-save',3),('duplicate-draft',0),('reordered-receipts',None)]:
            f=self.fixture()
            if index is None:f['events'][2],f['events'][3]=f['events'][3],f['events'][2]
            else:f['events'].insert(4,copy.deepcopy(f['events'][index]));f['preparation_index']=5
            with self.subTest(case=label),self.assertRaises((AssertionError,KeyError)):self.verify(f)

if __name__=='__main__':unittest.main()
