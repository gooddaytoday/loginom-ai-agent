"""Incident-only read-only privileged producer. Provisioning is a later Root decision.
No profile contents, /proc/environ/mem, target FD contents, signals or permission changes.
The unprivileged route consumes a signed, nonce-bound two-pass result, never UID0.
"""
import ctypes,errno,hashlib,json,os,pathlib,stat,subprocess,sys,time

def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def digest(v):return hashlib.sha256(canonical(v)).hexdigest()
class ObserverRefused(Exception):pass

def proc_identity(pid):
 p=pathlib.Path('/proc')/str(pid);raw=(p/'stat').read_text();t=raw[raw.rfind(')')+2:].split()
 return {'pid':pid,'parent':int(t[1]),'birth':t[19],'uid':p.stat().st_uid,'comm':(p/'comm').read_text().strip()}

# Hold the directory descriptor through rewind/recheck. scandir/listdir would close
# their own transient /proc/self/fd descriptor before its target could be observed.
class Dirent(ctypes.Structure):
 _fields_=[('ino',ctypes.c_ulong),('offset',ctypes.c_long),('reclen',ctypes.c_ushort),('kind',ctypes.c_ubyte),('name',ctypes.c_char*256)]
class HeldFdDirectory:
 def __init__(self,pid):
  self.path='/proc/'+str(pid)+'/fd';self.lib=ctypes.CDLL(None,use_errno=True)
  self.lib.opendir.argtypes=[ctypes.c_char_p];self.lib.opendir.restype=ctypes.c_void_p
  self.lib.readdir.argtypes=[ctypes.c_void_p];self.lib.readdir.restype=ctypes.POINTER(Dirent)
  self.lib.rewinddir.argtypes=[ctypes.c_void_p];self.lib.closedir.argtypes=[ctypes.c_void_p]
  self.handle=self.lib.opendir(self.path.encode())
  if not self.handle:raise OSError(ctypes.get_errno(),'FD directory unavailable')
 def targets(self):
  self.lib.rewinddir(self.handle);names=[]
  while True:
   ctypes.set_errno(0);item=self.lib.readdir(self.handle)
   if not item:
    if ctypes.get_errno():raise OSError(ctypes.get_errno(),'FD roster unreadable')
    break
   name=item.contents.name.decode()
   if name.isdigit():names.append(name)
  # ENOENT/ESRCH/EACCES are uncertainty, never empty/absence.
  return {name:os.readlink(self.path+'/'+name) for name in sorted(names,key=int)}
 def close(self):self.lib.closedir(self.handle)
class LinuxProc:
 def snapshot(self):return {int(p.name):proc_identity(int(p.name)) for p in pathlib.Path('/proc').iterdir() if p.name.isdigit()}
 def fds(self,pid):return HeldFdDirectory(pid)
 def listeners(self):
  values=set()
  for table in ['tcp','tcp6']:
   for line in pathlib.Path('/proc/net',table).read_text().splitlines()[1:]:
    r=line.split()
    if len(r)<10:raise ObserverRefused('PARTIAL_SOCKET_TABLE')
    if r[3]=='0A':values.add(r[9])
  return values

def owned(pid,procs,controller):
 seen=set()
 while pid in procs and pid not in seen:
  seen.add(pid);v=procs[pid]
  if pid==controller['pid']:return v['birth']==controller['birth'] and v['uid']==1000
  pid=v['parent']
 return False

def inspect_pass(backend,request):
 started=int(time.time()*1000);before=backend.snapshot();controller=request['controller'];requester=request['requester']
 for expected in [controller,requester]:
  actual=before.get(expected['pid'])
  if not actual or actual['birth']!=expected['birth'] or actual['uid']!=request['uid']:raise ObserverRefused('CONTROLLER_OR_REQUESTER_CHANGED')
 if not owned(requester['pid'],before,controller):raise ObserverRefused('REQUESTER_ANCESTRY_CHANGED')
 inventory=[];foreign=[];refs=[];native_sockets=set()
 # All processes and all UIDs, including zombies/systemd/sd-pam, remain observed.
 for pid,identity in sorted(before.items()):
  native=identity['comm'].startswith(('chrome','chromium','loginom-ai-','bwrap'))
  if native and not owned(pid,before,controller):foreign.append({'pid':pid,'birth':identity['birth']})
  directory=backend.fds(pid)
  try:
   fds=directory.targets();again=directory.targets()
   if fds!=again:raise ObserverRefused('FD_ROSTER_RACE')
  finally:directory.close()
  for fd,target in fds.items():
   for index,profile in enumerate(request['profiles']):
    if profile in target:refs.append({'pid':pid,'birth':identity['birth'],'fd':fd,'profile':index})
   if native and target.startswith('socket:[') and target.endswith(']'):native_sockets.add(target[8:-1])
  inventory.append({k:identity[k] for k in ['pid','parent','birth','uid']}|{'fdCount':len(fds),'fdDigest':digest(fds)})
 after=backend.snapshot()
 if before!=after:raise ObserverRefused('PROCESS_ROSTER_OR_IDENTITY_RACE')
 listeners=backend.listeners()&native_sockets
 return {'complete':True,'startedAt':started,'finishedAt':int(time.time()*1000),'inventory':inventory,
  'originalPids':sorted(set(request['originalPids'])&set(before)), 'foreignNative':foreign,
  'denied':[{'kind':'native-debug-listener','inode':i} for i in sorted(listeners)],'profileFds':refs}

def two_passes(backend,request):
 a=inspect_pass(backend,request);time.sleep(.12);b=inspect_pass(backend,request)
 if a['inventory']!=b['inventory']:raise ObserverRefused('TWO_PASS_COHERENCE_CHANGED')
 return [a,b]

def file_identity(s):return (s.st_dev,s.st_ino,s.st_size,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_mtime_ns,s.st_ctime_ns)

def secure_file(file,mode):
 p=pathlib.Path(file)
 if str(p.resolve())!=str(p):raise ObserverRefused('ROOT_FILE_ALIAS')
 for d in [p.parent,*p.parents]:
  s=d.lstat()
  if s.st_uid!=0 or not stat.S_ISDIR(s.st_mode) or s.st_mode&0o022:raise ObserverRefused('ROOT_PARENT_UNTRUSTED')
 f=os.open(p,os.O_RDONLY|os.O_NOFOLLOW);s=os.fstat(f)
 try:
  if s.st_uid!=0 or s.st_nlink!=1 or not stat.S_ISREG(s.st_mode) or stat.S_IMODE(s.st_mode)!=mode:raise ObserverRefused('ROOT_FILE_UNTRUSTED')
  with os.fdopen(f,'rb',closefd=False) as h:data=h.read()
  if file_identity(os.fstat(f))!=file_identity(s) or file_identity(p.lstat())!=file_identity(s):raise ObserverRefused('ROOT_FILE_RACE')
  return data
 finally:os.close(f)

def validate_privileged_request(binding,request):
 required={'version','nonce','sourceSha','ownerSha256','uid','controller','requester','node','profiles','originalPids','namespaces'}
 if set(request)!=required or request['version']!=1 or not isinstance(request['nonce'],str) or len(request['nonce'])!=64 or any(c not in '0123456789abcdef' for c in request['nonce']):raise ObserverRefused('REQUEST_SHAPE')
 for k in ['sourceSha','ownerSha256','uid','node','profiles','originalPids','namespaces']:
  if request[k]!=binding[k]:raise ObserverRefused('REQUEST_BINDING')
 if request['uid']!=1000 or len(set(request['profiles']))!=6:raise ObserverRefused('REQUEST_UID_PROFILES')
 for key in ['controller','requester']:
  v=request[key]
  if set(v)!= {'pid','birth'} or type(v['pid'])!=int or v['pid']<=1 or not isinstance(v['birth'],str) or not v['birth'].isdigit():raise ObserverRefused('REQUEST_PID_BIRTH')
  actual=proc_identity(v['pid'])
  if actual['birth']!=v['birth'] or actual['uid']!=1000:raise ObserverRefused('REQUEST_PID_REUSED')
 # Producer must be a real child of the requesting inspector, not a remotely submitted proof.
 pid=os.getpid();seen=set()
 while pid!=request['requester']['pid']:
  if pid in seen or pid<=1:raise ObserverRefused('PRODUCER_ANCESTRY')
  seen.add(pid);pid=proc_identity(pid)['parent']
 pid=request['requester']['pid'];seen=set()
 while pid!=request['controller']['pid']:
  if pid in seen or pid<=1:raise ObserverRefused('CONTROLLER_ANCESTRY')
  seen.add(pid);v=proc_identity(pid)
  if v['uid']!=1000:raise ObserverRefused('CONTROLLER_ANCESTRY_UID')
  pid=v['parent']
 node=request['node'];exe=pathlib.Path('/proc')/str(request['controller']['pid'])/'exe'
 if os.readlink(exe)!=node['path']:raise ObserverRefused('KERNEL_NODE_PATH')
 s=exe.stat()
 if [s.st_dev,s.st_ino,s.st_size]!=[node['device'],node['inode'],node['bytes']]:raise ObserverRefused('KERNEL_NODE_IDENTITY')
 if hashlib.sha256(exe.read_bytes()).hexdigest()!=node['sha256'] or file_identity(exe.stat())!=file_identity(s):raise ObserverRefused('KERNEL_NODE_BYTES')
 argv=(exe.parent/'cmdline').read_bytes().split(b'\0')
 expected='/home/user/.local/share/loginom-evals-runtime/support/evalrunner-'+request['sourceSha']+'/lab57-owned-route.mjs'
 if len(argv)<4 or argv[:3]!=[node['path'].encode(),expected.encode(),b'execute']:raise ObserverRefused('CONTROLLER_COMMAND')
 for k,v in request['namespaces'].items():
  if k not in ['pid','mnt','user'] or os.readlink('/proc/self/ns/'+k)!=v or os.readlink(str(exe.parent/'ns'/k))!=v:raise ObserverRefused('NAMESPACE_CHANGED')
 return request

def sign_report(report,key):
 # Isolated SOURCE tests use only their own fixture key. Production key is root-owned,
 # already verified by main; there is no public signing endpoint or arbitrary command.
 signature=subprocess.run(['/usr/bin/openssl','dgst','-sha256','-sign',str(key)],input=canonical(report),capture_output=True,timeout=10,check=True).stdout
 import base64
 return {'report':report,'signature':base64.b64encode(signature).decode()}

def main():
 if sys.argv[1:]!=['--request-stdin'] or os.geteuid()!=0 or os.getuid()!=0:raise ObserverRefused('FD_OBSERVER_CAPABILITY_REQUIRED')
 caps=int(next(l.split()[1] for l in pathlib.Path('/proc/self/status').read_text().splitlines() if l.startswith('CapEff:')),16)
 if not caps&(1<<19):raise ObserverRefused('FD_OBSERVER_CAPABILITY_REQUIRED')
 script=pathlib.Path(__file__);root=script.parent
 if str(root)!='/var/lib/loginom-evals/fd-observer/'+root.name or len(root.name)!=40:raise ObserverRefused('ROOT_HELPER_PATH')
 binding=json.loads(secure_file(root/'binding.json',0o444));raw=secure_file(script,0o555)
 if binding['sourceSha']!=root.name or hashlib.sha256(raw).hexdigest()!=binding['scriptSha256']:raise ObserverRefused('ROOT_HELPER_BYTES')
 secure_file(root/'private.pem',0o600)
 request=json.loads(sys.stdin.buffer.read(16385))
 validate_privileged_request(binding,request)
 passes=two_passes(LinuxProc(),request)
 validate_privileged_request(binding,request)
 report={'version':1,'request':request,'producer':{'uid':0,'capSysPtrace':True},'passes':passes,'observedAt':int(time.time()*1000)}
 # RSA signing accepts stdin; key and raw privileged FD targets never leave root.
 print(json.dumps(sign_report(report,root/'private.pem')))
if __name__=='__main__':
 try:main()
 except Exception as error:
  gates={'PARTIAL_SOCKET_TABLE','CONTROLLER_OR_REQUESTER_CHANGED','REQUESTER_ANCESTRY_CHANGED','FD_ROSTER_RACE','PROCESS_ROSTER_OR_IDENTITY_RACE','TWO_PASS_COHERENCE_CHANGED','ROOT_FILE_ALIAS','ROOT_PARENT_UNTRUSTED','ROOT_FILE_UNTRUSTED','ROOT_FILE_RACE','REQUEST_SHAPE','REQUEST_BINDING','REQUEST_UID_PROFILES','REQUEST_PID_BIRTH','REQUEST_PID_REUSED','PRODUCER_ANCESTRY','CONTROLLER_ANCESTRY','CONTROLLER_ANCESTRY_UID','KERNEL_NODE_PATH','KERNEL_NODE_IDENTITY','KERNEL_NODE_BYTES','CONTROLLER_COMMAND','NAMESPACE_CHANGED','FD_OBSERVER_CAPABILITY_REQUIRED','ROOT_HELPER_PATH','ROOT_HELPER_BYTES'}
  safe={'status':'BLOCKED','reason':'FD_OBSERVER_REFUSED','exception':{'name':type(error).__name__ if type(error).__name__ in ['ObserverRefused','PermissionError','FileNotFoundError','ProcessLookupError','TimeoutExpired'] else 'REDACTED','code':getattr(error,'errno',None),'gate':str(error) if isinstance(error,ObserverRefused) and str(error) in gates else 'UNCLASSIFIED'}}
  print(json.dumps(safe));sys.exit(2)
