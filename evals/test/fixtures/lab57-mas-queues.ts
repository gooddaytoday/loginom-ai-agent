import {queueDigest} from "../../src/lab57-queue-scope"
import type {QueueInventory} from "../../src/lab57-queue-scope"
export const queueFollowup="01a1393d-48db-7594-b5ce-0b18ec503ab9"
export const queueMas="24aa980b-b8c3-43e2-b087-bad8f79c9517",queueOriginal="a5fa993f-2903-4997-a832-955ffbb1203c"
export const queueBen="99804e93-d241-45f2-872d-8a1e16ec7f3d",queueForeign="c25d6205-7c17-4672-a177-7e8ee9af9358"
// Synthetic inventory. Actual identifiers show the scope but do not represent a live scan/admission.
export function queueFixture(withMas=true):QueueInventory {
 const roster=[{id:queueBen,runtime_id:queueOriginal},{id:queueForeign,runtime_id:queueMas},
  ...Array.from({length:6},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`,runtime_id:queueOriginal}))]
 const tasks=[{id:queueFollowup,status:"running",agent_id:queueBen,runtime_id:queueOriginal}]
 const masTasks=withMas?[{id:"01a13927-fe40-76bb-b3d3-303a35454c6f",status:"queued",agent_id:queueForeign,runtime_id:queueMas}]:[]
 return {roster,agents:roster.map((a,i)=>{const rows=i===0?tasks:i===1?masTasks:[];return {id:a.id,pages:[{before:null,next:null,rows,
  rowsSha256:queueDigest(rows),stdoutSha256:queueDigest(rows),stderrSha256:queueDigest("")}]}})}
}
