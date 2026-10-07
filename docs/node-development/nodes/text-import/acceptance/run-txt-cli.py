from pathlib import Path
import sys,json,hashlib,shutil,subprocess,time,argparse
OPS=Path.home()/'.local/share/loginom-multica/scripts'
sys.path.insert(0,str(OPS))
from common import read_private,write_private,managed_root,verify_candidate,artifact_lock,ops_identity
from accept import prepare_profile
from linux import run
import os
parser=argparse.ArgumentParser()
for key in ['worktree','config','out','source','expected']:parser.add_argument('--'+key,required=True,type=Path)
args=parser.parse_args()
root=args.worktree.resolve();cfgpath=args.config.resolve();cfg=read_private(cfgpath)
base,owner=managed_root(root,cfg);attempt=args.out.resolve()
if attempt.parent!=base/'attempts' or attempt.exists():raise RuntimeError('NEW_MANAGED_ATTEMPT_REQUIRED')
attempt.mkdir(mode=0o700)
evidence=attempt/'evidence';evidence.mkdir();tmp=attempt/'tmp';tmp.mkdir();work=tmp/'work';work.mkdir();profile=tmp/'profile'
payload=base/'current';lock=artifact_lock(base)
if verify_candidate(root,payload).returncode:raise RuntimeError('INVALID_CANDIDATE')
manifest=json.loads((payload/'cli-manifest.json').read_text());meta=manifest['metadata'];assert not meta['sourceDirty'];prepare_profile(profile,meta['channel'],cfg.get('model_cache_file'))
cli=payload/'bin/loginom-ai-agent-cli';resources=payload/'resources/loginom';node=resources/'bin/node';s=cfg['loginom'];package='/'+s['username']+'/node-text-import-'+attempt.name+'.lgp'
acceptance=root/'docs/node-development/nodes/text-import/acceptance';source=args.source.resolve();expected=args.expected.resolve()
if expected.is_relative_to(attempt):raise RuntimeError('EXPECTED_MUST_BE_OUTSIDE_MODEL_MOUNT')
if hashlib.sha256(source.read_bytes()).hexdigest()!=json.loads(expected.read_text())['source']['sha256']:raise RuntimeError('SOURCE_IDENTITY_DIFFERS')
shutil.copyfile(source,work/'transactions.txt');(work/'task.md').write_text((acceptance/'task.md').read_text().replace('{{PACKAGE_PATH}}',package))
result={'status':'FAIL','node':'text-import','role':cfg['role'],**owner,'source_sha':meta['sourceCommit'],'source_tree_sha256':meta['sourceTreeSha256'],'cli_manifest_sha256':hashlib.sha256((payload/'cli-manifest.json').read_bytes()).hexdigest(),'ops':ops_identity(),'model':cfg['model'],'variant':cfg['variant'],'cli_exit':None,'oracle_exit':None,'timed_out':False,'package_path':package,'oracle':{'status':'not_run'},'cleanup':{'package_closed':False,'logged_out':False},'desktop':'not_checked','cli_manifest_metadata':meta}
started=time.monotonic();kw=dict(attempt=attempt,payload=payload,profile=profile,cwd=work,auth=Path(cfg['provider_auth_file']),pass_fds=(lock,))
def invoke(command,stdout,stderr,**more):
 with stdout.open('wb') as out,stderr.open('wb') as err:return run(command,stdout=out,stderr=err,**more)
rawout=tmp/'stdout.raw';rawerr=tmp/'stderr.raw'
try:
 setup={'url':s['url'],'username':s['username'],'password':s['password'],'apiKey':s['api_key']}
 code=invoke([cli,'loginom','setup','--stdin-json','--format','json'],tmp/'setup.raw',tmp/'setup.stderr.raw',input=json.dumps(setup).encode(),timeout=240,**kw)
 if code:raise RuntimeError('CLI_SETUP_FAILED')
 print('CLI_RUNNING',attempt.name,flush=True)
 result['cli_exit']=invoke([cli,'run','--no-headless','--format','json','--model',cfg['model'],'--variant',cfg['variant'],'--dir',work,'--file',work/'task.md','--file',work/'transactions.txt','--','Выполни приложенное задание и сохрани результат в указанном новом пакете без перезаписи существующего файла.'],rawout,rawerr,timeout=7200,**kw)
 print('CLI_FINISHED',result['cli_exit'],flush=True)
 subprocess.run([node,OPS/'redact.mjs',root/'packages/loginom-runtime/client/lib/redact.mjs',cfgpath,cfg['provider_auth_file'],rawout,rawerr,evidence],check=True,capture_output=True)
 # Expected full data and administrative credentials are made available only
 # after the model exits, in an independent cold process.
 write_private(tmp/'cold-config.json',{'api_key':s['api_key'],'loginom_url':s['url'],'workflow_profile':{'passwordless_login':s['password']=='','loginom_user':s['username'],'password':s['password']}})
 write_private(tmp/'saved.json',{'path':package});shutil.copyfile(expected,tmp/'expected.json')
 operator=read_private(Path(cfg['operator_file']));write_private(tmp/'admin.json',{k:operator[k] for k in ['url','admin_user','admin_password']})
 release=tmp/'release';release.mkdir()
 code=invoke([node,OPS/'release-sessions.mjs','--resources',resources,'--accounts',tmp/'admin.json','--user',s['username'],'--output',release],release/'stdout',release/'stderr',attempt=attempt,payload=payload,cwd=release,timeout=180,pass_fds=(lock,))
 if code:raise RuntimeError('OWN_SESSION_RELEASE_FAILED')
 oracle=evidence/'oracle';oracle.mkdir()
 result['oracle_exit']=invoke([node,acceptance/'txt-cold-check.mjs','--config',tmp/'cold-config.json','--resources',resources,'--saved',tmp/'saved.json','--expected',tmp/'expected.json','--output',oracle],oracle/'stdout.txt',oracle/'stderr.txt',attempt=attempt,payload=payload,cwd=oracle,read_only=[root],timeout=1800,pass_fds=(lock,))
 cold=json.loads((oracle/'result.json').read_text());result['cleanup']=cold['cleanup'];result['oracle']={'status':cold['status']}
 if cold['status']=='CHECK_VALUES':
  proc=subprocess.run(['python3',acceptance/'txt-oracle.py','compare','--expected',expected,'--exported',oracle/'cold-output.csv'],capture_output=True,text=True)
  if proc.returncode:raise RuntimeError('FULL_COLD_VALUES_DIFFER')
  cold['full_values']=json.loads(proc.stdout);cold['status']='PASS';write_private(oracle/'result.json',cold);result['oracle']={'status':'PASS','full_values':cold['full_values']}
 write_private(evidence/'result.json',result)
 # Full values before cold reopen are independently checked against the same original oracle.
 subprocess.run(['python3',acceptance/'txt-cli-audit.py',attempt,expected],check=True,capture_output=True)
 result=json.loads((evidence/'result.json').read_text())
 if (result['cli_exit']!=0 or result['oracle_exit']!=0
     or result['oracle'].get('status')!='PASS'
     or not all(result['cleanup'].get(key) is True for key in ('package_closed','logged_out'))
     or not all(result.get(key,{}).get('status')=='PASS' and result[key].get('all_values_compared') is True
                for key in ('cli_full_values',))
     or result['oracle'].get('full_values',{}).get('status')!='PASS'
     or result['oracle']['full_values'].get('all_values_compared') is not True):
  raise RuntimeError('FULL_ACCEPTANCE_REQUIRED')
 result['status']='PASS'
except Exception as error:
 result['status']='FAIL';result['error']=str(error)[:300];print('FAILED',result['error'],flush=True)
finally:
 if rawout.exists() and rawerr.exists():
  subprocess.run([node,OPS/'redact.mjs',root/'packages/loginom-runtime/client/lib/redact.mjs',cfgpath,cfg['provider_auth_file'],rawout,rawerr,evidence],capture_output=True)
 result['duration_s']=round(time.monotonic()-started,3);write_private(evidence/'result.json',result);os.close(lock)
print(json.dumps({'status':result['status'],'attempt':attempt.name,'sha':result['source_sha'],'oracle':result['oracle'],'cleanup':result['cleanup']}))

if result['status']!='PASS':sys.exit(1)
