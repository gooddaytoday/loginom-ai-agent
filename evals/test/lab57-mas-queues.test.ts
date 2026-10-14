import {test,expect} from "bun:test"
import {validateFreshRouteState,ownedCsv,originalContainerStartedAt} from "../src/lab57-route-admission"
import {lab57CleanupScope} from "../src/lab57-cleanup-proposal"
import {inspectQueueInventory,queueDigest} from "../src/lab57-queue-scope"
import {queueFixture,queueFollowup,queueMas,queueOriginal,queueBen,queueForeign} from "./fixtures/lab57-mas-queues"
import type {QueueInventory} from "../src/lab57-queue-scope"
import type {FreshRouteState} from "../src/lab57-route-admission"
import {mkdir} from "node:fs/promises"
// Synthetic source fixtures; none grants native admission or reports live queue state.
const state=(inventory=queueFixture()):FreshRouteState&{queueLedger:ReturnType<typeof inspectQueueInventory>;pendingWorkers:Record<string,unknown>[]}=>{const ledger=inspectQueueInventory(inventory,queueFollowup);return {passes:[{originalPids:[],foreignNative:[],denied:[],profileFds:[]},{originalPids:[],foreignNative:[],denied:[],profileFds:[]}],
 profiles:6,foreignMarkers:[],pendingWorkers:ledger.blocked,queueInventory:inventory,queueLedger:ledger,queuesChecked:8,checkedAt:Date.now(),container:{id:lab57CleanupScope.containerId,startedAt:originalContainerStartedAt,running:true,mounts:[]},storage:[{...ownedCsv}]}}
test("owner-attested exact mas pending is eligible without requiring global idle",()=>{
 const s=state();expect(s.queueLedger.excluded.length).toBe(1);expect(s.queueLedger.pendingCount).toBe(2)
 expect(()=>validateFreshRouteState(s,false,queueFollowup)).not.toThrow()
})
test("original owner pending cannot become the new followup exemption",()=>{
 const v=queueFixture();v.agents[0]!.pages[0]!.rows[0]!.id=lab57CleanupScope.task;resign(v)
 expect(()=>inspectQueueInventory(v,lab57CleanupScope.task)).toThrow()
})
test("eligible mas rows cannot bypass the other fresh host gates",()=>{
 const changes=[(s:ReturnType<typeof state>)=>s.profiles=5,(s:ReturnType<typeof state>)=>s.container.mounts.push("foreign"),
  (s:ReturnType<typeof state>)=>s.container.id="foreign",(s:ReturnType<typeof state>)=>s.container.startedAt="changed",
  (s:ReturnType<typeof state>)=>s.passes[0]!.originalPids.push(123),(s:ReturnType<typeof state>)=>s.passes[0]!.foreignNative.push(123),
  (s:ReturnType<typeof state>)=>s.passes[0]!.denied.push(123),(s:ReturnType<typeof state>)=>s.passes[1]!.profileFds.push(123),
  (s:ReturnType<typeof state>)=>s.foreignMarkers.push("foreign"),(s:ReturnType<typeof state>)=>s.storage[0]!.sha256="changed",
  (s:ReturnType<typeof state>)=>s.storage[0]!.identity="changed",(s:ReturnType<typeof state>)=>s.storage.push({...ownedCsv}),
  (s:ReturnType<typeof state>)=>s.checkedAt-=20000]
 for(const change of changes){const s=state();change(s);expect(()=>validateFreshRouteState(s,false,queueFollowup)).toThrow()}
})
function resign(inventory:QueueInventory){for(const scan of inventory.agents)for(const page of scan.pages)page.rowsSha256=queueDigest(page.rows)}
const rowChanges:Record<string,(v:QueueInventory)=>void>={
 "original runtime":v=>v.agents[1]!.pages[0]!.rows[0]!.runtime_id=queueOriginal,
 "null task runtime":v=>v.agents[1]!.pages[0]!.rows[0]!.runtime_id=null,
 "missing task runtime":v=>Reflect.deleteProperty(v.agents[1]!.pages[0]!.rows[0]!,"runtime_id"),
 "malformed task runtime":v=>v.agents[1]!.pages[0]!.rows[0]!.runtime_id=42,
 "unknown task runtime":v=>v.agents[1]!.pages[0]!.rows[0]!.runtime_id="unknown",
 "other UUID with label mas":v=>{v.agents[1]!.pages[0]!.rows[0]!.runtime_id="00000000-0000-4000-8000-000000000099";Object.assign(v.roster[1]!,{label:"mas",runtime_id:"00000000-0000-4000-8000-000000000099"})},
 "conflicting task/agent runtime":v=>v.roster[1]!.runtime_id=queueOriginal,
 "missing agent runtime":v=>Reflect.deleteProperty(v.roster[1]!,"runtime_id"),
 "null agent runtime":v=>v.roster[1]!.runtime_id=null,
 "unknown agent runtime":v=>v.roster[1]!.runtime_id="unknown",
 "malformed agent runtime":v=>v.roster[1]!.runtime_id=42,
 "wrong roster agent":v=>v.agents[1]!.pages[0]!.rows[0]!.agent_id=queueBen,
 "missing task agent":v=>Reflect.deleteProperty(v.agents[1]!.pages[0]!.rows[0]!,"agent_id"),
 "original owner disguised as mas":v=>v.agents[1]!.pages[0]!.rows[0]!.id=lab57CleanupScope.task,
 "mas plus original":v=>v.agents[1]!.pages[0]!.rows.push({id:lab57CleanupScope.task,status:"running",agent_id:queueForeign,runtime_id:queueOriginal}),
 "mas plus unknown":v=>v.agents[1]!.pages[0]!.rows.push({id:lab57CleanupScope.task,status:"queued",agent_id:queueForeign,runtime_id:null}),
 "another current Ben task":v=>v.agents[0]!.pages[0]!.rows.push({id:lab57CleanupScope.task,status:"running",agent_id:queueBen,runtime_id:queueOriginal}),
 "wrong followup status":v=>v.agents[0]!.pages[0]!.rows[0]!.status="queued",
 "wrong followup UUID":v=>v.agents[0]!.pages[0]!.rows[0]!.id=lab57CleanupScope.task,
 "wrong followup runtime":v=>v.agents[0]!.pages[0]!.rows[0]!.runtime_id=queueMas,
 "wrong controller roster":v=>v.roster[0]!.runtime_id=queueMas,
 "missing controller":v=>v.agents[0]!.pages[0]!.rows=[],
}
for(const [name,change]of Object.entries(rowChanges))test(`scoped admission refuses ${name}`,()=>{
 const v=queueFixture();change(v);resign(v)
 expect(()=>validateFreshRouteState(state(v),false,queueFollowup)).toThrow()
})
const forged:Record<string,(s:ReturnType<typeof state>)=>void>={
 "missing ledger":s=>Reflect.deleteProperty(s,"queueLedger"),
 "missing inventory":s=>Reflect.deleteProperty(s,"queueInventory"),
 "wrong inventory hash":s=>s.queueLedger.inventorySha256="f".repeat(64),
 "wrong record count":s=>s.queueLedger.recordCount++,
 "wrong pending count":s=>s.queueLedger.pendingCount++,
 "wrong page count":s=>s.queueLedger.pageCount++,
 "wrong roster count":s=>s.queueLedger.rosterCount++,
 "wrong authority hash":s=>{Object.assign(s.queueLedger,{ownerAmendmentSha256:"f".repeat(64)})},
 "hidden exclusion":s=>s.queueLedger.excluded=[],
 "wrong exclusion binding":s=>s.queueLedger.excluded[0]!.taskRuntime=queueOriginal,
 "wrong exclusion reason":s=>s.queueLedger.excluded[0]!.reason="LABEL_MAS",
 "wrong exclusion authority":s=>s.queueLedger.excluded[0]!.ownerAmendmentSha256="f".repeat(64),
 "fake blocked partition":s=>s.queueLedger.blocked=[s.queueLedger.excluded[0]!],
 "fake current-task exemption":s=>s.queueLedger.controller.push(s.queueLedger.excluded[0]!),
 "filtered pending mismatch":s=>s.pendingWorkers=[s.queueLedger.excluded[0]!],
}
for(const [name,change]of Object.entries(forged))test(`production admission rejects ${name}`,()=>{
 const s=state();change(s);expect(()=>validateFreshRouteState(s,false,queueFollowup)).toThrow()
})
const cursor="2026-10-10T08:19:23.229165Z|01a124e5-33da-760e-99b8-ede89284188f"
function pagesFixture(blocking=false){const v=queueFixture(),first=v.agents[1]!.pages[0]!;first.next=cursor
 const rows=[{id:"00000000-0000-4000-8000-000000000099",status:"running",agent_id:queueForeign,runtime_id:blocking?queueOriginal:queueMas}]
 v.agents[1]!.pages.push({before:cursor,next:null,rows,rowsSha256:queueDigest(rows),stdoutSha256:queueDigest(rows),stderrSha256:queueDigest("")})
 return v
}
test("full paginated inventory preserves mas rows and a blocking last-page row",()=>{
 const v=pagesFixture();const ledger=inspectQueueInventory(v,queueFollowup)
 expect(ledger.pageCount).toBe(9);expect(ledger.recordCount).toBe(3);expect(ledger.excluded.length).toBe(2)
 expect(()=>validateFreshRouteState(state(v),false,queueFollowup)).not.toThrow()
 const blocked=state(pagesFixture(true));expect(blocked.queueLedger.excluded.length).toBe(1);expect(blocked.pendingWorkers.length).toBe(1)
 expect(()=>validateFreshRouteState(blocked,false,queueFollowup)).toThrow()
})
test("the five handed-off mas identities and every pending status retain exact binding and accounting",()=>{
 const v=queueFixture(),ids=["01a13927-fe40-76bb-b3d3-303a35454c6f","01a13922-14d1-7c76-8dea-a96d925a5a4a","01a13919-c844-73f5-b0a6-f05629b14a26","01a13884-799a-7679-86e0-05c560522e19","01a13545-d71b-7b39-9d4d-490dbfead7c8"]
 v.agents[1]!.pages[0]!.rows=ids.map((id,i)=>({id,status:["queued","pending","running","retrying","scheduled"][i]!,agent_id:queueForeign,runtime_id:queueMas}));resign(v)
 const s=state(v);expect(s.queueLedger.excluded.map(r=>r.task)).toEqual(ids);expect(s.queueLedger.pendingCount).toBe(6)
 expect(s.queueLedger.recordCount).toBe(6);expect(s.queueLedger.blocked.length).toBe(0)
 expect(()=>validateFreshRouteState(s,false,queueFollowup)).not.toThrow()
})
const paginationChanges:Record<string,(v:QueueInventory)=>void>={
 "missing last page":v=>v.agents[1]!.pages.pop(),
 "cyclic cursor":v=>{v.agents[1]!.pages[1]!.next=cursor},
 "wrong before cursor":v=>v.agents[1]!.pages[1]!.before=null,
 "malformed cursor":v=>v.agents[1]!.pages[0]!.next="unsafe",
 "duplicate task":v=>v.agents[1]!.pages[1]!.rows.push(v.agents[1]!.pages[0]!.rows[0]!),
 "duplicate across agents":v=>v.agents[2]!.pages[0]!.rows.push(v.agents[1]!.pages[0]!.rows[0]!),
 "duplicate roster":v=>v.roster[2]=v.roster[1]!,
 "missing agent inventory":v=>v.agents.pop(),
 "reordered roster":v=>v.roster.reverse(),
 "rows hash":v=>v.agents[1]!.pages[0]!.rowsSha256="f".repeat(64),
 "missing CLI byte hash":v=>v.agents[1]!.pages[0]!.stdoutSha256="",
}
for(const [name,change]of Object.entries(paginationChanges))test(`inventory replay refuses ${name}`,()=>{
 const v=pagesFixture();change(v);if(name!=="rows hash")resign(v)
 expect(()=>inspectQueueInventory(v,queueFollowup)).toThrow()
})
async function collected(v:QueueInventory,name:string,mutate?:(data:{roster:QueueInventory["roster"];agents:{id:string;pages:{before:string|null;stdout:string;stderr:string}[]}[]})=>void){
 const root=process.env.LAB57_SOURCE_PROOF!+"/"+name;await mkdir(root)
 const data={roster:v.roster,agents:v.agents.map(s=>({id:s.id,pages:s.pages.map(p=>({before:p.before,stdout:JSON.stringify(p.rows),
  stderr:p.next?`More runs available; use --before "${p.next}" to fetch the next page.\n`:""}))}))};mutate?.(data)
 await Bun.write(root+"/pages.json",JSON.stringify(data))
 const script=`import importlib.util,json,sys,subprocess
spec=importlib.util.spec_from_file_location('q',sys.argv[1]);q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
agents=json.loads(subprocess.check_output(['/usr/local/bin/multica','agent','list','--output','json']))
print(json.dumps(q.collect_queues(agents,sys.argv[2])))`
 const child=Bun.spawn(["/usr/bin/python3","-c",script,new URL("../script/lab57-queue-pages.py",import.meta.url).pathname,queueFollowup],
  {env:{...process.env,EVAL_ARTIFACT_SOURCE:"dir:"+root},stdout:"pipe",stderr:"pipe"})
 const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
 await Bun.write(root+"/collector-stdout.json",out);await Bun.write(root+"/collector-stderr.txt",err)
 return {code,out,err,root}
}
test("concrete collector reads every roster/page and its ledger replays in production admission",async()=>{
 const r=await collected(pagesFixture(),"collector-green");expect(r.code).toBe(0);expect(r.err).toBe("")
 const queues=JSON.parse(r.out);expect(queues.queueLedger.excluded.length).toBe(2);expect(queues.queueLedger.recordCount).toBe(3)
 expect(queues.queueLedger.pageCount).toBe(9);expect(queues.queueInventory.roster.length).toBe(8)
 expect((await Bun.file(r.root+"/requests.jsonl").text()).trim().split("\n").length).toBe(10)
 expect(()=>validateFreshRouteState({...state(),...queues},false,queueFollowup)).not.toThrow()
 const blocked=await collected(pagesFixture(true),"collector-last-blocker");expect(blocked.code).toBe(0)
 expect(()=>validateFreshRouteState({...state(),...JSON.parse(blocked.out)},false,queueFollowup)).toThrow()
},15000)
for(const name of ["unknown warning","partial page","duplicate page","cursor cycle"] as const)test(`concrete CLI collection stops for ${name}`,async()=>{
 const r=await collected(pagesFixture(),"collector-"+name.replaceAll(" ","-"),d=>{
  const pages=d.agents[1]!.pages
  if(name==="unknown warning")pages[0]!.stderr="WARNING unknown\n"
  if(name==="partial page")pages[0]!.stdout="{}"
  if(name==="duplicate page")pages[1]!.stdout=pages[0]!.stdout
  if(name==="cursor cycle")pages[1]!.stderr=pages[0]!.stderr
 });expect(r.code).not.toBe(0)
},15000)
test("Node fixture replay executes the production queue gate and the real closed entry remains source-only",async()=>{
 const build=await Bun.build({entrypoints:[new URL("./fixtures/lab57-mas-replay.ts",import.meta.url).pathname],target:"node",format:"esm"})
 expect(build.success).toBe(true);const root=process.env.LAB57_SOURCE_PROOF!,file=root+"/mas-replay.mjs";await Bun.write(file,build.outputs[0]!)
 for(const [name,s,code]of [["eligible",state(),0],["last-blocker",state(pagesFixture(true)),2]] as const){
  const input=root+"/node-"+name+".json";await Bun.write(input,JSON.stringify({state:s,followup:queueFollowup}))
  const child=Bun.spawn(["/opt/node",file,input],{stdout:"pipe",stderr:"pipe"})
  const [actual,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);expect(actual).toBe(code)
  expect(JSON.parse(code?err:out).nativeReady).toBe(false)
 }
},15000)
