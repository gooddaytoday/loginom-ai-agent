"""Read-only fresh collection for the exact closed incident; never an admission by itself."""
import pathlib,subprocess,json,os,time,stat,hashlib,sys,importlib.util
module_spec=importlib.util.spec_from_file_location("queues",pathlib.Path(__file__).with_name("lab57-queue-pages.py"))
queue_pages=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(queue_pages)
started=time.monotonic()
R=pathlib.Path('/home/user/.local/share/loginom-evals-runtime')
P=R/'roles/ben/eval-profile'
CFG=R/'roles/ben/agent-work/lab57-eb1-independent/node-eval-ops.json'
RUN=R/'roles/ben/results/lab57-eb1-independent/20261013-225027-eb1c2b0da'
controller,controller_birth,followup,csv_removed,archived,mode,source_sha,binding_sha,nonce=sys.argv[1:]
assert os.getuid()==1000 and os.geteuid()==1000
assert mode in ["ben-task","codex-coordinator"]
if mode=="codex-coordinator":assert followup=="root";followup=None
controller=int(controller)
def command(args): return subprocess.check_output(args,timeout=120,text=True)
def birth(proc):
    raw=(proc/'stat').read_text(); tail=raw[raw.rfind(')')+2:].split()
    return {'pid':int(proc.name),'parent':int(tail[1]),'birth':tail[19],'state':tail[0]}
def owned(pid,processes):
    seen=set()
    while pid in processes and pid not in seen:
        seen.add(pid); v=processes[pid]
        if pid==controller: return v['birth']==controller_birth
        pid=v['parent']
    return False
cfg=json.loads(CFG.read_bytes());profiles=[pathlib.Path(r[k]) for r in cfg['roles'].values() for k in ['referenceProfile','evalProfile'] if k in r]
assert len(set(profiles))==6
original=json.loads((RUN/'txt-semicolon-cp1251-decimal/1/cleanup.json').read_bytes())['processes']
old_ids={p['pid'] for p in original['processes']}|{2126565}
retained={'cli-profile.json','data/auth.json','config/loginom-ai-agent.json','config/loginom-ai-agent.jsonc','config/config.json','config/.gitignore','loginom/connection/connection.json','cache/models.json','state/model.json'}
markers=[]
for p in profiles:
    assert p.is_dir() and not p.is_symlink() and p.stat().st_uid==os.getuid()
    if (p/'.writer').exists():markers.append(str(p/'.writer'))
    if p!=P:
        for suffix in ['.process-group','.harness-lease']:
            if pathlib.Path(str(p)+suffix).exists():markers.append(str(p)+suffix)
    if p!=P or archived=='true':
        for f in p.rglob('*'):
            if f.is_symlink() or f.is_file() and str(f.relative_to(p)) not in retained:markers.append(str(f))
agents=json.loads(command(['/usr/local/bin/multica','agent','list','--output','json']))
assert isinstance(agents,list) and len(agents)>=8
queues=queue_pages.collect_queues(agents,followup,mode)
container=cfg['container']['id']; c=json.loads(command(['/usr/bin/docker','inspect',container]))[0]
names=command(['/usr/bin/docker','exec',container,'find','/workdir/UserStorage','/workdir/SessionBackup','-mindepth','1','-type','f']).splitlines()
storage=[{'path':n,'identity':command(['/usr/bin/docker','exec',container,'stat','-c','%d:%i:%s:%f',n]).strip(),'sha256':command(['/usr/bin/docker','exec',container,'sha256sum','--',n]).split()[0]} for n in names]
root=pathlib.Path('/var/lib/loginom-evals/fd-observer')/source_sha
binding=json.loads((root/'binding.json').read_bytes())
assert hashlib.sha256((root/'binding.json').read_bytes()).hexdigest()==binding_sha
request={'version':1,'nonce':nonce,'sourceSha':source_sha,'ownerSha256':'7d343a0f13f97506770e08a24e10f2d3360c88754dfd7184776cef4508b0be64','uid':1000,
 'controller':{'pid':controller,'birth':controller_birth},'requester':{'pid':os.getpid(),'birth':birth(pathlib.Path('/proc')/str(os.getpid()))['birth']},
 'node':binding['node'],'profiles':[str(p) for p in profiles],'originalPids':sorted(old_ids),
 'namespaces':{k:os.readlink('/proc/self/ns/'+k) for k in ['pid','mnt','user']}}
response=subprocess.run(['/usr/bin/sudo','-n','--','/usr/bin/python3','-I',str(root/'lab57-fd-observer.py'),'--request-stdin'],input=json.dumps(request),capture_output=True,text=True,timeout=15)
if response.returncode:
 try:exception=json.loads(response.stdout)['exception']
 except Exception:raise RuntimeError('FD_OBSERVER_UNCLASSIFIED')
 print('LAB57_FD_REFUSAL '+json.dumps(exception),file=sys.stderr)
 if exception['name']=='PermissionError':raise PermissionError(exception.get('code') or 13,'FD_OBSERVER_REFUSED')
 if exception['name']=='FileNotFoundError':raise FileNotFoundError(exception.get('code') or 2,'FD_OBSERVER_REFUSED')
 raise RuntimeError('FD_OBSERVER_REFUSED')
proof=json.loads(response.stdout)
assert time.monotonic()-started<15,'Fresh admission observation exceeded15s; STOP'
print(json.dumps({'passes':proof['report']['passes'],'fdProof':proof,'profiles':len(profiles),'foreignMarkers':markers,**queues,
 'checkedAt':int(time.time()*1000),'container':{'id':c['Id'],'startedAt':c['State']['StartedAt'],'running':c['State']['Running'],'mounts':c['Mounts']},'storage':storage}))
