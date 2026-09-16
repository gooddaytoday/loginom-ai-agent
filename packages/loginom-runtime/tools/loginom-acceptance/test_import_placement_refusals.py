"""Full unfiltered live fixture plus independently damaged proof obligations."""
import copy,gzip,json,unittest,hashlib
from unittest.mock import patch
from fixtures.missing_values_refusal_legacy import project_node as legacy_project
from pathlib import Path
from missing_values_refusals import audit_accounting,classify
from user_result_evidence import normalize_user_evidence
from node_public_acceptance_evidence import verify_public_nodes_and_saves
from evidence import PREFIX

FIXTURE=Path(__file__).parent/'fixtures/import-placement-refusal-live.json.gz'
ORIGINAL=json.loads(gzip.decompress(FIXTURE.read_bytes()))
RUNTIME=ORIGINAL['events'][0]['runtime_revision'];MANIFEST=ORIGINAL['events'][0]['manifest_sha256']
OP='refusal-placement';NEXT='refusal-corrected';UPLOAD='refusal-upload:upload';VERIFY='refusal-upload:verify'
def row(e,phase,op=OP):return next(x for x in e['events'] if x.get('phase')==phase and x.get('operation_id')==op)
def check(e):return audit_accounting(e,runtime_revision=RUNTIME,manifest_sha256=MANIFEST,save_ids=['refusal-save'])
def edit(phase,path,value,op=OP):
 def mutate(e):
  d=row(e,phase,op)
  for k in path[:-1]:d=d[k]
  d[path[-1]]=value
 return mutate

class ImportPlacementTests(unittest.TestCase):
 # The immutable live fixture used the scalar projection before node16.
 # Keep the current projection strict and pin its historical reader only here.
 def setUp(self):
  self.assertEqual(hashlib.sha256(FIXTURE.read_bytes()).hexdigest(),'906978351031c45d2cc5b2489c16e65b4fe0fb9596550ad48391f19eac03f19b')
  replacement=patch('user_result_evidence.project_node',legacy_project)
  replacement.start();self.addCleanup(replacement.stop)
 def test_whole_live_fixture_and_effect_boundary(self):
  before=json.dumps(ORIGINAL);a=check(ORIGINAL);self.assertTrue(a['passed'],a)
  self.assertEqual((a['total_prepared'],a['successful_count'],a['refusal_count']),(3,2,1))
  f=a['refusals'][OP];self.assertEqual(f['successor'],NEXT)
  self.assertEqual(f['outcome']['status'],'NOT_APPLIED');self.assertTrue(f['upload_effect_possible']);self.assertFalse(f['refused_node_effect_possible'])
  self.assertFalse(a['full_goal_accepted']);self.assertEqual(before,json.dumps(ORIGINAL))
 def test_general_defaults_remain_strict(self):
  self.assertFalse(normalize_user_evidence(ORIGINAL)[1]['passed'])
  a=classify(ORIGINAL,runtime_revision=RUNTIME,manifest_sha256=MANIFEST);self.assertTrue(a['passed'],a)
  norm,p=normalize_user_evidence(ORIGINAL,terminal_outcomes={OP:a['refusals'][OP]['outcome']});self.assertTrue(p['passed'])
  req={e['operation_id']:e['request'] for e in ORIGINAL['events'] if e.get('phase')=='node_apply_prepared'}
  self.assertFalse(verify_public_nodes_and_saves(norm,req,['refusal-save'])['passed'])
 def test_negative_obligations(self):
  mutations={
   'foreign owner':edit('node_target_refusal_observed',['session_id'],'foreign'),
   'foreign runtime':edit('node_target_refusal_observed',['runtime_revision'],'foreign'),
   'foreign manifest':edit('node_target_refusal_observed',['manifest_sha256'],'foreign'),
   'foreign document':edit('node_apply_prepared',['request','document_id'],'foreign'),
   'signature':edit('node_apply_prepared',['signature'],'0'*64),
   'foreign artifact':edit('prepared',['checkpoint','artifact','artifact_id'],'foreign',UPLOAD),
   'grant':edit('prepared',['parameters','upload_grant_id'],'foreign',UPLOAD),
   'overwrite grant':edit('prepared',['checkpoint','artifact','upload','overwrite'],'replace',UPLOAD),
   'CSV digest':edit('download_verified',['outcome','output','sha256'],'0'*64,VERIFY),
   'CSV size':edit('download_verified',['outcome','output','bytes'],1,VERIFY),
   'download owner':edit('download_prepared',['checkpoint','discovery','document'],'foreign',VERIFY),
   'download file':edit('download_completed',['outcome','output','file_ref'],'foreign',VERIFY),
   'source path':edit('node_apply_prepared',['request','parameters','settings','source','source_path'],'/foreign.csv'),
   'source schema':edit('node_apply_prepared',['request','parameters','settings','columns',0,'type'],'string'),
   'source node input':edit('node_apply_prepared',['request','inputs'],[{'input':0,'output':0,'source':{}}]),
   'pending':edit('completed',['outcome','output','pending_phase'],'target'),
   'partial effect':edit('completed',['outcome','effect_possible'],True),
   'nested partial effect':edit('completed',['outcome','output','effect_possible'],True),
   'unknown cleanup':edit('completed',['outcome','cleanup_complete'],False),
   'created node':edit('completed',['outcome','output','node'],{'node_id':'foreign'}),
   'execution':edit('completed',['outcome','output','execution','status'],'SUCCEEDED'),
   'saved':edit('completed',['outcome','output','package_saved'],True),
   'failed instead of refused':edit('completed',['outcome','status'],'FAILED'),
   'changed graph':edit('node_target_refusal_observed',['refusal','after_graph','nodes',0,'label'],'changed'),
   'changed ports':edit('node_target_refusal_observed',['refusal','after_graph','nodes',0,'outputs'],[{'port_guid':'foreign'}]),
   'incomplete graph':edit('node_target_checkpoint',['target_state','baseline','complete'],False),
   'graph pending':edit('node_target_checkpoint',['target_state','pending'],{'id':'pending'}),
   'target receipt':edit('node_target_checkpoint',['target_state','receipts'],[{}]),
   'false geometry':edit('node_target_refusal_observed',['refusal','receipt','placement_refusal','screen_point','x'],0),
   'reachable geometry':edit('node_target_refusal_observed',['refusal','receipt','placement_refusal','reachable'],True),
   'NaN geometry':edit('node_target_refusal_observed',['refusal','receipt','placement_refusal','viewport','width'],float('nan')),
   'successor schema':edit('node_apply_prepared',['request','parameters','settings','columns',0,'type'],'string',NEXT),
   'successor format':edit('node_apply_prepared',['request','parameters','settings','format','null_marker'],'null',NEXT),
   'successor bytes':edit('node_apply_prepared',['request','parameters','source','sha256'],'0'*64,NEXT),
  }
  def missing(phase,op=OP):return lambda e:e['events'].remove(row(e,phase,op))
  for phase,op in [('prepared',OP),('completed',OP),('node_target_checkpoint',OP),('node_target_refusal_observed',OP),('verification_delivered',OP),('download_completed',VERIFY),('download_verified',VERIFY),('transfer_completed',UPLOAD),('completed','refusal-save'),('node_checkpoint',NEXT)]:mutations['missing '+phase+op]=missing(phase,op)
  for phase in ('prepared','completed','node_apply_prepared'):mutations['duplicate '+phase]=lambda e,phase=phase:e['events'].append(copy.deepcopy(row(e,phase)))
  def extra_phase(e,phase):
   e['events'].append(dict(row(e,'node_phase_prepared'),phase=phase))
  for phase in ('node_step_prepared','node_observation_completed','missing_values_preflight_completed','node_apply_resume_prepared'):
   mutations['extra '+phase]=lambda e,phase=phase:extra_phase(e,phase)
  def effect_source(e):
   x=next(x for x in e['events'] if x.get('operation_id')==OP and x.get('phase')=='node_phase_completed' and x['receipt']['phase']=='source');x['receipt']['value']['effect_possible']=True
  mutations['source effect']=effect_source
  def workflow(e):
   x=next(x for x in e['events'] if x.get('operation_id')==OP and x.get('phase')=='node_phase_completed' and x['receipt']['phase']=='workflow');x['receipt']['value']['trace'][0]['active']=False
  mutations['workflow switch']=workflow
  def public(e):next(t['result'] for t in e['tools'] if t['arguments'].get('operation_id')==OP and t['result'].get('state')=='settled')['cleanup_complete']=False
  mutations['public projection']=public
  def early(e):next(c for c in e['calls'] if c['tool']==PREFIX+'dock_node_apply' and c['arguments'].get('operation_id')==NEXT)['row']=3
  mutations['successor before delivery']=early
  def oldid(e):next(c for c in e['calls'] if c['tool']==PREFIX+'dock_node_apply' and c['arguments'].get('operation_id')==NEXT)['arguments']['operation_id']=OP
  mutations['same ID']=oldid
  def early_event(e):
   d=row(e,'node_apply_prepared',NEXT);e['events'].remove(d);e['events'].insert(e['events'].index(row(e,'completed')),d)
  mutations['successor before durable end']=early_event
  for label,mutate in mutations.items():
   with self.subTest(label=label):
    e=copy.deepcopy(ORIGINAL);mutate(e);self.assertFalse(check(e)['passed'],label)
 def test_inspect_and_recovery(self):
  for key,value in [('state','pending'),('cleanup_confirmed',False),('effect_state','unknown'),('outcome',{}),('recovery_options',['resume'])]:
   e=copy.deepcopy(ORIGINAL);next(t for t in e['tools'] if t['tool']==PREFIX+'dock_operation_inspect')['result']['output'][key]=value
   with self.subTest(key=key):self.assertFalse(check(e)['passed'])
  for tool in ('dock_node_resume','dock_operation_recover','dock_artifact_delivery_resume'):
   e=copy.deepcopy(ORIGINAL);c=next(c for c in e['calls'] if c['tool']==PREFIX+'dock_operation_inspect');c['tool']=PREFIX+tool
   next(t for t in e['tools'] if t['tool_call_id']==c['tool_call_id'])['tool']=c['tool']
   with self.subTest(tool=tool):self.assertFalse(check(e)['passed'])
 def test_interleaved_effect_and_unallocated_call(self):
  e=copy.deepcopy(ORIGINAL);x=copy.deepcopy(row(e,'prepared'));x['operation_id']='unallocated';x['action_key']='ui.act'
  e['events'].insert(e['events'].index(row(e,'completed')),x);self.assertFalse(check(e)['passed'])
  e=copy.deepcopy(ORIGINAL);c=copy.deepcopy(e['calls'][0]);t=copy.deepcopy(e['tools'][0])
  c.update(tool=PREFIX+'dock_ui_act',tool_call_id='unallocated',row=100000);t.update(tool=c['tool'],tool_call_id=c['tool_call_id'],row=100001)
  e['calls'].append(c);e['tools'].append(t);self.assertFalse(check(e)['passed'])
 def test_coherent_successor_change_still_fails_semantic_identity(self):
  from missing_values_refusals import digest
  for key in ('schema','format','budget','label'):
   e=copy.deepcopy(ORIGINAL);d=row(e,'node_apply_prepared',NEXT);r=d['request']
   if key=='schema':r['parameters']['settings']['columns'][0]['type']='string'
   if key=='format':r['parameters']['settings']['format']['null_marker']='null'
   if key=='budget':r['budgets']['configure_ms']+=1
   if key=='label':r['target']['label']='different'
   for phase in ('prepared','completed'):row(e,phase,NEXT)['parameters']=copy.deepcopy(r)
   d['signature']=digest(dict(request=r,handler_revision='text-import-output-v2'))
   # Keep envelopes coherent: the semantic comparison itself must reject this.
   for c in e['calls']:
    if c['tool']==PREFIX+'dock_node_apply' and c['arguments'].get('operation_id')==NEXT:
     c['arguments']=dict(copy.deepcopy(r),workflow_ref={'workflow_id':r['workflow_ref']['workflow_id']})
   with self.subTest(key=key):self.assertFalse(classify(e,runtime_revision=RUNTIME,manifest_sha256=MANIFEST)['passed'])
 def test_scoped_result_is_not_full_goal(self):
  from missing_values_acceptance import full_goal_passed
  self.assertFalse(full_goal_passed({'terminal_refusal_accounting':{'passed':check(ORIGINAL)['passed']}}))

if __name__=='__main__':unittest.main()
