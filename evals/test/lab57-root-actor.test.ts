import {test,expect} from "bun:test"
import {readFile} from "node:fs/promises"
import {verifyRootActor,verifyEntryActor,operatorRecord,verifyOperatorContinuity} from "../src/lab57-root-actor"
import {inspectQueueInventory} from "../src/lab57-queue-scope"
import {queueFixture,queueDigest,queueFollowup} from "./fixtures/lab57-root-fixture"
const actor=()=>({kind:"codex-coordinator",thread:"01a120d5-a234-7481-b7ac-e68bbacc5f6d",member:"vs.kartamyshev",takeoverComment:"01a139d3-c44d-798e-98af-2c76f66a3756",handoverSha256:"fb0507f2b1ca03eb84f653b5e6df83185157d5b321efcca06be182c0ea0d5148"})
const receipt=()=>readFile(new URL("../docs/evaler/lab57-root-handover.json",import.meta.url))
test("Root authority is a separate exact handover actor, never a fictional Ben task",async()=>{
 expect(verifyRootActor(actor(),await receipt())).toBeUndefined()
 const q=queueFixture();q.agents[0]!.pages[0]!.rows=[];q.agents[0]!.pages[0]!.rowsSha256=queueDigest([])
 const ledger=inspectQueueInventory(q,null,"codex-coordinator")
 expect(ledger.controller).toEqual([]);expect(ledger.blocked).toEqual([])
})
for(const key of ["kind","thread","member","takeoverComment","handoverSha256"])test(`Root refuses wrong ${key}`,async()=>expect(()=>verifyRootActor({...actor(),[key]:"foreign"},awaitedReceipt)).toThrow("ROOT_ACTOR_REQUIRED"))
const awaitedReceipt=await receipt()
test("Root refuses missing/fabricated receipt and actor",()=>{
 for(const a of [null,{}, {...actor(),extra:true}])expect(()=>verifyRootActor(a,awaitedReceipt)).toThrow("ROOT_ACTOR_REQUIRED")
 expect(()=>verifyRootActor(actor(),new Uint8Array())).toThrow("ROOT_ACTOR_REQUIRED")
})
for(const status of ["running","queued","future_active"])test(`Root blocks active Ben or unknown ${status}`,()=>{
 const q=queueFixture();q.agents[0]!.pages[0]!.rows[0]!.status=status;q.agents[0]!.pages[0]!.rowsSha256=queueDigest(q.agents[0]!.pages[0]!.rows)
 if(status==="future_active")expect(()=>inspectQueueInventory(q,null,"codex-coordinator")).toThrow()
 else expect(inspectQueueInventory(q,null,"codex-coordinator").blocked).toHaveLength(1)
})
test("legacy Ben mode still requires exactly one real controller",()=>expect(inspectQueueInventory(queueFixture(),queueFollowup).controller).toHaveLength(1))
test("Root rejects worker impersonation and UID0; Ben requires its actual task",()=>{
 const a={actor:actor() as any,followupTask:null}
 expect(()=>verifyEntryActor(a,awaitedReceipt,undefined,1000)).not.toThrow()
 for(const [task,uid]of [[queueFollowup,1000],[undefined,0],[undefined,1001]] as const)expect(()=>verifyEntryActor(a,awaitedReceipt,task,uid)).toThrow()
 expect(()=>verifyEntryActor({...a,followupTask:queueFollowup},awaitedReceipt,undefined,1000)).toThrow()
 expect(()=>verifyEntryActor({followupTask:queueFollowup},new Uint8Array(),queueFollowup,1000)).not.toThrow()
 expect(()=>verifyEntryActor({followupTask:queueFollowup},new Uint8Array(),undefined,1000)).toThrow()
})
test("Root blocks foreign/original pending, permits exact MAS, and retains all status rows",()=>{
 const q=queueFixture(true);q.agents[0]!.pages[0]!.rows=[];q.agents[0]!.pages[0]!.rowsSha256=queueDigest([])
 expect(inspectQueueInventory(q,null,"codex-coordinator").excluded).toHaveLength(1)
 const p=q.agents[1]!.pages[0]!,row=p.rows[0]!
 row.runtime_id="unknown";p.rowsSha256=queueDigest(p.rows)
 expect(inspectQueueInventory(q,null,"codex-coordinator").blocked).toHaveLength(1)
 row.status="future_active";p.rowsSha256=queueDigest(p.rows)
 expect(()=>inspectQueueInventory(q,null,"codex-coordinator")).toThrow()
})
test("handover with modified original owner cannot authorize Root",()=>{
 const r=JSON.parse(awaitedReceipt.toString());r.originalLease.ownerSha256='f'.repeat(64)
 expect(()=>verifyRootActor(actor(),Buffer.from(JSON.stringify(r)))).toThrow('ROOT_ACTOR_REQUIRED')
})
test("once/attestation operator continuity cannot substitute historical Ben for external Root",()=>{
 const a={actor:actor() as any,followupTask:null}
 expect(()=>verifyOperatorContinuity(operatorRecord(a),a)).not.toThrow()
 for(const record of [undefined,{}, {kind:'ben-task',task:queueFollowup},{...actor(),member:'foreign'}])expect(()=>verifyOperatorContinuity(record,a)).toThrow()
 expect(()=>verifyOperatorContinuity({kind:'ben-task',task:queueFollowup},{followupTask:queueFollowup})).not.toThrow()
})
test("Root never exempts a running Ben even after conflicting MAS runtime rebind",()=>{
 const q=queueFixture();q.roster[0]!.runtime_id='24aa980b-b8c3-43e2-b087-bad8f79c9517';q.agents[0]!.pages[0]!.rows[0]!.runtime_id=q.roster[0]!.runtime_id
 q.agents[0]!.pages[0]!.rowsSha256=queueDigest(q.agents[0]!.pages[0]!.rows)
 expect(inspectQueueInventory(q,null,'codex-coordinator').blocked).toHaveLength(1)
})
test("Root concrete CLI collector and Node replay agree; active SOURCE worker blocks",async()=>{
 const {mkdir}=await import('node:fs/promises');const root=process.env.LAB57_SOURCE_PROOF!+'/root-pages';await mkdir(root)
 const q=queueFixture(true);q.agents[0]!.pages[0]!.rows=[];q.agents[0]!.pages[0]!.rowsSha256=queueDigest([])
 async function collect(){
  const data={roster:q.roster,agents:q.agents.map(a=>({id:a.id,pages:a.pages.map(p=>({before:p.before,stdout:JSON.stringify(p.rows),stderr:''}))}))}
  await Bun.write(root+'/pages.json',JSON.stringify(data))
  const script="import importlib.util,json,sys,subprocess;s=importlib.util.spec_from_file_location('q',sys.argv[1]);q=importlib.util.module_from_spec(s);s.loader.exec_module(q);r=json.loads(subprocess.check_output(['/usr/local/bin/multica','agent','list','--output','json']));print(json.dumps(q.collect_queues(r,None,'codex-coordinator')))"
  const child=Bun.spawn(['/usr/bin/python3','-c',script,new URL('../script/lab57-queue-pages.py',import.meta.url).pathname],{env:{...process.env,EVAL_ARTIFACT_SOURCE:'dir:'+root},stdout:'pipe',stderr:'pipe'})
  const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);expect(code).toBe(0);expect(err).toBe('');return JSON.parse(out)
 }
 const good=await collect();expect(good.queueLedger.controller).toEqual([]);expect(good.queueLedger.excluded).toHaveLength(1)
 expect(queueDigest(good.queueLedger)).toBe(queueDigest(inspectQueueInventory(good.queueInventory,null,'codex-coordinator')))
 const a=q.roster[2]!,p=q.agents[2]!.pages[0]!;p.rows.push({id:'01a139d0-0ab0-7a46-907f-8004baa51254',status:'running',agent_id:a.id,runtime_id:a.runtime_id});p.rowsSha256=queueDigest(p.rows)
 const blocked=await collect();expect(blocked.pendingWorkers).toHaveLength(1);expect(inspectQueueInventory(blocked.queueInventory,null,'codex-coordinator').blocked).toHaveLength(1)
})
