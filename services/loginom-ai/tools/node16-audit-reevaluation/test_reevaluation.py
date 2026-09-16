import copy,json,unittest
from pathlib import Path
import reevaluate as r
RUN=Path('.dock/node16/hermes-runs')/r.RUN_ID
class EvidenceCounterexamples(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  request=json.loads((RUN/'request.json').read_text())
  if r.sha(r.WORK/'collapse_node_acceptance.py')!=request['harness_inputs']['collapse_node_acceptance.py']:
   raise unittest.SkipTest('Historical verifier requires original execution checkout; use test_future_auditor.py for current harness')
  cls.verifier=r.build(RUN);cls.original=json.loads((RUN/'counterexample-input.json').read_text())
 def test_actual_sample_projection_and_restart(self):
  e=copy.deepcopy(self.original);v=self.verifier;v.node(e,v.pairs(e),r.RUN_ID+':import-mixed');self.assertEqual(v.bind_restart(e,v.pairs(e)),r.RUN_ID+':reconfigured-final')
 def test_nine_semantic_projection_mutations(self):
  v=self.verifier
  changes={
   'value':lambda p:p['sample'][0][0].update(value='2'),
   'type':lambda p:p['sample'][0][0].update(type='real'),
   'boolean_for_real':lambda p:p['sample'][1][2].update(value=True),
   'unequal_display_text':lambda p:p['sample'][0][0].update(display_text='wrong'),
   'missing_value':lambda p:p['sample'][0][0].pop('value'),
   'extra_semantic_field':lambda p:p['sample'][0][0].update(unit='foreign'),
   'missing_schema_type':lambda p:p['schema'][0].pop('type'),
   'extra_schema_field':lambda p:p['schema'][0].update(source_name='foreign'),
   'column_order':lambda p:p['schema'].reverse(),
  }
  for name,change in changes.items():
   with self.subTest(name=name):
    e=copy.deepcopy(self.original)
    for reply in e['tools']:
     body=reply['result']
     if isinstance(body,dict) and body.get('operation_id')==r.RUN_ID+':import-mixed' and body.get('state')=='settled':
      change(body['output']['ports'][0]);reply['raw_content']=json.dumps(body,ensure_ascii=False)
    ps=v.pairs(e) # Raw/content consistency remains valid in each counterexample.
    with self.assertRaises(ValueError):v.node(e,ps,r.RUN_ID+':import-mixed')
 def test_six_recovery_binding_mutations(self):
  v=self.verifier
  for name in ('id','target','parameters','prior_effect','prior_step','resume_execution'):
   with self.subTest(name=name):
    e=copy.deepcopy(self.original)
    call=next(c for c in e['calls'] if c['tool'].endswith('dock_node_apply') and c['arguments'].get('operation_id')==r.RUN_ID+':reconfigured-final')
    if name=='id':call['arguments']['operation_id']+='-foreign'
    elif name=='target':call['arguments']['target']['ref']['node_id']='foreign'
    elif name=='parameters':call['arguments']['parameters']['ignore_empty']=True
    elif name=='prior_effect':v.event(e,r.RUN_ID+':reconfigured','completed')['outcome']['effect_possible']=True
    elif name=='prior_step':e['events'].append({'operation_id':r.RUN_ID+':reconfigured','phase':'node_step_prepared'})
    else:
     for reply in e['tools']:
      body=reply['result']
      if isinstance(body,dict) and body.get('operation_id')==r.RUN_ID+':reconfigured' and (body.get('error') or {}).get('code')=='NODE_WORKER_REJECTED':
       body['status']='SUCCEEDED';reply['raw_content']=json.dumps(body,ensure_ascii=False)
    ps=v.pairs(e)
    with self.assertRaises(ValueError):v.bind_restart(e,ps)
if __name__=='__main__':unittest.main()
