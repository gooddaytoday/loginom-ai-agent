import {test,expect} from "bun:test"

test("observer retains nonnative command-label changes with exact process identity and full FD inventory",async()=>{
 const code=String.raw`
import importlib.util,sys,json
s=importlib.util.spec_from_file_location('observer',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
request={'controller':{'pid':100,'birth':'20'},'requester':{'pid':101,'birth':'21'},'uid':1000,'profiles':['/fixture/p'+str(i) for i in range(6)],'originalPids':[90]}
class Directory:
 def targets(self):return {}
 def close(self):pass
class Backend:
 def __init__(self):self.calls=0
 def snapshot(self):
  self.calls+=1
  return {100:{'pid':100,'parent':1,'birth':'20','uid':1000,'comm':'node'},101:{'pid':101,'parent':100,'birth':'21','uid':1000,'comm':'python3'},200:{'pid':200,'parent':2,'birth':'30','uid':0,'comm':'kworker/2:0-events' if self.calls%2 else 'kworker/2:0+events'}}
 def fds(self,pid):return Directory()
 def listeners(self):return set()
passes=m.two_passes(Backend(),request)
assert len(passes)==2 and all(len(p['inventory'])==3 for p in passes)
assert all(any(i['pid']==200 and i['birth']=='30' and i['uid']==0 and i['parent']==2 for i in p['inventory']) for p in passes)
print(json.dumps({'fullInventory':True,'stableIdentity':True,'commandLabelOnly':True}))
`
 const child=Bun.spawn(["/usr/bin/python3","-c",code,new URL("../script/lab57-fd-observer.py",import.meta.url).pathname],{stdout:"pipe",stderr:"pipe"})
 const [exit,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
 expect(exit).toBe(0);expect(stderr).toBe("");expect(JSON.parse(stdout).fullInventory).toBe(true)
})

for(const mode of ["native-enter","native-leave","native-rename","birth","uid","parent","between-enter","between-leave","between-rename"])test("observer still refuses changed "+mode,async()=>{
 const code=String.raw`
import importlib.util,sys
s=importlib.util.spec_from_file_location('observer',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
request={'controller':{'pid':100,'birth':'20'},'requester':{'pid':101,'birth':'21'},'uid':1000,'profiles':['/fixture/p'+str(i) for i in range(6)],'originalPids':[90]}
class Directory:
 def targets(self):return {}
 def close(self):pass
class Backend:
 def __init__(self):self.calls=0
 def snapshot(self):
  self.calls+=1;mode=sys.argv[2]
  row={'pid':200,'parent':2,'birth':'30','uid':0,'comm':'node'}
  if mode in ['native-leave','native-rename','between-leave','between-rename']:row['comm']='chrome'
  if self.calls>1:
   if mode=='native-enter':row['comm']='chrome'
   if mode=='native-leave':row['comm']='node'
   if mode=='native-rename':row['comm']='bwrap'
   if mode=='birth':row['birth']='31'
   if mode=='uid':row['uid']=1000
   if mode=='parent':row['parent']=3
  if self.calls>2 and mode=='between-enter':row['comm']='chrome'
  if self.calls>2 and mode=='between-leave':row['comm']='node'
  if self.calls>2 and mode=='between-rename':row['comm']='chromium'
  return {100:{'pid':100,'parent':1,'birth':'20','uid':1000,'comm':'node'},101:{'pid':101,'parent':100,'birth':'21','uid':1000,'comm':'python3'},200:row}
 def fds(self,pid):return Directory()
 def listeners(self):return set()
m.two_passes(Backend(),request)
`
 const child=Bun.spawn(["/usr/bin/python3","-c",code,new URL("../script/lab57-fd-observer.py",import.meta.url).pathname,mode],{stdout:"pipe",stderr:"pipe"})
 const [exit,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
 expect(exit).not.toBe(0);expect(stdout).toBe("");expect(stderr).toContain(mode.startsWith("between-")?"TWO_PASS_COHERENCE_CHANGED":"PROCESS_ROSTER_OR_IDENTITY_RACE")
})
