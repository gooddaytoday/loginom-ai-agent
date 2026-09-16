import copy,unittest
from persisted_import_evidence import verify_persisted_schema
class PersistedSchemaTests(unittest.TestCase):
 def test_independent_complete_schema_including_empty_output(self):
  cols=[dict(name='Id',label='Id',type='integer',data_kind='Непрерывный',used=True)]
  r=dict(operation_id='read');e=[dict(phase='node_checkpoint',operation_id='read',result=dict(output=dict(ports=[dict(schema=[{k:v for k,v in cols[0].items() if k!='used'}],sample=[],row_count=0)])))]
  self.assertTrue(verify_persisted_schema(e,r,cols)['passed'])
  for key,value in [('name','WrongId'),('label','Wrong label'),('type','string'),('data_kind','Дискретный')]:
   c=copy.deepcopy(e);c[0]['result']['output']['ports'][0]['schema'][0][key]=value
   self.assertFalse(verify_persisted_schema(c,r,cols)['passed'])
  c=copy.deepcopy(e);c[0]['result']['output']['ports'][0]['schema']=[];self.assertFalse(verify_persisted_schema(c,r,cols)['passed'])
if __name__=='__main__':unittest.main()
