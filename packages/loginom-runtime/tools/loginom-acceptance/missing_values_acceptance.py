"""Fail-closed full-goal audit. Native reopen/full rows are mandatory separate input.
Never infer acceptance from process exit, an old diagnostic 3x5, or a path alone.
"""
import argparse,copy,hashlib,json,re
from pathlib import Path
from evidence import PREFIX,KNOWLEDGE_TOOLS
from user_result_evidence import normalize_user_evidence
from prepare_binding import verified_prepare_v1
from grouping_node_acceptance import model_completed
from node_public_acceptance_evidence import verify_public_nodes_and_saves,verify_public_delivery
from artifact_delivery_evidence import verify_delivered_import_output,verify_delivered_existing_import_output
from node_configuration_evidence import verify_configuration_readback
from node_procedure_evidence import verify_internal_sequence
from calculator_output_evidence import verify_calculator_output
from missing_values_contract import audit_missing_values
from missing_values_goal import CASES,FILES,WORK,PIN,MANIFEST_URI,expected,fixtures,prompt,descriptors
from preflight import runtime_pin
from missing_values_refusals import classify

def unique(xs):
 if len(xs)!=1:raise ValueError('unique evidence required')
 return xs[0]
def result(events,r):return unique([e['result'] for e in events if e.get('phase')=='node_checkpoint' and e.get('operation_id')==r['operation_id']])
def phase(events,r,p):
 receipt=unique([e['receipt'] for e in events if e.get('phase')=='node_phase_completed' and e.get('operation_id')==r['operation_id'] and e['receipt']['phase']==p])
 if receipt['status']!='verified' or receipt['receipt_id']!=r['operation_id']+':'+p or receipt['value']['verified'] is not True or receipt['value']['cleanup_complete'] is not True:raise ValueError('Unverified phase')
 return receipt['value']
def configuration(events,r,res,goal):
 try:
  seq=verify_internal_sequence(events,r['operation_id'],max_steps=4096)
  assert not seq['failures']
  c=phase(events,r,'configure')['configuration'];rb=res['configuration']['readback'];node=res['node']
  assert c['verified'] and c['inventory_complete'] and any(s.get('node_missing_values')==c for _,s in seq['observations'])
  assert c['node_context']['verified'] is True and all(c['node_context'][k]==node[k] for k in ('document_id','workflow_id','node_id'))
  assert rb['kind']=='missing_values' and rb['node']==node and rb['ordered'] is False and rb['max_nulls_percent']==c['max_nulls_percent']==goal['max_nulls_percent']
  assert c['ordered'] is False and all(v['switch_pressed'] is False for v in c['options'].values()) and c['options']['pedUseQuality']['value'] is False
  fields=[{k:f[k] for k in ('name','label','type','data_kind','used')}|({k:f[k] for k in (('method','value') if f['method']=='constant' else ('method',))} if f['used'] else {}) for f in c['fields']]
  assert fields==rb['fields'] and len(fields)==len(goal['schema'])
  for f,s in zip(fields,goal['schema']):
   assert all(f[k]==v for k,v in s.items()) and f['used'] is (f['name'] in goal['fields'])
   if f['used']:assert all(f[k]==v for k,v in goal['fields'][f['name']].items())
  assert phase(events,r,'configure')['validation']['status']=='accepted_by_loginom_next'
  assert all(phase(events,r,p)['settings_applied'] is True and all(phase(events,r,p)['node_context'][k]==node[k] for k in ('document_id','workflow_id','node_id')) for p in ('node_finish','finish'))
  assert rb['scope']=='observed_before_verified_finish' and rb['values_are']=='observed_ui_values'
  assert rb['receipt_ids']==[r['operation_id']+':'+p for p in ('input_mapping','configure','node_finish','output_mapping','finish')]
  assert all(phase(events,r,p)['finish']['settings_applied'] for p in ('input_mapping','output_mapping'))
  for key in ('input_mapping','output_mapping'):
   m=rb[key];native=phase(events,r,key)['native_mapping'];assert native['verified'] and native['inventory_complete'] and native['source_identity_verified'] and all(native['node_context'][k]==node[k] for k in ('document_id','workflow_id','node_id'))
   assert m['port']==0 and m['autosync'] is False and native['autosync'] is False
   assert len(native['target_fields'])==len(m['fields']) and all(all(a.get(k)==b.get(k) for k in ('name','label','type','data_kind')) and a['source']['name']==b['source_name'] and any(s['record_id']==a['source']['record_id'] and s['field_id']==a['source']['field_id'] for s in native['source_fields']) for a,b in zip(native['target_fields'],m['fields']))
   assert len(m['fields'])==5 and all(all(f[k]==v for k,v in s.items()) and f['source_name']==s['name'] and not f.get('excluded',False) for f,s in zip(m['fields'],goal['schema']))
  return True
 except (KeyError,TypeError,ValueError,AssertionError,IndexError):return False

def session_binding(prepared,metadata,events,geometry,precheck):
 try:
  sid=prepared['sessionId'];active=unique([m for m in metadata if m['sessionId']==sid])
  assert active['workspaceReady'] is True and active['clientRevision']==PIN
  assert all(e.get('session_id')==sid for e in events)
  assert precheck['available'] is True and precheck['scope']=='MCP initialize/list_tools only; no model, prepare or browser actions'
  for m in metadata:
   if m['sessionId']!=sid:assert m['workspaceReady'] is False and m['archiveActive'] is False and m['targetIdentity'] is None and not any(e.get('session_id')==m['sessionId'] for e in events)
  w=geometry['geometry']['window'];assert geometry['session_id']==sid and geometry['document_id']==prepared['workspace']['document_id'] and geometry['runtime_revision']==PIN
  assert geometry['geometry']['viewport'] is None and w['width']==w['outerWidth'] and w['width']>=.9*w['availableWidth'] and w['outerHeight']>=.9*w['availableHeight']
  return True
 except (KeyError,TypeError,ValueError,AssertionError):return False

def checkpoint_save(events,path,revision,last_node,node_labels):
 try:
  keys=('package.save_checkpoint','package.save_as');starts=[(i,e) for i,e in enumerate(events) if e.get('phase')=='prepared' and e.get('action_key') in keys];ends=[(i,e) for i,e in enumerate(events) if e.get('phase')=='completed' and e.get('action_key') in keys]
  si,s=unique(starts);ei,e=unique(ends);last=unique([i for i,x in enumerate(events) if x.get('phase')=='node_checkpoint' and x.get('operation_id')==last_node])
  assert last<si<ei and s['action_key']==e['action_key']=='package.save_checkpoint' and s['operation_id']==e['operation_id'] and s['action_revision']==e['action_revision']==revision
  assert s['parameters']==e['parameters']==dict(path=path,conflict_policy='fail') and s['checkpoint']==e['checkpoint']
  native_labels={re.sub(r'\s','_',n).replace(',','') for n in node_labels}
  assert set(s['checkpoint']['graph']['nodes'])==native_labels and len(s['checkpoint']['graph']['nodes'])==len(native_labels)
  o=e['outcome'];out=o['output'];assert o['status']=='SUCCEEDED' and o['cleanup_complete'] is True and o['error'] is None and out['save_completed'] is True and out['workflow_preserved'] is True and out['reopened'] is False and out['persisted_content_verified'] is False and out['package_ref']['path']==path
  names=['save_requested','save_flow_completed','open_saved_package_observed','postcondition_verified'];trace=o['trace'];positions=[unique([i for i,t in enumerate(trace) if t['event']==n]) for n in names];assert positions==sorted(positions)
  post=trace[positions[-1]];observed=trace[positions[-2]];assert post['proof']=='awaited_save_flow_same_open_workflow' and post['package_path']==path and post['graph']==s['checkpoint']['graph'] and observed['actual_path']==observed['requested_path']==path and observed['path_matches'] and observed['graph_matches'] and observed['workflow_matches']
  assert not any(t['event'] in ('saved_package_closed','reopened_package_observed') for t in trace)
  return e['operation_id']
 except (KeyError,TypeError,ValueError,AssertionError,IndexError):return None

def raw_table_binding(table,raw):
 from decimal import Decimal
 try:
  assert raw['binding']['node']==table['node'] and raw['first']['verified'] and raw['first']['table']['port_guid']==table['port_guid'] and raw['first']['table']==table['table']
  assert raw['first']['row_total']==table['row_count']==len(raw['rows'])==len(table['rows'])
  assert len({r['record_id'] for r in raw['rows']})==len(raw['rows'])
  for i,(r,row) in enumerate(zip(raw['rows'],table['rows'])):
   assert r['index']==i and len(r['cells'])==len(row)==len(table['schema'])
   for j,(cell,value) in enumerate(zip(r['cells'],row)):
    assert cell['column']==j and cell['is_null'] is value['is_null']
    if cell['is_null']:assert cell['text'] is None and value['value'] is None
    elif value['type']=='string':assert cell['text']==value['value']
    else:assert Decimal(cell['text'].replace(',','.').replace(' ','').replace('\u00a0',''))==Decimal(str(value.get('decimal',value['value'])))
  return True
 except (KeyError,TypeError,ValueError,AssertionError,ArithmeticError):return False

def full_goal_passed(checks):
 # Explicit mandatory gates cannot disappear through a partial/empty report.
 required={'exact_operations','final_results_count','saved_exact_links','final_native_checkpoint','public_calls','public_projection','terminal_refusal_accounting','frozen','model','independent_reopen_present','reopened_package'}
 return required.issubset(checks) and all(c['passed'] for c in checks.values()) and all(sum(k.startswith(prefix) for k in checks)==12 for prefix in ('full_persisted:','raw_full_rows:','saved_configuration:','saved_connection:','unchanged_request:'))

def audit(run,candidate,reopen=None):
 checks={};put=lambda k,v:checks.update({k:dict(passed=bool(v))})
 def add(k,v):checks[k]=v
 try:
  req=json.loads((run/'request.json').read_text());original=json.loads((run/'evidence.json').read_text())
  partition=classify(original,runtime_revision=PIN,manifest_sha256=req['manifest_sha256']);add('terminal_refusal_accounting',partition)
  if not partition['passed']:raise ValueError('Unproved prepared operation or refusal')
  terminal={k:v['outcome'] for k,v in partition['refusals'].items()}
  ev,projection=normalize_user_evidence(original,terminal_outcomes=terminal);add('public_projection',projection)
  fixtures();manifest=json.loads((candidate/'manifest.json').read_text());actions=json.loads((candidate/'actions.json').read_text());uri=MANIFEST_URI;digest=hashlib.sha256((candidate/'manifest.json').read_bytes()).hexdigest()
  put('candidate_identity',req['manifest_uri']==uri and req['manifest_sha256']==digest and manifest['catalog_version']==uri.split('/')[-2] and manifest['status']=='candidate' and manifest['e2e_commit']=='2cad5602158fd2e4836d821d644a2b8d92f571a2' and manifest['compatibility']==dict(profile_id='loginom-7.4.2-macos-chromium-ru',loginom_build='7.4.2',platform='macos',browser='chromium'))
  stage=json.loads((candidate/'stage-report.json').read_text());put('staged_readback',stage['staged'] is True and stage['activated'] is False and stage['manifest_sha256']==digest and stage['catalog_uri']+'/manifest.json'==uri)
  put('candidate_bytes',all(hashlib.sha256((candidate/n).read_bytes()).hexdigest()==h for n,h in manifest['files'].items()))
  saves={a['action_key']:a for a in actions['actions'] if a['action_key'] in ('package.save_checkpoint','package.save_as')};put('save_roots',set(saves)=={'package.save_checkpoint','package.save_as'} and all(a['effect']['allowed_roots']==['/test-4'] for a in saves.values()))
  goal=WORK/'goals/missing-values-complete.txt';put('natural_goal',req['goal_id']=='missing-values-complete' and req['goal_sha256']==hashlib.sha256(goal.read_bytes()).hexdigest() and (run/'scenario.txt').read_text()==prompt(goal.read_text(),req['package_path'],req['storage_directory'],req['run_id']))
  put('model',model_completed(req,ev) and req['provider']=='openai-codex' and req['model']=='gpt-5.6-sol' and req['reasoning_effort']=='low' and req['fault_injection'] is False)
  put('frozen',ev['export_complete'] and ev['runtime_source_unchanged'] and ev['harness_unchanged'] and ev['native_skill_unchanged'] and req['runtime_source_pin']['client_revision']==PIN and runtime_pin(WORK.parents[1])==req['runtime_source_pin'] and all(hashlib.sha256((WORK/n).read_bytes()).hexdigest()==h for n,h in req['harness_inputs'].items()))
  put('artifacts',req['input_artifacts']==descriptors(req['run_id'],'/test-4'))
  events=ev['events'];all_requests=[e['request'] for e in events if e.get('phase')=='node_apply_prepared']
  requests=[r for r in all_requests if r['operation_id'] in partition['successful']];results={r['operation_id']:result(events,r) for r in requests}
  caller=ev['calls'][0]['session_id'];first=min(c['row'] for c in ev['calls'] if c['tool'] in (PREFIX+'dock_artifact_deliver',PREFIX+'dock_node_apply'))
  prepared=verified_prepare_v1(ev,PREFIX,caller,first);put('prepare',prepared is not None)
  if prepared is None:raise ValueError('No bound preparation')
  metadata=[json.loads(p.read_text()) for p in (run/'private/dock-state/sessions').glob('*/session.json')]
  geometry=json.loads((run/('geometry-'+prepared['sessionId']+'.json')).read_text());put('working_session_and_geometry',session_binding(prepared,metadata,events,geometry,json.loads((run/'tool-precheck.json').read_text())))
  put('event_pins',all(e.get('manifest_sha256')==digest and e.get('runtime_revision')==PIN for e in events))
  allowed=KNOWLEDGE_TOOLS|{PREFIX+n for n in ('dock_prepare','dock_action_describe','dock_workspace_observe','dock_diagnostics','dock_operation_inspect','dock_node_apply','dock_node_status','dock_node_wait','dock_node_resume','dock_node_cancel','dock_node_stop','dock_operation_recover','dock_artifact_deliver','dock_artifact_delivery_status','dock_artifact_delivery_resume','dock_action_run')}
  put('no_ui_or_other_tools',all(c['tool'] in allowed for c in ev['calls']))
  by_node={};imports={};source_versions={};missing=[]
  for r in requests:
   res=results[r['operation_id']];node=res['node'];key=node['node_id'];label=r['target'].get('label') or by_node.get(key)
   if r['target']['kind']=='new':
    if key in by_node or label in by_node.values():raise ValueError('Duplicate new node')
    by_node[key]=label
   elif r['target']['ref']!=node or key not in by_node:raise ValueError('Unbound existing node')
   if r['target']['type']=='imports.text':
    file=unique([n for n,a in zip(FILES,req['input_artifacts']) if r['parameters'].get('settings',{}).get('source',{}).get('source_path')=='/test-4/'+a['name']])
    schema=expected(dict(fixture=file,threshold=100,value='MISSING'))['schema'];settings=r['parameters']['settings'];put('source_schema:'+r['operation_id'],[{k:c[k] for k in ('name','label','type','data_kind')} for c in settings['columns']]==schema and all(c['used'] for c in settings['columns']) and r['finish']=='execute')
    add('source_readback:'+r['operation_id'],verify_configuration_readback(events,r))
    delivery_id=r['parameters']['source']['upload_operation_id'].removesuffix(':upload');calls=[c for c in ev['calls'] if c['tool'] not in (PREFIX+'dock_artifact_deliver',PREFIX+'dock_artifact_delivery_status') or c['arguments'].get('operation_id')==delivery_id];ids={(c['session_id'],c['tool_call_id']) for c in calls}
    delivery=verify_public_delivery(dict(ev,calls=calls,tools=[t for t in ev['tools'] if (t['session_id'],t['tool_call_id']) in ids]),r,prepared);add('delivery:'+r['operation_id'],delivery)
    if delivery['passed']:
     body=(WORK/'fixtures/missing-values'/file).read_bytes()
     if r['target']['kind']=='existing':
      proof=verify_delivered_existing_import_output(events,imports[label],r,body,delivery['delivery'],PIN,
       seed_source_bytes=(WORK/'fixtures/missing-values'/source_versions[key]).read_bytes())
     else:proof=verify_delivered_import_output(events,r,body,delivery['delivery'],PIN)
     add('source_bytes:'+r['operation_id'],proof)
    imports[label]=r;source_versions[key]=file
   elif r['target']['type']=='preprocessing.data_recovery':missing.append((r,res,label,copy.deepcopy(imports),copy.deepcopy(source_versions)))
   else:raise ValueError('Unexpected node type')
  expected_order=[(c,'execute') for c in CASES];core=CASES[1];expected_order[2:2]=[(core,'done'),(dict(core,value='DISCARD_ME'),'close'),(core,'preserve')]
  put('exact_operations',len(requests)==27 and len(all_requests)==27+partition['refusal_count'] and len(missing)==len(expected_order) and len(imports)==9)
  if len(missing)!=len(expected_order):raise ValueError('Incomplete case matrix')
  final={};seen_executions=set()
  for (r,res,label,imps,versions),(case,mode) in zip(missing,expected_order):
   wanted=expected(case);source=results[imps[case['source']]['operation_id']];tag=case['id']+':'+mode
   put('intent:'+tag,label==case['label'] and versions[source['node']['node_id']]==case['fixture'] and r['mode']=='impute' and r['finish']==('execute' if mode=='preserve' else mode) and (not case['existing'] or r['target']['kind']=='existing'))
   if r['target']['kind']=='new':put('connection:'+tag,r['inputs']==[dict(source=source['node'],output=0,input=0)])
   else:put('unchanged_connection:'+tag,r['inputs']==[])
   if mode=='close':
    put('declared_discard',any(f.get('field',{}).get('name')=='Note' and f.get('value')=='DISCARD_ME' for f in r['parameters']['fields']))
    seq=verify_internal_sequence(events,r['operation_id'],max_steps=4096);put('close',not seq['failures'] and res['configuration']['status']=='discarded' and res['execution']['status']=='not_requested' and res['output']['status']=='not_refreshed' and not any(a.get('verb') in ('execute_graph_node','execute_wizard') for _,a,_ in seq['mutations']));continue
   put('configuration:'+tag,configuration(events,r,res,wanted))
   if mode=='done':put('done_no_execution',res['execution']['status']=='not_requested' and res['output']['status']=='not_refreshed');continue
   if mode=='preserve' or case['id']=='source-after':put('preserve:'+tag,r['parameters']=={} and r['inputs']==[] and r['mappings']==[])
   execution=res['execution']['execution_id'];put('fresh:'+tag,execution not in seen_executions);seen_executions.add(execution)
   add('observed_output:'+tag,verify_calculator_output(events,r,wanted['schema'],wanted['rows']))
   if case['final']:final[label]=dict(case=case,request=r,result=res,source_request=imps[case['source']],source_result=source)
  put('final_results_count',len(final)==12)
  labels=set(by_node.values());save_graph=unique([e['checkpoint']['graph'] for e in events if e.get('phase')=='prepared' and e.get('action_key')=='package.save_checkpoint'])
  native=lambda n:re.sub(r'\s','_',n).replace(',','')
  put('saved_exact_links',sorted(save_graph['links'])==sorted(native(c['source'])+'|Output_Data[0]|'+native(c['label'])+'|Input_Data[0]' for c in CASES if c['final']))
  save=checkpoint_save(events,req['package_path'],saves['package.save_checkpoint']['revision'],requests[-1]['operation_id'],labels);put('final_native_checkpoint',save is not None)
  add('public_calls',verify_public_nodes_and_saves(ev,{r['operation_id']:r for r in all_requests},[save] if save else [],terminal_outcomes=terminal))
  # This plan is input to the separate operator reader, not an acceptance verdict.
  plan=dict(package_path=req['package_path'],old_document_id=prepared['workspace']['document_id'],working_session=prepared['sessionId'],runtime_revision=PIN,manifest_uri=uri,manifest_sha256=digest,final=final)
  put('independent_reopen_present',reopen is not None)
  if reopen is not None:
   post=json.loads((reopen/'index.json').read_text());put('reopened_package',post['prepare']['status']=='READY' and post['prepare']['target_verified'] is True and post['prepare']['created_draft'] is False and post['prepare']['package_ref']['path']==req['package_path'] and post['prepare']['document_id']!=plan['old_document_id'] and post['runtime_revision']==PIN and post['manifest_sha256']==digest and set(post['results'])==set(final))
   for label,before in final.items():
    item=post['results'][label];r=item['request'];res=item['result'];node=res['node'];wanted=expected(before['case']);source_node=dict(node,node_id=before['source_result']['node']['node_id']);inspection=item['source_inspection'];after=item['source_after'];settings=before['source_request']['parameters']['settings']
    good=(inspection['verified'] and inspection['node']==source_node and inspection['source']==dict(source_path=settings['source']['source_path'],encoding='UTF-8 (65001)',rows_to_skip='0',first_line_as_title=True) and inspection['format']==dict(delimiter='Точка с запятой',decimal_separator='Точка (.)',null_marker='NULL',text_qualifier='Двойная кавычка (")') and inspection['columns']==[{k:c[k] for k in ('name','label','type','data_kind','used')} for c in settings['columns']] and inspection['settings_applied'] is False and inspection['cancelled']['draft_discarded'] and inspection['cancelled']['settings_applied'] is False)
    source=dict(verified=bool(good),sha256=wanted['source_sha256'],node=source_node,destination=settings['source']['source_path'],execution_id=None,integrity_scope='prior_verified_upload',dependency_reexecution=dict(before=inspection['after_cancel'],after=after,target_execution_id=res['execution']['execution_id']))
    declaration=dict(wanted,operation_id=r['operation_id'],node=node,source_node=source_node,source_path=source['destination'],source_dependency_reexecution=True,previous_execution_ids=list(seen_executions))
    add('full_persisted:'+label,audit_missing_values(declaration,res,item['table'],source))
    put('raw_full_rows:'+label,raw_table_binding(item['table'],item['raw_table']))
    put('unchanged_request:'+label,r['parameters']=={} and r['inputs']==[] and r['mappings']==[] and r['finish']=='execute' and r['target']['ref']==node and node['node_id']==before['result']['node']['node_id'] and node['document_id']==post['prepare']['document_id'])
    graph=item['graph'];put('saved_connection:'+label,graph['verified'] and graph['read_only'] and graph['package_path']==req['package_path'] and len(graph['links'])==1 and graph['links'][0]['source']['node_id']==source_node['node_id'] and graph['links'][0]['target']['node_id']==node['node_id'])
    postevents=[json.loads(l) for l in (reopen/'execution-events.jsonl').read_text().splitlines()];put('saved_configuration:'+label,configuration(postevents,r,res,wanted))
  return dict(passed=full_goal_passed(checks),checks=checks,reopen_plan=plan,scope='full_missing_values_goal',source_bytes_reverified_after_reopen=False)
 except (KeyError,TypeError,ValueError,IndexError,AssertionError,FileNotFoundError) as error:
  checks['incomplete_evidence']=dict(passed=False,error=str(error));return dict(passed=False,checks=checks,scope='full_missing_values_goal')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--run-dir',required=True,type=Path);p.add_argument('--candidate',required=True,type=Path);p.add_argument('--reopen-dir',type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args();report=audit(a.run_dir,a.candidate,a.reopen_dir)
 with a.output.open('x') as f:json.dump(report,f,ensure_ascii=False,indent=2);f.write('\n')
 print(json.dumps(dict(passed=report['passed'],failed=[k for k,v in report['checks'].items() if not v['passed']])));raise SystemExit(0 if report['passed'] else 1)
