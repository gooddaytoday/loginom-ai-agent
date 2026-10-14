import {createHash} from "node:crypto"
import statusContract from "./lab57-task-statuses.json"

export const masQueueScope=Object.freeze({mas:"24aa980b-b8c3-43e2-b087-bad8f79c9517",original:"a5fa993f-2903-4997-a832-955ffbb1203c",
  ben:"99804e93-d241-45f2-872d-8a1e16ec7f3d",originalOwner:"01a1375d-ce4a-7c35-a3a3-94cf64a8b589",ownerAmendmentSha256:"e2925de35befd22407908e938e693bfcfaef62b73f9681af890ff7b8ad9bc4e3"})
type Agent={id:string;runtime_id:unknown}
type Task={id:string;status:string;agent_id:unknown;runtime_id:unknown}
type Page={before:string|null;next:string|null;rows:Task[];rowsSha256:string;stdoutSha256:string;stderrSha256:string}
export type QueueInventory={roster:Agent[];agents:{id:string;pages:Page[]}[]}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const sha=/^[0-9a-f]{64}$/
const terminal=new Set(statusContract.terminal)
const states=new Set([...statusContract.pending,...statusContract.terminal])
export function queueDigest(value:unknown):string {
  const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"
    ?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,item])=>[k,canonical(item)])):v
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")
}
function cursor(value:unknown) {
  if(typeof value!=="string")return false
  const parts=value.split("|")
  return parts.length===2&&uuid.test(parts[1]!)&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(parts[0]!)&&Number.isFinite(Date.parse(parts[0]!))
}
/** Replay complete, safe concrete CLI observations. Neither labels nor filtered arrays grant admission. */
export function inspectQueueInventory(inventory:QueueInventory,followup:string) {
  const fail=()=>{throw Error("QUEUE_INVENTORY_REFUSED")}
  if(!uuid.test(followup)||followup===masQueueScope.originalOwner||!inventory||!Array.isArray(inventory.roster)||inventory.roster.length<8||!Array.isArray(inventory.agents)
    ||inventory.agents.length!==inventory.roster.length||new Set(inventory.roster.map(a=>a?.id)).size!==inventory.roster.length)fail()
  const seen=new Set<string>(),excluded:Record<string,unknown>[]=[],blocked:Record<string,unknown>[]=[],controller:Record<string,unknown>[]=[]
  let pageCount=0,recordCount=0
  for(const [i,agent] of inventory.roster.entries()){
    const scan=inventory.agents[i]!
    if(!agent||!uuid.test(agent.id)||!scan||scan.id!==agent.id||!Array.isArray(scan.pages)||!scan.pages.length||scan.pages.length>100)fail()
    const cursors=new Set<string>();let before:string|null=null
    for(const [j,page]of scan.pages.entries()){
      if(!page||page.before!==before||!Array.isArray(page.rows)||page.rows.length>200||!sha.test(page.stdoutSha256)||!sha.test(page.stderrSha256)
        ||page.rowsSha256!==queueDigest(page.rows)||page.next!==null&&(!cursor(page.next)||cursors.has(page.next)||!page.rows.length)
        ||(j===scan.pages.length-1)!==(page.next===null))fail()
      if(page.next!==null)cursors.add(page.next)
      before=page.next;pageCount++
      for(const task of page.rows){
        if(!task||!uuid.test(task.id)||typeof task.status!=="string"||!states.has(task.status)||seen.has(task.id)||task.agent_id!==agent.id)fail()
        seen.add(task.id);recordCount++
        if(terminal.has(task.status))continue
        const row:Record<string,unknown>={task:task.id,agent:task.agent_id,status:task.status,taskRuntime:task.runtime_id,agentRuntime:agent.runtime_id,rosterAgent:agent.id}
        const bound=task.agent_id===agent.id
        if(task.id===followup&&bound&&agent.id===masQueueScope.ben&&task.status==="running"&&task.runtime_id===masQueueScope.original&&agent.runtime_id===masQueueScope.original){
          controller.push({...row,reason:"EXACT_BEN_CONTROLLER"});continue
        }
        // The original controller UUID can never be hidden as mas after a conflicting rebind.
        if(task.id!==followup&&task.id!==masQueueScope.originalOwner&&bound&&task.runtime_id===masQueueScope.mas&&agent.runtime_id===masQueueScope.mas){
          excluded.push({...row,reason:"OWNER_ATTESTED_EXACT_MAS",ownerAmendmentSha256:masQueueScope.ownerAmendmentSha256});continue
        }
        blocked.push({...row,reason:"UNEXEMPTED_OR_UNBOUND_PENDING"})
      }
    }
  }
  if(controller.length!==1)fail()
  return {version:1,ownerAmendmentSha256:masQueueScope.ownerAmendmentSha256,inventorySha256:queueDigest(inventory),rosterCount:inventory.roster.length,
    pageCount,recordCount,pendingCount:excluded.length+blocked.length+controller.length,excluded,blocked,controller}
}
