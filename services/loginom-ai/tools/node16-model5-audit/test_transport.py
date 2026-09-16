import copy,json,sys,unittest
from pathlib import Path
from unittest.mock import patch
import reevaluate
RUN=Path('.dock/node16/hermes-runs')/reevaluate.RUN_ID
class TransportTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.v=reevaluate.build(RUN);cls.e=json.loads((RUN/'evidence.json').read_text())
 def test_original_cases(self):
  ps=self.v.pairs(self.e)
  for key in self.v.EXPECTED:self.v.native_case(self.e,ps,reevaluate.RUN_ID+':'+key,key)
 def test_unknown_or_foreign_transport_refused(self):
  special=[x for x in self.e['tools'] if isinstance(x['result'],str)]
  mutations=[('unknown',lambda s:'unknown'),('foreign note',lambda s:s.replace('call_QJeD8JEMh0vLH5LwHuEgJWGe','call_foreign')),('changed arguments',lambda s:s.replace('60000','60001')),('foreign spill',lambda s:s.replace('/cache/spillover/','/cache/foreign/')),('changed size',lambda s:s.replace('66,209','66,208'))]
  for label,mutate in mutations:
   source=special[2] if 'spill' in label or 'size' in label else special[0]
   with self.subTest(label=label):
    e={'calls':self.e['calls'],'events':self.e['events'],'tools':[copy.deepcopy(x) if x is source else x for x in self.e['tools']]}
    t=next(x for x in e['tools'] if x['tool_call_id']==source['tool_call_id']);t['raw_content']=mutate(t['raw_content']);t['result']=self.v.unwrap(t['raw_content'])
    with self.assertRaises((ValueError,KeyError,OSError)):self.v.pairs(e)
 def test_spill_changed_outside_preview_refused_by_native(self):
  spill=RUN/'private/hermes-home/cache/spillover/call_ds4RRqm9WyhkDdxTCDHkwWaG.txt';original=Path.read_text
  raw=spill.read_text();assert '24' in raw[2000:]
  changed=raw[:2000]+raw[2000:].replace('24','23',1)
  def read(p,*a,**k):return changed if p.resolve()==spill.resolve() else original(p,*a,**k)
  with patch.object(Path,'read_text',read):
   ps=self.v.pairs(self.e)
   with self.assertRaises((ValueError,AssertionError)):self.v.native_case(self.e,ps,reevaluate.RUN_ID+':wide','wide')
 def test_loss_raw_refusal_counterexamples(self):
  import verify_loss
  directory=Path('.dock/node16/live-1789375922149')
  self.assertEqual(verify_loss.check(directory)['status'],'POST_GESTURE_LOSS_PASS')
  original=Path.read_text
  mutations={
   'replay performed work':('gates-loss-replay.json',lambda x:x.update(after=x['after']+1)),
   'replay changed result':('gates-loss-replay.json',lambda x:x.update(same_result=False)),
   'native flag unchanged':('gates-loss-native.json',lambda x:x.update(skip=True)),
   'loss not ambiguous':('gates-loss.json',lambda x:x['outcome'].update(status='SUCCEEDED')),
  }
  for label,(file,mutate) in mutations.items():
   with self.subTest(label=label):
    data=json.loads((directory/file).read_text());mutate(data)
    def read(p,*a,**k):return json.dumps(data) if p.resolve()==(directory/file).resolve() else original(p,*a,**k)
    with patch.object(Path,'read_text',read):
     with self.assertRaises(ValueError):verify_loss.check(directory)
  raw=(directory/'public-api.jsonl').read_text()
  altered=raw.replace('NODE_WORKER_REJECTED','NODE_WORKER_ALLOWED')
  def read(p,*a,**k):return altered if p.resolve()==(directory/'public-api.jsonl').resolve() else original(p,*a,**k)
  with patch.object(Path,'read_text',read):
   with self.assertRaises(ValueError):verify_loss.check(directory)
if __name__=='__main__':unittest.main()
