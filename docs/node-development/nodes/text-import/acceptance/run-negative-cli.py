from pathlib import Path
import sys,json,hashlib,shutil,subprocess,time,argparse
OPS=Path.home()/'.local/share/loginom-multica/scripts'
sys.path.insert(0,str(OPS))
from common import read_private,write_private,managed_root,verify_candidate,artifact_lock,ops_identity
from accept import prepare_profile
from linux import run
import os
parser=argparse.ArgumentParser()
for key in ['worktree','config','out']:parser.add_argument('--'+key,required=True,type=Path)
parser.add_argument('--case',required=True)
parser.add_argument('--matrix',choices=['matrix','csv-matrix'],default='matrix')
args=parser.parse_args()
sys.dont_write_bytecode=True
root=args.worktree.resolve();cfgpath=args.config.resolve();cfg=read_private(cfgpath)
base,owner=managed_root(root,cfg);attempt=args.out.resolve()
if attempt.parent!=base/'attempts' or attempt.exists():raise RuntimeError('NEW_MANAGED_ATTEMPT_REQUIRED')
attempt.mkdir(mode=0o700)
evidence=attempt/'evidence';evidence.mkdir();tmp=attempt/'tmp';tmp.mkdir();work=tmp/'work';work.mkdir();profile=tmp/'profile'
payload=base/'current';lock=artifact_lock(base)
if verify_candidate(root,payload).returncode:raise RuntimeError('INVALID_CANDIDATE')
manifest=json.loads((payload/'cli-manifest.json').read_text());meta=manifest['metadata'];assert not meta['sourceDirty'];prepare_profile(profile,meta['channel'],cfg.get('model_cache_file'))
cli=payload/'bin/loginom-ai-agent-cli';resources=payload/'resources/loginom';node=resources/'bin/node';s=cfg['loginom'];package='/'+s['username']+'/node-text-import-'+attempt.name+'.lgp'
acceptance=root/'docs/node-development/nodes/text-import/acceptance'
case=next(c for c in json.loads((acceptance/args.matrix/'manifest.json').read_text())['cases'] if c['case_id']==args.case)
case['settings']={'source':{'encoding':'65001','rows_to_skip':0,'first_line_as_title':True},'format':{'delimiter':',','decimal_separator':'.','null_marker':'?','text_qualifier':'"','multiple_delimiters':False,'date_format':'yyyy/mm/dd','date_separator':'-'}}
case['settings']['format'].pop('date_format');case['settings']['format'].pop('date_separator')
case['columns']=[{'name':n,'label':n,'type':'string','data_kind':'Дискретный','used':True} for n in ['Id','Name']]
if args.case=='ambiguous_headers':
 scenario=json.loads((acceptance/'negative/ambiguous-headers.settings.json').read_text());case['settings']={k:scenario[k] for k in ['source','format']};case['columns']=scenario['columns']
source=acceptance/args.matrix/'fixtures'/case['source']['name']
if hashlib.sha256(source.read_bytes()).hexdigest()!=case['source']['sha256'] or source.stat().st_size!=case['source']['bytes']:raise RuntimeError('SOURCE_IDENTITY_DIFFERS')
shutil.copyfile(source,work/source.name)
instructions=f"""Проверь импорт оригинального приложенного {source.name} в новый пакет {package}, один узел с меткой {case['case_id']}. Файл не изменяй, доставь ровно один раз с проверкой серверных байтов.
Используй новый operation_id для импорта: {attempt.name}-import.
Это проверка поведения проблемного входа. Применяй только заданные настройки, не исправляй кодировку, разделитель или кавычки для получения успеха.
Источник: {json.dumps(case['settings']['source'],ensure_ascii=False)}
Формат: {json.dumps(case['settings']['format'],ensure_ascii=False)}
Запрошенные поля: {json.dumps(case['columns'],ensure_ascii=False)}
Не угадывай привязку повторяющихся заголовков и не выбирай их по позиции. Если мастер или выполнение откажет, зафиксируй точную причину/предупреждение без повторного создания, доставки или изменения настроек. После только известного отказа с подтверждённым закрытием черновика сохрани собственный диагностический пакет в указанном пути с текущим исходом и остановись. Если импорт применится, прочитай всю малую таблицу и сохрани пакет, но не объявляй повреждённые/неполные значения правильно проверенной таблицей. Зафиксируй наблюдённое предупреждение, если оно есть; не придумывай его. При неизвестном эффекте немедленно остановись.
"""
if args.case=='ambiguous_headers':
 instructions=(acceptance/'negative/ambiguous-headers.task.md').read_text().replace('ambiguous_headers.txt',source.name).replace('{{PACKAGE_PATH}}',package).replace('{{OPERATION_ID}}',attempt.name+'-import').replace('{{SETTINGS}}',json.dumps({**case['settings'],'columns':case['columns']},ensure_ascii=False,indent=2))
(work/'task.md').write_text(instructions)
result={'status':'FAIL','node':'text-import','case_id':case['case_id'],'matrix':args.matrix,'input_source':case['source'],'role':cfg['role'],**owner,'source_sha':meta['sourceCommit'],'source_tree_sha256':meta['sourceTreeSha256'],'cli_manifest_sha256':hashlib.sha256((payload/'cli-manifest.json').read_bytes()).hexdigest(),'ops':ops_identity(),'model':cfg['model'],'variant':cfg['variant'],'cli_exit':None,'oracle_exit':None,'timed_out':False,'package_path':package,'oracle':{'status':'not_run'},'cleanup':{'package_closed':False,'logged_out':False},'desktop':'not_checked','cli_manifest_metadata':meta}
started=time.monotonic();kw=dict(attempt=attempt,payload=payload,profile=profile,cwd=work,auth=Path(cfg['provider_auth_file']),pass_fds=(lock,))
def invoke(command,stdout,stderr,**more):
 with stdout.open('wb') as out,stderr.open('wb') as err:return run(command,stdout=out,stderr=err,**more)
rawout=tmp/'stdout.raw';rawerr=tmp/'stderr.raw'
try:
 setup={'url':s['url'],'username':s['username'],'password':s['password'],'apiKey':s['api_key']}
 code=invoke([cli,'loginom','setup','--stdin-json','--format','json'],tmp/'setup.raw',tmp/'setup.stderr.raw',input=json.dumps(setup).encode(),timeout=240,**kw)
 if code:raise RuntimeError('CLI_SETUP_FAILED')
 status_exit=invoke([cli,'loginom','status','--format','json'],tmp/'status.raw',tmp/'status.stderr.raw',timeout=240,**kw)
 if status_exit or json.loads((tmp/'status.raw').read_text()).get('state')!='ready':raise RuntimeError('CLI_NOT_READY')
 print('CLI_RUNNING',attempt.name,flush=True)
 result['cli_exit']=invoke([cli,'run','--no-headless','--format','json','--model',cfg['model'],'--variant',cfg['variant'],'--dir',work,'--file',work/'task.md','--file',work/source.name,'--','Выполни приложенное задание и сохрани результат в указанном новом пакете без перезаписи существующего файла.'],rawout,rawerr,timeout=7200,**kw)
 print('CLI_FINISHED',result['cli_exit'],flush=True)
 subprocess.run([node,OPS/'redact.mjs',root/'packages/loginom-runtime/client/lib/redact.mjs',cfgpath,cfg['provider_auth_file'],rawout,rawerr,evidence],check=True,capture_output=True)
 lines=rawout.read_text().splitlines();terminal=[]
 for line in lines:
  try:event=json.loads(line)
  except ValueError:continue
  if event.get('type')=='tool_use' and event.get('part',{}).get('tool','').startswith('loginom_dock_') and event.get('part',{}).get('state',{}).get('status') in ['completed','error']:
   part=event['part'];state=part['state']
   try:terminal.append({'tool':part['tool'],'input':state['input'],'result':json.JSONDecoder().raw_decode(state.get('output',state.get('error')))[0]})
   except (ValueError,TypeError):
    if args.case=='ambiguous_headers' and part['tool']=='loginom_dock_node_apply' and state.get('status')=='error':terminal.append({'tool':part['tool'],'input':state['input'],'result':{'tool_error':state.get('error')}})
    else:raise RuntimeError('AUDIT_UNPARSEABLE_TOOL_REPLY')
 if any(t['result'].get('status') in ['AMBIGUOUS','TIMED_OUT'] for t in terminal):raise RuntimeError('UNKNOWN_EFFECT_PRESERVED')
 if any(t['result'].get('state')=='settled' and t['result'].get('cleanup_complete') is False for t in terminal):raise RuntimeError('UNCONFIRMED_OPERATION_CLEANUP_PRESERVED')
 # A running receipt is not a settled result; never release an unobserved operation.
 latest_operations={}
 for t in terminal:
  r=t.get('result',t)
  if r.get('state') in ['running','settled'] and r.get('operation_id'):latest_operations[r['operation_id']]=r
 if any(r.get('state')!='settled' for r in latest_operations.values()):raise RuntimeError('UNSETTLED_OPERATION_PRESERVED')
 # Negative evidence is checked independently; no oracle values are mounted in the model process.
 if result['cli_exit']!=0:raise RuntimeError('CLI_EXIT_NONZERO')
 prepared=[t['result'] for t in terminal if t['tool']=='loginom_dock_prepare']
 if len(prepared)!=1:raise RuntimeError('PREPARE_IDENTITY_REQUIRED')
 admitted=[v for v in prepared[0].get('input_artifacts',[]) if v['bytes']==case['source']['bytes'] and v['sha256']==case['source']['sha256'] and v['name'].endswith(case['source']['name'])]
 if len(admitted)!=1:raise RuntimeError('NEGATIVE_SOURCE_ADMISSION_REQUIRED')
 deliveries=[t for t in terminal if t['tool']=='loginom_dock_artifact_deliver']
 if len(deliveries)>1:raise RuntimeError('NEGATIVE_DUPLICATE_UPLOAD')
 settled={t['result']['operation_id']:t['result'] for t in terminal if t['result'].get('state')=='settled'}
 imports=[settled.get(t['input']['operation_id']) for t in terminal if t['tool']=='loginom_dock_node_apply' and t['input'].get('target',{}).get('type')=='imports.text']
 imports=[v for v in imports if v]
 if len(imports)>1:raise RuntimeError('NEGATIVE_IMPORT_REPEATED')
 result['negative_observations']={'terminal_imports':imports,'admitted_source':case['source'],'delivery_count':len(deliveries),'model_text':[json.loads(l)['part'].get('text','') for l in lines if l.startswith('{') and json.loads(l).get('type')=='text']}
 if args.case=='ambiguous_headers':
  spec=__import__('importlib.util',fromlist=['spec_from_file_location']);m=spec.spec_from_file_location('negative_audit',acceptance/'negative/ambiguous-headers-oracle.py');audit=spec.module_from_spec(m);m.loader.exec_module(audit)
  result['negative_audit']=audit.audit(terminal,case)
 result['status']='CHECK_NEGATIVE';result['error']='Independent negative outcome review and native cleanup required'
 # Stop before any subsequent UI work: review the known outcome and account/package inventory first.
except Exception as error:
 result['status']='FAIL';result['error']=str(error)[:300];print('FAILED',result['error'],flush=True)
finally:
 if rawout.exists() and rawerr.exists():
  subprocess.run([node,OPS/'redact.mjs',root/'packages/loginom-runtime/client/lib/redact.mjs',cfgpath,cfg['provider_auth_file'],rawout,rawerr,evidence],capture_output=True)
 result['duration_s']=round(time.monotonic()-started,3);write_private(evidence/'result.json',result);os.close(lock)
print(json.dumps({'status':result['status'],'attempt':attempt.name,'sha':result['source_sha'],'oracle':result['oracle'],'cleanup':result['cleanup']}))

if result['status'] not in ['PASS','CHECK_NEGATIVE']:sys.exit(1)
