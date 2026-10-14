import {test,expect} from "bun:test"
import {generateKeyPairSync,sign,randomBytes} from "node:crypto"
import {queueDigest} from "../src/lab57-queue-scope"
import {verifyFdProof} from "../src/lab57-fd-observer"
import {mkdtemp,writeFile,chmod} from "node:fs/promises"
const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048})
const pub=publicKey.export({type:"spki",format:"pem"}).toString()
const request=()=>({version:1,nonce:randomBytes(32).toString("hex"),sourceSha:"b".repeat(40),ownerSha256:"7d343a0f13f97506770e08a24e10f2d3360c88754dfd7184776cef4508b0be64",uid:1000,controller:{pid:400,birth:"300"},requester:{pid:401,birth:"301"},node:{path:"/exact/node",sha256:"c".repeat(64),device:1,inode:2,bytes:3},profiles:["/p/a","/p/b","/p/c","/p/d","/p/e","/p/f"],originalPids:[10],namespaces:{pid:"pid:[1]",mnt:"mnt:[2]",user:"user:[3]"}})
const report=(req=request())=>({version:1,request:req,producer:{uid:0,capSysPtrace:true},passes:[1,2].map((n)=>({complete:true,originalPids:[],foreignNative:[],denied:[],profileFds:[],startedAt:Date.now()-500+n*200,finishedAt:Date.now()-450+n*200,inventory:[{pid:400,birth:"300",uid:1000,parent:1,fdCount:2,fdDigest:"d".repeat(64),nativeComm:null as string|null},{pid:401,birth:"301",uid:1000,parent:400,fdCount:2,fdDigest:"e".repeat(64),nativeComm:null as string|null}]})),observedAt:Date.now()})
function sealed(value:unknown){const raw=canonical(value);return {report:value,signature:sign("sha256",Buffer.from(raw),privateKey).toString("base64")}}
function canonical(v:unknown):string {if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";if(v&&typeof v==="object")return "{"+Object.entries(v).sort(([a],[b])=>a<b?-1:1).map(([k,x])=>JSON.stringify(k)+":"+canonical(x)).join(",")+"}";return JSON.stringify(v)}
test("sealed fresh two-pass observer is bound to exact request and root producer",()=>{const req=request(),proof=sealed(report(req));expect(verifyFdProof(proof as any,req as any,pub)).toBeDefined();expect(()=>verifyFdProof(proof as any,req as any,pub)).toThrow("FD_OBSERVER_REFUSED")})
for(const [name,change]of Object.entries({denied:(r:any):any=>r.passes[0].denied.push({pid:2030,kind:"EACCES"}),resource:(r:any):any=>r.passes[1].profileFds.push({pid:2028,profile:0}),foreign:(r:any):any=>r.passes[0].foreignNative.push({pid:9}),missing:(r:any):any=>r.passes[0].complete=false,partial:(r:any):any=>r.passes.pop(),stale:(r:any):any=>r.observedAt-=20000,reusedPID:(r:any):any=>r.passes[1].inventory[0].birth="999",race:(r:any):any=>r.passes[1].inventory.pop(),unprivileged:(r:any):any=>r.producer.uid=1000,capability:(r:any):any=>r.producer.capSysPtrace=false,wrongNode:(r:any):any=>r.request.node.inode=999,replayedRequest:(r:any):any=>r.request.nonce="f".repeat(64)}))test(`observer refuses ${name}`,()=>{const req=request(),r=report(structuredClone(req));change(r);expect(()=>verifyFdProof(sealed(r) as any,req as any,pub)).toThrow("FD_OBSERVER_REFUSED")})
test("fabricated signature refuses even if metadata looks complete",()=>expect(()=>verifyFdProof({...sealed(report()),signature:"fake"} as any,request() as any,pub)).toThrow("FD_OBSERVER_REFUSED"))
for(const [before,after] of [[null,"chrome"],["chrome",null],["chrome","chromium"]] as const)test("signed consumer refuses between-pass native labels "+before+"→"+after,()=>{
 const req=request(),r=report(req)
 r.passes[0]!.inventory[1]!.nativeComm=before;r.passes[1]!.inventory[1]!.nativeComm=after
 expect(()=>verifyFdProof(sealed(r) as Parameters<typeof verifyFdProof>[0],req as Parameters<typeof verifyFdProof>[1],pub)).toThrow("FD_OBSERVER_REFUSED")
})
test("signed consumer refuses omitted native label even with a valid signature",()=>{
 const req=request(),r=report(req)
 const entry:Record<string,unknown>=r.passes[0]!.inventory[1]!;delete entry.nativeComm
 expect(()=>verifyFdProof(sealed(r) as Parameters<typeof verifyFdProof>[0],req as Parameters<typeof verifyFdProof>[1],pub)).toThrow("FD_OBSERVER_REFUSED")
})
test("actual Python/OpenSSL producer wire verifies in Node crypto and tampering refuses",async()=>{
 const root=await mkdtemp('/tmp/lab57-sign-source-'),req=request(),body=report(req)
 await writeFile(root+'/fixture.pem',privateKey.export({type:'pkcs8',format:'pem'}));await chmod(root+'/fixture.pem',0o600)
 await writeFile(root+'/report.json',JSON.stringify(body))
 const script="import importlib.util,json,sys; s=importlib.util.spec_from_file_location('o',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m); print(json.dumps(m.sign_report(json.load(open(sys.argv[2])),sys.argv[3])))"
 const child=Bun.spawn(['/usr/bin/python3','-c',script,new URL('../script/lab57-fd-observer.py',import.meta.url).pathname,root+'/report.json',root+'/fixture.pem'],{stdout:'pipe',stderr:'pipe'})
 const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);expect(code).toBe(0);expect(err).toBe('')
 const proof=JSON.parse(out);expect(verifyFdProof(proof,req as any,pub)).toHaveLength(2)
 proof.report.request.nonce='0'.repeat(64);expect(()=>verifyFdProof(proof,proof.report.request,pub)).toThrow('FD_OBSERVER_REFUSED')
})

test("concrete producer covers denied/missing/race/reused/foreign/resource cases and true open FDs",async()=>{
 const script=`import importlib.util,sys,os,tempfile,copy,pathlib,json
s=importlib.util.spec_from_file_location('observer',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
req={'controller':{'pid':100,'birth':'20'},'requester':{'pid':101,'birth':'21'},'uid':1000,'profiles':['/fixture/p'+str(i) for i in range(6)],'originalPids':[90]}
class Directory:
 def __init__(self,backend,pid):self.backend=backend;self.pid=pid;self.count=0
 def targets(self):
  self.count+=1
  if self.backend.mode=='denied' and self.pid==2030:raise PermissionError(13,'denied')
  if self.backend.mode=='missing' and self.pid==2028:raise FileNotFoundError(2,'missing')
  if self.backend.mode=='race' and self.count==2:return {'1':'changed'}
  if self.backend.mode=='resource' and self.pid==2028:return {'3':'/fixture/p0/data'}
  return {}
 def close(self):pass
class Fixture:
 def __init__(self,mode):self.mode=mode;self.n=0
 def snapshot(self):
  self.n+=1
  r={100:{'pid':100,'parent':1,'birth':'20','uid':1000,'comm':'node'},101:{'pid':101,'parent':100,'birth':'21','uid':1000,'comm':'python3'},2028:{'pid':2028,'parent':1,'birth':'11658','uid':1000,'comm':'systemd'},2030:{'pid':2030,'parent':2028,'birth':'11666','uid':1000,'comm':'(sd-pam)'}}
  if self.mode=='reuse' and self.n>1:r[100]['birth']='999'
  if self.mode=='foreign':r[2028]['comm']='chromium'
  if self.mode=='partial' and self.n>1:r.pop(2030)
  return r
 def fds(self,pid):return Directory(self,pid)
 def listeners(self):return set()
assert len(m.two_passes(Fixture('valid'),req))==2
for mode in ['denied','missing','race','reuse','partial']:
 try:m.two_passes(Fixture(mode),req)
 except Exception:continue
 raise Exception('Uncertainty accepted: '+mode)
assert m.two_passes(Fixture('foreign'),req)[0]['foreignNative']
assert m.two_passes(Fixture('resource'),req)[0]['profileFds'][0]['pid']==2028
# True Linux FD remains observable even when it is the producer itself.
with tempfile.TemporaryDirectory(prefix='lab57-fd-') as d:
 p=pathlib.Path(d)/'held';p.write_bytes(b'SOURCE fixture');fd=os.open(p,os.O_RDONLY)
 directory=m.HeldFdDirectory(os.getpid())
 try:assert str(p) in directory.targets().values();assert directory.targets()==directory.targets()
 finally:directory.close();os.close(fd)
print(json.dumps({'sourceOnly':True,'genuineOpenFD':True,'deniedNeverAbsence':True,'fixtureModes':8}))`
 const child=Bun.spawn(['/usr/bin/python3','-c',script,new URL('../script/lab57-fd-observer.py',import.meta.url).pathname],{stdout:'pipe',stderr:'pipe'})
 const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
 expect(code).toBe(0);expect(err).toBe('');expect(JSON.parse(out).genuineOpenFD).toBe(true)
})
test("privileged transport executable refuses unprivileged SOURCE caller before request or effects",async()=>{
 const child=Bun.spawn(['/usr/bin/python3','-I',new URL('../script/lab57-fd-observer.py',import.meta.url).pathname,'--request-stdin'],{stdout:'pipe',stderr:'pipe',stdin:'pipe'})
 child.stdin.write('{}');child.stdin.end();const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
 expect(code).toBe(2);expect(JSON.parse(out).reason).toBe('FD_OBSERVER_REFUSED');expect(JSON.parse(out).exception.gate).toBe('FD_OBSERVER_CAPABILITY_REQUIRED');expect(err).toBe('')
})
