import {test,expect,beforeAll} from "bun:test"
import {mkdir} from "node:fs/promises"
import {inspectQueueInventory,queueDigest} from "../src/lab57-queue-scope"
import {validateFreshRouteState,ownedCsv,originalContainerStartedAt} from "../src/lab57-route-admission"
import {lab57CleanupScope} from "../src/lab57-cleanup-proposal"
import {queueFixture,queueFollowup,queueForeign,queueBen,queueOriginal} from "./fixtures/lab57-mas-queues"
import type {QueueInventory} from "../src/lab57-queue-scope"
import type {FreshRouteState} from "../src/lab57-route-admission"

// Synthetic SOURCE controls; real CLI contract is pinned in the delivered status-contract proof.
const pending=["queued","dispatched","running","waiting_local_directory","deferred"]
const terminal=["completed","failed","cancelled"]
const malformed:[string,unknown][]=[["UNKNOWN", "UNKNOWN"],["future_active", "future_active"],["missing",undefined],["null",null],["empty",""],
 ["whitespace"," \t"],["number",1],["object",{}],["array",[]],["boolean",false],["case_variant","RUNNING"],["terminal_case","Completed"],
 ["trailing_space","running "],["legacy_pending","pending"],["legacy_retrying","retrying"],["legacy_scheduled","scheduled"]]
function resign(v:QueueInventory){for(const a of v.agents)for(const p of a.pages)p.rowsSha256=queueDigest(p.rows)}
function state(v:QueueInventory):FreshRouteState {
 const ledger=inspectQueueInventory(v,queueFollowup)
 return {passes:[{originalPids:[],foreignNative:[],denied:[],profileFds:[]},{originalPids:[],foreignNative:[],denied:[],profileFds:[]}],
  profiles:6,foreignMarkers:[],pendingWorkers:ledger.blocked,queueInventory:v,queueLedger:ledger,queuesChecked:v.roster.length,checkedAt:Date.now(),
  container:{id:lab57CleanupScope.containerId,startedAt:originalContainerStartedAt,running:true,mounts:[]},storage:[{...ownedCsv}]}
}
function extra(v:QueueInventory,owner=false){
 const scan=v.agents[owner?0:1]!,row={id:owner?lab57CleanupScope.task:"00000000-0000-4000-8000-000000000099",status:"completed",
  agent_id:owner?queueBen:queueForeign,runtime_id:owner?queueOriginal:null}
 scan.pages[0]!.rows.push(row);resign(v);return row
}
beforeAll(async()=>{
 const built=await Bun.build({entrypoints:[new URL("./fixtures/lab57-mas-replay.ts",import.meta.url).pathname],target:"node",format:"esm"})
 expect(built.success).toBe(true);await Bun.write(process.env.LAB57_SOURCE_PROOF!+"/status-node-replay.mjs",built.outputs[0]!)
})
async function node(s:FreshRouteState,name:string){
 const root=process.env.LAB57_SOURCE_PROOF!,file=root+"/node-"+name+".json";s.checkedAt=Date.now()
 await Bun.write(file,JSON.stringify({state:s,followup:queueFollowup}))
 const p=Bun.spawn(["/opt/node",root+"/status-node-replay.mjs",file],{stdout:"pipe",stderr:"pipe"})
 const [code,out,err]=await Promise.all([p.exited,new Response(p.stdout).text(),new Response(p.stderr).text()])
 await Bun.write(root+"/node-"+name+"-result.json",JSON.stringify({code,out,err,synthetic:true,nativeEffects:0}))
 return code
}
async function collector(v:QueueInventory,name:string){
 const root=process.env.LAB57_SOURCE_PROOF!+"/"+name;await mkdir(root)
 await Bun.write(root+"/pages.json",JSON.stringify({roster:v.roster,agents:v.agents.map(a=>({id:a.id,pages:a.pages.map(p=>({before:p.before,stdout:JSON.stringify(p.rows),
  stderr:p.next?`More runs available; use --before "${p.next}" to fetch the next page.\n`:""}))}))}))
 const code=`import importlib.util,json,subprocess,sys
s=importlib.util.spec_from_file_location('q',sys.argv[1]);q=importlib.util.module_from_spec(s);s.loader.exec_module(q)
a=json.loads(subprocess.check_output(['/usr/local/bin/multica','agent','list','--output','json']))
print(json.dumps(q.collect_queues(a,sys.argv[2])))`
 const p=Bun.spawn(["/usr/bin/python3","-c",code,new URL("../script/lab57-queue-pages.py",import.meta.url).pathname,queueFollowup],
  {env:{...process.env,EVAL_ARTIFACT_SOURCE:"dir:"+root},stdout:"pipe",stderr:"pipe"})
 const [exitCode,out,err]=await Promise.all([p.exited,new Response(p.stdout).text(),new Response(p.stderr).text()])
 await Bun.write(root+"/collector-result.json",JSON.stringify({exitCode,out,err,synthetic:true,nativeEffects:0}))
 return {exitCode,out,err}
}
for(const [name,status]of malformed)for(const actor of ["mas","owner","followup"] as const)test(`unknown ${name} on ${actor} refuses collector before partition and bundled Node`,async()=>{
 const v=queueFixture(),row=actor==="followup"?v.agents[0]!.pages[0]!.rows[0]!:extra(v,actor==="owner")
 // Start with a proven terminal control. Changing just status/hashes leaves a consistent old unsafe ledger.
 const witness=state(v)
 if(status===undefined)Reflect.deleteProperty(row,"status");else Reflect.set(row,"status",status)
 resign(v);(witness.queueLedger as {inventorySha256:string}).inventorySha256=queueDigest(v)
 const result=await collector(v,"bad-"+actor+"-"+name)
 const replay=await node(witness,"bad-"+actor+"-"+name)
 expect(result.exitCode).not.toBe(0);expect(result.out).toBe("");expect(replay).toBe(2)
},15000)
for(const status of terminal)test(`proven terminal ${status} remains in full inventory through collector and Node`,async()=>{
 const v=queueFixture(),row=extra(v,true);row.status=status;resign(v)
 const r=await collector(v,"terminal-"+status);expect(r.exitCode).toBe(0);expect(r.err).toBe("")
 const observed=JSON.parse(r.out);expect(observed.queueLedger.recordCount).toBe(3);expect(observed.queueLedger.pendingCount).toBe(2)
 expect(observed.queueInventory.agents[0].pages[0].rows[1].status).toBe(status)
 const s={...state(v),...observed};expect(()=>validateFreshRouteState(s,false,queueFollowup)).not.toThrow()
 expect(await node(s,"terminal-"+status)).toBe(0)
},15000)
for(const status of pending)test(`supported active ${status} excludes only exact mas and blocks original runtime`,async()=>{
 const v=queueFixture();v.agents[1]!.pages[0]!.rows[0]!.status=status;resign(v)
 const r=await collector(v,"pending-mas-"+status);expect(r.exitCode).toBe(0)
 const observed=JSON.parse(r.out);expect(observed.queueLedger.excluded.length).toBe(1);expect(observed.queueLedger.pendingCount).toBe(2)
 expect(await node({...state(v),...observed},"pending-mas-"+status)).toBe(0)
 extra(v,true).status=status;resign(v)
 const b=await collector(v,"pending-original-"+status);expect(b.exitCode).toBe(0)
 const blocked=JSON.parse(b.out);expect(blocked.pendingWorkers.length).toBe(1)
 expect(await node({...state(v),...blocked},"pending-original-"+status)).toBe(2)
},15000)
