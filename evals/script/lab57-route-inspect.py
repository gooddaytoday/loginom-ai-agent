"""Read-only fresh collection for the exact closed incident; never an admission by itself."""
import pathlib,subprocess,json,os,time,stat,hashlib,sys
R=pathlib.Path('/home/user/.local/share/loginom-evals-runtime')
P=R/'roles/ben/eval-profile'
CFG=R/'roles/ben/agent-work/lab57-eb1-independent/node-eval-ops.json'
RUN=R/'roles/ben/results/lab57-eb1-independent/20261013-225027-eb1c2b0da'
controller,controller_birth,followup,csv_removed,archived=sys.argv[1:]
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
passes=[]
for _ in range(2):
    processes={};denied=[];foreign=[];fds=[]
    for proc in pathlib.Path('/proc').iterdir():
        if not proc.name.isdigit(): continue
        try:
            processes[int(proc.name)]=birth(proc)
        except (FileNotFoundError,ProcessLookupError): pass
        except PermissionError: denied.append({'pid':int(proc.name),'kind':'process-stat'})
    assert controller in processes and processes[controller]['birth']==controller_birth
    # A complete proc ancestry snapshot precedes UID/FD/browser admission.
    native_sockets=set()
    for pid,identity in processes.items():
        proc=pathlib.Path('/proc')/str(pid)
        try:
            if identity['state'] in ['Z','X']:continue
            name=(proc/'comm').read_text().strip()
            native=name.startswith(('chrome','chromium','loginom-ai-','bwrap'))
            if native and not owned(pid,processes):foreign.append({'pid':pid,'birth':identity['birth'],'name':name})
            if proc.stat().st_uid==os.getuid() or native:
                for fd in (proc/'fd').iterdir():
                    try:
                        target=os.readlink(fd)
                        if any(str(p) in target for p in profiles):fds.append({'pid':pid,'target':target})
                        if native and target.startswith('socket:['):native_sockets.add(target[8:-1])
                    except (FileNotFoundError,ProcessLookupError):pass
        except (FileNotFoundError,ProcessLookupError):pass
        except PermissionError:denied.append({'pid':pid,'kind':'UID-FD-native'})
    # Own Chromium must retain a pipe debugger. Any native listening socket is unsafe.
    for table in ['tcp','tcp6']:
        for line in (pathlib.Path('/proc/net')/table).read_text().splitlines()[1:]:
            row=line.split()
            if row[3]=='0A' and row[9] in native_sockets:denied.append({'kind':'native-debug-listener','inode':row[9]})
    passes.append({'originalPids':sorted(old_ids&processes.keys()),'foreignNative':foreign,'denied':denied,'profileFds':fds})
    time.sleep(.12)
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
pending=[]
for agent in agents:
    tasks=json.loads(command(['/usr/local/bin/multica','agent','tasks',agent['id'],'--limit','200','--output','json']))
    assert isinstance(tasks,list) and len(tasks)<200,'Incomplete queue inventory'
    pending.extend({'agent':agent['id'],'task':t['id'],'status':t['status']} for t in tasks if t['status'] in ['queued','pending','running','retrying','scheduled'] and t['id']!=followup)
container=cfg['container']['id']; c=json.loads(command(['/usr/bin/docker','inspect',container]))[0]
names=command(['/usr/bin/docker','exec',container,'find','/workdir/UserStorage','/workdir/SessionBackup','-mindepth','1','-type','f']).splitlines()
storage=[{'path':n,'identity':command(['/usr/bin/docker','exec',container,'stat','-c','%d:%i:%s:%f',n]).strip(),'sha256':command(['/usr/bin/docker','exec',container,'sha256sum','--',n]).split()[0]} for n in names]
print(json.dumps({'passes':passes,'profiles':len(profiles),'foreignMarkers':markers,'pendingWorkers':pending,'queuesChecked':len(agents),
    'checkedAt':int(time.time()*1000),'container':{'id':c['Id'],'startedAt':c['State']['StartedAt'],'running':c['State']['Running'],'mounts':c['Mounts']},'storage':storage}))
