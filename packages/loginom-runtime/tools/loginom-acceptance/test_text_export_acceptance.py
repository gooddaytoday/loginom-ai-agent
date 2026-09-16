import copy,json,tempfile,unittest
from pathlib import Path
from text_export_acceptance import preserved,audit_directory,CASES,WORK,bytes_audit
from text_export_upload_probe import CONTRACT,descriptors,prompt,verify_expected,validate_catalog,MANIFEST_URI,MANIFEST_SHA
class TextExportAcceptanceTests(unittest.TestCase):
 def test_frozen_bytes_independent_oracle(self):
  verify_expected()
  for c in CASES.values():
   fixture=json.loads((WORK/'fixtures/text-export'/c['fixture']).read_text())
   self.assertEqual(bytes_audit.expected_bytes(fixture,c['settings']),(WORK/'fixtures/text-export'/c['expected_path']).read_bytes())
   self.assertEqual(len(c['types']),len(fixture['names']))
 def test_render_is_complete_and_isolated(self):
  text=prompt((WORK/'goals/text-export-node-complete.txt').read_text(),'/test-2/packages/example.lgp','/test-2','20260913-180000-1234abcd')
  self.assertNotIn('__',text);self.assertIn('/test-2/Dock-export-20260913-180000-1234abcd-reopen-zero.csv',text)
  self.assertEqual([a['upload']['overwrite'] for a in descriptors('20260913-180000-1234abcd','/test-2')],['reject']*3)
  for directory in ['/test-1','/test-2/nested','/test-2/../test-1']:
   with self.assertRaises(ValueError):validate_catalog(MANIFEST_URI,MANIFEST_SHA,directory)
  with self.assertRaises(ValueError):validate_catalog(MANIFEST_URI,'0'*64,'/test-2')
 def test_input_paths_never_collide_with_any_export_destination(self):
  run='20260913-180000-1234abcd';directory='/test-2';artifacts=descriptors(run,directory)
  inputs={directory+'/'+a['name'] for a in artifacts}
  suffixes=['csv.csv','typed.csv','wide.tsv','empty.csv','zero.csv','tsv.tsv','done.csv','closed.csv','reopen-changed.csv','reopen-typed.csv','reopen-wide.tsv','reopen-zero.csv']
  outputs={directory+'/Dock-export-'+run+'-'+s for s in suffixes}
  self.assertFalse(inputs & outputs);self.assertEqual(len(inputs),3)
  text=prompt((WORK/'goals/text-export-node-complete.txt').read_text(),directory+'/packages/run.lgp',directory,run)
  for a in artifacts:self.assertIn(a['name'],text)
  for output in outputs:self.assertIn(output,text)
 def test_persistence_rejects_reconfiguration_and_rebinding(self):
  def out(doc,execution):return {'output':{'node':{'node_id':'n','document_id':doc},'configuration':{'readback':{'input_mapping':{'fields':['a']},'settings':{'destination':doc,'delimiter':';'}}},'execution':{'status':'completed','execution_id':execution}}}
  a,b=out('old','e1'),out('new','e2');r={'target':{'kind':'existing'},'inputs':[],'mappings':[],'parameters':{'destination':'new'}}
  self.assertTrue(preserved(a,b,r)['passed'])
  bad=[]
  for key,value in [('parameters',{'destination':'new','delimiter':';'}),('inputs',[{'source':'another'}]),('mappings',[{'rewrite':True}])]:
   changed=copy.deepcopy(r);changed[key]=value;bad.append((b,changed))
  for field,value in [('node_id','foreign'),('document_id','old')]:
   changed=copy.deepcopy(b);changed['output']['node'][field]=value;bad.append((changed,r))
  changed=copy.deepcopy(b);changed['output']['execution']['execution_id']='e1';bad.append((changed,r))
  changed=copy.deepcopy(b);changed['output']['configuration']['readback']['settings']['delimiter']=',';bad.append((changed,r))
  for outcome,request in bad:
   with self.assertRaises(AssertionError):preserved(a,outcome,request)
 def test_no_model_or_missing_export_cannot_pass(self):
  with tempfile.TemporaryDirectory() as d:self.assertFalse(audit_directory(Path(d))['passed'])
if __name__=='__main__':unittest.main()
