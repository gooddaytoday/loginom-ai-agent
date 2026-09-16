import copy
from pathlib import Path
import unittest
from grouping_goal_contract import verify_goal,goal_output,IMPORT_COLUMNS,INITIAL_MEASURES,FINAL_MEASURES
from grouping_upload_probe import FIXTURE,descriptor,prompt,FIXTURE_SHA
import hashlib

class GroupingGoalTests(unittest.TestCase):
 def setUp(self):
  self.source=(Path(__file__).parent/FIXTURE).read_bytes();read=dict(ports=[0],sample_rows=10,require_exact_numbers=True)
  self.seed=dict(target=dict(kind='new',type='imports.text',label='Данные'),mode='delimited',finish='execute',inputs=[],mappings=[],read=read,parameters=dict(settings=dict(source=dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True),format=dict(delimiter=';',text_qualifier='"',decimal_separator='.',null_marker='\\N'),columns=copy.deepcopy(IMPORT_COLUMNS))))
  def group(kind,keys,measures):return dict(target=dict(kind=kind,type='transform.group_data',label='Итоги'),mode='aggregate',finish='execute',read=read,mappings=[],parameters=dict(group_by=[dict(kind='input_field',name=n) for n in keys],measures=[dict(m,field=dict(kind='input_field',name=m['field'])) for m in measures]))
  self.initial=group('new',['Group'],INITIAL_MEASURES);self.changed=group('existing',['Segment','Group'],FINAL_MEASURES)
  self.changed['mappings']=[dict(direction='output',port=0,autosync=False,fields=[dict(source=dict(kind='configured_field',name=n)) for n in ['Group','OtherTotal','MeanAmount','TextRows']]+[dict(source=dict(kind='configured_field',name='Segment'),excluded=True)])]
 def audit(self):return verify_goal(self.seed,self.initial,self.changed,self.source)
 def test_exact_goal(self):
  self.assertTrue(self.audit()['passed']);schema,rows=goal_output(self.source);self.assertEqual(len(schema),7);self.assertEqual(len(rows),3);self.assertEqual(rows[-1],['C',None,2,None,None,None,2])
  schema,rows=goal_output(self.source,True);self.assertEqual(len(schema),4);self.assertEqual(len(rows),4)
  self.assertEqual(rows,[['A',30.0,1.25,2],['A',-1.0,-2.5,2],['B',3.0,0.0617283945061725,2],['C',7.0,None,2]])
 def test_full_reconfiguration_required(self):
  for edit in [lambda:self.changed['parameters']['measures'].pop(),lambda:self.changed['parameters']['group_by'].reverse(),lambda:self.changed['mappings'][0].update(autosync=True),lambda:self.changed['mappings'][0]['fields'][-1].update(excluded=False)]:
   before=copy.deepcopy(self.changed);edit();self.assertFalse(self.audit()['passed']);self.changed=before
 def test_source_identity(self):
  self.assertEqual(hashlib.sha256(self.source).hexdigest(),FIXTURE_SHA);d=descriptor('20260909-120000-abcdef01','/user/dock-p3');self.assertEqual(d['bytes'],len(self.source));self.source+=b'\n';self.assertFalse(self.audit()['passed'])
 def test_duplicate_labels_preserved(self):
  self.changed['parameters']['measures'][1]['label']='Changed';self.assertFalse(self.audit()['passed'])

 def test_explicit_identity_mappings_preserve_goal(self):
  def mapping(direction,columns):return dict(direction=direction,port=0,autosync=True,fields=[dict(source=dict(kind='configured_field',name=c['name']),name=c['name'],label=c['label'],excluded=False) for c in columns])
  self.seed['mappings']=[mapping('output',IMPORT_COLUMNS)]
  self.initial['mappings']=[mapping('input',IMPORT_COLUMNS),mapping('output',goal_output(self.source)[0])]
  self.assertTrue(self.audit()['passed'])
  original=copy.deepcopy(self.initial['mappings'])
  for edit in [lambda:self.initial['mappings'][0]['fields'].reverse(),lambda:self.initial['mappings'][1]['fields'][0].update(excluded=True),lambda:self.initial['mappings'][1]['fields'][0].update(name='Wrong'),lambda:self.initial['mappings'][1]['fields'][0].update(label='Wrong'),lambda:self.initial['mappings'].append(copy.deepcopy(self.initial['mappings'][0]))]:
   edit();self.assertFalse(self.audit()['passed']);self.initial['mappings']=copy.deepcopy(original)

if __name__=='__main__':unittest.main()
