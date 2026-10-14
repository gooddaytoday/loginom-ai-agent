import {test,expect} from "bun:test"
import {validateFreshRouteState,ownedCsv,originalContainerStartedAt} from "../src/lab57-route-admission"
import {lab57CleanupScope} from "../src/lab57-cleanup-proposal"
import {inspectQueueInventory,queueDigest} from "../src/lab57-queue-scope"
import {queueFixture,queueFollowup,queueMas,queueOriginal,queueBen,queueForeign} from "./fixtures/lab57-mas-queues"
import type {QueueInventory} from "../src/lab57-queue-scope"
// Synthetic source fixtures; none grants native admission or reports live queue state.
const state=(inventory=queueFixture())=>{const ledger=inspectQueueInventory(inventory,queueFollowup);return {passes:[{originalPids:[],foreignNative:[],denied:[],profileFds:[]},{originalPids:[],foreignNative:[],denied:[],profileFds:[]}],
 profiles:6,foreignMarkers:[],pendingWorkers:ledger.blocked,queueInventory:inventory,queueLedger:ledger,queuesChecked:8,checkedAt:Date.now(),container:{id:lab57CleanupScope.containerId,startedAt:originalContainerStartedAt,running:true,mounts:[]},storage:[{...ownedCsv}]}}
test("owner-attested exact mas pending is eligible without requiring global idle",()=>{
 const s=state();expect(s.queueLedger.excluded.length).toBe(1);expect(s.queueLedger.pendingCount).toBe(2)
 expect(()=>validateFreshRouteState(s,false,queueFollowup)).not.toThrow()
})
