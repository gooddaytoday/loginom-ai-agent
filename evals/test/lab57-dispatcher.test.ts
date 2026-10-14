import { test, expect } from "bun:test"
import { correlateDispatcher, stableDispatcherDecision, validateDispatcherInventory, verifyDispatcherCessation, dispatcherScope, deriveOriginalBinding } from "../src/lab57-dispatcher"
import type { DispatcherInventory, OriginalBinding } from "../src/lab57-dispatcher"

// Synthetic protocol fixtures. These are not observed server identities or live cessation proofs.
export function dispatcherFixture(now = Date.now()) {
  const original: OriginalBinding = { journalSha: dispatcherScope.journalSha, runSha: dispatcherScope.runSha,
    packageSha: dispatcherScope.packageSha, runtimeId: dispatcherScope.runtimeId, document: dispatcherScope.document,
    executionId: `${dispatcherScope.document}:145:1`, startedAt: 1791933110493, durationMs: 194095,
    host: null, container: dispatcherScope.container, containerStartedAt: "2026-10-07T00:00:00.000Z" }
  const inventory: DispatcherInventory = { version: 1, origin: "http://localhost", build: "7.4.2", observer: "observer-ref", admin: true,
    complete: true, filtered: false, dialogs: false, countBefore: 2, countAfter: 2, collectedAt: now - 20,
    sessions: [ { key: "observer-ref", name: "admin:999", type: 1, created: now - 100, ip: "127.0.0.1", last: now - 100,
      packages: [], packageCount: 0, pendingDisconnect: false },
    { key: "original-ref", name: "user:123", type: 0, created: original.startedAt + 500, ip: "127.0.0.1", last: original.startedAt + 900,
      packageCount: 1, pendingDisconnect: true, packages: [{ key: "package-ref", name: "owned package", path: dispatcherScope.packagePath,
        created: original.startedAt + 600, modified: original.startedAt + 1000, readOnly: true, references: 1, running: false }] } ] }
  return { original, inventory, now }
}

test("writable target cannot silently authorize destructive close", () => {
  const {original,inventory,now} = dispatcherFixture(); inventory.sessions[1]!.packages[0]!.readOnly = false
  const r = correlateDispatcher(inventory,original,now)
  expect(r.closePermitted).toBe(false); expect(r.limitation).toBe("WRITABLE_TARGET_DIRTY_STATE_UNOBSERVABLE")
})

test("complete inventory binds a unique original target; Dock UUID is not its ID", () => {
  const {original,inventory,now} = dispatcherFixture()
  const r = correlateDispatcher(inventory,original,now)
  expect(r.status).toBe("BOUND_PRESENT");expect(r.target!.name).toBe("user:123")
  expect(r.target!.key).not.toBe(original.runtimeId);expect(r.closePermitted).toBe(true)
})

const inventoryMutations: Record<string,(v: DispatcherInventory) => void> = {
  "truncated":v=>{v.complete=false}, "pagination/count":v=>{v.countAfter=3}, "filtered":v=>{v.filtered=true},
  "mask/dialog":v=>{v.dialogs=true}, "privilege":v=>{v.admin=false}, "foreign origin":v=>{v.origin="https://foreign"},
  "changed build":v=>{v.build="7.4.3"}, "unknown observer":v=>{v.observer="original-ref"},
  "unknown session type":v=>{v.sessions[1]!.type=5}, "observer is target":v=>{v.sessions[0]!.name="user:123"},
  "label-only account":v=>{v.sessions[1]!.name="user"}, "casefold account":v=>{v.sessions[1]!.name="User:123"},
  "Dock UUID substituted":v=>{v.sessions[1]!.name=`user:${dispatcherScope.runtimeId}`},
  "foreign account with owned path":v=>{v.sessions[1]!.name="other:123"},
  "reused incarnation":v=>{v.sessions[1]!.created-=1000000}, "replaced incarnation":v=>{v.sessions[1]!.created+=1000000},
  "foreign package":v=>{v.sessions[1]!.packages[0]!.path="/foreign/p.lgp"},
  "draft":v=>{v.sessions[1]!.packages[0]!.path=null}, "unknown creation":v=>{v.sessions[1]!.packages[0]!.created=null},
  "package count":v=>{v.sessions[1]!.packageCount=2}, "running":v=>{v.sessions[1]!.packages[0]!.running=true},
  "shared":v=>{v.sessions[1]!.type=2}, "pool":v=>{v.sessions[1]!.type=3}, "backup":v=>{v.sessions[1]!.type=4},
  "reference ambiguity":v=>{v.sessions[1]!.packages[0]!.references=2},
  "path traversal":v=>{v.sessions[1]!.packages[0]!.path="/user/../p.lgp"},
  "path malicious control":v=>{v.sessions[1]!.packages[0]!.path="/user/evil\n.lgp"},
  "unknown raw data":v=>{Object.assign(v,{credentials:"do not publish"})},
  "unknown session data":v=>{Object.assign(v.sessions[1]!,{privateData:"do not publish"})},
  "unknown package data":v=>{Object.assign(v.sessions[1]!.packages[0]!,{dirty:false})},
  "changed package time":v=>{v.sessions[1]!.packages[0]!.modified = v.sessions[1]!.packages[0]!.modified! + 1000000},
  "duplicate session key":v=>{v.sessions[1]!.key=v.sessions[0]!.key},
  "duplicate package/session key":v=>{v.sessions[1]!.packages[0]!.key=v.sessions[0]!.key},
}
for (const [label,change] of Object.entries(inventoryMutations)) test(`refuses ${label} before close`, () => {
  const {original,inventory,now}=dispatcherFixture();change(inventory)
  expect(()=>correlateDispatcher(inventory,original,now)).toThrow()
})

for (const key of ["journalSha","runSha","packageSha","runtimeId","document","executionId","startedAt","durationMs","host","container","containerStartedAt"] as const)
  test(`refuses substituted original ${key}`,()=> {
    const {original,inventory,now}=dispatcherFixture();Object.assign(original,{[key]: typeof original[key] === "number" ? 123 : "changed"})
    expect(()=>correlateDispatcher(inventory,original,now)).toThrow("ORIGINAL_LINEAGE_CHANGED")
  })

test("fresh two-pass full inventory excludes original scope and identifies observer",()=> {
  const {original,inventory,now}=dispatcherFixture();inventory.sessions.pop();inventory.countBefore=inventory.countAfter=1
  const after=structuredClone(inventory);after.collectedAt++
  expect(stableDispatcherDecision(inventory,after,original,now).status).toBe("OWNERSHIP_SCOPE_ABSENT")
  const proof=verifyDispatcherCessation(inventory,after,original,now)
  expect(proof.status).toBe("SERVER_OWNERSHIP_SCOPE_CEASED");expect(proof.cleanup).toBe("UNCONFIRMED");expect(proof.originalOutcome).toBe("ERROR")
})
test("empty workspace or inaccessible inventory never proves cessation",()=> {
  const {original,inventory,now}=dispatcherFixture();inventory.sessions=[];inventory.countBefore=inventory.countAfter=0
  expect(()=>correlateDispatcher(inventory,original,now)).toThrow("OBSERVER_UNBOUND")
  expect(()=>validateDispatcherInventory(null,now)).toThrow()
})
test("same account without original path is unknown rather than absent",()=> {
  const {original,inventory,now}=dispatcherFixture();inventory.sessions[1]!.packages=[];inventory.sessions[1]!.packageCount=0
  expect(()=>correlateDispatcher(inventory,original,now)).toThrow("AMBIGUOUS_OR_FOREIGN_OWNERSHIP")
})
test("duplicate paths/membership, refresh races, stale observations refuse",()=> {
  const {original,inventory,now}=dispatcherFixture();const duplicate=structuredClone(inventory.sessions[1]!);duplicate.key="other";duplicate.name="user:124";duplicate.packages[0]!.key="other-p"
  inventory.sessions.push(duplicate);inventory.countBefore=inventory.countAfter=3
  expect(()=>correlateDispatcher(inventory,original,now)).toThrow()
  inventory.sessions.pop();inventory.countBefore=inventory.countAfter=2
  const after=structuredClone(inventory);after.collectedAt++;after.sessions[1]!.created++
  expect(()=>stableDispatcherDecision(inventory,after,original,now)).toThrow("INVENTORY_REFRESH_RACE")
  expect(()=>validateDispatcherInventory(inventory,now+20000)).toThrow("STALE_OBSERVATION")
})
test("post observation must preserve every non-target row and exclude user and all shared references",()=> {
  const {original,inventory,now}=dispatcherFixture();const after=structuredClone(inventory);after.collectedAt++;after.sessions.pop();after.countBefore=after.countAfter=1
  expect(verifyDispatcherCessation(inventory,after,original,now).serverName).toBe("user:123")
  after.sessions[0]!.name="admin:998"
  expect(()=>verifyDispatcherCessation(inventory,after,original,now)).toThrow("NON_TARGET_INVENTORY_CHANGED")
  expect(()=>verifyDispatcherCessation(inventory,inventory,original,now)).toThrow()
})
test("claimed hashes cannot replace authentic original bytes",()=> {
  expect(()=>deriveOriginalBinding(new TextEncoder().encode('{}'),new Uint8Array(),new Uint8Array(),'2026-10-07T00:00:00Z')).toThrow("ORIGINAL_BYTES_CHANGED")
})
