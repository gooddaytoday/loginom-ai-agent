import gzip,json,unittest,copy,hashlib
from unittest.mock import patch
from fixtures.missing_values_refusal_legacy import bound_wizard_close_confirmation as legacy_close, project_node as legacy_project
from pathlib import Path
from missing_values_refusals import audit_accounting,classify
from user_result_evidence import normalize_user_evidence
from node_public_acceptance_evidence import verify_public_nodes_and_saves
from evidence import PREFIX

FIXTURE=Path(__file__).parent/'fixtures/missing-values-refusal-live.json.gz'
ORIGINAL=json.loads(gzip.decompress(FIXTURE.read_bytes()))
RUNTIME=ORIGINAL['events'][0]['runtime_revision'];MANIFEST=ORIGINAL['events'][0]['manifest_sha256'];OP='refusal-placement';NEXT='refusal-corrected'
def row(e,phase,op=OP):return next(x for x in e['events'] if x.get('phase')==phase and x.get('operation_id')==op)
def check(e):return audit_accounting(e,runtime_revision=RUNTIME,manifest_sha256=MANIFEST,save_ids=['refusal-save'])

class RefusalTests(unittest.TestCase):
 # This immutable live fixture predates the stricter Close binding from node13
 # and the native cell projection from node16. Pin only its historical readers;
 # do not retrofit the original events or weaken the current verifier.
 def setUp(self):
  self.assertEqual(hashlib.sha256(FIXTURE.read_bytes()).hexdigest(),'b82fe54ef9e0779ea5836d1208a115df3f1b6004429b577dfe4c20aaf68dff46')
  for target,value in [('node_procedure_evidence.bound_wizard_close_confirmation',legacy_close),('user_result_evidence.project_node',legacy_project)]:
   replacement=patch(target,value);replacement.start();self.addCleanup(replacement.stop)
 def test_live_accounting_preserves_all_input_and_does_not_claim_full_goal(self):
  before=json.dumps(ORIGINAL);r=check(ORIGINAL)
  self.assertTrue(r['passed'],r.get('failures'));self.assertEqual((r['total_prepared'],r['successful_count'],r['refusal_count']),(3,2,1));self.assertFalse(r['full_goal_accepted'])
  self.assertEqual(r['refusals'][OP]['successor'],NEXT);self.assertEqual(before,json.dumps(ORIGINAL))
 def test_existing_defaults_still_reject_terminal_failure(self):
  self.assertFalse(normalize_user_evidence(ORIGINAL)[1]['passed'])
  part=classify(ORIGINAL,runtime_revision=RUNTIME,manifest_sha256=MANIFEST)
  norm,pr=normalize_user_evidence(ORIGINAL,terminal_outcomes={OP:part['refusals'][OP]['outcome']});self.assertTrue(pr['passed'])
  req={x['operation_id']:x['request'] for x in ORIGINAL['events'] if x.get('phase')=='node_apply_prepared'}
  self.assertFalse(verify_public_nodes_and_saves(norm,req,['refusal-save'])['passed'])
 def test_fail_closed_mutations(self):
  def setrow(phase,path,value,op=OP):
   def change(e):
    d=row(e,phase,op)
    for k in path[:-1]:d=d[k]
    d[path[-1]]=value
   return change
  def remove(phase,op=OP):return lambda e:e['events'].remove(row(e,phase,op))
  def duplicate(phase):return lambda e:e['events'].append(copy.deepcopy(row(e,phase)))
  def public_change(e):
   r=next(t['result'] for t in e['tools'] if t['arguments'].get('operation_id')==OP and t['result'].get('state')=='settled');r['cleanup_complete']=False
  def same_id_change(e):
   c=next(c for c in e['calls'] if c['tool']==PREFIX+'dock_node_apply' and c['arguments'].get('operation_id')==OP);c['arguments']['target']['position']['x']=700
  def early_successor(e):
   c=next(c for c in e['calls'] if c['tool']==PREFIX+'dock_node_apply' and c['arguments'].get('operation_id')==NEXT);c['row']=3
  def remove_successor(e):
   e['events'][:]=[x for x in e['events'] if x.get('operation_id')!=NEXT]
  def control(e):
   c=next(c for c in e['calls'] if c['tool']==PREFIX+'dock_operation_inspect');c['tool']=PREFIX+'dock_node_resume'
   next(t for t in e['tools'] if t['tool_call_id']==c['tool_call_id'])['tool']=c['tool']
  mutations={
   'missing completed':remove('completed'),'duplicate completed':duplicate('completed'),
   'missing prepared':remove('prepared'),'duplicate prepared':duplicate('prepared'),
   'missing inspect receipt':remove('verification_delivered'),
   'wrong session':setrow('node_target_refusal_observed',['session_id'],'foreign'),
   'wrong runtime':setrow('node_target_refusal_observed',['runtime_revision'],'foreign'),
   'wrong manifest':setrow('node_target_refusal_observed',['manifest_sha256'],'foreign'),
   'wrong document':setrow('node_apply_prepared',['request','document_id'],'foreign'),
   'wrong signature':setrow('node_apply_prepared',['signature'],'0'*64),
   'wrong source':setrow('missing_values_preflight_completed',['proof','source','node_id'],'foreign'),
   'wrong source port':setrow('missing_values_preflight_completed',['proof','port_guid'],'foreign'),
   'changed graph':setrow('node_target_refusal_observed',['refusal','after_graph','nodes',0,'label'],'changed'),
   'missing after observation':remove('node_target_refusal_observed'),
   'missing preflight acknowledgement':remove('missing_values_preflight_completed'),
   'changed source settings':setrow('missing_values_preflight_completed',['proof','settings_changed'],True),
   'open source editor':setrow('missing_values_preflight_completed',['proof','cancellation','draft_discarded'],False),
   'pending target':setrow('completed',['outcome','output','pending_phase'],'target'),
   'partial graph effect':setrow('node_target_refusal_observed',['refusal','receipt','effect_possible'],True),
   'invented no-effect outcome':setrow('completed',['outcome','effect_possible'],False),
   'forged placement':setrow('node_target_refusal_observed',['refusal','receipt','placement_refusal','reachable'],True),
   'forged public result':public_change,'changed request under old ID':same_id_change,
   'successor before settlement':early_successor,
   'changed successor parameters':setrow('node_apply_prepared',['request','parameters','max_nulls_percent'],50,NEXT),
   'missing successor':remove_successor,'missing successful checkpoint':remove('node_checkpoint',NEXT),
   'unsupported recovery':control,'missing save':remove('completed','refusal-save'),
  }
  for label,mutate in mutations.items():
   with self.subTest(label=label):
    e=copy.deepcopy(ORIGINAL);mutate(e);self.assertFalse(check(e)['passed'],label)
 def test_arbitrary_extra_call_and_forged_running_progress_fail(self):
  e=copy.deepcopy(ORIGINAL);call=copy.deepcopy(next(c for c in e['calls'] if c['tool']==PREFIX+'dock_node_apply'));reply=copy.deepcopy(next(t for t in e['tools'] if t['tool_call_id']==call['tool_call_id']))
  call.update(tool_call_id='extra',row=100000);call['arguments']['operation_id']='extra';reply.update(tool_call_id='extra',row=100001);reply['result']={'isError':True,'error':'unallocated'};e['calls'].append(call);e['tools'].append(reply);self.assertFalse(check(e)['passed'])
  e=copy.deepcopy(ORIGINAL);v=next(t['result'] for t in e['tools'] if t['arguments'].get('operation_id')==OP and t['result'].get('state')=='running' and t['result'].get('progress'))
  v['progress']['node']={'node_id':'forged'};self.assertFalse(check(e)['passed'])
 def test_inspect_must_be_exact_resolved_and_after_delivery(self):
  for key,value in [('state','pending'),('cleanup_confirmed',False),('effect_state','unknown'),('outcome',{}),('recovery_options',['resume'])]:
   e=copy.deepcopy(ORIGINAL);v=next(t['result'] for t in e['tools'] if t['tool']==PREFIX+'dock_operation_inspect');v['output'][key]=value
   with self.subTest(key=key):self.assertFalse(check(e)['passed'])


class MandatoryFullGoalGates(unittest.TestCase):
 def test_missing_goal_save_or_reopen_never_becomes_acceptance(self):
  from missing_values_acceptance import full_goal_passed
  # Tests only the final mandatory gates, never manufactures a full-goal fixture.
  checks={k:dict(passed=True) for k in ('exact_operations','final_results_count','saved_exact_links','final_native_checkpoint','public_calls','public_projection','terminal_refusal_accounting','frozen','model','independent_reopen_present','reopened_package')}
  for prefix in ('full_persisted:','raw_full_rows:','saved_configuration:','saved_connection:','unchanged_request:'):
   checks.update({prefix+str(i):dict(passed=True) for i in range(12)})
  for key in ('exact_operations','final_native_checkpoint','independent_reopen_present','reopened_package','full_persisted:11'):
   for absent in (False,True):
    damaged=copy.deepcopy(checks)
    if absent:del damaged[key]
    else:damaged[key]['passed']=False
    with self.subTest(key=key,absent=absent):self.assertFalse(full_goal_passed(damaged))
  self.assertFalse(full_goal_passed({}))

if __name__=='__main__':unittest.main()
