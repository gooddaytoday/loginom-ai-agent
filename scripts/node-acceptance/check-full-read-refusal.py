"""Managed live regression: 10-field full refusal, save, exact scalar read, save."""
import argparse, json, os, shutil, sys
from pathlib import Path
os.umask(0o077)
p=argparse.ArgumentParser()
p.add_argument('--worktree',type=Path,required=True)
p.add_argument('--config',type=Path,required=True)
p.add_argument('--out',type=Path,required=True)
a=p.parse_args()
sys.path.insert(0,str(Path.home()/'.local/share/loginom-multica/scripts'))
from common import managed_root,read_private,write_private,checked_path,artifact_lock,verify_candidate
from linux import run
w=a.worktree.resolve();c=read_private(a.config);root,_=managed_root(w,c)
out=checked_path(a.out.resolve(),root/'attempts')
if out.parent!=root/'attempts':raise RuntimeError('MANAGED_ATTEMPT_REQUIRED')
lock=artifact_lock(root)
try:
 payload=root/'current'
 if verify_candidate(w,payload).returncode:raise RuntimeError('CANDIDATE_INVALID')
 out.mkdir(mode=0o700)
 l=c['loginom']
 write_private(out/'config.json',dict(url=l['url'],username=l['username'],password=l['password'],api_key=l['api_key'],source_name='lab12-stage2-source-v3',report_name='native-refusal-'+out.name))
 source=w/'docs/node-development/nodes/transform-crosstable/acceptance'
 shutil.copyfile(source/'data/typed.csv',out/'typed.csv')
 write_private(out/'expected.json',json.loads((source/'expected.json').read_text())['outputs'][11])
 with (out/'stdout.raw').open('wb') as so,(out/'stderr.raw').open('wb') as se:
  code=run([payload/'resources/loginom/bin/node',w/'scripts/node-acceptance/check-full-read-refusal.mjs',payload/'resources/loginom',out],attempt=out,payload=payload,cwd=out,read_only=[w],stdout=so,stderr=se,timeout=1800,pass_fds=(lock,))
 r=read_private(out/'result.json')
 manifest=json.loads((payload/'cli-manifest.json').read_text())
 r['source_sha']=manifest['metadata']['sourceCommit'];write_private(out/'result.json',r)
 print(json.dumps({'exit':code,'status':r['status'],'source_sha':r['source_sha'],'cleanup':r['cleanup']}))
 if code or r['status']!='PASS':raise SystemExit(1)
finally:os.close(lock)
