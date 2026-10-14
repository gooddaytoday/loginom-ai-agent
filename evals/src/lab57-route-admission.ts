import {lab57CleanupScope} from "./lab57-cleanup-proposal"
import {inspectQueueInventory,queueDigest} from "./lab57-queue-scope"
import type {QueueInventory} from "./lab57-queue-scope"

export type FreshRouteState={passes:{originalPids:unknown[];foreignNative:unknown[];denied:unknown[];profileFds:unknown[]}[];
  profiles:number;foreignMarkers:unknown[];pendingWorkers:unknown[];queuesChecked:number;checkedAt:number;queueInventory:QueueInventory;queueLedger:unknown;
  container:{id:string;startedAt:string;running:boolean;mounts:unknown[]};storage:{path:string;identity:string;sha256:string}[]}
export const ownedCsv=Object.freeze({path:"/workdir/UserStorage/user/cc6187e46829a5fa768f09eeb024367d745628a1d10f46f26a0ec5543f76c997-0-semicolon_cp1251_decimal.txt",
  identity:"58:1179775:150:81a4",sha256:"94821af546f6454601f5338d6fe32b8bf7a85bf7208b34df2bc522e55e2ab4dd"})
export const originalContainerStartedAt="2026-10-07T09:05:53.309342637Z"
export function validateFreshRouteState(s:FreshRouteState,csvRemoved:boolean,followup:string|null,mode:"ben-task"|"codex-coordinator"="ben-task") {
  const ledger=inspectQueueInventory(s?.queueInventory,followup,mode)
  if(queueDigest(s.queueLedger)!==queueDigest(ledger)||queueDigest(s.pendingWorkers)!==queueDigest(ledger.blocked)
    ||s.queuesChecked!==ledger.rosterCount)throw Error("QUEUE_LEDGER_REFUSED")
  if(!s || !Array.isArray(s.passes) || s.passes.length!==2 || s.passes.some(p=>
    [p.originalPids,p.foreignNative,p.denied,p.profileFds].some(a=>!Array.isArray(a)||a.length))
    || s.profiles!==6 || !Array.isArray(s.foreignMarkers) || s.foreignMarkers.length || !Array.isArray(s.pendingWorkers) || s.pendingWorkers.length
    || s.queuesChecked<8 || !Number.isFinite(s.checkedAt) || s.checkedAt>Date.now() || Date.now()-s.checkedAt>15000
    || s.container?.id!==lab57CleanupScope.containerId || s.container.startedAt!==originalContainerStartedAt || s.container.running!==true
    || !Array.isArray(s.container.mounts) || s.container.mounts.length || !Array.isArray(s.storage)
    || s.storage.length!==(csvRemoved?0:1) || !csvRemoved&&Object.entries(ownedCsv).some(([k,v])=>s.storage[0]?.[k as keyof typeof ownedCsv]!==v))
    throw Error("FRESH_GUARD_REFUSED")
}
