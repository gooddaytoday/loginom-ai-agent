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
parser.add_argument('--same-node-correction',action='store_true')
parser.add_argument('--matrix',choices=['matrix','csv-matrix'],default='matrix')
args=parser.parse_args()
sys.dont_write_bytecode=True
import importlib.util
spec=importlib.util.spec_from_file_location('matrix_oracle',Path(__file__).with_name('matrix-oracle.py'));oracle_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle_module)
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
source=acceptance/args.matrix/'fixtures'/case['source']['name']
if hashlib.sha256(source.read_bytes()).hexdigest()!=case['source']['sha256'] or source.stat().st_size!=case['source']['bytes']:raise RuntimeError('SOURCE_IDENTITY_DIFFERS')
shutil.copyfile(source,work/source.name)
instructions=f"""Создай новый пакет {package}. Импортируй исходное приложенное {source.name}, загрузи ровно один раз с проверкой серверных байтов. Не изменяй файл. Один узел text import с меткой {case['case_id']}, без связей и вычислений.
Настройки источника: {json.dumps(case['settings']['source'],ensure_ascii=False)}
Настройки формата: {json.dumps(case['settings']['format'],ensure_ascii=False)}
Поля в исходном порядке: {json.dumps(case['columns'],ensure_ascii=False)}
Настрой технические имена, метки, типы, виды и использование всех полей; входные имена бери из фактического определения полей (для файла без заголовков не угадывай их). Не теряй строки, NULL, пустые значения, ведущие нули, кавычки и переносы. Выполни импорт, прочитай всю небольшую таблицу (до 10 строк) с точными числами. Сохрани новый пакет после успеха. При неизвестном эффекте остановись, не повторяй загрузку или создание.
"""
if args.same_node_correction:
 if case['case_id']!='pipe_multiline':raise RuntimeError('CORRECTION_CASE_REQUIRES_PIPE_FIXTURE')
 instructions += """
Проверка исправления на том же узле: сначала выполни ровно один новый импорт с тем же исходным файлом и всеми заданными настройками, но delimiter="," вместо "|". Ожидается известный отказ привязки числа полей. Продолжать можно только после settled FAILED и cleanup_complete=true с подтверждённым сохранённым node_id; при другом/неизвестном исходе остановись. Затем на ЭТОМ ЖЕ узле под новым operation_id примени все правильные настройки выше (delimiter="|") и выполни импорт. Не создавай второй узел и не загружай файл снова. Сохрани успешный пакет. Оба исхода зафиксируй.
"""
(work/'task.md').write_text(instructions)
result={'status':'FAIL','node':'text-import','case_id':case['case_id'],'matrix':args.matrix,'same_node_correction_required':args.same_node_correction,'input_source':case['source'],'role':cfg['role'],**owner,'source_sha':meta['sourceCommit'],'source_tree_sha256':meta['sourceTreeSha256'],'cli_manifest_sha256':hashlib.sha256((payload/'cli-manifest.json').read_bytes()).hexdigest(),'ops':ops_identity(),'model':cfg['model'],'variant':cfg['variant'],'cli_exit':None,'oracle_exit':None,'timed_out':False,'package_path':package,'oracle':{'status':'not_run'},'cleanup':{'package_closed':False,'logged_out':False},'desktop':'not_checked','cli_manifest_metadata':meta}
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
   try:receipt=json.JSONDecoder().raw_decode(state.get('output',state.get('error')))[0]
   except (ValueError,TypeError):raise RuntimeError('AUDIT_UNPARSEABLE_TOOL_REPLY')
   if not isinstance(receipt,dict):raise RuntimeError('AUDIT_NATIVE_RECEIPT_NOT_OBJECT')
   terminal.append({'tool':part['tool'],'input':state['input'],'result':receipt})
 if any(t['result'].get('status') in ['AMBIGUOUS','TIMED_OUT'] for t in terminal):raise RuntimeError('UNKNOWN_EFFECT_PRESERVED')
 if any(t['result'].get('state')=='settled' and t['result'].get('cleanup_complete') is False for t in terminal):raise RuntimeError('UNCONFIRMED_OPERATION_CLEANUP_PRESERVED')
 # Expected full data and administrative credentials are made available only
 # after the model exits, in an independent cold process.
 write_private(tmp/'cold-config.json',{'api_key':s['api_key'],'loginom_url':s['url'],'workflow_profile':{'passwordless_login':s['password']=='','loginom_user':s['username'],'password':s['password']}})
 write_private(tmp/'saved.json',{'path':package});write_private(tmp/'expected.json',case)
 operator=read_private(Path(cfg['operator_file']));write_private(tmp/'admin.json',{k:operator[k] for k in ['url','admin_user','admin_password']})
 release=tmp/'release';release.mkdir()
 code=invoke([node,OPS/'release-sessions.mjs','--resources',resources,'--accounts',tmp/'admin.json','--user',s['username'],'--output',release],release/'stdout',release/'stderr',attempt=attempt,payload=payload,cwd=release,timeout=180,pass_fds=(lock,))
 if code:raise RuntimeError('OWN_SESSION_RELEASE_FAILED')
 oracle=evidence/'oracle';oracle.mkdir()
 result['oracle_exit']=invoke([node,acceptance/'matrix-cold-check.mjs','--config',tmp/'cold-config.json','--resources',resources,'--saved',tmp/'saved.json','--expected',tmp/'expected.json','--output',oracle],oracle/'stdout.txt',oracle/'stderr.txt',attempt=attempt,payload=payload,cwd=oracle,read_only=[root],timeout=1800,pass_fds=(lock,))
 cold=json.loads((oracle/'result.json').read_text());result['cleanup']=cold['cleanup'];result['oracle']={'status':cold['status']}
 if cold['status']!='CHECK_VALUES':raise RuntimeError('COLD_READ_FAILED: '+str(cold.get('error')))
 oracle_module.settings(case,cold['configuration'],cold['cli_delivery']['destination'])
 cold_values=oracle_module.compare(case,cold['port'])
 cold['full_values']=cold_values;cold['status']='PASS';write_private(oracle/'result.json',cold)
 result['oracle']={'status':'PASS','full_values':cold_values}
 settled={t['result']['operation_id']:t['result'] for t in terminal if t['result'].get('state')=='settled'}
 successes=[settled.get(t['input']['operation_id']) for t in terminal if t['tool']=='loginom_dock_node_apply' and t['input'].get('target',{}).get('type')=='imports.text']
 successes=[r for r in successes if r and r.get('status')=='SUCCEEDED']
 if not successes:raise RuntimeError('WARM_IMPORT_MISSING')
 warm=successes[-1]
 if warm['cleanup_complete'] is not True:raise RuntimeError('WARM_CLEANUP_UNCONFIRMED')
 native=warm['configuration']['readback'];oracle_module.settings(case,native,cold['cli_delivery']['destination'])
 ports=warm['output']['ports']
 if len(ports)!=1:raise RuntimeError('WARM_OUTPUT_INCOMPLETE')
 result['cli_full_values']=oracle_module.compare(case,ports[0])
 if result.get('same_node_correction_required'):
  calls=[t for t in terminal if t['tool']=='loginom_dock_node_apply' and t['input'].get('target',{}).get('type')=='imports.text']
  if len(calls)!=2 or [t['input']['target']['kind'] for t in calls]!=['new','existing']:raise RuntimeError('CORRECTION_EXACT_TWO_APPLIES_REQUIRED')
  first,second=[settled.get(t['input']['operation_id']) for t in calls]
  if not first or first.get('status')!='FAILED' or first.get('cleanup_complete') is not True or second is not warm:raise RuntimeError('CORRECTION_KNOWN_REFUSAL_REQUIRED')
  if not first.get('node',{}).get('node_id') or first['node']['node_id']!=second['node']['node_id']:raise RuntimeError('CORRECTION_SAME_NODE_REQUIRED')
  if len([t for t in terminal if t['tool']=='loginom_dock_artifact_deliver'])!=1:raise RuntimeError('CORRECTION_SINGLE_DELIVERY_REQUIRED')
  if calls[0]['input']['parameters']['settings']['format']['delimiter']!=',' or calls[1]['input']['parameters']['settings']['format']['delimiter']!='|':raise RuntimeError('CORRECTION_DELIMITER_SEQUENCE_REQUIRED')
  result['same_node_correction']={'status':'PASS','node_id':first['node']['node_id'],'original_refusal':first,'corrected_operation_id':second['operation_id'],'node_apply_count':2,'delivery_count':1}

 if result['cli_exit']!=0 or result['oracle_exit']!=0 or not all(result['cleanup'].get(k) is True for k in ['package_closed','logged_out']):raise RuntimeError('FULL_ACCEPTANCE_REQUIRED')
 result['status']='PASS'
except Exception as error:
 result['status']='FAIL';result['error']=str(error)[:300];print('FAILED',result['error'],flush=True)
finally:
 if rawout.exists() and rawerr.exists():
  subprocess.run([node,OPS/'redact.mjs',root/'packages/loginom-runtime/client/lib/redact.mjs',cfgpath,cfg['provider_auth_file'],rawout,rawerr,evidence],capture_output=True)
 result['duration_s']=round(time.monotonic()-started,3);write_private(evidence/'result.json',result);os.close(lock)
print(json.dumps({'status':result['status'],'attempt':attempt.name,'sha':result['source_sha'],'oracle':result['oracle'],'cleanup':result['cleanup']}))

if result['status']!='PASS':sys.exit(1)
