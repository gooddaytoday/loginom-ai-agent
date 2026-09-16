import copy,json,unittest
from missing_values_goal import CASES,expected,fixtures,descriptors,prompt
from missing_values_acceptance import session_binding,raw_table_binding,checkpoint_save
class MissingAcceptance(unittest.TestCase):
 def test_frozen_oracle_boundaries_and_input_distinctions(self):
  frozen=fixtures();self.assertEqual(len(frozen['expected']),14)
  core=expected(CASES[0]);self.assertEqual(core['rows'][1],['2','5.0','2','MISSING',None]);self.assertEqual(core['rows'][2][3],'');self.assertEqual(core['rows'][3][3],'null');self.assertEqual(core['rows'][0][4],'0')
  precision=expected(next(c for c in CASES if c['id']=='precision'));self.assertEqual(precision['rows'][1][2],'-2')
  for n,nulls in [(40,5),(41,0),(42,0)]:self.assertEqual(expected(next(c for c in CASES if c['id']=='boundary-'+str(n)))['remaining_nulls'][1],nulls)
  self.assertEqual(expected(next(c for c in CASES if c['id']=='rounded-zero'))['remaining_nulls'][1],0)
  self.assertEqual(expected(next(c for c in CASES if c['id']=='empty'))['rows'],[])
  self.assertEqual(expected(CASES[-1])['rows'][1][1],'20')
 def test_all_missing_does_not_invent_a_mean_or_constant(self):
  x=expected(next(c for c in CASES if c['id']=='all-null'));self.assertGreater(x['remaining_nulls'][3],0);self.assertIsNone(x['rows'][0][3])
 def test_explicit_artifact_scope_and_unique_run_names(self):
  a=descriptors('20260913-120000-1234abcd','/test-4');self.assertEqual(len(a),8);self.assertEqual(len({x['name'] for x in a}),8)
  with self.assertRaises(ValueError):descriptors('20260913-120000-1234abcd','/test-1')
 def test_reordered_reuses_precision_without_changing_expected_cells(self):
  case=next(c for c in CASES if c['id']=='reordered');current=expected(case)
  historical=expected(dict(case,fixture='reordered.csv',input_order=case['input_order']))
  self.assertEqual({k:v for k,v in current.items() if k!='source_sha256'},{k:v for k,v in historical.items() if k!='source_sha256'})
  self.assertEqual(len([c for c in CASES if c['final']]),12)
  self.assertEqual(current['schema'][0]['label'],'Same');self.assertEqual(current['schema'][-1]['label'],'Same')
 def fixture(self):
  from missing_values_goal import PIN
  prep={'sessionId':'work','workspace':{'document_id':'d'}};meta=[dict(sessionId='work',workspaceReady=True,clientRevision=PIN),dict(sessionId='precheck',workspaceReady=False,archiveActive=False,targetIdentity=None)]
  events=[dict(session_id='work')];geo=dict(session_id='work',document_id='d',runtime_revision=PIN,geometry=dict(viewport=None,window=dict(width=1508,outerWidth=1508,outerHeight=949,availableWidth=1512,availableHeight=949)));pre=dict(available=True,scope='MCP initialize/list_tools only; no model, prepare or browser actions');return prep,meta,events,geo,pre
 def test_work_session_is_bound_not_counted(self):
  self.assertTrue(session_binding(*self.fixture()))
  for fault in ('precheck_work','foreign_journal','wrong_window','virtual_viewport','wrong_document'):
   p,m,e,g,c=copy.deepcopy(self.fixture())
   if fault=='precheck_work':m[1]['workspaceReady']=True
   elif fault=='foreign_journal':e.append({'session_id':'precheck'})
   elif fault=='wrong_window':g['session_id']='precheck'
   elif fault=='virtual_viewport':g['geometry']['viewport']={'width':1508,'height':862}
   else:g['document_id']='other'
   self.assertFalse(session_binding(p,m,e,g,c),fault)
 def test_full_raw_rows_bind_cells_not_just_summary(self):
  table=dict(node={'node_id':'n'},table={'port_guid':'p'},port_guid='p',schema=[{'name':'A'}],row_count=1,rows=[[dict(type='string',is_null=False,value='null')]])
  raw=dict(binding=dict(node={'node_id':'n'}),first=dict(verified=True,table={'port_guid':'p'},row_total=1),rows=[dict(index=0,record_id='r',cells=[dict(column=0,is_null=False,text='null')])])
  self.assertTrue(raw_table_binding(table,raw))
  for f in ('text','null','owner','row'):
   r=copy.deepcopy(raw)
   if f=='text':r['rows'][0]['cells'][0]['text']=''
   elif f=='null':r['rows'][0]['cells'][0]['is_null']=True
   elif f=='owner':r['binding']['node']['node_id']='foreign'
   else:r['rows'][0]['index']=1
   self.assertFalse(raw_table_binding(table,r),f)
 def test_checkpoint_requires_real_complete_save_trace(self):
  path='/test-4/packages/a.lgp';graph={'nodes':['A']};params=dict(path=path,conflict_policy='fail');checkpoint={'graph':graph}
  output=dict(save_completed=True,workflow_preserved=True,reopened=False,persisted_content_verified=False,package_ref={'path':path})
  trace=[dict(event='save_requested'),dict(event='save_flow_completed'),dict(event='open_saved_package_observed',actual_path=path,requested_path=path,path_matches=True,graph_matches=True,workflow_matches=True),dict(event='postcondition_verified',proof='awaited_save_flow_same_open_workflow',package_path=path,graph=graph)]
  start=dict(phase='prepared',action_key='package.save_checkpoint',action_revision='5',operation_id='save',parameters=params,checkpoint=checkpoint)
  end=dict(start,phase='completed',outcome=dict(status='SUCCEEDED',cleanup_complete=True,error=None,output=output,trace=trace))
  events=[dict(phase='node_checkpoint',operation_id='last'),start,end]
  self.assertEqual(checkpoint_save(events,path,'5','last',['A']),'save')
  for f in ('reopen_instead','missing_trace','wrong_path','two_saves','early_save'):
   e=copy.deepcopy(events)
   if f=='reopen_instead':e[1]['action_key']=e[2]['action_key']='package.save_as'
   elif f=='missing_trace':e[2]['outcome']['trace'].pop(1)
   elif f=='wrong_path':e[2]['outcome']['output']['package_ref']['path']='/test-1/a.lgp'
   elif f=='two_saves':e.append(e[2])
   else:e=[e[1],e[2],e[0]]
   self.assertIsNone(checkpoint_save(e,path,'5','last',['A']),f)
if __name__=='__main__':unittest.main()
