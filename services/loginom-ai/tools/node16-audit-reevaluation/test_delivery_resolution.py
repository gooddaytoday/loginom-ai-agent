"""Real preserved model evidence: resolved uploads never excuse a node failure."""
import copy,hashlib,json,sys,unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,str(Path.cwd()/'tools/loginom-acceptance'))
import collapse_node_acceptance as v
RUN=Path('.dock/node16/hermes-runs/20260913-234616-4ac1a433/evidence.json')

class DeliveryResolution(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not RUN.exists():raise unittest.SkipTest('Preserved fourth model evidence required')
        assert hashlib.sha256(RUN.read_bytes()).hexdigest()=='202eb0f8039d712395aa4b2d7c357b4bb67eb115423f7cf0d82155f33ca3f802'
        cls.e=json.loads(RUN.read_text());cls.ps=v.pairs(cls.e)
        cls.op='20260913-234616-4ac1a433:deliver-mixed:upload'
    def check(self,e,ps):
        return v.verified_delivery_child(SimpleNamespace(**vars(v)),e,ps,v.event(e,self.op,'completed'))
    def test_five_uploads_resolved_genuine_node_failure_rejected(self):
        outcomes=[]
        for ev in self.e['events']:
            if ev.get('phase')=='completed' and ev.get('outcome',{}).get('status')=='AMBIGUOUS':
                if ev['action_key']=='artifact.upload':
                    self.assertTrue(v.verified_delivery_child(SimpleNamespace(**vars(v)),self.e,self.ps,ev));outcomes.append(ev)
                else:
                    with self.assertRaises(ValueError):v.verified_delivery_child(SimpleNamespace(**vars(v)),self.e,self.ps,ev)
        self.assertEqual(len(outcomes),5)
    def test_incomplete_or_foreign_proofs_rejected(self):
        def ev(e,phase):return v.event(e,self.op,phase)
        def transfer(e):return ev(e,'transfer_completed')['outcome']
        def checked(e):return v.event(e,self.op.removesuffix(':upload')+':verify','download_verified')['outcome']
        def public(ps):return next((c,r) for c,r in ps if c['tool'].endswith('dock_artifact_deliver') and c['arguments']['operation_id']==self.op.removesuffix(':upload'))
        mutations={
          'missing transfer':lambda e,p:e['events'].remove(ev(e,'transfer_completed')),
          'wrong phase order':lambda e,p:e['events'].insert(0,e['events'].pop(e['events'].index(ev(e,'transfer_completed')))),
          'transfer cleanup':lambda e,p:transfer(e).update(cleanup_complete=False),
          'transfer verification pending':lambda e,p:transfer(e)['output'].update(verification_required=True),
          'foreign hash':lambda e,p:transfer(e)['output'].update(sha256='0'*64),
          'foreign destination':lambda e,p:transfer(e)['output'].update(destination='/other/file.csv'),
          'foreign verification':lambda e,p:transfer(e)['output']['server_copy_verification'].update(verification_id='foreign'),
          'missing native bytes':lambda e,p:checked(e)['output'].update(bytes_verified=False),
          'native cleanup':lambda e,p:checked(e).update(cleanup_complete=False),
          'foreign native artifact':lambda e,p:checked(e)['output'].update(artifact_id='foreign'),
          'foreign native grant':lambda e,p:checked(e)['output'].update(upload_grant_id='foreign'),
          'public unresolved':lambda e,p:public(p)[1]['result'].update(state='running'),
          'public error':lambda e,p:public(p)[1]['result'].update(error={'code':'FAIL'}),
          'public output':lambda e,p:public(p)[1]['result']['output'].update(bytes=999),
          'public session':lambda e,p:public(p)[0].update(session_id='foreign'),
          'public grant':lambda e,p:public(p)[0]['arguments'].update(upload_grant_id='foreign'),
          'foreign runtime':lambda e,p:ev(e,'transfer_completed').update(runtime_revision='foreign'),
          'foreign manifest':lambda e,p:ev(e,'transfer_completed').update(manifest_sha256='foreign'),
          'foreign session':lambda e,p:ev(e,'transfer_completed').update(session_id='foreign'),
          'changed upload':lambda e,p:ev(e,'transfer_completed')['parameters'].update(destination='/foreign'),
        }
        ids={self.op,self.op.removesuffix(':upload'),self.op.removesuffix(':upload')+':verify'}
        phases={'prepared','completed','artifact_delivery_prepared','artifact_delivery_completed','download_completed','download_verified','transfer_completed'}
        focused={'events':[x for x in self.e['events'] if x.get('operation_id') in ids and x.get('phase') in phases]}
        public_pairs=[(c,r) for c,r in self.ps if c['tool'].endswith('dock_prepare') or c['arguments'].get('operation_id')==self.op.removesuffix(':upload')]
        for label,mutate in mutations.items():
            with self.subTest(label=label):
                e,p=copy.deepcopy((focused,public_pairs));mutate(e,p)
                with self.assertRaises((ValueError,KeyError,TypeError)):self.check(e,p)

if __name__=='__main__':unittest.main()
