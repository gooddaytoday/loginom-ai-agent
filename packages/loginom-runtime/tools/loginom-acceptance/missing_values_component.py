"""Operator component evidence gate. Never establishes model/full-goal acceptance."""
import argparse,json
from pathlib import Path
from missing_values_acceptance import configuration,result,checkpoint_save,unique
from missing_values_goal import PIN,MANIFEST_URI,expected
from calculator_output_evidence import verify_calculator_output
from node_configuration_evidence import verify_configuration_readback

def component(run):
 run=Path(run);req=json.loads((run/'request.json').read_text())
 def response(name):
  r=json.loads((run/(name+'.json')).read_text())['response'];return r.get('structuredContent') or json.loads(r['content'][0]['text'])
 def request(name):return json.loads((run/(name+'.json')).read_text())['request']['arguments']
 assert req['scope']=='native_component_diagnostic' and req['model_started'] is False and req['fault_injection'] is False
 prepared=response('prepare');w=prepared['workspace'];sid=prepared['sessionId'];directory=run/'dock/sessions'/sid
 events=[json.loads(l) for l in (directory/'execution-events.jsonl').read_text().splitlines()];metadata=json.loads((directory/'session.json').read_text())
 assert w['status']=='READY' and w['target_verified'] is True and w['ownership_verified'] is True and metadata['clientRevision']==PIN
 digest=prepared['executor']['session_manifest']['actionManifestDigest'];assert prepared['executor']['session_manifest']['catalogLifecycleStatus']=='candidate'
 assert all(e.get('session_id')==sid and e.get('runtime_revision')==PIN and e.get('manifest_sha256')==digest for e in events)
 geo=json.loads((run/('geometry-'+sid+'.json')).read_text());g=geo['geometry'];assert geo['document_id']==w['document_id'] and geo['runtime_revision']==PIN and g['viewport'] is None and g['window']['width']==g['window']['outerWidth'] and g['window']['outerHeight']>=g['window']['availableHeight']*.9
 seen=set();final={};checks={}
 for key,file in [('core','core.csv'),('changed','changed.csv'),('one-in-120','one-in-120.csv')]:
  r=request('import-'+key);res=result(events,r);assert res['status']=='SUCCEEDED'
  proof=verify_configuration_readback(events,r);assert proof['passed'],proof
  delivered=response('deliver-'+key);artifact=unique([a for a in prepared['input_artifacts'] if a['artifact_id']==r['parameters']['source']['artifact_id']]);d=delivered['outcome']
  assert delivered['state']=='settled' and d['status']=='SUCCEEDED' and d['cleanup_complete'] and d['upload_completion_verified'] and d['bytes']==artifact['bytes'] and d['sha256']==artifact['sha256'] and d['destination']==r['parameters']['settings']['source']['source_path']==artifact['upload']['destination'] and r['parameters']['source']['upload_operation_id']==d['upload_operation_id']
  assert d['sha256']==expected(dict(fixture=file,threshold=100,value='MISSING'))['source_sha256']
  checks['source:'+key]=True
 assert result(events,request('import-core'))['node']==result(events,request('import-changed'))['node']
 for key,file,threshold,sourcekey in [('impute-core','core.csv',100,'core'),('preserve-core','changed.csv',100,'changed'),('impute-one-in-120','one-in-120.csv',0,'one-in-120')]:
  r=request(key);res=result(events,r);case=dict(fixture=file,threshold=threshold,value='MISSING');goal=expected(case)
  assert res['status']=='SUCCEEDED' and configuration(events,r,res,goal),key+' configuration'
  proof=verify_calculator_output(events,r,goal['schema'],goal['rows']);assert proof['passed'],proof
  execution=res['execution']['execution_id'];assert execution not in seen;seen.add(execution)
  if key=='preserve-core':assert r['parameters']=={} and r['inputs']==[] and r['mappings']==[] and res['node']==result(events,request('impute-core'))['node']
  checks['node:'+key]=True
  if key!='impute-core':final[key]=dict(case=case,request=r,result=res,source_request=request('import-'+sourcekey),source_result=result(events,request('import-'+sourcekey)))
 save=request('save');path=save['parameters']['path'];assert path.startswith('/test-4/packages/')
 saveid=checkpoint_save(events,path,response('save-describe')['action']['revision'],'node14-native-impute-one-in-120',['Source core','Result core','Source one-in-120','Result one-in-120']);assert saveid==save['operation_id'],'Native save trace required'
 checks['native_checkpoint']=True
 closed=response('close-verify');assert response('close-package')['status']=='SUCCEEDED' and closed['status']=='SUCCEEDED' and closed['output']['package_identity'] is None and closed['output']['nodes']==[] and closed['output']['ui']['dialogs']==[]
 checks['separate_close']=True
 return dict(scope='native_component_diagnostic',model_started=False,full_goal_accepted=False,checks=checks,reopen_plan=dict(package_path=path,old_document_id=w['document_id'],working_session=sid,runtime_revision=PIN,manifest_uri=MANIFEST_URI,manifest_sha256=digest,final=final))
def reopen_component(report,directory):
 from missing_values_acceptance import raw_table_binding
 from missing_values_contract import audit_missing_values
 directory=Path(directory);plan=report['reopen_plan'];post=json.loads((directory/'index.json').read_text());events=[json.loads(l) for l in (directory/'execution-events.jsonl').read_text().splitlines()]
 checks={};w=post['prepare'];checks['new_document']=w['status']=='READY' and w['target_verified'] is True and w['created_draft'] is False and w['package_ref']['path']==plan['package_path'] and w['document_id']!=plan['old_document_id'] and post['runtime_revision']==PIN and post['manifest_sha256']==plan['manifest_sha256'] and set(post['results'])==set(plan['final'])
 previous=[v['result']['execution']['execution_id'] for v in plan['final'].values()]
 for label,before in plan['final'].items():
  item=post['results'][label];r=item['request'];res=item['result'];node=res['node'];wanted=expected(before['case']);source_node=dict(node,node_id=before['source_result']['node']['node_id']);inspection=item['source_inspection'];after=item['source_after'];settings=before['source_request']['parameters']['settings']
  good=(inspection['verified'] and inspection['node']==source_node and inspection['source']==dict(source_path=settings['source']['source_path'],encoding='UTF-8 (65001)',rows_to_skip='0',first_line_as_title=True) and inspection['format']==dict(delimiter='Точка с запятой',decimal_separator='Точка (.)',null_marker='NULL',text_qualifier='Двойная кавычка (")') and inspection['columns']==[{k:c[k] for k in ('name','label','type','data_kind','used')} for c in settings['columns']] and inspection['settings_applied'] is False and inspection['cancelled']['draft_discarded'] and inspection['cancelled']['settings_applied'] is False)
  source=dict(verified=bool(good),sha256=wanted['source_sha256'],node=source_node,destination=settings['source']['source_path'],execution_id=None,integrity_scope='prior_verified_upload',dependency_reexecution=dict(before=inspection['after_cancel'],after=after,target_execution_id=res['execution']['execution_id']))
  declaration=dict(wanted,operation_id=r['operation_id'],node=node,source_node=source_node,source_path=source['destination'],source_dependency_reexecution=True,previous_execution_ids=previous)
  proof=audit_missing_values(declaration,res,item['table'],source);checks[label+':full_output']=proof['passed'];checks[label+':output_details']=proof
  checks[label+':raw_binding']=raw_table_binding(item['table'],item['raw_table'])
  checks[label+':preserved_request']=r['parameters']=={} and r['inputs']==[] and r['mappings']==[] and r['finish']=='execute' and r['target']['ref']==node and node['node_id']==before['result']['node']['node_id'] and node['document_id']==w['document_id']
  graph=item['graph'];checks[label+':saved_connection']=graph['verified'] and graph['read_only'] and graph['package_path']==plan['package_path'] and len(graph['links'])==1 and graph['links'][0]['source']['node_id']==source_node['node_id'] and graph['links'][0]['target']['node_id']==node['node_id']
  checks[label+':saved_configuration']=configuration(events,r,res,wanted)
 return dict(scope='native_component_diagnostic',model_started=False,full_goal_accepted=False,passed=all(v if isinstance(v,bool) else v['passed'] for v in checks.values()),checks=checks,rows={k:v['table']['row_count'] for k,v in post['results'].items()})

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--run',required=True);p.add_argument('--reopen');a=p.parse_args();report=component(a.run);report=reopen_component(report,a.reopen) if a.reopen else report;print(json.dumps(report,ensure_ascii=False));raise SystemExit(0 if report.get('passed',True) else 1)
