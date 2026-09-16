import copy, hashlib, importlib.util, pathlib, unittest
spec=importlib.util.spec_from_file_location('audit',pathlib.Path(__file__).with_name('audit-text-export.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class AuditNegativeTests(unittest.TestCase):
 def test_full_bytes_and_receipt_tampering(self):
  fixture={'names':['x','y'],'labels':['X','Y'],'rows':[['Привет','a"b'],['',None]]};settings={'delimiter':';','header':'names','bom':False,'line_ending':'\n','null_marker':'?'}
  actual='x;y\nПривет;"a""b"\n;?\n'.encode();node={'document_id':'d','workflow_id':'w','node_id':'n'}
  artifact={'destination':'/test-2/a.csv','execution_id':'run','verification_id':'op:export-download','freshness_basis':'native_absence_check_and_completed_execution','bytes':len(actual),'sha256':hashlib.sha256(actual).hexdigest()}
  r={'status':'SUCCEEDED','cleanup_complete':True,'output':{'status':'SUCCEEDED','cleanup_complete':True,'operation_id':'op','node':node,'package_saved':False,'execution':{'status':'completed','execution_id':'run'},'output':{'status':'complete','ports':[],'execution_id':'run','file_artifacts':[artifact]},'configuration':{'readback':{'kind':'text_export','node':node,'destination':'/test-2/a.csv','package_persistence_verified':False,'receipt_ids':['op:input_mapping','op:configure','op:finish'],'settings':{'delimiter':';','bom':False,'header':1,'line_ending':0,'encoding':65001,'null_marker':'?'}}}}}
  self.assertTrue(mod.audit(r,fixture,settings,actual,'/test-2/a.csv')['passed'])
  cases=[('status','FAILED'),('cleanup_complete',False)]
  for key,value in cases:
   bad=copy.deepcopy(r);bad[key]=value
   with self.subTest(key=key),self.assertRaises(AssertionError):mod.audit(bad,fixture,settings,actual,'/test-2/a.csv')
  for key,value in [('destination','/test-2/old.csv'),('execution_id','old'),('bytes',len(actual)-1),('sha256','0'*64),('verification_id','other'),('freshness_basis','file_exists')]:
   bad=copy.deepcopy(r);bad['output']['output']['file_artifacts'][0][key]=value
   with self.subTest(key=key),self.assertRaises(AssertionError):mod.audit(bad,fixture,settings,actual,'/test-2/a.csv')
  for changed in [actual[:-1],actual+b'extra',actual.replace(b';?',b';'),actual.replace(b'a""b',b'a"b'),actual.replace(b'\n',b'\r\n'),b'\xef\xbb\xbf'+actual]:
   bad=copy.deepcopy(r);a=bad['output']['output']['file_artifacts'][0];a['bytes']=len(changed);a['sha256']=hashlib.sha256(changed).hexdigest()
   with self.subTest(bytes=changed),self.assertRaises(AssertionError):mod.audit(bad,fixture,settings,changed,'/test-2/a.csv')
if __name__=='__main__':unittest.main()
