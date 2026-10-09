import unittest,importlib.util,json,copy
from pathlib import Path
import sys
sys.dont_write_bytecode=True
root=Path(__file__).parent
spec=importlib.util.spec_from_file_location('oracle',root/'matrix-oracle.py')
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
case=json.loads((root/'matrix/manifest.json').read_text())['cases'][0]
def complete():
 return {'schema':case['columns'],'row_count':3,'sample_rows':3,'sample_complete':True,'fresh':True,'execution_id':'owned',
         'sample':[[{'type':c['type'],'is_null':v is None,'value':v} for c,v in zip(case['columns'],row)] for row in case['expected_rows']]}
class CompleteOracle(unittest.TestCase):
 def test_every_cell_and_full_count(self):
  self.assertTrue(oracle.compare(case,complete())['all_values_compared'])
  for key,value in [('row_count',4),('sample_complete',False),('fresh',False)]:
   port=complete();port[key]=value
   with self.assertRaises(ValueError):oracle.compare(case,port)
 def test_null_empty_zero_and_last_cell_are_distinct(self):
  for row,col,value in [(0,4,None),(1,2,'1'),(2,4,'truncated')]:
   port=complete();port['sample'][row][col].update(value=value,is_null=value is None)
   with self.assertRaises(ValueError):oracle.compare(case,port)
 def test_order_type_label_and_omitted_values_refuse(self):
  for mutation in ['order','type','label','missing']:
   port=copy.deepcopy(complete())
   if mutation=='order':port['sample'].reverse()
   if mutation=='type':port['schema'][0]['type']='integer'
   if mutation=='label':port['schema'][0]['label']='other'
   if mutation=='missing':port['sample'][2].pop()
   with self.assertRaises(ValueError):oracle.compare(case,port)
if __name__=='__main__':unittest.main()
