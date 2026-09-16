#!/usr/bin/env python3
"""Export only the catalog builder's tracked dependency closure from a fixed commit."""
import argparse,hashlib,io,json,re,subprocess,tarfile
from pathlib import Path,PurePosixPath
CODE='c32a5d5e163fe174afba59abce973ac405742cdc'
VERSION='2026.09.13-node14-test4.1-candidate'
def build(root,out,code=CODE,version=VERSION):
 assert re.fullmatch(r"[0-9a-f]{40}",code),"Exact source commit required"
 assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*-candidate",version),"Candidate version required"
 out.mkdir(parents=True,exist_ok=False,mode=0o700)
 def git(*args):return subprocess.check_output(['git','-C',str(root),*args])
 assert git('rev-parse',code).decode().strip()==code
 files={};pending=['executor/capability-abi.json','deploy/loginom-dock/build-action-catalog.mjs','deploy/loginom-dock/publish-action-catalog.py']+[f'executor/catalog/{n}.json' for n in ('actions','selectors','source-index','compatibility')]
 while pending:
  name=pending.pop()
  if name in files:continue
  mode=git('ls-tree',code,'--',name).decode().split()[0];assert mode in ('100644','100755'),name
  data=git('show',code+':'+name);files[name]=(data,mode)
  if name.endswith('.mjs'):
   for dep in re.findall(r"(?:from\s*|import\s*\()(['\"])(\.[^'\"]+)\1",data.decode()):
    import posixpath
    target=posixpath.normpath(str(PurePosixPath(name).parent/dep[1]));assert not target.startswith('../');pending.append(target)
 manifest={'source_commit':code,'version':version,'e2e_commit':'2cad5602158fd2e4836d821d644a2b8d92f571a2','files':[]}
 actions=json.loads(files['executor/catalog/actions.json'][0]);assert actions['e2e_commit']==manifest['e2e_commit']
 add=next(a for a in actions['actions'] if a['action_key']=='node.add');assert 'preprocessing.data_recovery' in json.dumps(add)
 with tarfile.open(out/'catalog-source.tar','w',format=tarfile.PAX_FORMAT) as tar:
  for name,(data,mode) in sorted(files.items()):
   assert not any(x in name.split('/') for x in ('.env','.dock','node_modules','browser-profile'))
   assert not re.search(rb'-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-proj-|sk-or-v1-|glpat-)[A-Za-z0-9_-]{12,}',data)
   info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if mode=='100755' else 0o644;info.mtime=0
   tar.addfile(info,io.BytesIO(data));manifest['files'].append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'git_mode':mode})
 manifest['archive_sha256']=hashlib.sha256((out/'catalog-source.tar').read_bytes()).hexdigest()
 (out/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 with tarfile.open(out/'catalog-source.tar') as tar:
  assert tar.getnames()==[f['path'] for f in manifest['files']]
  for f in manifest['files']:assert hashlib.sha256(tar.extractfile(f['path']).read()).hexdigest()==f['sha256']
 print(json.dumps({'files':len(files),'archive_sha256':manifest['archive_sha256'],'output':str(out)}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[3]);p.add_argument('--out',required=True,type=Path);p.add_argument('--commit',default=CODE);p.add_argument('--version',default=VERSION);a=p.parse_args();build(a.root,a.out,a.commit,a.version)
