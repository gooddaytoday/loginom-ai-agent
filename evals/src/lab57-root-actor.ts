export type RouteActor={kind:"codex-coordinator";thread:string;member:string;takeoverComment:string;handoverSha256:string}
import {createHash} from "node:crypto"
import {lab57CleanupScope} from "./lab57-cleanup-proposal"
import {queueDigest} from "./lab57-queue-scope"
export const rootAuthority=Object.freeze({kind:"codex-coordinator",thread:"01a120d5-a234-7481-b7ac-e68bbacc5f6d",member:"vs.kartamyshev",
 takeoverComment:"01a139d3-c44d-798e-98af-2c76f66a3756",handoverSha256:"fb0507f2b1ca03eb84f653b5e6df83185157d5b321efcca06be182c0ea0d5148"})
/** Pinned human handover authorizes the external actor, never changes the common owner. */
export function verifyRootActor(actor:unknown,handover:Uint8Array) {
 const fail=()=>{throw Error("ROOT_ACTOR_REQUIRED")}
 if(!actor||typeof actor!=="object"||Array.isArray(actor)||Object.keys(actor).length!==Object.keys(rootAuthority).length
  ||Object.entries(rootAuthority).some(([k,v])=>(actor as Record<string,unknown>)[k]!==v)
  ||handover.byteLength!==5268||createHash("sha256").update(handover).digest("hex")!==rootAuthority.handoverSha256)fail()
 const receipt=JSON.parse(Buffer.from(handover).toString("utf8"))
 if(receipt.rootCodexThread!==rootAuthority.thread||receipt.boardTakeoverComment!==rootAuthority.takeoverComment
  ||receipt.originalLease.ownerTask!==lab57CleanupScope.task||receipt.originalLease.role!=="ben"
  ||receipt.originalLease.acquiredAt!==lab57CleanupScope.acquiredAt||receipt.originalLease.ownerSha256!==lab57CleanupScope.raw_owner_sha256
  ||receipt.originalLease.rebinding!==false)fail()
}
export function verifyEntryActor(a:{actor?:RouteActor;followupTask:string|null},handover:Uint8Array,task:string|undefined,uid:number) {
 if(uid!==1000)throw Error("ROOT_ACTOR_REQUIRED")
 if(a.actor){verifyRootActor(a.actor,handover);if(a.followupTask!==null||task!==undefined)throw Error("ROOT_ACTOR_REQUIRED")}
 else if(typeof a.followupTask!=="string"||task!==a.followupTask)throw Error("ADMITTED_SOURCE_OWNER_TASK_REQUIRED")
}
export function operatorRecord(a:{actor?:RouteActor;followupTask:string|null}) {return a.actor??{kind:"ben-task",task:a.followupTask}}
export function verifyOperatorContinuity(observed:unknown,a:{actor?:RouteActor;followupTask:string|null}) {
 if(queueDigest(observed)!==queueDigest(operatorRecord(a)))throw Error("OPERATOR_ACTOR_CHANGED")
}
