import copy
import unittest
from pathlib import Path
from reform_goal_contract import verify_goal,goal_output,INITIAL_CHANGES,FINAL_CHANGES
from reform_upload_probe import FIXTURE,descriptor

class ReformGoalContractTests(unittest.TestCase):
 def setUp(self):
  self.source=(Path(__file__).parent/FIXTURE).read_bytes();read=dict(ports=[0],sample_rows=10,require_exact_numbers=True)
  names=['Id','RawAmount','RawFlag','RawWhen','Comment','Unused']
  self.seed=dict(target=dict(kind='new',type='imports.text',label='Данные'),mode='delimited',finish='execute',inputs=[],mappings=[],read=read,
   parameters=dict(settings=dict(source=dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True),
   format=dict(delimiter=';',text_qualifier='"',decimal_separator=',',null_marker='NULL'),columns=[dict(name=n,label=n,type='integer' if i==0 else 'string',used=True,data_kind='Непрерывный' if i==0 else 'Дискретный') for i,n in enumerate(names)])))
  def request(final):return dict(target=dict(kind='existing' if final else 'new',type='transform.reform_columns',label='Очистка'),mode='scalar',finish='execute',read=read,
   parameters=dict(changes=copy.deepcopy(FINAL_CHANGES if final else INITIAL_CHANGES)),
   mappings=[dict(direction='output',port=0,autosync=False,fields=[dict(source=dict(kind='configured_field',name=c['name'])) for c in goal_output(self.source,final)[0]])])
  self.initial,self.changed=request(False),request(True)
 def audit(self):return verify_goal(self.seed,self.initial,self.changed,self.source)
 def test_goal_and_fixed_oracle(self):
  self.assertTrue(self.audit()['passed']);schema,rows=goal_output(self.source,True)
  self.assertEqual([c['name'] for c in schema],['Timestamp','Id','NetAmount','Enabled'])
  self.assertEqual(rows[0],['2024-02-29 23:59:58.000','1','3.545',True]);self.assertEqual(rows[3],[None,'4',None,None])
  self.assertEqual(descriptor('20260911-123456-1234abcd','/user/dock-p3')['bytes'],len(self.source))
 def test_missing_preservation_and_conversion_are_rejected(self):
  for change in [lambda:self.changed['parameters']['changes'].pop(),lambda:self.initial['parameters']['changes'][0].update(type='integer'),
   lambda:self.changed['parameters']['changes'][0].update(label='Значение'),lambda:self.changed['mappings'][0]['fields'].reverse(),
   lambda:self.changed['mappings'][0].update(autosync=True),lambda:self.seed['parameters']['settings']['columns'][1].update(type='real')]:
   self.setUp();change();self.assertFalse(self.audit()['passed'])
 def test_explicit_unchanged_mapping_and_six_row_read_satisfy_goal(self):
  columns=self.seed['parameters']['settings']['columns']
  def mapping(direction):return dict(direction=direction,port=0,autosync=True,fields=[dict(source=dict(kind='configured_field',name=c['name']),name=c['name'],label=c['label']) for c in columns])
  self.seed['mappings']=[mapping('output')];self.initial['mappings'].insert(0,mapping('input'))
  for r in (self.seed,self.initial,self.changed):r['read']=dict(ports=[0],sample_rows=6,require_exact_numbers=True)
  self.assertTrue(self.audit()['passed'])
  self.seed['mappings'][0]['autosync']=False;self.assertTrue(self.audit()['passed'])
  self.initial['mappings'][0]['fields'].reverse();self.assertFalse(self.audit()['passed'])
 def test_source_and_empty_null_oracle_are_separate(self):
  _,rows=goal_output(self.source,False);self.assertEqual(rows[3][-1],'');self.assertIsNone(rows[4][-1])
  self.source+=b'\n';self.assertFalse(self.audit()['passed'])

if __name__=='__main__':unittest.main()
