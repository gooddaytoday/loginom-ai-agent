import {test,expect} from "bun:test"
import {inspectQueueInventory,queueDigest} from "../src/lab57-queue-scope"
import {queueFixture} from "./fixtures/lab57-mas-queues"
import extension from "../src/lab57-mas-runtime-extension.json"
import {mkdtemp} from "node:fs/promises"

function fixture() {
 const q={...queueFixture(true),runtimePlacements:[
  {id:extension.originalRuntime,daemon_id:extension.originalDaemon,owner_id:extension.runtimeOwner,provider:"codex",runtime_mode:"local"},
  {id:extension.masRuntime,daemon_id:extension.masDaemon,owner_id:extension.runtimeOwner,provider:"codex",runtime_mode:"local"},
  {id:extension.cursorMasRuntime,daemon_id:extension.masDaemon,owner_id:extension.runtimeOwner,provider:"cursor",runtime_mode:"local"},
 ]}
 q.agents[0]!.pages[0]!.rows=[];q.agents[0]!.pages[0]!.rowsSha256=queueDigest([])
 q.roster[1]!.runtime_id=extension.cursorMasRuntime
 const page=q.agents[1]!.pages[0]!
 page.rows[0]!.runtime_id=extension.cursorMasRuntime;page.rowsSha256=queueDigest(page.rows)
 return q
}
test("exact Cursor runtime on the owner-attested MAS daemon is excluded with full placement evidence",()=>{
 const q=fixture(),ledger=inspectQueueInventory(q,null,"codex-coordinator")
 expect(ledger.blocked).toEqual([]);expect(ledger.excluded).toHaveLength(1)
 expect(ledger.recordCount).toBeGreaterThan(0);expect(ledger.rosterCount).toBe(q.roster.length)
})
async function collect(q:ReturnType<typeof fixture>){
 const root=await mkdtemp("/tmp/lab57-cursor-mas-")
 const pages={roster:q.roster,agents:q.agents.map(a=>({id:a.id,pages:a.pages.map(p=>({before:p.before,stdout:JSON.stringify(p.rows),stderr:""}))}))}
 await Bun.write(root+"/pages.json",JSON.stringify(pages));await Bun.write(root+"/runtimes.json",JSON.stringify(q.runtimePlacements))
 const code="import importlib.util,json,sys,subprocess;s=importlib.util.spec_from_file_location('q',sys.argv[1]);q=importlib.util.module_from_spec(s);s.loader.exec_module(q);a=json.loads(subprocess.check_output(['/usr/local/bin/multica','agent','list','--output','json']));print(json.dumps(q.collect_queues(a,None,'codex-coordinator',json.load(open(sys.argv[2])))))"
 const child=Bun.spawn(["/usr/bin/python3","-c",code,new URL("../script/lab57-queue-pages.py",import.meta.url).pathname,root+"/runtimes.json"],{env:{...process.env,EVAL_ARTIFACT_SOURCE:"dir:"+root},stdout:"pipe",stderr:"pipe"})
 const [exit,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
 expect(exit).toBe(0);expect(stderr).toBe("")
 return JSON.parse(stdout)
}
test("concrete collector and Node replay agree on exact Cursor MAS placement ledger",async()=>{
 const observed=await collect(fixture())
 expect(observed.pendingWorkers).toEqual([])
 expect(queueDigest(observed.queueLedger)).toBe(queueDigest(inspectQueueInventory(observed.queueInventory,null,"codex-coordinator")))
})

for(const index of [0,1,2])for(const key of ["daemon_id","owner_id","provider","runtime_mode"] as const)test("Cursor MAS refuses changed placement "+index+"/"+key,()=>{
 const q=fixture();q.runtimePlacements[index]![key]="foreign"
 expect(inspectQueueInventory(q,null,"codex-coordinator").blocked).toHaveLength(1)
})
test("Cursor MAS refuses missing, partial and duplicate placement; no labels or new UUID alias",()=>{
 const q=fixture()
 expect(inspectQueueInventory({roster:q.roster,agents:q.agents},null,"codex-coordinator").blocked).toHaveLength(1)
 q.runtimePlacements.pop();expect(inspectQueueInventory(q,null,"codex-coordinator").blocked).toHaveLength(1)
 const duplicate=fixture();duplicate.runtimePlacements.push({...duplicate.runtimePlacements[0]!})
 expect(()=>inspectQueueInventory(duplicate,null,"codex-coordinator")).toThrow("QUEUE_INVENTORY_REFUSED")
 const alias=fixture(),page=alias.agents[1]!.pages[0]!
 alias.roster[1]!.runtime_id="99999999-9999-4999-9999-999999999999";page.rows[0]!.runtime_id=alias.roster[1]!.runtime_id
 page.rowsSha256=queueDigest(page.rows)
 expect(inspectQueueInventory(alias,null,"codex-coordinator").blocked).toHaveLength(1)
})
test("Cursor MAS cannot hide original owner, active Ben or conflicting task runtime",()=>{
 const owner=fixture(),page=owner.agents[1]!.pages[0]!
 page.rows[0]!.id="01a1375d-ce4a-7c35-a3a3-94cf64a8b589";page.rowsSha256=queueDigest(page.rows)
 expect(inspectQueueInventory(owner,null,"codex-coordinator").blocked).toHaveLength(1)
 const conflict=fixture(),row=conflict.agents[1]!.pages[0]!
 row.rows[0]!.runtime_id=extension.originalRuntime;row.rowsSha256=queueDigest(row.rows)
 expect(inspectQueueInventory(conflict,null,"codex-coordinator").blocked).toHaveLength(1)
 const ben=fixture()
 ben.agents[1]!.pages[0]!.rows=[];ben.agents[1]!.pages[0]!.rowsSha256=queueDigest([])
 ben.roster[0]!.runtime_id=extension.cursorMasRuntime
 const task={id:"00000000-0000-4000-8000-000000000999",status:"running",agent_id:ben.roster[0]!.id,runtime_id:extension.cursorMasRuntime}
 ben.agents[0]!.pages[0]!.rows=[task];ben.agents[0]!.pages[0]!.rowsSha256=queueDigest([task])
 expect(inspectQueueInventory(ben,null,"codex-coordinator").blocked).toHaveLength(1)
})

for(const scenario of ["partial","wrong-daemon","wrong-owner","wrong-provider","conflicting-task"])test("concrete collector refuses Cursor placement "+scenario,async()=>{
 const q=fixture()
 if(scenario==="partial")q.runtimePlacements.pop()
 if(scenario==="wrong-daemon")q.runtimePlacements[2]!.daemon_id=extension.originalDaemon
 if(scenario==="wrong-owner")q.runtimePlacements[2]!.owner_id="foreign"
 if(scenario==="wrong-provider")q.runtimePlacements[2]!.provider="codex"
 if(scenario==="conflicting-task"){const p=q.agents[1]!.pages[0]!;p.rows[0]!.runtime_id=extension.originalRuntime;p.rowsSha256=queueDigest(p.rows)}
 const observed=await collect(q)
 expect(observed.pendingWorkers).toHaveLength(1)
 expect(queueDigest(observed.queueLedger)).toBe(queueDigest(inspectQueueInventory(observed.queueInventory,null,"codex-coordinator")))
})
