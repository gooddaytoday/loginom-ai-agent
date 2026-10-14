import { test, expect } from "bun:test"
import { mkdtemp, chmod, readFile, lstat, symlink, writeFile } from "node:fs/promises"
import { runInNewContext } from "node:vm"
import { dispatcherFixture } from "./lab57-dispatcher.test"
import { dispatcherBrowserCode } from "../src/lab57-dispatcher-browser"
import { dispatcherDigest, dispatcherScope } from "../src/lab57-dispatcher"
import { parseDispatcherResponse, reserveDispatcherClose, runDispatcherBoundary } from "../src/lab57-dispatcher-transport"
import { connectDispatcherMcp } from "../src/lab57-dispatcher-host"
import type { DispatcherInventory } from "../src/lab57-dispatcher"

const root = async () => {const r=await mkdtemp("/tmp/dispatcher-test-");await chmod(r,0o700);return r}
const envelope = (r: unknown) => ({content:[{type:"text",text:`### Result\n${JSON.stringify(r)}\n### Ran Playwright code\n(private)`}]})

test("MCP parser rejects error, duplicate, missing and invalid response without echoing raw secrets",()=> {
  expect(parseDispatcherResponse(envelope({version:1}))).toEqual({version:1})
  for (const r of [null,{isError:true,content:[{type:"text",text:"SECRET"}]},{content:[]},
    {content:[{type:"text",text:"SECRET"}]},{content:[{type:"text",text:"{}"},{type:"text",text:"{}"}]}])
    expect(()=>parseDispatcherResponse(r)).toThrow()
})

test("durable once uses real private wx/fsync and is retained after duplicate/error",async()=> {
  const r=await root(),{original,inventory}=dispatcherFixture(),target=inventory.sessions[1]!
  const reservation=await reserveDispatcherClose(r,original,target,dispatcherDigest(inventory))
  expect((await lstat(reservation.file)).mode&0o777).toBe(0o600)
  expect(JSON.parse(await readFile(reservation.file,"utf8")).state).toBe("CONSUMED_BEFORE_EFFECT")
  await expect(reserveDispatcherClose(r,original,target,dispatcherDigest(inventory))).rejects.toThrow()
  expect(await readFile(reservation.file,"utf8")).toContain(reservation.originalSha)
})
test("nonprivate, symlink or nonexistent root refuses before effect",async()=> {
  const r=await root(),{original,inventory}=dispatcherFixture();await chmod(r,0o755)
  await expect(reserveDispatcherClose(r,original,inventory.sessions[1]!,"sha")).rejects.toThrow()
  await expect(reserveDispatcherClose(r+"/absent",original,inventory.sessions[1]!,"sha")).rejects.toThrow()
  await chmod(r,0o700);await symlink(r,r+"-link")
  await expect(reserveDispatcherClose(r+"-link",original,inventory.sessions[1]!,"sha")).rejects.toThrow()
})

// Only in the closed fake mode: actual transport automation executes against static protocol responses.
function fakeCall(sequence: unknown[]) {
  if (process.env.EVAL_CLI_MODE!=="fake") throw Error("SYNTHETIC_CONTOUR_REQUIRED")
  const calls: string[]=[]
  return {calls,call:async(request:{name:"browser_run_code_unsafe";arguments:{code:string}})=> {
    calls.push(request.arguments.code)
    const item=sequence.shift();if(item instanceof Error)throw item
    if(item===undefined)throw Error("NO_SYNTHETIC_RESPONSE")
    return envelope(item)
  }}
}
function inventories() {
  const f=dispatcherFixture(), second=structuredClone(f.inventory);second.collectedAt++
  const after=structuredClone(second);after.collectedAt++;after.sessions.pop();after.countBefore=after.countAfter=1
  const post=structuredClone(after);post.collectedAt++
  return {...f,second,after,post}
}
test("no admission means no observe/close/once",async()=> {
  const f=inventories(),fake=fakeCall([f.inventory]),r=await root()
  await expect(runDispatcherBoundary(fake.call,f.original,r,async()=>{throw Error("ORIGINAL_ADMISSION_FAILED")})).rejects.toThrow()
  expect(fake.calls.length).toBe(0)
})
test("writable target blocks before once or native close",async()=> {
  const f=inventories();f.inventory.sessions[1]!.packages[0]!.readOnly=false;f.second.sessions[1]!.packages[0]!.readOnly=false
  const fake=fakeCall([f.inventory,f.second]),r=await root()
  await expect(runDispatcherBoundary(fake.call,f.original,r,async()=>{})).rejects.toThrow("WRITABLE_TARGET_DIRTY_STATE_UNOBSERVABLE")
  expect(fake.calls.length).toBe(2)
  await expect(lstat(r+"/lab57-original-dispatcher-close.once")).rejects.toThrow()
})
test("stable absence performs no closure and preserves ERROR/UNCONFIRMED",async()=> {
  const f=inventories(),fake=fakeCall([f.after,f.post])
  const proof=await runDispatcherBoundary(fake.call,f.original,await root(),async()=>{})
  expect(fake.calls.length).toBe(2);expect(proof.serverName).toBeNull();expect(proof.cleanup).toBe("UNCONFIRMED")
})
test("native ACK plus stable complete post-observations can prove scoped cessation, not cleanup",async()=> {
  const f=inventories(),fake=fakeCall([f.inventory,f.second,{version:1,operation:"addressed_close",acknowledged:true,before:f.second,after:f.after},f.post])
  const proof=await runDispatcherBoundary(fake.call,f.original,await root(),async()=>{})
  expect(fake.calls.length).toBe(4);expect(proof.serverName).toBe("user:123");expect(proof.originalOutcome).toBe("ERROR")
})
for (const [label,response] of [ ["transport disappearance",new Error("SECRET_REMOTE_ERROR")],
  ["native refusal",{version:1,operation:"addressed_close",acknowledged:false}],
  ["missing result",{}] ] as const) test(`once remains spent after ${label}`,async()=> {
  const f=inventories(),fake=fakeCall([f.inventory,f.second,response]),r=await root()
  await expect(runDispatcherBoundary(fake.call,f.original,r,async()=>{})).rejects.toThrow()
  expect(fake.calls.length).toBe(3);expect((await lstat(r+"/lab57-original-dispatcher-close.once")).isFile()).toBe(true)
  expect(JSON.parse(await readFile(r+"/dispatcher-failure.json","utf8")).effect_possible).toBe(true)
  await expect(reserveDispatcherClose(r,f.original,f.second.sessions[1]!,dispatcherDigest(f.second))).rejects.toThrow()
})
test("changed native precondition or partial post observation does not certify cessation",async()=> {
  const f=inventories();const altered=structuredClone(f.second);altered.sessions[0]!.name="admin:998"
  const fake=fakeCall([f.inventory,f.second,{version:1,operation:"addressed_close",acknowledged:true,before:altered,after:f.after}])
  await expect(runDispatcherBoundary(fake.call,f.original,await root(),async()=>{})).rejects.toThrow()
})
test("final admission failure leaves once consumed and skips native close",async()=> {
  const f=inventories(),fake=fakeCall([f.inventory,f.second]),r=await root();let n=0
  await expect(runDispatcherBoundary(fake.call,f.original,r,async()=>{if(++n===3)throw Error("RACE")})).rejects.toThrow()
  expect(fake.calls.length).toBe(2);expect((await lstat(r+"/lab57-original-dispatcher-close.once")).isFile()).toBe(true)
  expect(JSON.parse(await readFile(r+"/dispatcher-failure.json","utf8")).effect_possible).toBe(false)
})
test("tampered private once is refused before native effect",async()=> {
  const f=inventories(),fake=fakeCall([f.inventory,f.second]),r=await root();let n=0
  await expect(runDispatcherBoundary(fake.call,f.original,r,async()=>{
    if(++n===3)await writeFile(r+"/lab57-original-dispatcher-close.once","changed")
  })).rejects.toThrow("PRE_EFFECT_GATE_REFUSED_ONCE_RETAINED")
  expect(fake.calls.length).toBe(2)
})

/** Executes generated browser transport as JS, with NO browser/network in the EVAL_CLI_MODE=fake contour. */
async function vendorFixture(v: DispatcherInventory, close=false, alter?: (rows: DispatcherInventory["sessions"])=>void) {
  if(process.env.EVAL_CLI_MODE!=="fake")throw Error("SYNTHETIC_CONTOUR_REQUIRED")
  const rows=structuredClone(v.sessions), calls:string[]=[]
  alter?.(rows)
  const packageProxy=(p:typeof rows[number]["packages"][number])=>({key:p.key,Name:p.name,Path:p.path,CreateTime:new Date(p.created!),ModifyTime:new Date(p.modified!),ReadOnly:p.readOnly,ReferenceCount:p.references,Progress:p.running?{}:null})
  const sessionProxy=(s:typeof rows[number])=>({key:s.key,Name:s.name,SessionType:s.type,CreateTime:new Date(s.created),SessionIP:s.ip,LastTime:new Date(s.last),PendingDisconnect:s.pendingDisconnect,Count:s.packageCount,PackageInfo:async(i:number)=>packageProxy(s.packages[i]!)})
  const manager={get Count(){return rows.length},UpdateSessionInfos:async()=>{calls.push("refresh")},SessionInfo:async(i:number)=>{calls.push(`session:${i}`);return sessionProxy(rows[i]!)},
    CloseSession:async(s:{key:string},timeout:number)=>{calls.push(`close:${s.key}:${timeout}`);const i=rows.findIndex(r=>r.key===s.key);if(i<0)return false;rows.splice(i,1);return true}}
  const fakeWindow={bg:{app:{Version:"7.4.2",CurrentUser:{Get:()=>({IsAdmin:true})},Application:{FInstance:{GetConnection:()=>({Connected:true,ServerContainer:{Session:{}}})}}},IBGDeductorSessionsManagerContainer:{},objectId:async(o:{key:string})=>({toString:()=>o.key})},safeCast:()=>({GetSessionsManager:async()=>manager})}
  const context={window:fakeWindow,location:{origin:"http://localhost"},document:{querySelectorAll:()=>[]},Date,Map,getComputedStyle:()=>({visibility:"hidden"}),page:{evaluate:async(fn:(o:unknown)=>Promise<unknown>,o:unknown)=>fn(o)}}
  const code=dispatcherBrowserCode(close?v.sessions[1]!:null,close?v:null)
  const fn=runInNewContext(`(${code})`,context) as (page:typeof context.page)=>Promise<unknown>
  return {value:await fn(context.page),calls}
}
test("generated observer exhausts actual indexed vendor interface, including packages",async()=> {
  const f=dispatcherFixture(),r=await vendorFixture(f.inventory)
  expect((r.value as DispatcherInventory).sessions).toEqual(f.inventory.sessions)
  expect(r.calls).toEqual(["refresh","session:0","session:1"])
})
test("generated native closure addresses the same proxy exactly once and preserves observer",async()=> {
  const f=dispatcherFixture(),r=await vendorFixture(f.inventory,true)
  const value=r.value as {acknowledged:boolean;after:DispatcherInventory}
  expect(value.acknowledged).toBe(true);expect(value.after.sessions.length).toBe(1)
  expect(r.calls.filter(s=>s.startsWith("close:"))).toEqual(["close:original-ref:0"])
})
for(const [label,alter] of Object.entries({
  "changed incarnation":(rows:DispatcherInventory["sessions"])=>{rows[1]!.created++},
  "changed private proxy":(rows:DispatcherInventory["sessions"])=>{rows[1]!.key="replacement"},
  "changed path":(rows:DispatcherInventory["sessions"])=>{rows[1]!.packages[0]!.path="/foreign/a.lgp"},
  "new executing process":(rows:DispatcherInventory["sessions"])=>{rows[1]!.packages[0]!.running=true},
  "became writable":(rows:DispatcherInventory["sessions"])=>{rows[1]!.packages[0]!.readOnly=false},
  "foreign membership":(rows:DispatcherInventory["sessions"])=>{rows.push({...structuredClone(rows[1]!),key:"foreign"})},
}))test(`generated closure blocks native ${label} race`,async()=>{
  const f=dispatcherFixture();await expect(vendorFixture(f.inventory,true,alter)).rejects.toThrow("CLOSE_TARGET_CHANGED_OR_UNSAFE")
})
test("unsafe selector/foreign path and unbound native target cannot produce close code",()=> {
  const f=dispatcherFixture();expect(()=>dispatcherBrowserCode(f.inventory.sessions[1]!)).toThrow()
  f.inventory.sessions[1]!.packages[0]!.path="/foreign/unknown.lgp"
  expect(()=>dispatcherBrowserCode(f.inventory.sessions[1]!,f.inventory)).toThrow()
})
test("offline entrypoint rejects all live/apply/recovery flags before opening inputs",async()=> {
  for(const flag of ["--apply","recover","close","--login","--live"]){
    const child=Bun.spawn([process.execPath,new URL("../script/lab57-dispatcher-candidate.ts",import.meta.url).pathname,flag,"/unavailable"],{stdout:"pipe",stderr:"pipe"})
    const [code,text]=await Promise.all([child.exited,new Response(child.stdout).text()])
    expect(code).toBe(2);expect(JSON.parse(text).reason).toBe("LIVE_NOT_ASSIGNED")
  }
})

test("MCP connector refuses before opening any native/config source if original admission is missing",async()=> {
  await expect(connectDispatcherMcp({directory:"/unavailable",browserCli:"/unavailable",browserConfig:"/unavailable"},async()=>{
    throw Error("OWNER_OR_ONCE_UNCONFIRMED")
  })).rejects.toThrow("OWNER_OR_ONCE_UNCONFIRMED")
})
test("Node executable candidate builds and functions on exact bundled Node without native connection",async()=> {
  const build=await Bun.build({entrypoints:[new URL("../src/lab57-dispatcher-runtime.ts",import.meta.url).pathname],target:"node",format:"esm"})
  expect(build.success).toBe(true);expect(build.outputs.length).toBe(1)
  const r=process.env.LAB57_SOURCE_PROOF!+"/dispatcher-candidate.mjs"
  await Bun.write(r,build.outputs[0]!)
  const {original,inventory}=dispatcherFixture()
  const script=`import {correlateDispatcher,dispatcherBrowserCode} from ${JSON.stringify(r)};\n`+
    `console.log(JSON.stringify({node:process.versions.node,decision:correlateDispatcher(${JSON.stringify(inventory)},${JSON.stringify(original)}).status,code:dispatcherBrowserCode().startsWith('async page')}))`
  const child=Bun.spawn(["/opt/node","--input-type=module","-e",script],{stdout:"pipe",stderr:"pipe"})
  const [code,text,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
  expect(err).toBe("");expect(code).toBe(0)
  expect(JSON.parse(text)).toEqual({node:"24.19.0",decision:"BOUND_PRESENT",code:true})
})
