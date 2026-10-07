"""Reject missing-field substitution, transport errors and replacement imports."""
import copy,importlib.util,json,unittest,sys
sys.dont_write_bytecode=True
from pathlib import Path
root=Path(__file__).parent
spec=importlib.util.spec_from_file_location('audit',root/'negative/ambiguous-headers-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
case=next(c for c in json.loads((root/'matrix/manifest.json').read_text())['cases'] if c['case_id']=='ambiguous_headers')
scenario=json.loads((root/'negative/ambiguous-headers.settings.json').read_text());case['columns']=scenario['columns'];case['settings']={k:scenario[k] for k in ['source','format']}
def receipts():
 artifact={'artifact_id':'original','name':'prefix-'+case['source']['name'],'bytes':case['source']['bytes'],'sha256':case['source']['sha256'],'upload':{'grant_id':'grant','destination':'/owned/ambiguous_headers.txt'}}
 transfer={'upload_operation_id':'delivery:upload','destination':artifact['upload']['destination'],'bytes':artifact['bytes'],'sha256':artifact['sha256'],'upload_completion_verified':True,'cleanup_complete':True}
 return [{'tool':'loginom_dock_action_run','input':{'action_key':'package.save_checkpoint','parameters':{'path':'/owned/negative.lgp'}},'result':{'status':'SUCCEEDED','cleanup_complete':True,'output':{'package_ref':{'path':'/owned/negative.lgp','active_identity':'/owned/negative.lgp'},'save_completed':True,'workflow_preserved':True}}},{'tool':'loginom_dock_prepare','result':{'workspace':{'status':'READY','ownership_verified':True,'loginom_account':'owned','document_id':'doc','workflow_ref':{'workflow_id':'wf'}},'input_artifacts':[artifact]}},{'tool':'loginom_dock_artifact_deliver','input':{'artifact_id':'original','upload_grant_id':'grant'},'result':{'status':'SUCCEEDED','output':transfer}},{'tool':'loginom_dock_node_apply','input':{'operation_id':'negative','document_id':'doc','workflow_ref':{'workflow_id':'wf'},'target':{'kind':'new','type':'imports.text'},'mode':'delimited','finish':'execute','inputs':[],'mappings':[],'parameters':{'source':{'artifact_id':'original','upload_operation_id':'delivery:upload'},'settings':{**copy.deepcopy(scenario),'source':{**scenario['source'],'source_path':transfer['destination']}}}},'result':{'operation_id':'negative','state':'settled','status':'NOT_APPLIED','action_key':'request.validate','phase':'request_rejected','request_rejected':True,'effect_possible':False,'cleanup_complete':True,'error':{'code':'REQUEST_REJECTED','message':'Duplicate source column names'}}}]
class RepeatedReferences(unittest.TestCase):
 def test_exact_repeated_reference_refusal(self):self.assertEqual(oracle.audit(receipts(),case)['status'],'PASS')
 def test_missing_field_is_not_ambiguity(self):
  t=receipts();t[-1]['input']['parameters']['settings']['columns']=json.loads((root/'negative/missing-field.settings.json').read_text())['columns']
  with self.assertRaisesRegex(ValueError,'EXACT_REPEAT_REFERENCES_REQUIRED'):oracle.audit(t,case)
 def test_normalized_name_correction_is_refused(self):
  t=receipts();t[-1]['input']['parameters']['settings']['columns'][1]['source_name']='Name_1'
  with self.assertRaisesRegex(ValueError,'EXACT_REPEAT_REFERENCES_REQUIRED'):oracle.audit(t,case)
 def test_transport_uncertainty_is_not_refusal(self):
  t=receipts();t[-1]['result']={'tool_error':'Transport disconnected'}
  with self.assertRaisesRegex(ValueError,'EXACT_PREFLIGHT_REFUSAL_REQUIRED'):oracle.audit(t,case)
 def test_duplicate_creation_or_upload(self):
  for i in [2,3]:
   t=receipts();t.append(copy.deepcopy(t[i]))
   with self.assertRaises(ValueError):oracle.audit(t,case)
 def test_wrong_original_bytes(self):
  t=receipts();t[2]['result']['output']['sha256']='0'*64
  with self.assertRaisesRegex(ValueError,'SERVER_BYTES_UNCONFIRMED'):oracle.audit(t,case)
 def test_started_operation_cannot_pass(self):
  t=receipts();t.append({'tool':'loginom_dock_node_status','result':{'operation_id':'negative','state':'running'}})
  with self.assertRaisesRegex(ValueError,'IMPORT_OPERATION_MUST_NOT_START'):oracle.audit(t,case)
 def test_unsaved_package_cannot_pass(self):
  t=receipts();t[0]['result']['output']['save_completed']=False
  with self.assertRaisesRegex(ValueError,'EMPTY_PACKAGE_SAVE_UNCONFIRMED'):oracle.audit(t,case)
 def test_foreign_request_owner(self):
  t=receipts();t[-1]['input']['document_id']='other'
  with self.assertRaisesRegex(ValueError,'REQUEST_WORKSPACE_OWNER_DIFFERS'):oracle.audit(t,case)
if __name__=='__main__':unittest.main()
