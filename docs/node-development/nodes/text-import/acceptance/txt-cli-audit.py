from pathlib import Path
import json,hashlib,sys,collections,subprocess
root=Path(__file__).resolve().parents[5];attempt=Path(sys.argv[1]).resolve();expected_path=Path(sys.argv[2]).resolve();events=[];seen=set()
for line in (attempt/'evidence/events.jsonl').read_text().splitlines():
 try:e=json.loads(line)
 except ValueError:continue
 p=e.get('part',{});s=p.get('state',{})
 if e.get('type')!='tool_use' or s.get('status') not in ('completed','error') or p.get('id') in seen:continue
 seen.add(p.get('id'))
 out=s.get('output',s.get('error'))
 if isinstance(out,str):
  try:out=json.loads(out)
  except ValueError:continue
 if not isinstance(out,dict):continue
 events.append({'tool':p['tool'],'input':s.get('input',{}),'result':out})
need=lambda v,m: None if v else (_ for _ in ()).throw(ValueError(m))
settled={e['result']['operation_id']:e['result'] for e in events if e['result'].get('state')=='settled'}
reply=lambda e:settled.get(e['input'].get('operation_id'),e['result'])
prepare=[e['result'] for e in events if e['tool']=='loginom_dock_prepare'];need(len(prepare)==1,'ONE_PREPARATION_REQUIRED')
admitted=[a for a in prepare[0]['input_artifacts'] if a['name'].endswith('transactions.txt') and a['bytes']==1779179 and a['sha256']=='8468e52d938f26b9531ce045053df17197f6b6dd0f6b435c7a8dff47bcecaa28'];need(len(admitted)==1,'EXACT_ORIGINAL_ADMISSION_REQUIRED')
delivery_requests=[e for e in events if e['tool']=='loginom_dock_artifact_deliver'];need(len(delivery_requests)==1 and delivery_requests[0]['input']['artifact_id']==admitted[0]['artifact_id'] and delivery_requests[0]['input']['upload_grant_id']==admitted[0]['upload']['grant_id'],'DELIVERY_ADMISSION_UNBOUND')
deliveries=[reply(e) for e in events if e['tool']=='loginom_dock_artifact_deliver'];need(len(deliveries)==1,'ONE_USER_ATTACHMENT_DELIVERY_REQUIRED');d=deliveries[0];proof=d['output']
need(d.get('status')=='SUCCEEDED' and proof.get('cleanup_complete') and proof.get('upload_completion_verified') and proof['bytes']==1779179 and proof['sha256']=='8468e52d938f26b9531ce045053df17197f6b6dd0f6b435c7a8dff47bcecaa28' and proof['destination']==admitted[0]['upload']['destination'],'DELIVERY_PROOF_DIFFERS')
applies=[e for e in events if e['tool']=='loginom_dock_node_apply']
imports=[e for e in applies if e['input'].get('target',{}).get('type')=='imports.text' and reply(e).get('status')=='SUCCEEDED'];need(len(imports)==1,'ONE_SUCCESSFUL_IMPORT_REQUIRED');i=imports[0];r=reply(i)
need(i['input']['parameters']['source']['upload_operation_id']==proof['upload_operation_id'] and i['input']['parameters']['source']['artifact_id']==admitted[0]['artifact_id'],'IMPORT_SOURCE_TRANSFER_UNBOUND')
port=r['output']['ports'][0];need(port['row_count']==20789 and len(port['schema'])==7 and port['fresh'] and port['execution_id']==r['execution']['execution_id'],'FRESH_IMPORT_OUTPUT_DIFFERS')
expected=json.loads((expected_path).read_text());need([{k:f[k] for k in ('name','label','type','data_kind')} for f in port['schema']]==expected['columns'],'CLI_NATIVE_SCHEMA_DIFFERS')
exports=[e for e in applies if e['input'].get('target',{}).get('type')=='exports.text' and reply(e).get('status')=='SUCCEEDED'];need(len(exports)==1,'ONE_SUCCESSFUL_NATIVE_EXPORT_REQUIRED');export=reply(exports[0]);need(exports[0]['input']['inputs'][0]['source']['node_id']==r['node']['node_id'],'EXPORT_IMPORT_LINK_DIFFERS')
f=export['output']['file_artifacts'][0];need(f['execution_id']==export['execution']['execution_id'],'EXPORT_EXECUTION_UNBOUND');matched=[]
for p in (attempt/'tmp').rglob('*'):
 if p.is_file() and p.parent.name=='output-'+f['artifact_id'] and p.stat().st_size==f['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==f['sha256']:matched.append(p)
need(len(matched)==1,'VERIFIED_CLI_DOWNLOAD_REQUIRED')
proc=subprocess.run(['python3',root/'docs/node-development/nodes/text-import/acceptance/txt-oracle.py','compare','--expected',expected_path,'--exported',matched[0]],capture_output=True,text=True)
need(proc.returncode==0,'FULL_CLI_VALUES_DIFFER');values=json.loads(proc.stdout)
report={'status':'PASS','original_user_attachment':True,'admitted_source':admitted[0],'delivery':proof,'native_schema':expected['columns'],'import_execution':r['execution'],'output':f,'full_values':values,'one_delivery_request':True,'export_link_verified':True}
print(json.dumps(report,ensure_ascii=False))
(attempt/'evidence/oracle/cli-full-result.json').write_text(json.dumps(report,ensure_ascii=False))
result=json.loads((attempt/'evidence/result.json').read_text());cold=json.loads((attempt/'evidence/oracle/result.json').read_text());cold['cli_full_values']=values;cold['admitted_source_chain']=report
(attempt/'evidence/oracle/result.json').write_text(json.dumps(cold,ensure_ascii=False));result['cli_full_values']=values
result['status']='PASS' if result['cli_exit']==0 and result['oracle_exit']==0 and result['oracle']['status']=='PASS' and all(result['cleanup'].values()) else 'FAIL'
(attempt/'evidence/result.json').write_text(json.dumps(result,ensure_ascii=False))
