import copy,unittest
import calculator_evidence as v2
import calculator_test_fixtures as fixture

def node_fixture():
 e,ops=fixture.expression_fixture();removed={ops.pop('output_before'),ops.pop('output_after')}
 e['calls']=[c for c in e['calls'] if c['tool_call_id'] not in removed];e['tools']=[c for c in e['tools'] if c['result']['operation_id'] not in removed];e['events']=[v for v in e['events'] if v['operation_id'] not in removed];ops['sequence']=[op for op in ops['sequence'] if op not in removed]
 done=next(t for t in e['tools'] if t['result']['operation_id']==ops['done']);prior=next(t for t in e['tools'] if t['result']['operation_id']==ops['options_apply'])
 for c in e['calls']+[done]:
  if c['tool_call_id']==done['tool_call_id']:c['arguments']['observation_id']=prior['result']['output']['observation_id']
 for t in done['result']['trace']:
  if t['event']=='wizard_step_verified':t['from_stage']='calculator'
 next(t for t in e['events'] if t['operation_id']==ops['done'])['outcome']=copy.deepcopy(done['result'])
 return e,ops

class NodeTests(unittest.TestCase):
 def test_native_node_roundtrip_without_output_step(self):
  e,o=node_fixture();r=v2.verify_node_roundtrip(e,'',o,fixture.old.EXPECTED,fixture.SCHEMA)
  self.assertTrue(r['calculator_node_roundtrip_verified'],r);self.assertNotIn('output_mapping',r);self.assertFalse(r['package_persistence_verified'])
 def test_native_node_tampering(self):
  for mode in ['changed_text','intermediate','changed_name','missing_apply','missing_finish','same_editor','foreign_owner','extra_mutation']:
   with self.subTest(mode=mode):
    e,o=node_fixture()
    if mode=='extra_mutation':e['calls'].append({'session_id':'s','tool_call_id':'extra','row':19.5,'tool':'dock_action_run'})
    else:
     key={'changed_text':'definition_after','intermediate':'options_after','changed_name':'definition_after','missing_apply':'options_apply','missing_finish':'finish','same_editor':'definition_after','foreign_owner':'done'}[mode]
     t=next(t for t in e['tools'] if t['result']['operation_id']==o[key]);r=t['result'];s=r['output'];w=s['wizard']
     if mode=='changed_text':s['ui']['elements'][0]['calculator_editor']['document']['text']='0'
     if mode=='intermediate':w['expression_parameters']['options']['intermediate']['value']=True
     if mode=='changed_name':w['calculator_expressions']['fields'][0]['name']='Other'
     if mode in ['missing_apply','missing_finish']:r['trace']=r['trace'][:2]
     if mode=='same_editor':s['ui']['elements'][0]['calculator_editor']['document']['document_ref']='editor1'
     if mode=='foreign_owner':w['owner_context']['node']['tid']='foreign'
     next(x for x in e['events'] if x['operation_id']==o[key])['outcome']=copy.deepcopy(r)
    self.assertFalse(v2.verify_node_roundtrip(e,'',o,fixture.old.EXPECTED,fixture.SCHEMA)['calculator_node_roundtrip_verified'])

def output_fixture():
 e,o,_,owner=fixture.port_fixture();expression=fixture.ce.definition(fixture.calculator(),fixture.old.EXPECTED)
 ee,eo=fixture.expression_fixture();mapping=next(t['result']['output']['wizard']['output_columns'] for t in ee['tools'] if t['result']['operation_id']==eo['output_before'])
 path=owner['path'][:-1]+[{'tid':owner['node']['tid']+'>Выходные_порты','label':'Выходные порты'},{'tid':owner['node']['tid']+'>Выходные_порты>Выход','label':'Выход'}]
 for t in e['tools']:
  r=t['result'];s=r['output'];w=s['wizard']
  if w.get('stage')=='input_mapping':
   w.pop('input_mapping');w.pop('input_port_context');w['stage']='output_mapping';w['owner_context']={'status':'unobserved','opening_verified':False}
   w['port_context']={'status':'observed','kind':'output_data','opening_verified':False,'node':{**owner['node'],'ref':'nodecrumb'},'port':{**path[-1],'ref':'portcrumb'},'path':path+[{'tid':path[-1]['tid']+'>Настройка','label':'Настройка'}]}
   w['output_columns']=copy.deepcopy(mapping);s['ui']['elements'][0]['wizard_finish']['mode']='output_port'
  else:
   for n in s['nodes']:
    for p in n.get('ports',[]):
     if p['tid']=='MF;TF-1;Graph;n;Input_Data-0':p['tid']='MF;TF-1;Graph;n;Output_Data-0'
   for x in s['ui']['elements']:
    if x.get('tid')=='MF;TF-1;Graph;n;Input_Data-0':x['tid']='MF;TF-1;Graph;n;Output_Data-0'
  for tr in r['trace']:
   if tr['event'].startswith('input_port_finish'):tr['event']=tr['event'].replace('input_port','output_port')
   if tr['event']=='output_port_finish_verified':tr['port_path']=copy.deepcopy(path)
  next(x for x in e['events'] if x['operation_id']==r['operation_id'])['outcome']=copy.deepcopy(r)
 return e,o,owner,expression

class OutputTests(unittest.TestCase):
 def test_separate_native_output_port_roundtrip(self):
  e,o,owner,d=output_fixture();r=v2.verify_output_port_roundtrip(e,'',o,owner,fixture.SCHEMA,d)
  self.assertTrue(r['calculator_output_roundtrip_verified'],r);self.assertEqual(len(r['output_mapping']['fields']),3)
 def test_output_port_tampering(self):
  for mode in ['wrong_port','missing_graph_port','unissued_menu','unknown_type','extra_field','partial','changed_mapping','changed_owner','changed_port','same_root','no_settle','no_finish','duplicate_reply','duplicate_journal','detached_change','intervening_mutation']:
   with self.subTest(mode=mode):
    e,o,owner,d=output_fixture()
    if mode=='unissued_menu':e['calls'][2]['arguments']['observation_id']='obs0'
    elif mode=='duplicate_reply':e['tools'].append(copy.deepcopy(e['tools'][3]))
    elif mode=='duplicate_journal':e['events'].append(copy.deepcopy(e['events'][3]))
    elif mode=='intervening_mutation':e['calls'].append({'session_id':'s','tool_call_id':'extra','row':6.5,'tool':'dock_action_run'})
    else:
     i=0 if mode in ['wrong_port','missing_graph_port'] else 4 if mode in ['no_settle','no_finish'] else 8
     r=e['tools'][i]['result'];s=r['output'];w=s['wizard']
     if mode=='wrong_port':s['ui']['elements'][-1]['tid']='MF;TF-1;Graph;n;Input_Data-0'
     if mode=='missing_graph_port':s['nodes'].pop()
     if mode=='unknown_type':w['output_columns']['fields'][0]['type']='unknown'
     if mode=='extra_field':w['output_columns']['fields'].append(copy.deepcopy(w['output_columns']['fields'][0]))
     if mode=='partial':w['output_columns']['definition_coverage']['status']='partial'
     if mode=='changed_mapping':w['output_columns']['fields'][0]['source']['label']='Other'
     if mode=='changed_owner':w['port_context']['node']['tid']='foreign'
     if mode=='changed_port':w['port_context']['port']['tid']='foreign'
     if mode=='same_root':w['root_ref']='map1'
     if mode=='no_settle':r['trace']=[t for t in r['trace'] if t['event']!='output_port_finish_settled']
     if mode=='no_finish':r['trace']=[t for t in r['trace'] if t['event']!='output_port_finish_verified']
     if mode=='detached_change':w['output_columns']['auto_sync']['value']=False
     else:next(x for x in e['events'] if x['operation_id']==r['operation_id'])['outcome']=copy.deepcopy(r)
    self.assertFalse(v2.verify_output_port_roundtrip(e,'',o,owner,fixture.SCHEMA,d)['calculator_output_roundtrip_verified'],mode)

def joined_fixture():
 e,expected,old=fixture.aggregate_fixture();ops=copy.deepcopy(old['expression'])
 output=copy.deepcopy(next(t['result']['output']['wizard']['output_columns'] for t in e['tools'] if t['result']['operation_id']==ops['output_before']))
 removed={ops.pop('output_before'),ops.pop('output_after')};ops['sequence']=[x for x in ops['sequence'] if x not in removed]
 ids={t['tool_call_id'] for t in e['tools'] if t['result']['operation_id'] in removed}
 e['calls']=[c for c in e['calls'] if c['tool_call_id'] not in ids];e['tools']=[t for t in e['tools'] if t['tool_call_id'] not in ids];e['events']=[x for x in e['events'] if x.get('operation_id') not in removed]
 get=lambda op:next(t for t in e['tools'] if t['result']['operation_id']==op)
 done=get(ops['done']);prior=get(ops['options_apply'])
 for c in e['calls']+[done]:
  if c['tool_call_id']==done['tool_call_id']:c['arguments']['observation_id']=prior['result']['output']['observation_id']
 for tr in done['result']['trace']:
  if tr['event']=='wizard_step_verified':tr['from_stage']='calculator'
 next(v for v in e['events'] if v['operation_id']==ops['done'])['outcome']=copy.deepcopy(done['result'])
 owner=fixture.ce.semantic_owner(get(ops['definition_before'])['result']['output'])
 upstream=fixture.ce.semantic_owner(get(old['import_operations'][-1])['result']['output']);parent=owner['node']['tid'].rsplit('>',1)[0]
 oe,oo,_,_=output_fixture();tidmap={'root':owner['path'][0]['tid'],'root>w':parent,'root>w>up':upstream['node']['tid'],'root>w>up>s':upstream['path'][-1]['tid'],'root>w>n':owner['node']['tid'],'root>w>n>s':owner['path'][-1]['tid']}
 def remap(v):
  if isinstance(v,list):return [remap(x) for x in v]
  if isinstance(v,dict):return {k:remap(x) for k,x in v.items()}
  if isinstance(v,str):
   for key in sorted(tidmap,key=len,reverse=True):
    if v==key or v.startswith(key+'>'):return tidmap[key]+v[len(key):]
   if v.startswith('MF;TF-1;Graph;'):
    import re
    return 'MF;TF-1;Graph;'+re.sub(r'(?<![A-Za-z])(up|n)(?=[;|]|$)',lambda m:{'up':upstream['graph_key'],'n':owner['graph_key']}[m[0]],v[len('MF;TF-1;Graph;'):])
   return {'n':owner['graph_key'],'up':upstream['graph_key'],'Node':owner['node']['label']}.get(v,v)
  return v
 oe=remap(oe)
 for t in oe['tools']:
  if t['result']['output']['wizard'].get('stage')=='output_mapping':t['result']['output']['wizard']['output_columns']=copy.deepcopy(output)
 for ev,t in zip(oe['events'],oe['tools']):ev['outcome']=copy.deepcopy(t['result'])
 def emit(s,verb,ref,trace):
  n=max(t['row'] for t in e['tools'])+1;op='output-bridge-'+str(n);last=e['tools'][-1]['result']['output']
  call={'row':n,'session_id':'s','tool_call_id':op,'tool':'dock_ui_action','arguments':{'observation_id':last['observation_id'],'action':{'verb':verb,'ref':ref}}}
  if verb=='wizard_step':call['arguments']['action']['expected_stage']=s['wizard']['stage']
  s=copy.deepcopy(s);s['observation_id']=op+'obs';r={'status':'SUCCEEDED','cleanup_complete':True,'operation_id':op,'output':s,'trace':[{'event':'ui_preconditions_verified','verb':verb,'refs':[ref]},{'event':'ui_gesture_applied','verb':verb},trace]}
  e['calls'].append(call);e['tools'].append({**call,'row':n+1,'result':r});e['events'].append({'phase':'completed','operation_id':op,'outcome':copy.deepcopy(r)})
 d=copy.deepcopy(get(ops['done'])['result']['output']);d['wizard']['root_ref']=get(ops['options_cancel'])['result']['output']['wizard']['root_ref']
 emit(d,'wizard_step','next',{'event':'wizard_step_verified','from_stage':'calculator','to_stage':'done','root_ref':d['wizard']['root_ref'],'settings_applied':False})
 graph=oe['tools'][0]['result']['output'];emit(graph,'finish_wizard','finish',{'event':'wizard_finish_graph_verified','previous_owner':d['wizard']['owner_context']['node'],'label':owner['node']['label'],'node':{'node_label':owner['graph_key'],'part':'body'},'node_ref':owner['graph_key'],'reopen_required':True,'settings_readback_verified':False,'package_saved':False})
 offset=max(t['row'] for t in e['tools']);om={t['result']['operation_id']:'out-'+t['result']['operation_id'] for t in oe['tools']};obs={t['result']['output']['observation_id']:'out-'+t['result']['output']['observation_id'] for t in oe['tools']}
 for c in oe['calls']+oe['tools']:
  c['row']+=offset;c['tool_call_id']='out-'+c['tool_call_id']
  if 'observation_id' in c['arguments']:c['arguments']['observation_id']=obs.get(c['arguments']['observation_id'],c['arguments']['observation_id'])
 for t in oe['tools']:t['result']['operation_id']=om[t['result']['operation_id']];t['result']['output']['observation_id']=obs[t['result']['output']['observation_id']]
 for ev,t in zip(oe['events'],oe['tools']):ev['operation_id']=t['result']['operation_id'];ev['outcome']=copy.deepcopy(t['result'])
 for k in e:e[k].extend(oe[k])
 outops={k:[om[x] for x in v] if isinstance(v,list) else om[v] for k,v in oo.items()}
 return e,expected,{'import_operations':old['import_operations'],'input':old['port'],'node':ops,'output':outops}

class JoinedTests(unittest.TestCase):
 def test_native_joined_flow(self):
  e,x,c=joined_fixture();r=v2.verify_native_calculator(e,x,'',c,expected_source_path='/test/source.csv');self.assertTrue(r['calculator_expression_and_mappings'],r)

class JoinedRefusalTests(unittest.TestCase):
 def test_joined_rejects_missing_navigation_and_foreign_changes(self):
  for mode in ['missing_input_finish','missing_node_finish','missing_output_finish','wrong_import','extra_mutation','changed_bridge_owner','duplicate_output_op']:
   with self.subTest(mode=mode):
    e,x,c=joined_fixture()
    if mode=='wrong_import':c['import_operations']=['not-bound']
    elif mode=='extra_mutation':e['calls'].append({'row':e['tools'][-5]['row']+1,'session_id':'s','tool_call_id':'extra','tool':'dock_action_run','arguments':{}})
    elif mode=='duplicate_output_op':c['output']['after']=c['output']['before']
    else:
     candidates=[t for t in e['tools'] if any(q.get('event')=={'missing_input_finish':'input_port_finish_verified','missing_node_finish':'wizard_finish_graph_verified','missing_output_finish':'output_port_finish_verified','changed_bridge_owner':'wizard_step_verified'}[mode] for q in t['result'].get('trace',[]))]
     t=candidates[-1];op=t['result']['operation_id']
     if mode=='changed_bridge_owner':t['result']['output']['wizard']['owner_context']['node']['tid']='foreign';next(z for z in e['events'] if z['operation_id']==op)['outcome']=copy.deepcopy(t['result'])
     else:e['calls']=[z for z in e['calls'] if z['tool_call_id']!=t['tool_call_id']]
    self.assertFalse(v2.verify_native_calculator(e,x,'',c,expected_source_path='/test/source.csv')['calculator_expression_and_mappings'],mode)

def scaffold_fixture():
 e,x,c=joined_fixture();j=v2.Journal(e,'');source=j.get(c['import_operations'][-1]);up=v2.semantic_owner(source['outcome']['output']);owner=v2.semantic_owner(j.get(c['node']['definition_before'])['outcome']['output'])
 for t in e['tools']:
  s=t['result']['output']
  if s.get('wizard',{}).get('status')=='absent' and 'nodes' in s:
   s['ui'].setdefault('truncated',{})['nodes']=False
   for n,o in zip(s['nodes'],[up,owner]):n['node_ref']={'kind':'node','node_label':o['graph_key'],'workflow_ref':s['workflow_ref']}
 for ev,t in zip(e['events'],e['tools']):ev['outcome']=copy.deepcopy(t['result'])
 boundary=next(t['row']-1 for t in e['tools'] if t['result']['operation_id']==c['input']['before'][0])
 for z in e['calls']+e['tools']:
  if z['row']>=boundary:z['row']+=10
  z['row']+=10
 after=next(t for t in e['tools'] if t['result']['operation_id']==c['input']['before'][0]);before=max((t for t in e['tools'] if t['row']<after['row']),key=lambda t:t['row'])
 wf=before['result']['output']['workflow_ref'];node=lambda o:{'kind':'node','node_label':o['graph_key'],'workflow_ref':wf}
 p={'source_node':node(up),'target_node':node(owner),'source_port':{'kind':'data','index':0},'target_port':{'kind':'data','index':0}}
 op='scaffold-link';call={'row':boundary+10,'session_id':'s','tool_call_id':op,'tool':'dock_action_run','arguments':{'action_key':'link.create','operation_id':op,'parameters':p}}
 link=before['result']['output']['links'][0];out={'status':'SUCCEEDED','cleanup_complete':True,'phase':'verified','action_key':'link.create','action_revision':'2','operation_id':op,'output':{'link_ref':{'kind':'link','tid':link},'reconciled':True}}
 e['calls'].append(call);e['tools'].append({**call,'row':call['row']+1,'result':out})
 cp={'workflow_ref':wf,'source_tid':'MF;TF-1;Graph;'+up['graph_key']+';Output_Data-0','target_tid':'MF;TF-1;Graph;'+owner['graph_key']+';Input_Data-0'}
 ev={'operation_id':op,'session_id':'native-s','action_key':'link.create','action_revision':'2','runtime_revision':'runtime','manifest_sha256':'manifest','parameters':p,'checkpoint':cp}
 e['events'] += [{**ev,'phase':'prepared'},{**ev,'phase':'completed','outcome':copy.deepcopy(out)}]
 state={'created_draft':True};prep={'row':1,'session_id':'s','tool_call_id':'prep','tool':'dock_prepare','arguments':{}}
 e['calls'].append(prep);e['tools'].append({**prep,'row':2,'result':{'prepared':True,'sessionId':'native-s','workspace':state}});e['events'].append({'event':'workspace_prepared','session_id':'native-s','state':state})
 e['calls'].sort(key=lambda z:z['row']);e['tools'].sort(key=lambda z:z['row'])
 return e,x,c,call

class ScaffoldTests(unittest.TestCase):
 def test_ready_link_bridge_does_not_change_import_settings(self):
  e,x,c,_=scaffold_fixture();r=v2.verify_native_calculator(e,x,'',c,expected_source_path='/test/source.csv');self.assertTrue(r['calculator_expression_and_mappings'],r)
 def test_scaffold_rejects_foreign_unbound_or_different_actions(self):
  for mode in ['other_action','other_target','other_port','foreign_journal','changed_journal','missing_prepared','duplicate_completed','missing_prepare','bad_cleanup']:
   with self.subTest(mode=mode):
    e,x,c,call=scaffold_fixture();op=call['arguments']['operation_id'];records=[z for z in e['events'] if z.get('operation_id')==op]
    if mode=='other_action':call['arguments']['action_key']='node.add'
    if mode=='other_target':call['arguments']['parameters']['target_node']['node_label']='other'
    if mode=='other_port':call['arguments']['parameters']['source_port']['index']=1
    if mode=='foreign_journal':records[-1]['session_id']='other'
    if mode=='changed_journal':records[-1]['outcome']['output']['link_ref']['tid']='other'
    if mode=='missing_prepared':e['events'].remove(records[0])
    if mode=='duplicate_completed':e['events'].append(copy.deepcopy(records[-1]))
    if mode=='missing_prepare':e['calls']=[z for z in e['calls'] if z['tool']!='dock_prepare']
    if mode=='bad_cleanup':next(t for t in e['tools'] if t['tool_call_id']==op)['result']['cleanup_complete']=False
    self.assertFalse(v2.verify_native_calculator(e,x,'',c,expected_source_path='/test/source.csv')['calculator_expression_and_mappings'],mode)

class SelectionTests(unittest.TestCase):
 def test_selects_real_chain_without_supplied_manifest(self):
  e,x,c=joined_fixture();r=v2.diagnose(e,x,'',expected_source_path='/test/source.csv');self.assertTrue(r['calculator_expression_and_mappings'],r)
 def test_scaffold_selection(self):
  e,x,c,_=scaffold_fixture();r=v2.diagnose(e,x,'',expected_source_path='/test/source.csv');self.assertTrue(r['calculator_expression_and_mappings'],r)
 def test_bound_failure_is_not_acceptance(self):
  e,x,c=joined_fixture()
  for kw in [{'limit':1},{'limit':0},{'import_operations':['foreign']},{'expected_source_path':'/other.csv'}]:
   with self.subTest(kw=kw):
    r=v2.diagnose(e,x,'',**{'expected_source_path':'/test/source.csv',**kw});self.assertFalse(r['calculator_expression_and_mappings'],r)
 def test_transfer_and_pinned_fixture_cannot_be_asserted_by_model(self):
  e,x,c=joined_fixture()
  for value in [False,True,'true',1]:
   r=v2.audit_gate(e,{},'',x,transfer_verified=value);self.assertFalse(r['calculator_expression_and_mappings'],r)

def admission_fixture():
    import test_data_pipeline as dpt
    from audit import PREFIX
    import data_pipeline
    base,request=dpt.DataPipelineTest().wizard_fixture()
    old_import_ops={t['result']['operation_id'] for t in base['tools'] if t['row']>=20}
    base['calls']=[c for c in base['calls'] if c['row']<20];base['tools']=[t for t in base['tools'] if t['row']<20]
    base['events']=[event for event in base['events'] if event.get('operation_id') not in old_import_ops]
    combined,expected,_=joined_fixture();destination=data_pipeline.declared_source_path(request)
    for t in combined['tools']:
        source=t['result']['output'].get('wizard',{}).get('import_source',{}).get('fields',{}).get('source_path')
        if source:source.update(value=destination,value_length_utf16=len(destination))
    for event,t in zip(combined['events'],combined['tools']):event['outcome']=copy.deepcopy(t['result'])
    for row in combined['calls']+combined['tools']:
        row['row']+=20;row['tool']=PREFIX+row['tool'];row['tool_call_id']='aggregate-'+row['tool_call_id']
    for key in base:base[key].extend(combined[key])
    return base,request,expected,PREFIX


class AdmissionTests(unittest.TestCase):
    def test_transfer_pinned_fixture_and_exact_import_anchor(self):
        e,request,expected,prefix=admission_fixture()
        r=v2.audit_gate(e,request,prefix,expected,transfer_verified=True)
        self.assertTrue(r['calculator_expression_and_mappings'],r)
        self.assertEqual(r['transfer_bound_import_operations'],r['roundtrips'][0]['import_operations'])
        self.assertFalse(r['package_persistence_verified'])

    def test_missing_transfer_hash_or_wrong_import_destination_cannot_admit(self):
        for mode in ('transfer','expected_hash','csv_hash','destination','unbound_file_observation'):
            with self.subTest(mode=mode):
                e,request,expected,prefix=admission_fixture()
                if mode=='expected_hash':request['harness_inputs']['fixtures/data-pipeline/expected.json']='0'*64
                if mode=='csv_hash':request['harness_inputs']['fixtures/upload-probe/probe.csv']='0'*64
                if mode=='destination':request['storage_directory']='/other'
                if mode=='unbound_file_observation':e['calls']=[c for c in e['calls'] if c['tool_call_id']!='file-read']
                if mode=='csv_hash':
                    import upload_probe
                    request['harness_inputs'][upload_probe.FIXTURE]='0'*64
                self.assertFalse(v2.audit_gate(e,request,prefix,expected,transfer_verified=mode!='transfer')['calculator_expression_and_mappings'])


class IntegratedGateTests(unittest.TestCase):
 def test_pipeline_admits_only_independently_proved_calculator(self):
  import data_pipeline
  from audit import MUTATIONS,file_storage_inspect,rejected_before_browser
  e,request,expected,prefix=admission_fixture()
  report=data_pipeline.audit(e,[],request,prefix,MUTATIONS,file_storage_inspect,rejected_before_browser)
  self.assertTrue(report['transfer_verified'])
  self.assertTrue(report['wizard_settings_readback_diagnostics']['wizard_settings_readback'])
  self.assertTrue(report['calculator_settings_diagnostics']['calculator_expression_and_mappings'],report['calculator_settings_diagnostics'])
  self.assertFalse(report['all_assertions_passed'])
  self.assertEqual(report['missing_domain_verifiers'],list(data_pipeline.DOMAIN_GATES[2:]))

class ParameterButtonTests(unittest.TestCase):
 def test_exact_native_parameter_button_and_foreign_button_refusal(self):
  for mode in ['native','foreign_button','changed_definition']:
   with self.subTest(mode=mode):
    e,ops=node_fixture()
    for key in ['options_before','options_after']:
     target=next(t for t in e['tools'] if t['result']['operation_id']==ops[key]);call=next(c for c in e['calls'] if c['tool_call_id']==target['tool_call_id'])
     prior=max((t for t in e['tools'] if t['row']<call['row']),key=lambda t:t['row'])
     element=next(x for x in prior['result']['output']['ui']['elements'] if x.get('ref')==call['arguments']['action']['ref'])
     element.update(tid='MF;TF-1;WizrdMCF;CalcDataWizard;'+('btnDelete' if mode=='foreign_button' else 'btnExprEdit'),allowed_actions=['click'])
     if mode=='changed_definition':prior['result']['output']['wizard']['calculator_expressions']['selected_replacement']['value']=True
     for c in [call,target]:c['arguments']['action'].update(verb='click');c['arguments']['action'].pop('key',None)
     for trace in target['result']['trace']:
      if trace.get('verb')=='press':trace['verb']='click'
    for event,t in zip(e['events'],e['tools']):event['outcome']=copy.deepcopy(t['result'])
    r=v2.verify_node_roundtrip(e,'',ops,fixture.old.EXPECTED,fixture.SCHEMA)
    self.assertEqual(r['calculator_node_roundtrip_verified'],mode=='native',r)
